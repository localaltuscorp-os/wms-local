package com.altuscorp.altus.feature.ambassadors

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.AmbFunnelStageDto
import com.altuscorp.altus.data.remote.dto.AmbassadorRowDto
import com.altuscorp.altus.data.remote.dto.AmbassadorsDto
import com.altuscorp.altus.data.repository.AmbassadorsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlin.math.abs
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
 * The Ambassadors brain (Sales workspace). Reads are cache-first —
 * [AmbassadorsRepository.ambassadors] paints the last-decoded snapshot instantly
 * (null → skeletons) while [refresh] reconciles against the server. Read-only:
 * ambassadors are created / edited on the web, so this ViewModel only owns the
 * refresh / error flags. All formatting (compact `₹` totals, conversion %, tier
 * labels, funnel fractions) happens here so the composable stays a dumb render.
 */
@HiltViewModel
class AmbassadorsViewModel @Inject constructor(
    private val repository: AmbassadorsRepository,
) : ViewModel() {

    private data class LocalState(
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    val uiState: StateFlow<AmbassadorsUiState> =
        combine(repository.ambassadors(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = AmbassadorsUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: AmbassadorsIntent) {
        when (intent) {
            AmbassadorsIntent.Refresh -> refresh()
            AmbassadorsIntent.Retry -> refresh()
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

    private fun reduce(dto: AmbassadorsDto?, local: LocalState): AmbassadorsUiState {
        if (dto == null) {
            return AmbassadorsUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
            )
        }

        val m = dto.metrics
        val kpis: ImmutableList<AmbKpiUi> = persistentListOf(
            AmbKpiUi(
                id = "partners",
                label = "Active partners",
                value = m.activeAmbassadors.toString(),
                caption = "referral partners",
                accent = AmbAccent.Sales,
            ),
            AmbKpiUi(
                id = "referrals",
                label = "Referrals",
                value = m.totalReferrals.toString(),
                caption = "${m.convertedReferrals} converted",
                accent = AmbAccent.Sales,
            ),
            AmbKpiUi(
                id = "conversion",
                label = "Conversion",
                value = "${(m.conversionRate * 100).roundToInt()}%",
                caption = "referrals won",
                accent = AmbAccent.Success,
            ),
            AmbKpiUi(
                id = "revenue",
                label = "Revenue driven",
                value = inrCompact(m.revenue),
                caption = "from won referrals",
                accent = AmbAccent.Success,
            ),
            AmbKpiUi(
                id = "commission",
                label = "Commission owed",
                value = inrCompact(m.commissionPending),
                caption = "${inrCompact(m.commissionPaid)} paid",
                accent = if (m.commissionPending > 0.0) AmbAccent.Warn else AmbAccent.Neutral,
            ),
        )

        // Pipeline funnel — exclude the terminal `lost`, fraction against the max.
        val stages = dto.funnel.filter { it.stage != "lost" }
        val maxCount = stages.maxOfOrNull { it.count }?.takeIf { it > 0 } ?: 1
        val funnel = stages.map { it.toUi(maxCount) }.toImmutableList()
        val lost = dto.funnel.firstOrNull { it.stage == "lost" }?.count ?: 0
        val lostCaption = if (lost > 0) "$lost lost" else null

        return AmbassadorsUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            subtitle = "Your referral partners, their pipeline & the commissions they earn.",
            kpis = kpis,
            funnel = funnel,
            lostCaption = lostCaption,
            partners = dto.ambassadors.map { it.toUi() }.toImmutableList(),
        )
    }

    private fun AmbFunnelStageDto.toUi(maxCount: Int): AmbFunnelUi = AmbFunnelUi(
        stage = stage,
        label = label.ifBlank { stage },
        count = count,
        fraction = (count.toFloat() / maxCount.toFloat()).coerceIn(0f, 1f),
    )

    private fun AmbassadorRowDto.toUi(): AmbPartnerUi = AmbPartnerUi(
        id = id,
        name = name,
        company = company?.takeIf { it.isNotBlank() } ?: "—",
        photoUrl = photoUrl?.takeIf { it.isNotBlank() },
        tierLabel = tier?.takeIf { it.isNotBlank() }?.uppercase(Locale.ENGLISH),
        score = partnerScore?.let { it.roundToInt().toString() },
        pipeline = "$referrals ${plural(referrals, "referral")} · $converted won",
        revenue = inrCompact(revenue),
        commissionCaption = commissionPending.takeIf { it > 0.0 }?.let { "${inrCompact(it)} owed" },
    )

    private fun plural(n: Int, word: String): String = if (n == 1) word else "${word}s"

    /** Compact Indian money — "₹1.24 Cr" / "₹4.2 L" / "₹8,400" / "₹0". */
    private fun inrCompact(amount: Double): String {
        val v = abs(amount)
        return when {
            v >= 1_00_00_000 -> "₹%.2f Cr".format(amount / 1_00_00_000)
            v >= 1_00_000 -> "₹%.1f L".format(amount / 1_00_000)
            else -> "₹" + INR.format(kotlin.math.round(amount).toLong())
        }
    }

    private companion object {
        val INR: java.text.NumberFormat =
            java.text.NumberFormat.getInstance(Locale("en", "IN"))
    }
}
