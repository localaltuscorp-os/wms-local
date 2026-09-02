package com.altuscorp.altus.feature.profile

import androidx.compose.runtime.Immutable
import androidx.fragment.app.FragmentActivity
import com.altuscorp.altus.core.firebase.BiometricAvailability
import com.altuscorp.altus.data.prefs.ThemeMode

/**
 * S9 Profile / You — the single [Immutable] state the screen renders (Part 6:
 * one UiState + one sealed intent per screen).
 *
 * Three ledgers stack on the deep identity card:
 *  1. **Identity** — name / dept / email / admin, painted from the live `/me`
 *     snapshot, falling back to the cached identity so a returning user sees
 *     themselves before the network answers (never a blank card).
 *  2. **Rhythm** — three honest stat tiles (punch streak, today's DCC
 *     compliance, tasks closed this week). Zeros are shown as zeros; the streak
 *     tile earns the zest flame at [streakEarnsFlame] — the only zest outside
 *     the Day Seal.
 *  3. **Settings** — appearance (Light/Dark/System), the biometric-unlock
 *     toggle (gated on real device capability), notifications, about/version.
 */
@Immutable
data class ProfileUiState(
    /** True only on a true cold start — no live snapshot AND no cached identity. */
    val loading: Boolean = true,
    /** Pull-to-refresh reconcile in flight. */
    val refreshing: Boolean = false,

    // ── Identity ─────────────────────────────────────────────────────────────
    val name: String = "",
    val email: String = "",
    val department: String? = null,
    val avatarUrl: String? = null,
    val isAdmin: Boolean = false,

    // ── Rhythm (honest zeros) ────────────────────────────────────────────────
    /** Consecutive days present, counting back from today (today un-punched is grace, not a break). */
    val punchStreak: Int = 0,
    /** Today's DCC compliance percentage (0–100). */
    val dccPct: Int = 0,
    val dccFilled: Int = 0,
    val dccDue: Int = 0,
    /** Tasks whose completion landed on or after this week's Monday. */
    val tasksClosedThisWeek: Int = 0,

    // ── Settings ─────────────────────────────────────────────────────────────
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val biometricEnabled: Boolean = false,
    val biometricAvailability: BiometricAvailability = BiometricAvailability.Unsupported,
    /** "1.0.0 (1)" — mono About line. */
    val version: String = "",

    // ── Sign-out ─────────────────────────────────────────────────────────────
    val signOutSheetVisible: Boolean = false,
    val signingOut: Boolean = false,
) {
    val hasIdentity: Boolean get() = name.isNotBlank()

    /** ≥5-day streak lights the zest flame glyph (canonical §S9). */
    val streakEarnsFlame: Boolean get() = punchStreak >= 5

    /** The toggle is interactive when hardware is ready, or when it is already
     *  on (so a user can always turn it back off even if hardware went away). */
    val biometricToggleEnabled: Boolean
        get() = biometricAvailability == BiometricAvailability.Available || biometricEnabled
}

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface ProfileIntent {

    /** Appearance segmented control — write-through to DataStore; MainActivity re-themes. */
    data class SelectTheme(val mode: ThemeMode) : ProfileIntent

    /**
     * Flip the biometric-unlock toggle. Turning it ON prompts once to prove the
     * finger works before persisting; turning it OFF is immediate. [activity]
     * hosts the BiometricPrompt.
     */
    data class SetBiometric(val enabled: Boolean, val activity: FragmentActivity) : ProfileIntent

    /** Open the sign-out confirm sheet. */
    data object RequestSignOut : ProfileIntent

    /** Dismiss the sign-out confirm sheet without signing out. */
    data object DismissSignOut : ProfileIntent

    /** Confirmed: DELETE register-push → clear outbox/cache → Firebase sign-out. */
    data object ConfirmSignOut : ProfileIntent

    /** Pull-to-refresh: reconcile identity + all three rhythm sources. */
    data object Refresh : ProfileIntent
}

/** One-shot effects routed through a channel (Part 6: effects ≠ state). */
sealed interface ProfileEvent {
    /** Teardown finished — the screen pops back to Login. */
    data object SignedOut : ProfileEvent

    /** Biometric enable prompt was cancelled / failed — fire the "uh-uh". */
    data object BiometricRejected : ProfileEvent

    /** Biometric unlock just turned on — a single commit tick. */
    data object BiometricEnabled : ProfileEvent
}
