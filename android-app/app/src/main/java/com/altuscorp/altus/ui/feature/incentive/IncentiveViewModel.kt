package com.altuscorp.altus.feature.incentive

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.IncentiveDto
import com.altuscorp.altus.data.remote.dto.IncentiveLineDto
import com.altuscorp.altus.data.remote.dto.IncentiveRequestDto
import com.altuscorp.altus.data.repository.IncentiveRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
 * The incentive brain (Employees workspace). Reads are cache-first —
 * [IncentiveRepository.incentive] paints the last-decoded year instantly (null →
 * skeletons) while [refresh] reconciles against the server. Read-only: there are
 * no mobile incentive commits, so this ViewModel only owns the selected year and
 * the refresh / error flags. All formatting (Indian-grouped `₹`, percentages,
 * settlement copy, dates) happens here so the composable stays a dumb render.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class IncentiveViewModel @Inject constructor(
    private val repository: IncentiveRepository,
) : ViewModel() {

    private data class LocalState(
        val year: Int,
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val currentYear: Int =
        Instant.now().atZone(ZoneId.systemDefault()).year

    private val local = MutableStateFlow(LocalState(year = currentYear))

    private val snapshot =
        local
            .map { it.year }
            .distinctUntilChanged()
            .flatMapLatest { repository.incentive(it) }

    val uiState: StateFlow<IncentiveUiState> =
        combine(snapshot, local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = IncentiveUiState(year = currentYear),
            )

    init {
        refresh(currentYear)
    }

    fun onIntent(intent: IncentiveIntent) {
        when (intent) {
            is IncentiveIntent.SelectYear -> selectYear(intent.year)
            IncentiveIntent.Refresh -> refresh(local.value.year)
            IncentiveIntent.Retry -> refresh(local.value.year)
        }
    }

    private fun selectYear(year: Int) {
        if (year == local.value.year) return
        local.update { it.copy(year = year, loadFailed = false, refreshFailed = false) }
        refresh(year)
    }

    private fun refresh(year: Int) {
        if (local.value.isRefreshing && year == local.value.year) return
        local.update { it.copy(isRefreshing = true, loadFailed = false, refreshFailed = false) }
        viewModelScope.launch {
            val failed = repository.refresh(year) !is ApiResult.Success
            local.update {
                it.copy(isRefreshing = false, loadFailed = failed, refreshFailed = failed)
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(dto: IncentiveDto?, local: LocalState): IncentiveUiState {
        if (dto == null) {
            return IncentiveUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
                year = local.year,
            )
        }

        val earned = dto.totals.earned
        val paid = dto.totals.paid
        val unpaid = dto.totals.unpaid
        val target = dto.totals.target
        val paidRate = if (earned > 0.0) paid / earned else null
        val attainmentPct = dto.totals.attainmentPct

        val kpis: ImmutableList<IncentiveKpiUi> = persistentListOf(
            IncentiveKpiUi(
                id = "earned",
                label = "Total earned",
                value = inr(earned),
                caption = "permanent + project · ${dto.year}",
                accent = IncentiveAccent.Employees,
            ),
            IncentiveKpiUi(
                id = "paid",
                label = "Paid",
                value = inr(paid),
                caption = paidRate?.let { "${(it * 100).roundToInt()}% of earned settled" }
                    ?: "nothing earned yet",
                accent = IncentiveAccent.Success,
                progress = paidRate?.let { it.coerceIn(0.0, 1.0).toFloat() },
            ),
            IncentiveKpiUi(
                id = "unpaid",
                label = "Unpaid",
                value = inr(unpaid),
                caption = if (unpaid > 0.0) "awaiting payout" else "all settled",
                accent = if (unpaid > 0.0) IncentiveAccent.Danger else IncentiveAccent.Neutral,
            ),
            IncentiveKpiUi(
                id = "attainment",
                label = "Attainment",
                value = attainmentPct?.let { "${it.roundToInt()}%" } ?: "—",
                caption = if (target > 0.0) "${inr(earned)} of ${inr(target)} target" else "no target set",
                accent = attainmentAccent(attainmentPct),
                progress = attainmentPct?.let { (it / 100.0).coerceIn(0.0, 1.0).toFloat() },
            ),
        )

        return IncentiveUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            year = dto.year,
            years = dto.years.toImmutableList(),
            subtitle = "Your incentive earnings, attainment and requests.",
            kpis = kpis,
            lines = dto.lines.map { it.toUi() }.toImmutableList(),
            requests = dto.requests.map { it.toUi() }.toImmutableList(),
        )
    }

    private fun IncentiveLineDto.toUi(): IncentiveLineUi = IncentiveLineUi(
        id = id,
        label = label,
        sub = sub,
        amount = inr(approved),
        settle = if (isPaid) "Paid" else "${inr(unpaid)} unpaid",
        isPaid = isPaid,
    )

    private fun IncentiveRequestDto.toUi(): IncentiveRequestUi = IncentiveRequestUi(
        id = id,
        title = title,
        statusLabel = statusLabel,
        statusToken = statusToken(status),
        dateLabel = formatDate(createdAt),
        note = decisionNote?.takeIf { it.isNotBlank() },
    )

    private fun attainmentAccent(pct: Double?): IncentiveAccent = when {
        pct == null -> IncentiveAccent.Neutral
        pct >= 100.0 -> IncentiveAccent.Success
        pct >= 60.0 -> IncentiveAccent.Warn
        else -> IncentiveAccent.Danger
    }

    /** Map the request status token onto the StatusPill colour vocabulary. */
    private fun statusToken(status: String): String = when (status.lowercase()) {
        "approved" -> "green"
        "rejected" -> "red"
        else -> "amber" // pending / anything new
    }

    private fun formatDate(iso: String): String = try {
        DATE.format(Instant.parse(iso).atZone(ZoneId.systemDefault()))
    } catch (_: DateTimeParseException) {
        ""
    }

    private fun inr(amount: Double): String = INR.format(amount)

    private companion object {
        val INR: NumberFormat = NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply {
            maximumFractionDigits = 0
        }
        val DATE: DateTimeFormatter =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
    }
}
