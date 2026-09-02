package com.altuscorp.altus.core.firebase

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.EnrollmentBlock
import com.altuscorp.altus.core.network.TokenProvider
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.prefs.AltusPreferences
import com.altuscorp.altus.data.prefs.CachedIdentity
import com.altuscorp.altus.data.remote.dto.MeDto
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.tasks.await
import timber.log.Timber

/**
 * Terminal states of the S1 sign-in / unlock flow. The ViewModel `when`s over
 * this — Firebase exceptions and `/me` HTTP outcomes never leak upward.
 */
sealed interface AuthOutcome {

    /** Signed in AND enrolled AND active — proceed to Today. */
    data class Enrolled(val identity: CachedIdentity, val me: MeDto) : AuthOutcome

    /** Firebase session exists but `/me` gates it (S1 enrollment screens). */
    data class Blocked(val reason: EnrollmentBlock) : AuthOutcome

    /** Wrong email/password (or user deleted). Copy stays generic on purpose. */
    data object InvalidCredentials : AuthOutcome

    /**
     * Network unavailable. Returning users with a [CachedIdentity] may proceed
     * to a cached, read-only Today; first-time sign-in cannot.
     */
    data object Offline : AuthOutcome

    /** Anything else (rate limit, server error, malformed body). */
    data class Failed(val message: String?) : AuthOutcome
}

/**
 * The ONLY writer of Firebase auth state. Wraps the native SDK (which owns
 * refresh-token exchange and hourly ID-token rotation — never hand-rolled
 * Identity Toolkit REST) and resolves enrollment against `GET /api/mobile/me`,
 * caching the identity snapshot for splash routing and offline greeting.
 *
 * Sign-out order matters: push unregistration + outbox clearing are
 * AuthRepository's job BEFORE calling [signOut] here, because both need the
 * still-valid Bearer.
 */
@Singleton
class FirebaseAuthManager @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
    private val api: AltusApi,
    private val preferences: AltusPreferences,
    private val tokenProvider: TokenProvider,
) {

    /** True when a Firebase user session exists on-device (biometric-unlock path). */
    fun isSignedIn(): Boolean = firebaseAuth.currentUser != null

    /** The signed-in Firebase email (shown in mono on the enrollment gate). */
    fun signedInEmail(): String? = firebaseAuth.currentUser?.email

    /** Current ID token; see [TokenProvider]. */
    suspend fun idToken(forceRefresh: Boolean = false): String? =
        tokenProvider.idToken(forceRefresh)

    /**
     * Email/password sign-in, then enrollment resolution. Any Firebase failure
     * maps to a typed outcome; a Firebase success followed by a `/me` gate
     * still leaves the Firebase session in place so the gate screen can show
     * the signed-in email and offer sign-out.
     */
    suspend fun signIn(email: String, password: String): AuthOutcome {
        try {
            firebaseAuth.signInWithEmailAndPassword(email.trim(), password).await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: FirebaseAuthInvalidUserException) {
            return AuthOutcome.InvalidCredentials
        } catch (e: FirebaseAuthInvalidCredentialsException) {
            return AuthOutcome.InvalidCredentials
        } catch (e: FirebaseNetworkException) {
            return AuthOutcome.Offline
        } catch (e: FirebaseTooManyRequestsException) {
            return AuthOutcome.Failed("Too many attempts — wait a moment and try again.")
        } catch (e: Exception) {
            Timber.w(e, "Firebase sign-in failed")
            return AuthOutcome.Failed(e.message)
        }
        return resolveEnrollment()
    }

    /**
     * `GET /me` → enrollment verdict + cached identity refresh. Also the
     * returning-user path after BiometricPrompt: unlock → cached Firebase
     * session → this call.
     */
    suspend fun resolveEnrollment(): AuthOutcome {
        if (firebaseAuth.currentUser == null) return AuthOutcome.InvalidCredentials
        return when (val result = safeApiCall { api.me() }) {
            is ApiResult.Success -> {
                val me = result.data
                val identity = CachedIdentity(
                    employeeId = me.id,
                    name = me.name,
                    email = me.email,
                    department = me.department,
                    isAdmin = me.isAdmin,
                    avatarUrl = me.avatarUrl,
                )
                preferences.setCachedIdentity(identity)
                AuthOutcome.Enrolled(identity, me)
            }

            is ApiResult.Enrollment -> AuthOutcome.Blocked(result.reason)

            // 401 straight after a Firebase success means the server rejected
            // a token Firebase considers fresh — misconfig, not user error.
            is ApiResult.ReAuth -> AuthOutcome.Failed("Session could not be verified — try again.")

            is ApiResult.Gate -> AuthOutcome.Failed(result.gate.message)

            is ApiResult.Failure ->
                if (result.isNetwork) AuthOutcome.Offline else AuthOutcome.Failed(result.message)
        }
    }

    /**
     * Clears identity-bound preferences and ends the Firebase session.
     * (AuthRepository has already unregistered push + cleared cache/outbox.)
     */
    suspend fun signOut() {
        preferences.clearOnSignOut()
        firebaseAuth.signOut()
    }
}
