package com.altuscorp.altus.feature.login

import androidx.compose.runtime.Immutable
import androidx.fragment.app.FragmentActivity

/**
 * Which pane the S1 lower panel is showing.
 *
 * The mode is decided once at bootstrap from the session snapshot:
 * no Firebase session → [Password]; a session with the biometric-unlock
 * toggle on and strong biometrics available → [Biometric] (the returning-user
 * default); a session without a usable biometric path → [Resuming] (silent
 * revalidation, no prompt).
 */
enum class LoginMode {
    /** Silent `resumeSession()` revalidation in flight — quiet spinner pane. */
    Resuming,

    /** "Unlock with biometrics" — the returning-user default path. */
    Biometric,

    /** Email + password form (first sign-in, or every fallback). */
    Password,
}

/**
 * The single S1 state object. Errors are per-surface: [emailError] /
 * [passwordError] ride their fields, [formError] is the banner above the
 * primary action (offline, rate-limit, session-ended copy).
 */
@Immutable
data class LoginUiState(
    /** False until the cached-identity + biometric probe resolves (splash holds ~800ms anyway). */
    val bootstrapped: Boolean = false,
    val mode: LoginMode = LoginMode.Password,
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val formError: String? = null,
    /** Continue pressed — the label commit-morphs to a spinner. */
    val submitting: Boolean = false,
    /** BiometricPrompt or the follow-up `/me` revalidation in flight. */
    val unlocking: Boolean = false,
    /** Session cached + toggle on + BIOMETRIC_STRONG available — the unlock pane is offerable. */
    val biometricReady: Boolean = false,
    val cachedName: String? = null,
    val cachedEmail: String? = null,
    val cachedAvatarUrl: String? = null,
) {
    /** Any terminal action in flight — inputs lock while true. */
    val busy: Boolean get() = submitting || unlocking || mode == LoginMode.Resuming

    /** Greeting name for the biometric pane ("Welcome back, Manan"). */
    val firstName: String? get() = cachedName?.substringBefore(' ')?.takeIf { it.isNotBlank() }
}

/** Everything the S1 screen can ask of its ViewModel. */
sealed interface LoginIntent {

    data class EmailChanged(val value: String) : LoginIntent

    data class PasswordChanged(val value: String) : LoginIntent

    /** Continue — validate, sign in, resolve enrollment. */
    data object Submit : LoginIntent

    /**
     * Show the BiometricPrompt and, on success, revalidate the cached session.
     * Carries the host [FragmentActivity] because BiometricPrompt requires one;
     * the ViewModel uses it only for the duration of the call.
     */
    data class UnlockWithBiometrics(val activity: FragmentActivity) : LoginIntent

    /** Drop from the biometric pane to the password form. */
    data object UsePassword : LoginIntent

    /** Return from the password form to the biometric pane. */
    data object UseBiometrics : LoginIntent
}

/** One-shot effects — navigation and the rejection haptic, never state. */
sealed interface LoginEvent {

    /** Enrolled and active — the NavHost pushes into Today. */
    data object SignedIn : LoginEvent

    /**
     * `/me` gated the session; [kind] is an
     * [com.altuscorp.altus.navigation.EnrollmentGateRoute] kind constant.
     */
    data class EnrollmentBlocked(val kind: String) : LoginEvent

    /** A sign-in attempt failed — the screen fires the "uh-uh" double tick. */
    data object Rejected : LoginEvent
}
