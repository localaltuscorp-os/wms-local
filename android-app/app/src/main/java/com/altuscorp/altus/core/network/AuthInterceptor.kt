package com.altuscorp.altus.core.network

import com.altuscorp.altus.core.util.DeviceId
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Injects `Authorization: Bearer <Firebase ID token>` on every request and
 * performs exactly ONE forced-refresh retry on a 401 (the "token expired
 * between cache-read and server-verify" edge). A second 401 propagates so
 * [safeApiCall] maps it to [ApiResult.ReAuth] and the session-ended flow runs.
 *
 * OkHttp interceptors are synchronous, so the suspend [TokenProvider] is
 * bridged with runBlocking — this executes on OkHttp's dispatcher threads,
 * never the main thread.
 *
 * ── DEVICE IDENTITY ────────────────────────────────────────────────────────
 * Also injects [HEADER_DEVICE_ID] on EVERY request. The server gates the whole
 * WMS on a registered device, not just the punch (see lib/security/device-
 * access.ts), so every endpoint needs to know which phone is asking — not only
 * `POST /attendance/punch`, which is where the id used to travel in the body.
 *
 * The value is the same keystore-backed id the punch has always sent, so a
 * phone already approved for attendance is already approved for the app; nobody
 * re-enrols. [DeviceId.id] is a cached `by lazy`, so this costs one map lookup
 * per request after the first.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
    private val deviceId: DeviceId,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = runBlocking { tokenProvider.idToken(forceRefresh = false) }

        val withDevice = original.newBuilder()
            .header(HEADER_DEVICE_ID, deviceId.id)
            .build()

        val authed = if (token.isNullOrEmpty()) {
            withDevice
        } else {
            withDevice.newBuilder().header(HEADER_AUTHORIZATION, "$BEARER_PREFIX$token").build()
        }
        var response = chain.proceed(authed)

        // One-shot retry with a force-refreshed token on 401.
        if (response.code == HTTP_UNAUTHORIZED && !token.isNullOrEmpty()) {
            val fresh = runBlocking { tokenProvider.idToken(forceRefresh = true) }
            if (!fresh.isNullOrEmpty() && fresh != token) {
                response.close()
                // Retry from `withDevice`, not `original` — rebuilding from the
                // untouched request would drop the device header and the retry
                // would be refused as an unidentified device, turning a routine
                // token refresh into a lockout.
                response = chain.proceed(
                    withDevice.newBuilder().header(HEADER_AUTHORIZATION, "$BEARER_PREFIX$fresh").build(),
                )
            }
        }
        return response
    }

    private companion object {
        const val HEADER_AUTHORIZATION = "Authorization"

        /** Must match DEVICE_ID_HEADER in lib/security/device-access.ts. */
        const val HEADER_DEVICE_ID = "X-Altus-Device-Id"
        const val BEARER_PREFIX = "Bearer "
        const val HTTP_UNAUTHORIZED = 401
    }
}
