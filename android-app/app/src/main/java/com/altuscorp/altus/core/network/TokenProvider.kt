package com.altuscorp.altus.core.network

import com.google.firebase.auth.FirebaseAuth
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Suspend accessor for the current Firebase ID token — the single Bearer used
 * by every `/api/mobile/...` call AND the supabase-kt `accessToken` provider
 * (Third-Party Auth accepts the raw Firebase token; no custom JWT is ever
 * minted — see architecture `supabaseTokenRoute: NONE`).
 *
 * `getIdToken(false)` returns the SDK-cached token (the SDK owns the hourly
 * refresh); `getIdToken(true)` forces a refresh — used by [AuthInterceptor]'s
 * one-shot 401 retry and the RealtimeAuthBridge.
 *
 * Returns null when signed out or when Firebase cannot mint a token (offline
 * with an expired cache) — callers proceed unauthenticated and the server's
 * 401 surfaces as [ApiResult.ReAuth].
 */
@Singleton
class TokenProvider @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
) {

    /** The signed-in user's ID token, or null when unavailable. Never throws. */
    suspend fun idToken(forceRefresh: Boolean = false): String? {
        val user = firebaseAuth.currentUser ?: return null
        return suspendCancellableCoroutine { continuation ->
            user.getIdToken(forceRefresh)
                .addOnSuccessListener { result ->
                    if (continuation.isActive) continuation.resume(result.token)
                }
                .addOnFailureListener {
                    if (continuation.isActive) continuation.resume(null)
                }
        }
    }

    /** True when a Firebase user session exists on-device. */
    fun isSignedIn(): Boolean = firebaseAuth.currentUser != null
}
