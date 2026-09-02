package com.altuscorp.altus.core.network

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
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = runBlocking { tokenProvider.idToken(forceRefresh = false) }

        val authed = if (token.isNullOrEmpty()) {
            original
        } else {
            original.newBuilder().header(HEADER_AUTHORIZATION, "$BEARER_PREFIX$token").build()
        }
        var response = chain.proceed(authed)

        // One-shot retry with a force-refreshed token on 401.
        if (response.code == HTTP_UNAUTHORIZED && !token.isNullOrEmpty()) {
            val fresh = runBlocking { tokenProvider.idToken(forceRefresh = true) }
            if (!fresh.isNullOrEmpty() && fresh != token) {
                response.close()
                response = chain.proceed(
                    original.newBuilder().header(HEADER_AUTHORIZATION, "$BEARER_PREFIX$fresh").build(),
                )
            }
        }
        return response
    }

    private companion object {
        const val HEADER_AUTHORIZATION = "Authorization"
        const val BEARER_PREFIX = "Bearer "
        const val HTTP_UNAUTHORIZED = 401
    }
}
