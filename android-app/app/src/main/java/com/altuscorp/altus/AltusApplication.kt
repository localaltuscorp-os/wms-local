package com.altuscorp.altus

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

/**
 * Application entry point.
 *
 * - Hosts the Hilt graph ([HiltAndroidApp]).
 * - Provides the WorkManager configuration with the Hilt worker factory so the
 *   offline outbox worker (`data.sync.OutboxWorker`, a @HiltWorker) can be
 *   constructor-injected. The default WorkManager initializer is removed in the
 *   manifest; WorkManager initialises on demand through this provider.
 * - Plants Timber (debug builds only — release logcat stays silent).
 * - Creates the default notification channel FCM messages land on
 *   ([CHANNEL_DEFAULT], matching the manifest's
 *   `com.google.firebase.messaging.default_notification_channel_id`).
 */
@HiltAndroidApp
class AltusApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) Log.DEBUG else Log.ERROR)
            .build()

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        val general = NotificationChannel(
            CHANNEL_DEFAULT,
            getString(R.string.notification_channel_default),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = getString(R.string.notification_channel_default_description)
        }
        manager.createNotificationChannel(general)
    }

    companion object {
        /** Channel every FCM payload lands on unless it names its own. */
        const val CHANNEL_DEFAULT = "altus_default"
    }
}
