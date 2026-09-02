package com.altuscorp.altus.core.firebase

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.altuscorp.altus.AltusApplication
import com.altuscorp.altus.R
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.prefs.AltusPreferences
import com.altuscorp.altus.data.remote.dto.RegisterPushRequestDto
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * FCM endpoint. Two jobs, both thin:
 *
 * 1. `onNewToken` — persist the rotated token; if a session exists, register
 *    it immediately against `POST /api/mobile/register-push`. If not (or the
 *    POST fails), it stays in [AltusPreferences.pendingPushToken] and
 *    AuthRepository registers it after the next login — a token rotated while
 *    signed out is never lost.
 * 2. `onMessageReceived` — one notification on the default channel carrying
 *    exactly one `altus://` deep link (the server sends `data.route` like
 *    `"task/<id>"` or `"attendance"`, per lib/push/fcm.ts). Tapping it routes
 *    through MainActivity's VIEW intent-filter into the NavHost.
 *
 * System-tray-delivered messages (app killed, notification-only payloads) are
 * shown by the OS itself on the same channel with the manifest's default icon
 * and color; their tap opens the launcher. This handler owns the
 * foreground/background-delivered case.
 */
@AndroidEntryPoint
class AltusMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var api: AltusApi

    @Inject
    lateinit var preferences: AltusPreferences

    @Inject
    lateinit var firebaseAuth: FirebaseAuth

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        Timber.d("FCM token rotated")
        serviceScope.launch {
            preferences.setPendingPushToken(token)
            if (firebaseAuth.currentUser == null) return@launch
            val result = safeApiCall {
                api.registerPush(RegisterPushRequestDto(token = token, platform = PLATFORM))
            }
            if (result is ApiResult.Success) {
                preferences.setRegisteredPushToken(token)
                preferences.setPendingPushToken(null)
            } else {
                Timber.w("register-push deferred; token kept pending for next login")
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title
            ?: message.data[KEY_TITLE]
            ?: getString(R.string.app_name)
        val body = message.notification?.body ?: message.data[KEY_BODY] ?: ""
        val route = message.data[KEY_ROUTE]
        showNotification(title, body, route, message.messageId)
    }

    @SuppressLint("MissingPermission") // guarded by canPostNotifications() below
    private fun showNotification(title: String, body: String, route: String?, messageId: String?) {
        if (!canPostNotifications()) return

        val contentIntent = buildContentIntent(route)
        val notification = NotificationCompat.Builder(this, AltusApplication.CHANNEL_DEFAULT)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(this, R.color.altus_evergreen))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        val id = messageId?.hashCode() ?: (route ?: title).hashCode()
        NotificationManagerCompat.from(this).notify(id, notification)
    }

    /** Deep link when the route resolves in-app; launcher intent otherwise. */
    private fun buildContentIntent(route: String?): PendingIntent {
        val deepLink = route?.let(::routeToUri)
        val intent = deepLink
            ?.let { uri ->
                Intent(Intent.ACTION_VIEW, uri)
                    .setPackage(packageName)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .takeIf { it.resolveActivity(packageManager) != null }
            }
            ?: packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(packageName)
        return PendingIntent.getActivity(
            this,
            (route ?: "open").hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    /**
     * Server route → `altus://` URI. The web sends short routes
     * (`"task/<id>"`, `"attendance"`); newer payloads may send full
     * `altus://…` links — both normalise here. Unknown hosts simply fail
     * `resolveActivity` and fall back to the launcher.
     */
    private fun routeToUri(route: String): Uri? {
        val trimmed = route.removePrefix(SCHEME_PREFIX).trim('/').trim()
        if (trimmed.isEmpty()) return null
        val mapped = when (trimmed) {
            // Legacy web route name for the punch surface.
            "attendance" -> "punch"
            else -> trimmed
        }
        return Uri.parse("$SCHEME_PREFIX$mapped")
    }

    private fun canPostNotifications(): Boolean {
        val permitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return permitted && NotificationManagerCompat.from(this).areNotificationsEnabled()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val PLATFORM = "android"
        const val KEY_ROUTE = "route"
        const val KEY_TITLE = "title"
        const val KEY_BODY = "body"
        const val SCHEME_PREFIX = "altus://"
    }
}
