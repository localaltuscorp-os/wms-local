package com.altuscorp.altus.feature.signals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.PromotionSignalDto
import com.altuscorp.altus.data.remote.dto.RecognitionDto
import com.altuscorp.altus.data.remote.dto.SignalsDto
import com.altuscorp.altus.data.remote.dto.SignalsSummaryDto
import com.altuscorp.altus.data.repository.SignalsRepository
import com.altuscorp.altus.domain.model.StatusDisplay
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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
 * The signals feed brain (Employees · PMS). Reads are cache-first —
 * [SignalsRepository.signals] paints the last-decoded feed instantly (null →
 * skeletons) while [refresh] reconciles against the server. Read-only: there
 * are no mobile signals commits, so this ViewModel only owns the refresh /
 * error flags. All formatting (period labels, dates, status pills, KPI copy)
 * happens here so the composable stays a dumb render.
 */
@HiltViewModel
class SignalsViewModel @Inject constructor(
    private val repository: SignalsRepository,
) : ViewModel() {

    private data class LocalState(
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    val uiState: StateFlow<SignalsUiState> =
        combine(repository.signals(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = SignalsUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: SignalsIntent) {
        when (intent) {
            SignalsIntent.Refresh -> refresh()
            SignalsIntent.Retry -> refresh()
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

    private fun reduce(dto: SignalsDto?, local: LocalState): SignalsUiState {
        if (dto == null) {
            return SignalsUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
            )
        }

        return SignalsUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            ownerName = dto.ownerName,
            subtitle = "The recognition and promotion signals the score engine has raised about you.",
            kpis = kpis(dto.summary),
            recognitions = dto.recognitions.map { it.toUi() }.toImmutableList(),
            promotions = dto.promotions.map { it.toUi() }.toImmutableList(),
        )
    }

    private fun kpis(summary: SignalsSummaryDto): ImmutableList<SignalsKpiUi> = persistentListOf(
        SignalsKpiUi(
            id = "recognitions",
            label = "Recognitions",
            value = summary.recognitionsReceived.toString(),
            caption = if (summary.recognitionsReleased > 0) {
                "${summary.recognitionsReleased} released"
            } else {
                "none released yet"
            },
            accent = if (summary.recognitionsReleased > 0) SignalsAccent.Success else SignalsAccent.Employees,
        ),
        SignalsKpiUi(
            id = "promotions",
            label = "Promotion signals",
            value = summary.promotionSignals.toString(),
            caption = if (summary.promotionFlagged > 0) {
                "${summary.promotionFlagged} flagged"
            } else {
                "none flagged"
            },
            accent = if (summary.promotionFlagged > 0) SignalsAccent.Warn else SignalsAccent.Employees,
        ),
    )

    private fun RecognitionDto.toUi(): RecognitionUi {
        val scored = scoreSnapshot?.let { " · Score ${it.roundToInt()}" } ?: ""
        return RecognitionUi(
            id = id,
            kind = kind.ifBlank { "Recognition" },
            meta = formatPeriod(period) + scored,
            reason = reason?.takeIf { it.isNotBlank() },
            status = recognitionStatus(status),
            footnote = if (status.equals("suggested", ignoreCase = true)) {
                null
            } else {
                decidedLine(recognitionStatus(status).label, releasedByName, releasedAt)
            },
        )
    }

    private fun PromotionSignalDto.toUi(): PromotionUi = PromotionUi(
        id = id,
        scoreLabel = scoreSnapshot?.let { it.roundToInt().toString() },
        eligibleLabel = eligibleSince?.let { formatDate(it) }?.let { "Eligible since $it" },
        rationale = rationale?.takeIf { it.isNotBlank() },
        status = promotionStatus(status),
        footnote = if (status.equals("flagged", ignoreCase = true)) {
            null
        } else {
            decidedLine(promotionStatus(status).label, decidedByName, decidedAt)
        },
    )

    /** Recognition status → the StatusPill colour vocabulary. */
    private fun recognitionStatus(status: String): StatusDisplay = when (status.lowercase()) {
        "released" -> StatusDisplay("Released", "green")
        "dismissed" -> StatusDisplay("Dismissed", "slate")
        "suggested" -> StatusDisplay("Suggested", "amber")
        else -> StatusDisplay(status.replaceFirstChar { it.uppercase() }, "slate")
    }

    /** Promotion status → the StatusPill colour vocabulary. */
    private fun promotionStatus(status: String): StatusDisplay = when (status.lowercase()) {
        "flagged" -> StatusDisplay("Flagged", "amber")
        "acknowledged" -> StatusDisplay("Acknowledged", "blue")
        "actioned" -> StatusDisplay("Actioned", "green")
        "dismissed" -> StatusDisplay("Dismissed", "slate")
        else -> StatusDisplay(status.replaceFirstChar { it.uppercase() }, "slate")
    }

    /** "Released by Ana · 1 Jul 2026" — the quiet decided-by footnote. */
    private fun decidedLine(label: String, byName: String?, iso: String?): String = buildString {
        append(label)
        byName?.takeIf { it.isNotBlank() }?.let { append(" by ").append(it) }
        iso?.let { formatDate(it) }?.let { append(" · ").append(it) }
    }

    /** "2026-07" → "Jul 2026"; leaves the raw string on a parse miss. */
    private fun formatPeriod(period: String): String = try {
        PERIOD_OUT.format(YearMonth.parse(period))
    } catch (_: Exception) {
        period
    }

    /** ISO-8601 → "1 Jul 2026"; null on a parse miss. */
    private fun formatDate(iso: String): String? = try {
        DATE.format(Instant.parse(iso).atZone(ZoneId.systemDefault()))
    } catch (_: Exception) {
        null
    }

    private companion object {
        val PERIOD_OUT: DateTimeFormatter =
            DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)
        val DATE: DateTimeFormatter =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
    }
}
