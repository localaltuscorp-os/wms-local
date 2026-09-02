package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.firebase.AuthOutcome
import com.altuscorp.altus.core.firebase.FirebaseAuthManager
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.dao.CacheDao
import com.altuscorp.altus.data.local.dao.OutboxDao
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.prefs.AltusPreferences
import com.altuscorp.altus.data.prefs.CachedIdentity
import com.altuscorp.altus.data.remote.dto.MeDto
import com.altuscorp.altus.data.remote.dto.RegisterPushRequestDto
import com.altuscorp.altus.data.remote.dto.UnregisterPushRequestDto
import com.altuscorp.altus.data.sync.SyncScheduler
import com.altuscorp.altus.domain.model.Identity
import com.altuscorp.altus.domain.model.toDomain
import com.google.firebase.messaging.FirebaseMessaging
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import timber.log.Timber

/**
 * Session orchestration (S1 + S9 sign-out): sign-in / biometric resume /
 * enrollment resolution, push register-unregister bookkeeping, and the
 * sign-out teardown ORDER (unregister push while the Bearer is still valid →
 * stop + clear the outbox → clear the read cache → end the Firebase session).
 */
interface AuthRepository {

    /** Last-known enrolled identity — splash routing + offline greeting. */
    val cachedIdentity: Flow<CachedIdentity?>

    /** "Unlock with biometrics" toggle (S9 / the S1 returning-user default). */
    val biometricUnlockEnabled: Flow<Boolean>

    /** Live decoded `/me` snapshot (You screen identity card). */
    fun identity(): Flow<Identity?>

    /** A Firebase session exists on-device (the biometric-unlock precondition). */
    fun isSignedIn(): Boolean

    /** The signed-in Firebase email — mono line on the enrollment gate. */
    fun signedInEmail(): String?

    /**
     * Email/password sign-in → enrollment resolution. On [AuthOutcome.Enrolled]
     * the `/me` snapshot is cached, the pending FCM token registers, and any
     * outbox rows held while the session was dead flush.
     */
    suspend fun signIn(email: String, password: String): AuthOutcome

    /**
     * Returning-user path (after BiometricPrompt, or a cold start with a live
     * Firebase session): re-resolve enrollment and re-run the post-login side
     * effects. Never prompts — pure session revalidation.
     */
    suspend fun resumeSession(): AuthOutcome

    /** Re-fetch `/me`; refreshes both the Room snapshot and the prefs identity. */
    suspend fun refreshMe(): ApiResult<Identity>

    /**
     * Register the newest FCM token with the backend if one is waiting (or can
     * be minted). Safe to call repeatedly — it no-ops when the registered token
     * is already current.
     */
    suspend fun registerPendingPushToken()

    suspend fun setBiometricUnlockEnabled(enabled: Boolean)

    /**
     * Full teardown, in the only safe order:
     * 1. best-effort `DELETE /register-push` (needs the still-valid Bearer),
     * 2. cancel outbox replay + drop queued mutations,
     * 3. clear the read cache (no identity inherits another's ledger),
     * 4. clear prefs + Firebase sign-out.
     */
    suspend fun signOut()
}

class AuthRepositoryImpl @Inject constructor(
    private val authManager: FirebaseAuthManager,
    private val api: AltusApi,
    private val preferences: AltusPreferences,
    private val cache: JsonCache,
    private val cacheDao: CacheDao,
    private val outboxDao: OutboxDao,
    private val syncScheduler: SyncScheduler,
    private val firebaseMessaging: FirebaseMessaging,
) : AuthRepository {

    override val cachedIdentity: Flow<CachedIdentity?> = preferences.cachedIdentity

    override val biometricUnlockEnabled: Flow<Boolean> = preferences.biometricUnlockEnabled

    override fun identity(): Flow<Identity?> =
        cache.observe(CacheKeys.ME, MeDto.serializer()).map { it?.toDomain() }

    override fun isSignedIn(): Boolean = authManager.isSignedIn()

    override fun signedInEmail(): String? = authManager.signedInEmail()

    override suspend fun signIn(email: String, password: String): AuthOutcome {
        val outcome = authManager.signIn(email, password)
        if (outcome is AuthOutcome.Enrolled) onSessionEstablished(outcome.me)
        return outcome
    }

    override suspend fun resumeSession(): AuthOutcome {
        val outcome = authManager.resolveEnrollment()
        if (outcome is AuthOutcome.Enrolled) onSessionEstablished(outcome.me)
        return outcome
    }

    override suspend fun refreshMe(): ApiResult<Identity> {
        val result = safeApiCall { api.me() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.ME, MeDto.serializer(), result.data)
            preferences.setCachedIdentity(result.data.toCachedIdentity())
        }
        return result.map { it.toDomain() }
    }

    override suspend fun registerPendingPushToken() {
        val pending = preferences.pendingPushToken.first()
        val token = pending ?: currentFcmToken() ?: return
        if (token == preferences.registeredPushToken.first()) {
            // Already registered — just retire the pending marker.
            if (pending != null) preferences.setPendingPushToken(null)
            return
        }
        val result = safeApiCall {
            api.registerPush(RegisterPushRequestDto(token = token, platform = "android"))
        }
        if (result is ApiResult.Success) {
            preferences.setRegisteredPushToken(token)
            preferences.setPendingPushToken(null)
        } else {
            // Keep it pending: AltusMessagingService or the next login retries.
            preferences.setPendingPushToken(token)
            Timber.w("register-push deferred — token kept pending")
        }
    }

    override suspend fun setBiometricUnlockEnabled(enabled: Boolean) {
        preferences.setBiometricUnlockEnabled(enabled)
    }

    override suspend fun signOut() {
        // 1. Retire this device's push token while the Bearer still works.
        val token = preferences.registeredPushToken.first()
        if (token != null) {
            val result = safeApiCall { api.unregisterPush(UnregisterPushRequestDto(token = token)) }
            if (result !is ApiResult.Success) {
                // Best-effort: the server reassigns tokens on next login anyway.
                Timber.w("unregister-push failed on sign-out — continuing teardown")
            }
        }
        // 2. A new session must not replay a stranger's day.
        syncScheduler.cancel()
        outboxDao.clearAll()
        // 3. No identity inherits another's ledger.
        cacheDao.clearAll()
        // 4. Prefs + Firebase session.
        authManager.signOut()
    }

    /** Post-login side effects shared by [signIn] and [resumeSession]. */
    private suspend fun onSessionEstablished(me: MeDto) {
        cache.write(CacheKeys.ME, MeDto.serializer(), me)
        registerPendingPushToken()
        // Flush anything the outbox held while the session was dead.
        syncScheduler.requestSync()
    }

    private suspend fun currentFcmToken(): String? = try {
        firebaseMessaging.token.await()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Timber.w(e, "FCM token unavailable")
        null
    }
}

private fun MeDto.toCachedIdentity(): CachedIdentity = CachedIdentity(
    employeeId = id,
    name = name,
    email = email,
    department = department,
    isAdmin = isAdmin,
    avatarUrl = avatarUrl,
)
