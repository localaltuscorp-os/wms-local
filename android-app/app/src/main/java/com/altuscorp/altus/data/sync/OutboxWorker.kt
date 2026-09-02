package com.altuscorp.altus.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiJson
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.dao.OutboxDao
import com.altuscorp.altus.data.local.entity.MutationKind
import com.altuscorp.altus.data.local.entity.OutboxEntity
import com.altuscorp.altus.data.remote.dto.CommentRequestDto
import com.altuscorp.altus.data.remote.dto.DccEntryRequestDto
import com.altuscorp.altus.data.remote.dto.DccParticipantsRequestDto
import com.altuscorp.altus.data.remote.dto.StatusChangeRequestDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import timber.log.Timber

/**
 * A mutation the server permanently refused after it was optimistically
 * applied locally. Repositories collect [SyncEvents.rejections], revert the
 * exact control in cache, and let the owning screen fire the "uh-uh"
 * double-tick + retry snackbar — the single ordering contract between the
 * background worker (no UI) and the surface the user is looking at
 * (critique P1-5).
 */
data class MutationRejection(
    val kind: MutationKind,
    /** Task id / DCC item id whose control must revert. */
    val targetId: String,
    /** DCC board day the mutation belonged to, when applicable. */
    val dayKey: String?,
    /** Human copy for the snackbar (server copy when it sent any). */
    val message: String,
    /** True for the optimistic-lock 409 `stale` — shake + silent re-fetch. */
    val isStaleConflict: Boolean,
)

/**
 * App-wide bus for replay outcomes. Hot, shallow-buffered, drop-oldest: a
 * rejection nobody is collecting (app killed) is recovered anyway on the next
 * cache-vs-server reconcile, so unbounded buffering would only lie longer.
 */
@Singleton
class SyncEvents @Inject constructor() {

    private val _rejections = MutableSharedFlow<MutationRejection>(
        replay = 0,
        extraBufferCapacity = 16,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /** Permanent server refusals of optimistically-applied mutations. */
    val rejections: SharedFlow<MutationRejection> = _rejections.asSharedFlow()

    /** Worker-side emit; non-suspending so a slow collector never stalls replay. */
    fun emitRejection(rejection: MutationRejection) {
        _rejections.tryEmit(rejection)
    }
}

/**
 * Replays the outbox FIFO against `/api/mobile` (Part 6: what makes
 * optimistic-first honest). Scheduled by [SyncScheduler] with a CONNECTED
 * constraint + exponential backoff.
 *
 * Per-row outcomes:
 * - Success → row deleted; the server now agrees with the optimistic cache.
 * - Transient (offline, 5xx, 429) → attempt recorded, replay stops, WorkManager
 *   retries the whole queue with backoff (order preserved).
 * - Permanent (validation 4xx, optimistic-lock `stale`, WMS gate, forbidden,
 *   undecodable payload, attempt cap) → row dead-lettered: deleted + surfaced
 *   on [SyncEvents] so the exact control reverts. The board never blocks.
 * - Session dead (401 ReAuth) → rows KEPT, work ends; AuthRepository requests
 *   a sync after the next successful login.
 */
@HiltWorker
class OutboxWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val outboxDao: OutboxDao,
    private val api: AltusApi,
    private val syncEvents: SyncEvents,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val pending = outboxDao.pending()
        if (pending.isEmpty()) return Result.success()
        Timber.d("Outbox replay: %d pending mutation(s)", pending.size)

        for (entry in pending) {
            if (entry.attemptCount >= MAX_ATTEMPTS) {
                deadLetter(entry, "Couldn't save after repeated attempts.", stale = false)
                continue
            }
            when (val result = replay(entry)) {
                is ApiResult.Success<*> -> outboxDao.delete(entry.id)

                is ApiResult.ReAuth -> {
                    // Session is dead; nothing here can land until re-login.
                    Timber.w("Outbox replay halted: session requires re-auth")
                    return Result.success()
                }

                is ApiResult.Enrollment -> {
                    // Deactivated / unenrolled mid-queue: these writes will
                    // never be accepted for this identity. Dead-letter all.
                    deadLetter(entry, "Your account can no longer make this change.", stale = false)
                }

                is ApiResult.Gate -> {
                    // A WMS gate refused the mutation at replay time (the
                    // offline-vs-gates divergence the risk list calls out).
                    deadLetter(entry, result.gate.message, stale = false)
                }

                is ApiResult.Failure -> {
                    val transient = result.isNetwork ||
                        result.isRateLimited ||
                        (result.httpCode ?: 0) >= 500
                    if (transient) {
                        outboxDao.markAttempt(entry.id, result.message)
                        Timber.d(
                            "Outbox replay deferred at row %d (%s) — transient: %s",
                            entry.id, entry.kind, result.message,
                        )
                        // Stop here: later rows may depend on this one, and if
                        // the network is down they would all fail anyway.
                        return Result.retry()
                    }
                    deadLetter(
                        entry,
                        result.message ?: "Couldn't save this change.",
                        stale = result.isStaleConflict,
                    )
                }
            }
        }
        return Result.success()
    }

    /** Decode the stored payload and hit the matching endpoint. */
    private suspend fun replay(entry: OutboxEntity): ApiResult<*> {
        val decoded = runCatching { decodePayload(entry) }.getOrElse { error ->
            Timber.e(error, "Outbox row %d has an undecodable payload", entry.id)
            return ApiResult.Failure(message = "Couldn't save this change.", cause = error)
        }
        return when (entry.kind) {
            MutationKind.DCC_ENTRY ->
                safeApiCall { api.dccEntry(decoded as DccEntryRequestDto) }

            MutationKind.DCC_PARTICIPANTS ->
                safeApiCall { api.dccParticipants(decoded as DccParticipantsRequestDto) }

            MutationKind.TASK_STATUS ->
                safeApiCall { api.changeTaskStatus(entry.targetId, decoded as StatusChangeRequestDto) }

            MutationKind.TASK_COMMENT ->
                safeApiCall { api.addTaskComment(entry.targetId, decoded as CommentRequestDto) }
        }
    }

    private fun decodePayload(entry: OutboxEntity): Any = when (entry.kind) {
        MutationKind.DCC_ENTRY ->
            ApiJson.decodeFromString(DccEntryRequestDto.serializer(), entry.payloadJson)

        MutationKind.DCC_PARTICIPANTS ->
            ApiJson.decodeFromString(DccParticipantsRequestDto.serializer(), entry.payloadJson)

        MutationKind.TASK_STATUS ->
            ApiJson.decodeFromString(StatusChangeRequestDto.serializer(), entry.payloadJson)

        MutationKind.TASK_COMMENT ->
            ApiJson.decodeFromString(CommentRequestDto.serializer(), entry.payloadJson)
    }

    private suspend fun deadLetter(entry: OutboxEntity, message: String, stale: Boolean) {
        Timber.w("Outbox row %d (%s → %s) rejected: %s", entry.id, entry.kind, entry.targetId, message)
        outboxDao.delete(entry.id)
        syncEvents.emitRejection(
            MutationRejection(
                kind = entry.kind,
                targetId = entry.targetId,
                dayKey = entry.dayKey,
                message = message,
                isStaleConflict = stale,
            ),
        )
    }

    companion object {
        /** After this many transient failures a row is dead-lettered, not hoarded. */
        const val MAX_ATTEMPTS = 24
    }
}
