package com.altuscorp.altus.feature.attendance

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.repository.AttendanceRepository
import com.altuscorp.altus.domain.model.AttendanceDay
import com.altuscorp.altus.domain.model.AttendanceState
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeParseException
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Attendance History (S2 note): the 14-day punch ledger pushed from Today's
 * hero card / the Hub. Read-only — cache paints first (skeletons only on a
 * true cold cache), a network reconcile runs on entry and on pull-to-refresh.
 *
 * All formatting (day headers, mono in→out values, worked durations) is done
 * here so the composables stay dumb renders of an [Immutable] state.
 */

/** How a ledger day resolved. Drives the presence dot + meta line colors. */
enum class PunchPresence {
    /** Clock-in and clock-out both recorded. */
    Complete,

    /** Today, clocked in, not yet out — the one in-progress row. */
    Open,

    /** A past day with a clock-in but no clock-out. */
    MissingOut,

    /** No punch at all. */
    Absent,
}

/** One pre-formatted row of the punch log (most-recent-first, today on top). */
@Immutable
data class PunchDayRow(
    /** Stable ISO `yyyy-MM-dd` LazyColumn key. */
    val key: String,
    /** "Today" / "Yesterday" / "Mon, 30 Jun". */
    val dayLabel: String,
    /** Mono ledger value: "09:14 → 18:42", "09:14 → —", or "—". */
    val punchLabel: String,
    /** Quiet second line: "Present · 9h 04m" / "On the clock" / "No clock-out" / "Absent". */
    val metaLabel: String,
    val presence: PunchPresence,
    val isToday: Boolean,
)

/** The screen's single source of truth (Part 6: one @Immutable UiState). */
@Immutable
data class AttendanceHistoryUiState(
    /** True only while the cache is cold and the first fetch is in flight. */
    val isLoading: Boolean = true,
    /** Pull-to-refresh spinner. */
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** Today + prior days, most-recent-first. */
    val days: ImmutableList<PunchDayRow> = persistentListOf(),
    /** Days in [days] with a recorded clock-in. */
    val daysPresent: Int = 0,
    /** Size of the ledger window (today + server history, ~14). */
    val windowDays: Int = 0,
    val devicesEnrolled: Int = 0,
    val biometricExempt: Boolean = false,
) {
    val hasContent: Boolean get() = days.isNotEmpty()
}

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface AttendanceHistoryIntent {
    /** Pull-to-refresh reconcile. */
    data object Refresh : AttendanceHistoryIntent

    /** Retry after a cold-cache load failure. */
    data object Retry : AttendanceHistoryIntent
}

@HiltViewModel
class AttendanceHistoryViewModel @Inject constructor(
    private val repository: AttendanceRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    val uiState: StateFlow<AttendanceHistoryUiState> = combine(
        repository.attendance(),
        refreshing,
        loadFailed,
        refreshFailed,
    ) { snapshot, isRefreshing, coldFailed, warmFailed ->
        if (snapshot == null) {
            // Cold cache: skeleton until the fetch resolves, retry on failure.
            AttendanceHistoryUiState(
                isLoading = !coldFailed,
                isRefreshing = isRefreshing,
                loadFailed = coldFailed,
            )
        } else {
            snapshot.toUiState(isRefreshing = isRefreshing, refreshFailed = warmFailed)
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AttendanceHistoryUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: AttendanceHistoryIntent) {
        when (intent) {
            AttendanceHistoryIntent.Refresh,
            AttendanceHistoryIntent.Retry,
            -> refresh()
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        // Clearing both up front makes a retry show the skeleton again and
        // drops the stale banner while the new attempt is in flight.
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success -> Unit // cache emission repaints the ledger
                else -> {
                    // Both flags set; the combine picks whichever applies to
                    // the snapshot it actually has (cold → retry, warm → banner).
                    loadFailed.value = true
                    refreshFailed.value = true
                }
            }
            refreshing.value = false
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

private fun AttendanceState.toUiState(
    isRefreshing: Boolean,
    refreshFailed: Boolean,
): AttendanceHistoryUiState {
    val todayDate = today.date
    val window = buildList {
        add(today to true)
        // History is documented as prior days; dedupe defensively anyway.
        history.forEach { day -> if (day.date != todayDate) add(day to false) }
    }
    val rows = window
        .map { (day, isToday) -> day.toRow(isToday = isToday, today = todayDate) }
        .toImmutableList()
    return AttendanceHistoryUiState(
        isLoading = false,
        isRefreshing = isRefreshing,
        loadFailed = false,
        refreshFailed = refreshFailed,
        days = rows,
        daysPresent = window.count { (day, _) -> day.checkIn != null },
        windowDays = window.size,
        devicesEnrolled = devicesEnrolled,
        biometricExempt = biometricExempt,
    )
}

private fun AttendanceDay.toRow(isToday: Boolean, today: LocalDate): PunchDayRow {
    val presence = when {
        checkIn == null -> PunchPresence.Absent
        checkOut != null -> PunchPresence.Complete
        isToday -> PunchPresence.Open
        else -> PunchPresence.MissingOut
    }
    val punchLabel = when (checkIn) {
        null -> DASH
        else -> "$checkIn → ${checkOut ?: DASH}"
    }
    val metaLabel = when (presence) {
        PunchPresence.Complete -> workedLabel(checkIn, checkOut)
            ?.let { "Present · $it" }
            ?: "Present"
        PunchPresence.Open -> "On the clock"
        PunchPresence.MissingOut -> "No clock-out"
        PunchPresence.Absent -> "Absent"
    }
    return PunchDayRow(
        key = DateFormat.dayKey(date),
        dayLabel = DateFormat.dayHeader(date, today),
        punchLabel = punchLabel,
        metaLabel = metaLabel,
        presence = presence,
        isToday = isToday,
    )
}

/** "7h 32m" between two server-formatted "HH:mm" strings; null when unparsable
 *  or non-positive (an overnight pair is never guessed at). */
private fun workedLabel(checkIn: String?, checkOut: String?): String? {
    val start = parseTime(checkIn) ?: return null
    val end = parseTime(checkOut) ?: return null
    val worked = Duration.between(start, end)
    return if (worked.isNegative || worked.isZero) null else DateFormat.duration(worked)
}

private fun parseTime(raw: String?): LocalTime? {
    if (raw.isNullOrBlank()) return null
    return try {
        LocalTime.parse(raw)
    } catch (_: DateTimeParseException) {
        null
    }
}

private const val DASH = "—"
