package com.altuscorp.altus.feature.hrrecord

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.HrDayDto
import com.altuscorp.altus.data.remote.dto.HrRecordDto
import com.altuscorp.altus.data.remote.dto.HrSummaryDto
import com.altuscorp.altus.data.repository.HrRecordRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.format.DateTimeParseException
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The HR Attendance Record brain (Employees workspace). Read-only — the HR
 * sheet is an authoritative reference layer the app never edits. Reads are
 * cache-first: [HrRecordRepository.record] paints the last-decoded month
 * instantly (null → skeletons) while [refresh] reconciles. Switching months
 * re-subscribes the record flow to that month's snapshot, mirroring the DCC
 * board's day switch.
 *
 * All formatting (KPI numerals, the Monday-first calendar layout, day-code
 * semantics, paid-leave rows) happens here so the composables stay dumb renders
 * of an [Immutable] state.
 */

/** Semantic tone of a sheet day code / KPI — the screen maps it to a token colour. */
enum class HrTone { Present, Absent, HalfDay, WeeklyOff, Holiday, HolidayPresent, None }

/** One month option in the switcher row. */
@Immutable
data class HrMonthChip(
    val value: String,
    val label: String,
    val isSelected: Boolean,
)

/** One KPI stat card in the month summary. */
@Immutable
data class HrKpi(
    val label: String,
    val value: String,
    val caption: String,
    val tone: HrTone,
    /** 0..1 progress bar (present / total-worked share of the month); null = none. */
    val fraction: Float?,
)

/** One day cell in the calendar grid. `null` cells are calendar padding. */
@Immutable
data class HrDayCell(
    val day: Int,
    val code: String,
    val tone: HrTone,
    /** a11y / long-press label: "Wed, 4 Jun 2026 · Present". */
    val label: String,
)

/** A Monday-first week row of exactly seven slots. */
@Immutable
data class HrWeekRow(
    val key: Int,
    val cells: ImmutableList<HrDayCell?>,
)

/** One legend entry under the grid. */
@Immutable
data class HrLegendEntry(val code: String, val label: String, val tone: HrTone)

/** One paid-leave entitlement cycle row. */
@Immutable
data class HrLeaveRow(
    val id: String,
    val period: String,
    val status: String?,
    val leaves: String,
    val remarks: String,
)

/** The paid-leave block. */
@Immutable
data class HrPaidLeaveUi(
    val dojLabel: String?,
    val totalLabel: String,
    val cycles: ImmutableList<HrLeaveRow>,
)

@Immutable
data class HrRecordUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** Server returned loadError (a DB hiccup) → inline "couldn't load" card. */
    val serverError: Boolean = false,
    val employeeName: String = "",
    val designation: String? = null,
    val companyName: String? = null,
    val fy: String? = null,
    val remark: String? = null,
    val monthLabel: String? = null,
    val months: ImmutableList<HrMonthChip> = persistentListOf(),
    val kpis: ImmutableList<HrKpi> = persistentListOf(),
    val weeks: ImmutableList<HrWeekRow> = persistentListOf(),
    val legend: ImmutableList<HrLegendEntry> = persistentListOf(),
    val paidLeave: HrPaidLeaveUi? = null,
    /** No months AND no paid-leave block matched — the honest empty state. */
    val showEmpty: Boolean = false,
) {
    val hasContent: Boolean get() = kpis.isNotEmpty() || paidLeave != null || months.isNotEmpty()
    val hasDays: Boolean get() = weeks.isNotEmpty()
}

