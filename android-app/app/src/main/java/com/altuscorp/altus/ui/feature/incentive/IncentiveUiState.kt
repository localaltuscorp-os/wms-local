package com.altuscorp.altus.feature.incentive

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * INCENTIVE — Employees-workspace analytics for the signed-in user, one year at
 * a time. One @Immutable UiState reduced from the cache-first
 * [com.altuscorp.altus.data.repository.IncentiveRepository] snapshot plus local
 * view state (selected year, refresh / error flags). Every field is render-ready
 * so the composable stays a dumb render: money is pre-formatted `₹` copy, the
 * KPI accents are already chosen, and status tokens are mapped to colour roles.
 *
 * Faithful to the web `/incentive` page (glass hero + year pills, a 4-up KPI
 * strip, then the ledger), narrowed to the one person the phone belongs to.
 */
@Immutable
data class IncentiveUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    val year: Int = 0,
    val years: ImmutableList<Int> = persistentListOf(),
    /** "Track your incentive earnings, attainment and requests." */
    val subtitle: String = "",
    /** The 4-up KPI strip: earned · paid · unpaid · attainment. */
    val kpis: ImmutableList<IncentiveKpiUi> = persistentListOf(),
    val lines: ImmutableList<IncentiveLineUi> = persistentListOf(),
    val requests: ImmutableList<IncentiveRequestUi> = persistentListOf(),
) {
    val hasContent: Boolean get() = kpis.isNotEmpty()
}

/** Which token an accent / meter draws from — resolved to a colour in the composable. */
enum class IncentiveAccent { Employees, Success, Danger, Warn, Neutral }

/** One KPI stat card (mirrors the web `KpiCard`). */
@Immutable
data class IncentiveKpiUi(
    /** Stable key. */
    val id: String,
    /** UPPERCASE eyebrow ("TOTAL EARNED"). */
    val label: String,
    /** Pre-formatted mono value ("₹1,25,000" / "82%" / "—"). */
    val value: String,
    val caption: String,
    val accent: IncentiveAccent,
    /** 0..1 fill for the thin meter, or null to hide it. */
    val progress: Float? = null,
)

/** One ledger line — a permanent entry or a project leg the user played. */
@Immutable
data class IncentiveLineUi(
    val id: String,
    val label: String,
    /** "Jun 2026 · Permanent" / "May 2026 · Supervisor". */
    val sub: String,
    /** Pre-formatted approved amount ("₹18,000"). */
    val amount: String,
    /** "Paid" or "₹6,000 unpaid" — the settlement state, render-ready. */
    val settle: String,
    val isPaid: Boolean,
)

/** One filed incentive request with its decision status. */
@Immutable
data class IncentiveRequestUi(
    val id: String,
    val title: String,
    val statusLabel: String,
    /** Colour token for the status pill ("green" | "red" | "amber"). */
    val statusToken: String,
    /** "12 Jun 2026". */
    val dateLabel: String,
    val note: String?,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface IncentiveIntent {
    data class SelectYear(val year: Int) : IncentiveIntent
    data object Refresh : IncentiveIntent
    data object Retry : IncentiveIntent
}
