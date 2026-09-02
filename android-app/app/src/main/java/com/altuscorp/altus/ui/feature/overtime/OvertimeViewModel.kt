package com.altuscorp.altus.feature.overtime

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.OvertimeDto
import com.altuscorp.altus.data.remote.dto.OvertimeEntryDto
import com.altuscorp.altus.data.repository.OvertimeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The overtime brain (Employees workspace). Reads are cache-first —
 * [OvertimeRepository.overtime] paints the last-decoded ledger instantly (null →
 * skeletons) while [refresh] reconciles against the server. Read-only: there are
 * no mobile overtime commits (entries are filed / approved on the web), so this
 * ViewModel only owns the refresh / error flags. All formatting (hours, dates,
 * decision meta, status tokens) happens here so the composable stays a dumb
 * render.
 */
@HiltViewModel
class OvertimeViewModel @Inject constructor(
    private val repository: OvertimeRepository,
) : ViewModel() {

    private data class LocalState(
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    val uiState: StateFlow<OvertimeUiState> =
        combine(repository.overtime(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = OvertimeUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: OvertimeIntent) {
        when (intent) {
            OvertimeIntent.Refresh -> refresh()
            OvertimeIntent.Retry -> refresh()
        }
    }

    private fun refresh() {
        if (local.value.isRefreshing) return
        local.update { it.copy(isRefreshing = true, loadFailed = false, refreshFailed = false) }
        viewModelScope.launch {
            val failed = repository.refresh() !is ApiResult.Success
            local.update {
                it.copy(isRefreshing = false, loadFailed = failed, refreshFailed = failed)
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(dto: OvertimeDto?, local: LocalState): OvertimeUiState {
        if (dto == null) {
            return OvertimeUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
            )
        }

        val t = dto.totals
        val approvedRate = t.approvedRate?.let { it.coerceIn(0.0, 1.0).toFloat() }

        val kpis: ImmutableList<OvertimeKpiUi> = persistentListOf(
            OvertimeKpiUi(
                id = "total",
                label = "Total OT hours",
                value = fmtHours(t.totalHours),
                caption = "${t.entryCount} ${if (t.entryCount == 1) "entry" else "entries"} logged",
                accent = OvertimeAccent.Employees,
            ),
            OvertimeKpiUi(
                id = "approved",
                label = "Approved hours",
                value = fmtHours(t.approvedHours),
                caption = t.approvedRate?.let { "${(it * 100).roundToInt()}% of logged hours" }
                    ?: "nothing logged yet",
                accent = OvertimeAccent.Success,
                progress = approvedRate,
            ),
            OvertimeKpiUi(
                id = "pending",
                label = "Pending",
                value = t.pendingCount.toString(),
                caption = if (t.pendingCount > 0) "${fmtHours(t.pendingHours)} awaiting review" else "all reviewed",
                accent = if (t.pendingCount > 0) OvertimeAccent.Warn else OvertimeAccent.Neutral,
            ),
            OvertimeKpiUi(
                id = "month",
                label = "This month${if (t.monthLabel.isNotBlank()) " (${t.monthLabel})" else ""}",
                value = fmtHours(t.monthHours),
                caption = "hours logged this month",
                accent = OvertimeAccent.Neutral,
            ),
        )

        return OvertimeUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            subtitle = "Log the extra hours you put in. Your manager approves them.",
            kpis = kpis,
            entries = dto.entries.map { it.toUi() }.toImmutableList(),
        )
    }

    private fun OvertimeEntryDto.toUi(): OvertimeEntryUi = OvertimeEntryUi(
        id = id,
        dateLabel = formatDate(workDate),
        hoursLabel = fmtHours(hours),
        meta = buildMeta(this),
        statusLabel = statusLabel.ifBlank { status.replaceFirstChar { c -> c.uppercase() } },
        statusToken = statusToken(status),
    )

    /** "Month-end close · Approved by Manan" — reason then decision, both optional. */
    private fun buildMeta(e: OvertimeEntryDto): String {
        val parts = mutableListOf<String>()
        e.reason?.takeIf { it.isNotBlank() }?.let(parts::add)
        val by = e.approvedByName?.takeIf { it.isNotBlank() }
        when (e.status.lowercase()) {
            "approved" -> parts.add(if (by != null) "Approved by $by" else "Approved")
            "rejected" -> parts.add(if (by != null) "Rejected by $by" else "Rejected")
            else -> parts.add("Awaiting review")
        }
        return parts.joinToString(" · ")
    }

    /** Map the overtime status token onto the StatusPill colour vocabulary. */
    private fun statusToken(status: String): String = when (status.lowercase()) {
        "approved" -> "green"
        "rejected" -> "red"
        else -> "amber" // pending / anything new
    }

    /** "6h" for whole hours, "1.5h" otherwise (mirrors the web `fmtHours`). */
    private fun fmtHours(n: Double): String {
        val whole = n % 1.0 == 0.0
        return if (whole) "${n.toLong()}h" else "${TWO_DP.format(n).trimEnd('0').trimEnd('.')}h"
    }

    private fun formatDate(iso: String): String = try {
        LocalDate.parse(iso).format(DATE)
    } catch (_: DateTimeParseException) {
        iso
    }

    private companion object {
        val DATE: DateTimeFormatter =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
        val TWO_DP: java.text.DecimalFormat =
            java.text.DecimalFormat("0.00", java.text.DecimalFormatSymbols(Locale.US))
    }
}
