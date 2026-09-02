package com.altuscorp.altus.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.BuildConfig
import com.altuscorp.altus.core.firebase.BiometricAuthenticator
import com.altuscorp.altus.core.firebase.BiometricAvailability
import com.altuscorp.altus.core.firebase.BiometricOutcome
import com.altuscorp.altus.data.prefs.AltusPreferences
import com.altuscorp.altus.data.prefs.ThemeMode
import com.altuscorp.altus.data.repository.AttendanceRepository
import com.altuscorp.altus.data.repository.AuthRepository
import com.altuscorp.altus.data.repository.DccRepository
import com.altuscorp.altus.data.repository.TaskRepository
import com.altuscorp.altus.domain.model.AttendanceState
import com.altuscorp.altus.domain.model.TaskBoard
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * S9 Profile / You ViewModel.
 *
 * Assembles the identity card + rhythm tiles + settings ledger from five
 * cache-first sources (live `/me`, cached identity, attendance, today's DCC
 * board, the task board) plus DataStore-backed appearance / biometric prefs.
 * Reads are cache-first — the screen paints instantly from whatever is warm and
 * a best-effort reconcile runs on entry and on pull-to-refresh. Nothing here
 * touches the punch/gate path; sign-out is the only mutation and it delegates
 * the teardown ORDER to [AuthRepository.signOut].
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val attendanceRepository: AttendanceRepository,
    private val dccRepository: DccRepository,
    private val taskRepository: TaskRepository,
    private val preferences: AltusPreferences,
    private val biometricAuthenticator: BiometricAuthenticator,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val signingOut = MutableStateFlow(false)
    private val signOutSheet = MutableStateFlow(false)
    private val biometricAvailability = MutableStateFlow(BiometricAvailability.Unsupported)

    private val eventChannel = Channel<ProfileEvent>(Channel.BUFFERED)
    val events: Flow<ProfileEvent> = eventChannel.receiveAsFlow()

    // Identity: prefer the live decoded /me snapshot, fall back to the cached
    // identity so a returning user is greeted before the network answers.
    private val identityFlow: Flow<IdentityView> = combine(
        authRepository.identity(),
        authRepository.cachedIdentity,
    ) { live, cached ->
        when {
            live != null -> IdentityView(
                present = true,
                name = live.name,
                email = live.email,
                department = live.department,
                avatarUrl = live.avatarUrl,
                isAdmin = live.isAdmin,
            )

            cached != null -> IdentityView(
                present = true,
                name = cached.name,
                email = cached.email,
                department = cached.department,
                avatarUrl = cached.avatarUrl,
                isAdmin = cached.isAdmin,
            )

            else -> IdentityView.Empty
        }
    }

    private val rhythmFlow: Flow<RhythmView> = combine(
        attendanceRepository.attendance(),
        dccRepository.board(),
        taskRepository.board(),
    ) { attendance, dcc, board ->
        RhythmView(
            streak = punchStreak(attendance),
            dccPct = dcc?.stats?.pct ?: 0,
            dccFilled = dcc?.stats?.filled ?: 0,
            dccDue = dcc?.stats?.due ?: 0,
            tasksClosed = tasksClosedThisWeek(board),
        )
    }

    private val settingsFlow: Flow<SettingsView> = combine(
        preferences.themeMode,
        authRepository.biometricUnlockEnabled,
        biometricAvailability,
    ) { mode, bioEnabled, availability ->
        SettingsView(mode, bioEnabled, availability)
    }

    private val flagsFlow: Flow<FlagsView> = combine(
        refreshing,
        signingOut,
        signOutSheet,
    ) { isRefreshing, isSigningOut, sheetVisible ->
        FlagsView(isRefreshing, isSigningOut, sheetVisible)
    }

    val uiState: StateFlow<ProfileUiState> = combine(
        identityFlow,
        rhythmFlow,
        settingsFlow,
        flagsFlow,
    ) { identity, rhythm, settings, flags ->
        ProfileUiState(
            loading = !identity.present,
            refreshing = flags.refreshing,
            name = identity.name,
            email = identity.email,
            department = identity.department,
            avatarUrl = identity.avatarUrl,
            isAdmin = identity.isAdmin,
            punchStreak = rhythm.streak,
            dccPct = rhythm.dccPct,
            dccFilled = rhythm.dccFilled,
            dccDue = rhythm.dccDue,
            tasksClosedThisWeek = rhythm.tasksClosed,
            themeMode = settings.themeMode,
            biometricEnabled = settings.biometricEnabled,
            biometricAvailability = settings.availability,
            version = APP_VERSION,
            signOutSheetVisible = flags.sheetVisible,
            signingOut = flags.signingOut,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ProfileUiState(),
    )

    init {
        biometricAvailability.value = biometricAuthenticator.availability()
        refresh()
    }

    fun onIntent(intent: ProfileIntent) {
        when (intent) {
            is ProfileIntent.SelectTheme -> setTheme(intent.mode)
            is ProfileIntent.SetBiometric -> setBiometric(intent)
            ProfileIntent.RequestSignOut -> signOutSheet.value = true
            ProfileIntent.DismissSignOut -> signOutSheet.value = false
            ProfileIntent.ConfirmSignOut -> signOut()
            ProfileIntent.Refresh -> refresh()
        }
    }

    private fun setTheme(mode: ThemeMode) {
        if (mode == uiState.value.themeMode) return
        viewModelScope.launch { preferences.setThemeMode(mode) }
    }

    private fun setBiometric(intent: ProfileIntent.SetBiometric) {
        if (!intent.enabled) {
            // Turning off is immediate — no proof required to remove a factor.
            viewModelScope.launch { authRepository.setBiometricUnlockEnabled(false) }
            return
        }
        // Turning on: prove the finger works before persisting the toggle, so a
        // returning-user unlock can never be armed against a broken sensor.
        viewModelScope.launch {
            val outcome = biometricAuthenticator.authenticate(
                activity = intent.activity,
                title = "Enable biometric unlock",
                subtitle = "Confirm it's you to turn this on",
            )
            when (outcome) {
                BiometricOutcome.Success -> {
                    authRepository.setBiometricUnlockEnabled(true)
                    eventChannel.send(ProfileEvent.BiometricEnabled)
                }

                else -> eventChannel.send(ProfileEvent.BiometricRejected)
            }
        }
    }

    private fun signOut() {
        if (signingOut.value) return
        // Keep the confirm sheet up so its button commit-morphs to a spinner
        // through the teardown; the SignedOut event navigates away and disposes it.
        signingOut.value = true
        viewModelScope.launch {
            authRepository.signOut()
            eventChannel.send(ProfileEvent.SignedOut)
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        // A returning user may have enrolled a fingerprint since last visit.
        biometricAvailability.value = biometricAuthenticator.availability()
        viewModelScope.launch {
            // Reconcile every rhythm source in parallel. All four return
            // ApiResult (safeApiCall never throws), so awaitAll can't cancel the
            // batch on a single failure — cache emissions repaint whatever won.
            coroutineScope {
                awaitAll(
                    async { authRepository.refreshMe() },
                    async { attendanceRepository.refresh() },
                    async { dccRepository.refresh() },
                    async { taskRepository.refreshBoard() },
                )
            }
            refreshing.value = false
        }
    }

    private companion object {
        val APP_VERSION: String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"
    }
}

// ─── Intermediate combine views (private) ─────────────────────────────────────

private data class IdentityView(
    val present: Boolean,
    val name: String,
    val email: String,
    val department: String?,
    val avatarUrl: String?,
    val isAdmin: Boolean,
) {
    companion object {
        val Empty = IdentityView(
            present = false,
            name = "",
            email = "",
            department = null,
            avatarUrl = null,
            isAdmin = false,
        )
    }
}

private data class RhythmView(
    val streak: Int,
    val dccPct: Int,
    val dccFilled: Int,
    val dccDue: Int,
    val tasksClosed: Int,
)

private data class SettingsView(
    val themeMode: ThemeMode,
    val biometricEnabled: Boolean,
    val availability: BiometricAvailability,
)

private data class FlagsView(
    val refreshing: Boolean,
    val signingOut: Boolean,
    val sheetVisible: Boolean,
)

// ─── Rhythm derivations (honest zeros) ────────────────────────────────────────

/**
 * Consecutive days present, counting back from today. Today with no punch yet
 * is grace (it doesn't break the streak — the day isn't over); the first prior
 * day without a clock-in ends the count.
 */
private fun punchStreak(state: AttendanceState?): Int {
    if (state == null) return 0
    val ordered = buildList {
        add(state.today)
        state.history.forEach { if (it.date != state.today.date) add(it) }
    }
    var streak = 0
    ordered.forEachIndexed { index, day ->
        val present = day.checkIn != null
        when {
            index == 0 && !present -> Unit // today un-punched — grace, keep scanning
            present -> streak++
            else -> return streak
        }
    }
    return streak
}

/** Tasks completed on or after this week's Monday (device zone). */
private fun tasksClosedThisWeek(board: TaskBoard?): Int {
    if (board == null) return 0
    val weekStart: Instant = LocalDate.now()
        .with(DayOfWeek.MONDAY)
        .atStartOfDay(ZoneId.systemDefault())
        .toInstant()
    return board.tasks.count { task ->
        val completed = task.completedAt
        completed != null && completed >= weekStart
    }
}
