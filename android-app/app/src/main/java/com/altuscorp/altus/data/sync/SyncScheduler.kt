package com.altuscorp.altus.data.sync

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The one place outbox replay is enqueued. Repositories call [requestSync]
 * after every optimistic commit; AuthRepository calls it after a successful
 * login (to flush anything held while the session was dead) and [cancel] +
 * `OutboxDao.clearAll()` on sign-out.
 *
 * Unique work with APPEND_OR_REPLACE: a request made while a replay is
 * already running chains a fresh pass afterwards, so a mutation enqueued
 * mid-replay is never silently skipped (KEEP would drop it). The CONNECTED
 * constraint means "commit offline, sync on reconnect" needs no listener
 * code at all.
 */
@Singleton
class SyncScheduler @Inject constructor(
    private val workManager: WorkManager,
) {

    /** Flush the outbox as soon as the device is connected. */
    fun requestSync() {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                BACKOFF_INITIAL_SECONDS,
                TimeUnit.SECONDS,
            )
            .build()
        workManager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** Sign-out: stop replaying — the queue itself is cleared via OutboxDao. */
    fun cancel() {
        workManager.cancelUniqueWork(WORK_NAME)
    }

    companion object {
        const val WORK_NAME = "altus_outbox_replay"
        private const val BACKOFF_INITIAL_SECONDS = 30L
    }
}
