package com.altuscorp.altus.feature.attreport

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.AttendanceDashboardDto
import com.altuscorp.altus.data.remote.dto.AttendancePersonDto
import com.altuscorp.altus.data.repository.AttendanceReportRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Admin · Employees → Att Report (read-only): the org-wide monthly attendance
 * summary with month navigation. Direct-fetch — no cache; the ViewModel owns the
 * selected month + loading/error. All formatting happens here.
 */

@Immutable
data class AttReportPersonRow(
    val id: String,
    val name: String,
    /** Payable days, trimmed ("21" or "20.5"). */
    val payable: String,
    val present: Int,
    val absent: Int,
    val halfDay: Int,
    val paidLeave: Int,
    val late: Int,
)

@Immutable
data class AttReportUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val monthLabel: String = "",
    val peopleCount: Int = 0,
    val present: Int = 0,
    val absent: Int = 0,
    val halfDay: Int = 0,
    val paidLeave: Int = 0,
    val late: Int = 0,
    val people: ImmutableList<AttReportPersonRow> = persistentListOf(),
) {
    val hasContent: Boolean get() = monthLabel.isNotBlank()
}

sealed interface AttReportIntent {
    data object Retry : AttReportIntent
    data object PrevMonth : AttReportIntent
    data object NextMonth : AttReportIntent
}

@HiltViewModel
class AttReportViewModel @Inject constructor(
    private val repository: AttendanceReportRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AttReportUiState())
    val uiState: StateFlow<AttReportUiState> = _uiState.asStateFlow()

    // Selected month; null until the first response tells us the current month.
    private var year: Int? = null
    private var month: Int? = null

    init {
        load(year, month)
    }

    fun onIntent(intent: AttReportIntent) {
        when (intent) {
            AttReportIntent.Retry -> load(year, month)
            AttReportIntent.PrevMonth -> shiftMonth(-1)
            AttReportIntent.NextMonth -> shiftMonth(+1)
        }
    }

    private fun shiftMonth(delta: Int) {
        val y = year ?: return
        val m = month ?: return
        var nm = m + delta
        var ny = y
        if (nm < 1) { nm = 12; ny -= 1 }
        if (nm > 12) { nm = 1; ny += 1 }
        year = ny
        month = nm
        load(ny, nm)
    }

    private fun load(y: Int?, m: Int?) {
        val hadContent = _uiState.value.hasContent
        _uiState.value = _uiState.value.copy(
            isLoading = !hadContent,
            isRefreshing = hadContent,
            loadFailed = false,
        )
        viewModelScope.launch {
            when (val res = repository.monthDashboard(y, m)) {
                is ApiResult.Success -> {
                    year = res.data.year
                    month = res.data.month
                    _uiState.value = res.data.toUiState()
                }
                else -> _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isRefreshing = false,
                    loadFailed = !hadContent,
                )
            }
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

private fun AttendanceDashboardDto.toUiState(): AttReportUiState = AttReportUiState(
    isLoading = false,
    isRefreshing = false,
    loadFailed = false,
    monthLabel = monthLabel,
    peopleCount = peopleCount,
    present = totals.present,
    absent = totals.absent,
    halfDay = totals.halfDay,
    paidLeave = totals.paidLeave,
    late = totals.late,
    people = people.map { it.toRow() }.toImmutableList(),
)

private fun AttendancePersonDto.toRow(): AttReportPersonRow = AttReportPersonRow(
    id = employeeId,
    name = name,
    payable = trimNum(payableDays),
    present = present,
    absent = absent,
    halfDay = halfDay,
    paidLeave = paidLeave,
    late = late,
)

/** "21.0" → "21", "20.5" → "20.5". */
private fun trimNum(v: Double): String =
    if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()
