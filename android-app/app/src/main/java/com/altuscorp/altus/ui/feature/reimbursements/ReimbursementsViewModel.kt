package com.altuscorp.altus.feature.reimbursements

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.ReimbursementClaimDto
import com.altuscorp.altus.data.remote.dto.ReimbursementsDto
import com.altuscorp.altus.data.repository.ReimbursementsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
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
 * The reimbursements brain (Employees workspace). Reads are cache-first —
 * [ReimbursementsRepository.reimbursements] paints the last-decoded shelf
 * instantly (null → skeletons) while [refresh] reconciles against the server.
 * Read-only: claims are filed on the web, so this ViewModel only owns the
 * selected shelf and the refresh / error flags. All formatting (Indian-grouped
 * `₹`, dates, settlement copy) happens here so the composable stays a dumb render.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ReimbursementsViewModel @Inject constructor(
    private val repository: ReimbursementsRepository,
) : ViewModel() {

    private data class LocalState(
        val view: String,
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState(view = ReimbursementsUiState.VIEW_ACTIVE))

    private val snapshot =
        local
            .map { it.view }
            .distinctUntilChanged()
            .flatMapLatest { repository.reimbursements(it) }

    val uiState: StateFlow<ReimbursementsUiState> =
        combine(snapshot, local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = ReimbursementsUiState(),
            )

    init {
        refresh(ReimbursementsUiState.VIEW_ACTIVE)
    }

    fun onIntent(intent: ReimbursementsIntent) {
        when (intent) {
            is ReimbursementsIntent.SelectView -> selectView(intent.view)
            ReimbursementsIntent.Refresh -> refresh(local.value.view)
            ReimbursementsIntent.Retry -> refresh(local.value.view)
        }
    }

    private fun selectView(view: String) {
        if (view == local.value.view) return
        local.update { it.copy(view = view, loadFailed = false, refreshFailed = false) }
        refresh(view)
    }

    private fun refresh(view: String) {
        if (local.value.isRefreshing && view == local.value.view) return
        local.update { it.copy(isRefreshing = true, loadFailed = false, refreshFailed = false) }
        viewModelScope.launch {
            val failed = repository.refresh(view) !is ApiResult.Success
            local.update {
                it.copy(isRefreshing = false, loadFailed = failed, refreshFailed = failed)
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(dto: ReimbursementsDto?, local: LocalState): ReimbursementsUiState {
        if (dto == null) {
            return ReimbursementsUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
                view = local.view,
            )
        }

        val t = dto.totals
        val paidShare = if (t.approvedCount > 0) t.paidCount.toDouble() / t.approvedCount else null

        val kpis: ImmutableList<ReimbursementKpiUi> = persistentListOf(
            ReimbursementKpiUi(
                id = "claimed",
                label = "Total claimed",
                value = inr(t.totalClaimed),
                caption = "across ${t.claimCount} ${plural(t.claimCount, "claim", "claims")}" +
                    if (dto.view == ReimbursementsUiState.VIEW_ARCHIVED) " (archived)" else "",
                accent = ReimbursementAccent.Employees,
            ),
            ReimbursementKpiUi(
                id = "pending",
                label = "Pending",
                value = inr(t.pendingAmount),
                caption = if (t.pendingCount > 0)
                    "${t.pendingCount} awaiting review"
                else "all reviewed",
                accent = if (t.pendingCount > 0) ReimbursementAccent.Warn else ReimbursementAccent.Neutral,
            ),
            ReimbursementKpiUi(
                id = "approved",
                label = "Approved · paid",
                value = inr(t.approvedAmount),
                caption = if (t.approvedCount > 0)
                    "${t.paidCount} of ${t.approvedCount} settled"
                else "nothing approved yet",
                accent = ReimbursementAccent.Success,
                progress = t.approvedShare?.coerceIn(0.0, 1.0)?.toFloat()
                    ?: paidShare?.coerceIn(0.0, 1.0)?.toFloat(),
            ),
            ReimbursementKpiUi(
                id = "claims",
                label = "Claims",
                value = t.claimCount.toString(),
                caption = if (t.rejectedCount > 0)
                    "${t.rejectedCount} rejected"
                else "none rejected",
                accent = ReimbursementAccent.Neutral,
            ),
        )

        return ReimbursementsUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            view = dto.view,
            subtitle = if (dto.view == ReimbursementsUiState.VIEW_ARCHIVED)
                "Your archived claims."
            else "Raise an expense for reimbursement and track its approval.",
            kpis = kpis,
            claims = dto.claims.map { it.toUi() }.toImmutableList(),
        )
    }

    private fun ReimbursementClaimDto.toUi(): ReimbursementClaimUi {
        val metaParts = buildList {
            formatDay(expenseDate)?.let { add(it) }
            product?.takeIf { it.isNotBlank() }?.let { add(it) }
            if (product.isNullOrBlank()) expenseHead?.takeIf { it.isNotBlank() }?.let { add(it) }
        }
        val settle = when {
            status == "rejected" -> "Rejected"
            isPaid -> "Paid" + (formatDay(paymentDate ?: "")?.let { " · $it" } ?: "")
            status == "approved" -> "Awaiting payout"
            else -> "In review"
        }
        return ReimbursementClaimUi(
            id = id,
            title = title,
            amount = inr(amount),
            meta = metaParts.joinToString(" · "),
            statusLabel = statusLabel,
            statusToken = statusToken(status),
            settleLabel = settle,
            isPaid = isPaid,
            billUrl = billUrl?.takeIf { it.isNotBlank() },
            notes = notes?.takeIf { it.isNotBlank() },
        )
    }

    /** Map the claim status token onto the StatusPill colour vocabulary. */
    private fun statusToken(status: String): String = when (status.lowercase()) {
        "approved" -> "green"
        "rejected" -> "red"
        else -> "amber" // pending / anything new
    }

    /** "YYYY-MM-DD" → "12 Jun 2026"; null on empty/unparseable so meta omits it. */
    private fun formatDay(iso: String): String? {
        if (iso.isBlank()) return null
        // Prefer a plain calendar date; fall back to an ISO instant (createdAt).
        return try {
            DAY.format(LocalDate.parse(iso))
        } catch (_: DateTimeParseException) {
            try {
                DAY.format(Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate())
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }

    private fun plural(n: Int, one: String, many: String): String = if (n == 1) one else many

    private fun inr(amount: Double): String = INR.format(amount)

    private companion object {
        val INR: NumberFormat = NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply {
            maximumFractionDigits = 0
        }
        val DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
    }
}
