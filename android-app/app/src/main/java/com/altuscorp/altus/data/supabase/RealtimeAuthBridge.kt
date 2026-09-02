package com.altuscorp.altus.data.supabase

import com.altuscorp.altus.core.di.ApplicationScope
import com.altuscorp.altus.core.network.TokenProvider
import com.google.firebase.auth.FirebaseAuth
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.realtime
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Keeps the long-lived Realtime socket authenticated across Firebase's hourly
 * ID-token rotation — the ">1h session silently dies" failure the risk list
 * flags as a certainty, not a maybe (critique P1-3).
 *
 * supabase-kt's `accessToken` provider is only consulted per *request*; an
 * already-open websocket keeps whatever JWT it joined with. So this bridge
 * listens to [FirebaseAuth]'s ID-token refresh callback and pushes every fresh
 * token to the socket via `realtime.setAuth(...)`, which re-sends the access
 * token on all live channels. On sign-out it tears the socket down — an
 * unauthenticated socket is a battery leak that can only ever stream nothing.
 *
 * Design-for-dead-socket: this bridge is necessary but NOT sufficient — OEM
 * Doze will still kill sockets. [SupabaseRealtime] callers must treat
 * reconnect-and-refetch-on-resume as the normal case, with the bridge keeping
 * the *foreground* session honest.
 */
@Singleton
class RealtimeAuthBridge @Inject constructor(
    private val supabase: SupabaseClient,
    private val firebaseAuth: FirebaseAuth,
    private val tokenProvider: TokenProvider,
    @ApplicationScope private val scope: CoroutineScope,
) {

    private val started = AtomicBoolean(false)

    /**
     * Registers the token listener exactly once. Called by [SupabaseRealtime]
     * before the first subscription; safe (and cheap) to call repeatedly.
     */
    fun ensureStarted() {
        if (!started.compareAndSet(false, true)) return
        firebaseAuth.addIdTokenListener(
            FirebaseAuth.IdTokenListener { auth ->
                if (auth.currentUser == null) {
                    // Signed out: drop the socket, don't re-auth it.
                    scope.launch {
                        runCatching { supabase.realtime.disconnect() }
                            .onFailure { Timber.w(it, "Realtime disconnect on sign-out failed") }
                    }
                    return@IdTokenListener
                }
                scope.launch { pushFreshToken() }
            },
        )
    }

    /**
     * Reads the (SDK-cached, auto-refreshed) token and re-auths the socket.
     * Also called by [SupabaseRealtime] on resume so a socket revived after
     * process-alive-but-dozed gaps rejoins with a live JWT.
     */
    suspend fun pushFreshToken() {
        val token = tokenProvider.idToken(forceRefresh = false) ?: return
        runCatching { supabase.realtime.setAuth(token) }
            .onFailure { Timber.w(it, "Realtime setAuth failed; socket will re-auth on reconnect") }
    }
}