sealed interface HrRecordIntent {
    data class SelectMonth(val month: String) : HrRecordIntent
    data object Refresh : HrRecordIntent
    data object Retry : HrRecordIntent
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HrRecordViewModel @Inject constructor(
    private val repository: HrRecordRepository,
) : ViewModel() {

    private data class LocalState(
        /** null = "newest available"; a bucket string once the user picks one. */
        val selectedMonth: String? = null,
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    /** Record flow re-subscribed whenever the selected month changes. */
    private val record: Flow<HrRecordDto?> =
        local
            .map { it.selectedMonth }
            .distinctUntilChanged()
            .flatMapLatest { repository.record(it) }

    val uiState: StateFlow<HrRecordUiState> =
        combine(record, local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = HrRecordUiState(),
            )

    init {
        refresh(null)
    }

    fun onIntent(intent: HrRecordIntent) {
        when (intent) {
            is HrRecordIntent.SelectMonth -> selectMonth(intent.month)
            HrRecordIntent.Refresh,
            HrRecordIntent.Retry,
            -> refresh(local.value.selectedMonth)
        }
    }

    private fun selectMonth(month: String) {
        if (month == local.value.selectedMonth) return
        local.update { it.copy(selectedMonth = month, loadFailed = false, refreshFailed = false) }
        refresh(month)
    }

    private fun refresh(month: String?) {
        if (local.value.isRefreshing && month == local.value.selectedMonth) return
        local.update { it.copy(isRefreshing = true, loadFailed = false, refreshFailed = false) }
        viewModelScope.launch {
            val ok = repository.refresh(month) is ApiResult.Success
            local.update {
                it.copy(isRefreshing = false, loadFailed = !ok, refreshFailed = !ok)
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(dto: HrRecordDto?, local: LocalState): HrRecordUiState {
        if (dto == null) {
            return HrRecordUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
            )
        }

        // The chip that is "on": the user's explicit pick, else the resolved month.
        val activeMonth = local.selectedMonth ?: dto.month
        val months = dto.months
            .map { HrMonthChip(value = it.value, label = it.label, isSelected = it.value == activeMonth) }
            .toImmutableList()

        val kpis = dto.summary?.let(::kpisOf) ?: persistentListOf()
        val weeks = weeksOf(dto.month, dto.days)
        val legend = if (weeks.isNotEmpty()) LEGEND else persistentListOf()
        val paidLeave = dto.paidLeave?.let { pl ->
            HrPaidLeaveUi(
                dojLabel = pl.dojLabel,
                totalLabel = "${hrNum(pl.totalLeaves)} leaves",
                cycles = pl.cycles.map { c ->
                    HrLeaveRow(
                        id = c.id,
                        period = c.period,
                        status = c.status?.takeIf { it.isNotBlank() },
                        leaves = c.leaves?.let(::hrNum) ?: DASH,
                        remarks = c.remarks?.takeIf { it.isNotBlank() } ?: DASH,
                    )
                }.toImmutableList(),
            )
        }

        val showEmpty = !dto.loadError && dto.months.isEmpty() && paidLeave == null

        return HrRecordUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            serverError = dto.loadError,
            employeeName = dto.employeeName,
            designation = dto.designation?.takeIf { it.isNotBlank() },
            companyName = dto.companyName?.takeIf { it.isNotBlank() },
            fy = dto.fy?.takeIf { it.isNotBlank() },
            remark = dto.remark?.takeIf { it.isNotBlank() },
            monthLabel = dto.monthLabel,
            months = months,
            kpis = kpis,
            weeks = weeks,
            legend = legend,
            paidLeave = paidLeave,
            showEmpty = showEmpty,
        )
    }

    // ─── Mappers ─────────────────────────────────────────────────────────────

    private fun kpisOf(s: HrSummaryDto): ImmutableList<HrKpi> {
        val days = s.daysInMonth
        val pohCaption =
            if (s.pohFull > 0.0 || s.pohHalf > 0.0) {
                "+ POH ${hrNum(s.pohFull)} full · ${hrNum(s.pohHalf)} half"
            } else {
                "paid holidays"
            }
        return persistentListOf(
            HrKpi("Present", hrNum(s.present), "days present", HrTone.Present,
                fraction = if (days > 0.0) (s.present / days).toFloat() else null),
            HrKpi("Absent", hrNum(s.absent), "days absent", HrTone.Absent, null),
            HrKpi("Half day", hrNum(s.halfDay), "half days", HrTone.HalfDay, null),
            HrKpi("Weekly off", hrNum(s.weeklyOff), "weekly offs", HrTone.WeeklyOff, null),
            HrKpi("Holiday", hrNum(s.holiday), pohCaption, HrTone.Holiday, null),
            HrKpi("Total worked", hrNum(s.totalDaysWorked), "payable days", HrTone.Present,
                fraction = if (days > 0.0) (s.totalDaysWorked / days).toFloat() else null),
            HrKpi("Days in month", hrNum(s.daysInMonth), "calendar days", HrTone.None, null),
        )
    }

    /** Build a Monday-first calendar of seven-slot week rows (null = padding). */
    private fun weeksOf(monthBucket: String?, days: List<HrDayDto>): ImmutableList<HrWeekRow> {
        val realDays = days.filter { it.date != null }
        if (monthBucket == null || realDays.isEmpty()) return persistentListOf()

        val firstOfMonth = parseDate(monthBucket) ?: return persistentListOf()
        // java.time: MONDAY=1 … SUNDAY=7, so Monday-first offset is value-1.
        val offset = firstOfMonth.dayOfWeek.value - 1

        val slots = ArrayList<HrDayCell?>(offset + realDays.size)
        repeat(offset) { slots.add(null) }
        realDays.forEach { d ->
            val tone = toneOf(d.statusCode)
            slots.add(
                HrDayCell(
                    day = d.day,
                    code = codeLabel(d.statusCode),
                    tone = tone,
                    label = "${d.date?.let(::dateLabel) ?: "Day ${d.day}"} · ${toneLabel(tone, d.statusCode)}",
                ),
            )
        }
        // Pad the final week so every row has seven columns for even weighting.
        while (slots.size % 7 != 0) slots.add(null)

        return slots.chunked(7)
            .mapIndexed { i, week -> HrWeekRow(key = i, cells = week.toImmutableList()) }
            .toImmutableList()
    }

    private companion object {
        const val DASH = "—"

        val LEGEND: ImmutableList<HrLegendEntry> = persistentListOf(
            HrLegendEntry("P", "Present", HrTone.Present),
            HrLegendEntry("H/D", "Half day", HrTone.HalfDay),
            HrLegendEntry("A", "Absent", HrTone.Absent),
            HrLegendEntry("W/O", "Weekly off", HrTone.WeeklyOff),
            HrLegendEntry("H", "Holiday", HrTone.Holiday),
            HrLegendEntry("H-P", "Present on holiday", HrTone.HolidayPresent),
            HrLegendEntry("-", "No record", HrTone.None),
        )

        /** Sheet code → semantic tone (unknown codes fall back to neutral). */
        fun toneOf(raw: String): HrTone = when (raw.trim().uppercase()) {
            "P" -> HrTone.Present
            "A" -> HrTone.Absent
            "H/D" -> HrTone.HalfDay
            "W/O" -> HrTone.WeeklyOff
            "H" -> HrTone.Holiday
            "H-P" -> HrTone.HolidayPresent
            "H-H/D" -> HrTone.HalfDay
            "-", "" -> HrTone.None
            else -> HrTone.None
        }

        fun toneLabel(tone: HrTone, raw: String): String = when (tone) {
            HrTone.Present -> "Present"
            HrTone.Absent -> "Absent"
            HrTone.HalfDay -> if (raw.trim().uppercase() == "H-H/D") "Half day on holiday" else "Half day"
            HrTone.WeeklyOff -> "Weekly off"
            HrTone.Holiday -> "Holiday"
            HrTone.HolidayPresent -> "Present on holiday"
            HrTone.None -> if (raw.trim() == "-" || raw.isBlank()) "No record" else raw
        }

        /** The short chip glyph (verbatim code, dash normalised). */
        fun codeLabel(raw: String): String = raw.trim().ifBlank { "-" }

        /** Integer bare, otherwise one decimal (mirrors web hrNum). */
        fun hrNum(n: Double): String =
            if (n == n.toLong().toDouble()) n.toLong().toString() else String.format("%.1f", n)

        fun parseDate(iso: String): LocalDate? = try {
            LocalDate.parse(iso.take(10))
        } catch (_: DateTimeParseException) {
            null
        }

        /** "2026-06-04" → "Wed, 4 Jun 2026". */
        fun dateLabel(iso: String): String {
            val d = parseDate(iso) ?: return iso
            val weekday = d.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)
            val month = d.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)
            return "$weekday, ${d.dayOfMonth} $month ${d.year}"
        }
    }
}
