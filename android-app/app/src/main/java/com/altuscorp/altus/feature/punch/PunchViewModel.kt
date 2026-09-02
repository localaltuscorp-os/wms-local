package com.altuscorp.altus.feature.punch

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.firebase.BiometricAuthenticator
import com.altuscorp.altus.core.firebase.BiometricAvailability
import com.altuscorp.altus.core.firebase.BiometricOutcome
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.core.util.DeviceId
import com.altuscorp.altus.data.remote.dto.PunchLocationDto
import com.altuscorp.altus.data.repository.AttendanceRepository
import com.altuscorp.altus.ui.designsystem.toGateCardData
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import timber.log.Timber

/**
 * S3 Punch — geofence/device trust pre-check, hold → BiometricPrompt →
 * ONLINE-ONLY `POST /attendance/punch`, 409 gates as re-arming cards.
 *
 * The repository patches the attendance + dashboard caches on success, so
 * Today is already optimistic when this screen auto-dismisses; the Day Ring
 * segment sweep is that cache patch re-emitting through DayRepository.
 */
@HiltViewModel
class PunchViewModel @Inject constructor(
    private val attendanceRepository: AttendanceRepository,
    private val biometric: BiometricAuthenticator,
    deviceId: DeviceId,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(PunchUiState(deviceLabel = deviceId.label))
    val state: StateFlow<PunchUiState> = _state.asStateFlow()

    /** Server-side exemption flag from the last attendance snapshot. */
    private var biometricExempt = false

    /** Freshest fix — rides the punch payload even when the zone row is calm. */
    private var lastFix: PunchLocationDto? = null

    private var zoneJob: Job? = null

    init {
        observeAttendance()
        viewModelScope.launch { attendanceRepository.refresh() }
        refreshBiometricGate()
        evaluateZone()
    }

    fun onIntent(intent: PunchIntent) {
        when (intent) {
            is PunchIntent.HoldCompleted -> punch(intent.activity)
            PunchIntent.Resumed -> onResumed()
            is PunchIntent.LocationPermissionResult -> evaluateZone()
            PunchIntent.RetryLocation -> evaluateZone()
        }
    }

    // ── Sources ──────────────────────────────────────────────────────────────

    private fun observeAttendance() {
        viewModelScope.launch {
            attendanceRepository.attendance().collect { snapshot ->
                if (snapshot == null) {
                    _state.update { it.copy(loading = true) }
                    return@collect
                }
                biometricExempt = snapshot.biometricExempt
                _state.update {
                    it.copy(
                        loading = false,
                        punchKind = snapshot.nextPunchKind,
                        checkedInAt = snapshot.today.checkIn,
                        checkedOutAt = snapshot.today.checkOut,
                        devicesEnrolled = snapshot.devicesEnrolled,
                        geofenceEnabled = snapshot.geofence.enabled,
                        geofenceRadiusM = snapshot.geofence.radiusM,
                        biometricGate = resolveBiometricGate(),
                    )
                }
            }
        }
    }

    private fun onResumed() {
        refreshBiometricGate()
        evaluateZone()
        viewModelScope.launch { attendanceRepository.refresh() }
        // Coming back from a gate's fix surface: the card slides out and the
        // control re-arms (S3 — gates re-arm, never dead-end).
        _state.update {
            if (it.gate != null) it.copy(gate = null, rearmed = true, error = null) else it
        }
    }

    // ── Trust: biometrics ────────────────────────────────────────────────────

    private fun refreshBiometricGate() {
        _state.update { it.copy(biometricGate = resolveBiometricGate()) }
    }

    private fun resolveBiometricGate(): BiometricGate = when {
        biometricExempt -> BiometricGate.Exempt
        else -> when (biometric.availability()) {
            BiometricAvailability.Available -> BiometricGate.Ready
            BiometricAvailability.NotEnrolled -> BiometricGate.NotEnrolled
            BiometricAvailability.NoHardware -> BiometricGate.NoHardware
            BiometricAvailability.TemporarilyUnavailable -> BiometricGate.TemporarilyUnavailable
            BiometricAvailability.Unsupported -> BiometricGate.Unsupported
        }
    }

    // ── Trust: zone / location ───────────────────────────────────────────────

    private fun evaluateZone() {
        zoneJob?.cancel()
        zoneJob = viewModelScope.launch {
            if (!hasLocationPermission()) {
                setZone(ZoneStatus.PermissionNeeded)
                return@launch
            }
            if (!locationServicesEnabled()) {
                setZone(ZoneStatus.LocationOff)
                return@launch
            }
            setZone(ZoneStatus.Acquiring)
            val fix = acquireFix()
            if (fix != null) {
                lastFix = fix
                setZone(ZoneStatus.Locked(fix.accuracyM.roundToInt()))
            } else {
                setZone(ZoneStatus.NoFix)
            }
        }
    }

    private fun setZone(zone: ZoneStatus) = _state.update { it.copy(zone = zone) }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun locationServicesEnabled(): Boolean {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return false
        return LocationManagerCompat.isLocationEnabled(manager)
    }

    /** One high-accuracy fix, bounded by [LOCATION_TIMEOUT_MS]; null on miss. */
    @SuppressLint("MissingPermission") // guarded by hasLocationPermission() above
    private suspend fun acquireFix(): PunchLocationDto? {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val location: Location? = withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                val cancellation = CancellationTokenSource()
                client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
                    .addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
                    .addOnFailureListener { error ->
                        Timber.w(error, "Punch location fix failed")
                        if (continuation.isActive) continuation.resume(null)
                    }
                    .addOnCanceledListener { if (continuation.isActive) continuation.resume(null) }
                continuation.invokeOnCancellation { cancellation.cancel() }
            }
        }
        return location?.let {
            PunchLocationDto(lat = it.latitude, lng = it.longitude, accuracyM = it.accuracy.toDouble())
        }
    }

    // ── THE punch ────────────────────────────────────────────────────────────

    private fun punch(activity: FragmentActivity?) {
        val armed = state.value
        if (!armed.holdEnabled) return
        val kind = armed.punchKind ?: return

        viewModelScope.launch {
            _state.update {
                it.copy(phase = PunchPhase.Authenticating, error = null, rearmed = false)
            }

            if (armed.biometricGate != BiometricGate.Exempt) {
                if (activity == null) {
                    fail("Couldn't open the biometric prompt — try again.")
                    return@launch
                }
                val outcome = biometric.authenticate(
                    activity = activity,
                    title = if (kind == "in") "Confirm clock in" else "Confirm clock out",
                    subtitle = "Verify it's you — punches are biometric",
                )
                when (outcome) {
                    BiometricOutcome.Success -> Unit
                    BiometricOutcome.Cancelled -> {
                        _state.update { it.copy(phase = PunchPhase.Idle) }
                        return@launch
                    }

                    BiometricOutcome.LockedOut -> {
                        fail("Biometrics locked out — wait a moment, then try again.")
                        return@launch
                    }

                    is BiometricOutcome.Error -> {
                        fail(outcome.message.ifBlank { "Biometric check failed — try again." })
                        return@launch
                    }
                }
            }

            _state.update { it.copy(phase = PunchPhase.Submitting) }
            when (val result = attendanceRepository.punch(kind = kind, location = lastFix)) {
                is ApiResult.Success -> _state.update {
                    it.copy(
                        phase = PunchPhase.Success,
                        gate = null,
                        stampedKind = kind,
                        stampedTime = DateFormat.time(Instant.now()),
                        newDevice = result.data.newDevice,
                    )
                }

                // 409 gate: screen-within-the-screen — control slides down,
                // the warn card slides in, one route button (Signature 5).
                is ApiResult.Gate -> _state.update {
                    it.copy(phase = PunchPhase.Idle, gate = result.gate.toGateCardData())
                }

                ApiResult.ReAuth ->
                    fail("Your session ended — sign in again to punch.")

                is ApiResult.Enrollment ->
                    fail("Your account can't punch right now — contact your admin.")

                is ApiResult.Failure -> fail(
                    when {
                        result.isNetwork -> "You're offline — punching needs a live connection."
                        result.isRateLimited -> "Too many attempts — give it a few seconds."
                        else -> result.message ?: "Couldn't record the punch — try again."
                    },
                )
            }
        }
    }

    private fun fail(message: String) =
        _state.update { it.copy(phase = PunchPhase.Idle, error = message) }

    private companion object {
        /** GPS fix budget — beyond this the zone row offers a retry. */
        const val LOCATION_TIMEOUT_MS = 12_000L
    }
}
