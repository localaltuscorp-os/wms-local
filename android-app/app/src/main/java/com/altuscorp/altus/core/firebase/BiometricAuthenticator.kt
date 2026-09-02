package com.altuscorp.altus.core.firebase

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/** What the device can offer BEFORE we show any biometric UI. */
enum class BiometricAvailability {
    /** Strong biometrics enrolled and ready. */
    Available,

    /** Hardware exists but nothing is enrolled — route to system settings copy. */
    NotEnrolled,

    /** No biometric hardware on this device. */
    NoHardware,

    /** Hardware busy/unavailable right now — retry later. */
    TemporarilyUnavailable,

    /** Security update required / unknown — treat as unsupported. */
    Unsupported,
}

/** Terminal result of one prompt. `onAuthenticationFailed` (unrecognized
 *  finger) is transient — the prompt stays up — so it never surfaces here. */
sealed interface BiometricOutcome {

    /** Verified. Proceed with unlock / punch. */
    data object Success : BiometricOutcome

    /** User dismissed (back, tap-outside, negative button). Not an error. */
    data object Cancelled : BiometricOutcome

    /** Too many attempts — locked out (temporarily or until credential). */
    data object LockedOut : BiometricOutcome

    /** Hardware/system error with the OS-provided message. */
    data class Error(val code: Int, val message: String) : BiometricOutcome
}

/**
 * The app's single BiometricPrompt wrapper — used by S1 returning-user unlock
 * and the S3 punch confirmation gate.
 *
 * Deliberately built on the STABLE callback API wrapped in a cancellable
 * coroutine (the punch list rejects the alpha ktx coroutine extension on this
 * security-critical path). BIOMETRIC_STRONG only, no device-credential
 * fallback: a PIN can be shared, a fingerprint can't — that asymmetry is the
 * entire anti-proxy design. Employees whose devices can't do strong biometrics
 * are handled server-side via `biometricExempt`, never by weakening the
 * prompt.
 */
@Singleton
class BiometricAuthenticator @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /** Capability probe for gating UI (hide the toggle, disable the control). */
    fun availability(): BiometricAvailability =
        when (BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricAvailability.Available
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricAvailability.NotEnrolled
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricAvailability.NoHardware
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> BiometricAvailability.TemporarilyUnavailable
            else -> BiometricAvailability.Unsupported
        }

    /**
     * Shows the prompt and suspends until a terminal outcome. Runs on Main
     * (BiometricPrompt requirement); cancelling the calling coroutine cancels
     * the prompt. [activity] must be the app's FragmentActivity (MainActivity).
     */
    suspend fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String? = null,
        negativeButtonText: String = "Cancel",
        confirmationRequired: Boolean = false,
    ): BiometricOutcome = withContext(Dispatchers.Main.immediate) {
        suspendCancellableCoroutine { continuation ->
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (continuation.isActive) continuation.resume(BiometricOutcome.Success)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val outcome = when (errorCode) {
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_CANCELED,
                        -> BiometricOutcome.Cancelled

                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT,
                        -> BiometricOutcome.LockedOut

                        else -> BiometricOutcome.Error(errorCode, errString.toString())
                    }
                    if (continuation.isActive) continuation.resume(outcome)
                }
            }

            val prompt = BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                callback,
            )
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { subtitle?.let(::setSubtitle) }
                .setNegativeButtonText(negativeButtonText)
                .setConfirmationRequired(confirmationRequired)
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .build()

            prompt.authenticate(promptInfo)
            continuation.invokeOnCancellation { prompt.cancelAuthentication() }
        }
    }
}
