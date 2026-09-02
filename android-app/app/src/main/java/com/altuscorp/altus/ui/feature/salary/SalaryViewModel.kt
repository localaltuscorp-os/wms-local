package com.altuscorp.altus.feature.salary

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.repository.SalaryRepository
import com.altuscorp.altus.domain.model.SalaryMonth
import com.altuscorp.altus.domain.model.SalaryState
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.NumberFormat
import java.util.Locale
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.roundToLong
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
 * Salary (Employees workspace): the signed-in user's own payslip history.
 *
 * Read-only + cache-first, the exact shape of the Attendance History loop — the
 * Room snapshot paints first (skeletons only on a true cold cache), a reconcile
 * runs on entry and on pull-to-refresh. All currency + day formatting happens
 * here so the composables stay dumb renders of an [Immutable] state.
 *
 * The month chips are the "recent months" selector: tapping one re-points the
 * hero + breakdown at that month. The default selection is the newest imported
 * month (the server orders newest-first).
 */

/** How a breakdown line reads: a plain component, a deduction, or the net total. */
enum class SalaryLineKind { Component, Deduction, Net }

/** One pre-formatted breakdown row: label + mono ₹ value. */
@Immutable
data class SalaryLine(
    val label: String,
    /** "₹12,345" — deductions already carry a leading "− ". */
    val value: String,
    val kind: SalaryLineKind,
)

/** One pre-formatted month, ready to render (hero + breakdown + days). */
@Immutable
data class SalaryMonthUi(
    /** `YYYY-MM` — the stable chip key + selection identity. */
    val key: String,
    /** "June 2026". */
    val monthLabel: String,
    /** "Jun '26" — the compact chip label. */
    val shortLabel: String,
    /** "₹45,000" — net pay (finalPayment). */
    val netPayLabel: String,
    /** "Designer · Carbide India", null when neither is set. */
    val metaLine: String?,
    val breakdown: ImmutableList<SalaryLine>,
    val daysWorkedLabel: String,
    val finalWorkingDaysLabel: String,
    val presentLabel: String,
    val absentLabel: String,
    val halfDayLabel: String,
    val weeklyOffLabel: String,
    val remarks: String?,
)

@Immutable
data class SalaryUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val refreshFailed: Boolean = false,
    /** All months, newest first — the chip row. */
    val months: ImmutableList<SalaryMonthUi> = persistentListOf(),
    /** `YYYY-MM` of the chip currently shown in the hero + breakdown. */
    val selectedKey: String? = null,
) {
    val hasContent: Boolean get() = months.isNotEmpty()

    /** The month the hero + breakdown render — the selected one, else newest. */
    val selected: SalaryMonthUi?
        get() = months.firstOrNull { it.key == selectedKey } ?: months.firstOrNull()
}

sealed interface SalaryIntent {
    data object Refresh : SalaryIntent
    data object Retry : SalaryIntent
    data class SelectMonth(val key: String) : SalaryIntent
}

