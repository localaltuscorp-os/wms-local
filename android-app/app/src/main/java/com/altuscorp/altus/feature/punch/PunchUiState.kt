package com.altuscorp.altus.feature.punch

import androidx.compose.runtime.Immutable
import androidx.fragment.app.FragmentActivity
import com.altuscorp.altus.ui.designsystem.GateCardData

/**
 * S3 Punch — one @Immutable UiState + one sealed intent (Part 6 contract).
 *
 * The live seconds clock is deliberately NOT in here (critique P1-6): it is an
 * isolated per-second `State<String>` read only by the numeral composable, so
 * the tick never recomposes the ledger, the hold control or the grain surface.
 */

/** Where the punch attempt currently sits. */
enum class PunchPhase {
    /** Armed (or disarmed by trust checks) — the hold control is live. */
    Idle,

    /** BiometricPrompt is up. */
    Authenticating,

    /** `POST /attendance/punch` in flight — control shows "Punching…". */
    Submitting,

    /** Server stamped it: commit-morph → stamp → typed-in time → auto-dismiss. */
    Success,
}

/**
 * The Zone row's trust machine. The server owns the geofence *verdict* (the
 * payload carries only the raw fix), so the honest client-side statement is
 * the state of the fix itself — permission, services, acquisition, accuracy.
 */
@Immutable
sealed interface ZoneStatus {

    /** Evaluating permission/services — cold entry. */
    data object Checking : ZoneStatus

    /** Location permission not granted — the Allow button routes to the system dialog. */
    data object PermissionNeeded : ZoneStatus

    /** Location services are off at the OS level. */
    data object LocationOff : ZoneStatus

    /** FusedLocationProvider is working on a fix. */
    data object Acquiring : ZoneStatus

    /** No fix inside the timeout — retry affordance. */
    data object NoFix : ZoneStatus

    /** A fresh fix is captured and will ride the punch payload. */
    data class Locked(val accuracyM: Int) : ZoneStatus
}

/** Whether the biometric confirmation gate can be satisfied on this device. */
enum class BiometricGate {
    /** Availability probe not run yet. */
    Checking,

    /** BIOMETRIC_STRONG enrolled and ready. */
    Ready,

    /** Server-side `biometricExempt` — the prompt is skipped entirely. */
    Exempt,

    /** Hardware exists, nothing enrolled — route the user to system settings. */
    NotEnrolled,

    /** No strong-biometric hardware and not exempt — punch is blocked here. */
    NoHardware,

    /** Sensor busy right now; the prompt itself may still succeed. */
    TemporarilyUnavailable,

    /** Security-update-required / unknown — treated as blocked. */
    Unsupported,
}

@Immutable
data class PunchUiState(
    /** True on a cold cache before the first attendance snapshot lands. */
    val loading: Boolean = true,

    /** "in" | "out" | null (both punches done — the day is sealed). */
    val punchKind: String? = null,

    // ── Status ledger (trust shown BEFORE the tap) ────────────────────────
    /** Server-formatted local times for the Today row ("09:14"). */
    val checkedInAt: String? = null,
    val checkedOutAt: String? = null,
    val deviceLabel: String = "",
    val devicesEnrolled: Int = 0,
    val geofenceEnabled: Boolean = false,
    val geofenceRadiusM: Int? = null,
    val zone: ZoneStatus = ZoneStatus.Checking,
    val biometricGate: BiometricGate = BiometricGate.Checking,

    // ── Punch machinery ───────────────────────────────────────────────────
    val phase: PunchPhase = PunchPhase.Idle,

    /** The sliding 409 gate card; non-null slides the control down 12dp. */
    val gate: GateCardData? = null,

    /** True right after a gate cleared on resume — "Re-armed" hint copy. */
    val rearmed: Boolean = false,

    /** Inline failure copy (offline, biometric lockout, 5xx…). */
    val error: String? = null,

    // ── Success choreography inputs ───────────────────────────────────────
    /** The kind that was just punched (stable while punchKind flips). */
    val stampedKind: String? = null,

    /** The time the Today row types in character-by-character ("18:42"). */
    val stampedTime: String? = null,

    /** This punch enrolled a new device (admins are alerted server-side). */
    val newDevice: Boolean = false,
) {

    /** Both punches recorded — nothing left to do here today. */
    val daySealed: Boolean get() = !loading && punchKind == null

    /** Zone trust satisfied for the hold control (only gates when geofenced). */
    val zoneReady: Boolean get() = !geofenceEnabled || zone is ZoneStatus.Locked

    /** Biometric trust satisfiable (the prompt itself may still say no). */
    val biometricReady: Boolean
        get() = when (biometricGate) {
            BiometricGate.Ready,
            BiometricGate.Exempt,
            BiometricGate.TemporarilyUnavailable,
            -> true

            else -> false
        }

    /** The single condition the 72dp hold control keys off. */
    val holdEnabled: Boolean
        get() = phase == PunchPhase.Idle &&
            !loading &&
            punchKind != null &&
            gate == null &&
            zoneReady &&
            biometricReady
}

/** Everything the screen can ask of the ViewModel. */
sealed interface PunchIntent {

    /** The 600ms hold completed — run biometric → POST. [activity] hosts the prompt. */
    data class HoldCompleted(val activity: FragmentActivity?) : PunchIntent

    /** ON_RESUME: refresh sources, re-probe trust, clear + re-arm any gate. */
    data object Resumed : PunchIntent

    /** The system location-permission dialog returned. */
    data class LocationPermissionResult(val granted: Boolean) : PunchIntent

    /** "Retry" on a failed GPS fix. */
    data object RetryLocation : PunchIntent
}
