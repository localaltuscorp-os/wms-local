package com.altuscorp.altus.feature.ambassadors

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * AMBASSADORS — the Sales "Partner Intelligence" surface for the native app,
 * reduced from the cache-first
 * [com.altuscorp.altus.data.repository.AmbassadorsRepository] snapshot plus local
 * view state (refresh / error flags). Every field is render-ready so the
 * composable stays a dumb render: money is pre-formatted `₹` copy, the funnel
 * bars carry a resolved 0..1 fraction, and each partner row's rollups are
 * already formatted.
 *
 * Faithful to the web `/ambassadors` page: the five executive KPI tiles, the
 * referral-pipeline funnel (with a quiet "N lost" footer), and the score-ranked
 * partner registry (which subsumes the web leaderboard).
 */
@Immutable
data class AmbassadorsUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    val subtitle: String = "",
    /** The 5-up KPI strip. */
    val kpis: ImmutableList<AmbKpiUi> = persistentListOf(),
    /** Pipeline funnel bars (excludes the terminal `lost` — surfaced as [lostCaption]). */
    val funnel: ImmutableList<AmbFunnelUi> = persistentListOf(),
    /** "3 lost" — the quiet funnel footer, or null when nothing is lost. */
    val lostCaption: String? = null,
    /** The score-ranked partner registry. */
    val partners: ImmutableList<AmbPartnerUi> = persistentListOf(),
) {
    val hasContent: Boolean get() = kpis.isNotEmpty()
}

/** Which token an accent draws from — resolved to a colour in the composable. */
enum class AmbAccent { Sales, Success, Warn, Neutral }

/** One headline KPI card. */
@Immutable
data class AmbKpiUi(
    val id: String,
    val label: String,
    val value: String,
    /** Optional secondary line ("12 converted" / "₹3.4L paid"), or null. */
    val caption: String?,
    val accent: AmbAccent,
)

/** One pipeline-funnel stage bar (fraction relative to the largest non-lost stage). */
@Immutable
data class AmbFunnelUi(
    val stage: String,
    val label: String,
    val count: Int,
    /** 0..1 fill of this stage's count against the largest stage. */
    val fraction: Float,
)

/** One partner registry row with its per-ambassador rollups. */
@Immutable
data class AmbPartnerUi(
    val id: String,
    val name: String,
    val company: String,
    val photoUrl: String?,
    /** Uppercase tier label ("PLATINUM" | "GOLD" | …), or null when untiered. */
    val tierLabel: String?,
    /** Partner score, pre-formatted ("87"), or null. */
    val score: String?,
    /** "8 referrals · 3 won" — the pipeline rollup, render-ready. */
    val pipeline: String,
    /** Revenue driven, compact `₹`. */
    val revenue: String,
    /** "₹1.2L owed" when a commission is pending, else null. */
    val commissionCaption: String?,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface AmbassadorsIntent {
    data object Refresh : AmbassadorsIntent
    data object Retry : AmbassadorsIntent
}