@HiltViewModel
class SalaryViewModel @Inject constructor(
    private val repository: SalaryRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    /** User's chosen month; null follows the newest (the server's first row). */
    private val selectedKey = MutableStateFlow<String?>(null)

    val uiState: StateFlow<SalaryUiState> = combine(
        repository.salary(),
        refreshing,
        loadFailed,
        refreshFailed,
        selectedKey,
    ) { snapshot, isRefreshing, coldFailed, warmFailed, chosen ->
        if (snapshot == null) {
            SalaryUiState(
                isLoading = !coldFailed,
                isRefreshing = isRefreshing,
                loadFailed = coldFailed,
                selectedKey = chosen,
            )
        } else {
            snapshot.toUiState(
                isRefreshing = isRefreshing,
                refreshFailed = warmFailed,
                selectedKey = chosen,
            )
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SalaryUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: SalaryIntent) {
        when (intent) {
            SalaryIntent.Refresh, SalaryIntent.Retry -> refresh()
            is SalaryIntent.SelectMonth -> selectedKey.value = intent.key
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success -> Unit // cache emission repaints
                else -> {
                    loadFailed.value = true
                    refreshFailed.value = true
                }
            }
            refreshing.value = false
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

private fun SalaryState.toUiState(
    isRefreshing: Boolean,
    refreshFailed: Boolean,
    selectedKey: String?,
): SalaryUiState = SalaryUiState(
    isLoading = false,
    isRefreshing = isRefreshing,
    loadFailed = false,
    refreshFailed = refreshFailed,
    months = months.map { it.toUi() }.toImmutableList(),
    selectedKey = selectedKey,
)

private fun SalaryMonth.toUi(): SalaryMonthUi {
    val meta = listOfNotNull(
        designation?.takeIf { it.isNotBlank() },
        companyName?.takeIf { it.isNotBlank() },
    ).joinToString(" · ").ifBlank { null }

    val breakdown = buildList {
        add(SalaryLine("Monthly CTC", inr(monthlyCtc), SalaryLineKind.Component))
        add(SalaryLine("Payable after leave", inr(payableAfterLeave), SalaryLineKind.Component))
        add(SalaryLine("Professional tax", deduction(pt), SalaryLineKind.Deduction))
        add(SalaryLine("Payable after PT", inr(payableAfterPt), SalaryLineKind.Component))
        if (abs(advance) > 0.005) {
            add(SalaryLine("Advance", deduction(advance), SalaryLineKind.Deduction))
        }
        if (abs(previousPending) > 0.005) {
            add(SalaryLine("Previous pending", deduction(previousPending), SalaryLineKind.Deduction))
        }
        add(SalaryLine("Net payment", inr(finalPayment), SalaryLineKind.Net))
    }.toImmutableList()

    return SalaryMonthUi(
        key = month,
        monthLabel = monthLabel,
        shortLabel = shortLabel(month, monthLabel),
        netPayLabel = inr(finalPayment),
        metaLine = meta,
        breakdown = breakdown,
        daysWorkedLabel = days(totalDaysWorked),
        finalWorkingDaysLabel = days(finalWorkingDays),
        presentLabel = days(present),
        absentLabel = days(absent),
        halfDayLabel = days(halfDay),
        weeklyOffLabel = days(weeklyOff),
        remarks = remarks?.takeIf { it.isNotBlank() },
    )
}

private val INR: NumberFormat = NumberFormat.getIntegerInstance(Locale("en", "IN"))

/** "₹45,000" — Indian digit grouping, rounded to the rupee (mirrors the web). */
private fun inr(value: Double): String = "₹" + INR.format(value.roundToLong())

/** "− ₹1,200" for a deduction (always shown as money leaving the pay). */
private fun deduction(value: Double): String = "− ₹" + INR.format(abs(value).roundToLong())

/** Whole days show clean ("24"); fractional keep one decimal ("0.5"). */
private fun days(value: Double): String {
    val rounded = value.roundToLong()
    return if (abs(value - rounded) < 0.005) rounded.toString() else {
        // one-decimal, trimming a trailing .0 that survived the check above
        val oneDp = (Math.round(value * 10.0) / 10.0)
        if (oneDp == oneDp.toLong().toDouble()) oneDp.toLong().toString() else oneDp.toString()
    }
}

private val SHORT_MONTHS = arrayOf(
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

/** "Jun '26" from a `YYYY-MM` key; falls back to the server label's head. */
private fun shortLabel(key: String, monthLabel: String): String {
    val parts = key.split("-")
    val year = parts.getOrNull(0)?.toIntOrNull()
    val month = parts.getOrNull(1)?.toIntOrNull()
    return if (year != null && month != null && month in 1..12) {
        "${SHORT_MONTHS[month - 1]} '${(year % 100).toString().padStart(2, '0')}"
    } else {
        monthLabel.take(8)
    }
}
