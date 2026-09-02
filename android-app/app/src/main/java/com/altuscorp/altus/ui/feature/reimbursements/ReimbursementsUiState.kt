package com.altuscorp.altus.feature.reimbursements

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * REIMBURSEMENTS — the signed-in user's own expense claims (Employees
 * workspace), one shelf at a time ("active" | "archived"). One @Immutable
 * UiState reduced from the cache-first
 * [com.altuscorp.altus.data.repository.ReimbursementsRepository] snapshot plus
 * local view state (selected shelf, refresh / error flags). Every field is
 * render-ready so the composable stays a dumb render: money is pre-formatted `₹`
 * copy, KPI accents are already chosen, and status tokens are mapped to roles.
 *
 * Faithful to the web `/reimbursements` page (glass hero, a 4-up KPI strip,
 * Active/Archived tabs, then the claims list), narrowed to the one person.
 */
@Immutable
data class ReimbursementsUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** "active" | "archived" — the selected shelf. */
    val view: String = VIEW_ACTIVE,
    /** One-line subtitle under the KPI strip. */
    val subtitle: String = "",
    /** The 4-up KPI strip: total claimed · pending · approved·paid · claims. */
    val kpis: ImmutableList<ReimbursementKpiUi> = persistentListOf(),
    val claims: ImmutableList<ReimbursementClaimUi> = persistentListOf(),
) {
    val hasContent: Boolean get() = kpis.isNotEmpty()

    companion object {
        const val VIEW_ACTIVE = "active"
        const val VIEW_ARCHIVED = "archived"
    }
}

/** Which token an accent / meter draws from — resolved to a colour in the composable. */
enum class ReimbursementAccent { Employees, Success, Warn, Neutral }

/** One KPI stat card (mirrors the web `KpiCard`). */
@Immutable
data class ReimbursementKpiUi(
    val id: String,
    /** UPPERCASE eyebrow ("TOTAL CLAIMED"). */
    val label: String,
    /** Pre-formatted mono value ("₹12,500" / "4"). */
    val value: String,
    val caption: String,
    val accent: ReimbursementAccent,
    /** 0..1 fill for the thin meter, or null to hide it. */
    val progress: Float? = null,
)

/** One reimbursement claim, render-ready. */
@Immutable
data class ReimbursementClaimUi(
    val id: String,
    val title: String,
    /** Pre-formatted claim amount ("₹1,500"). */
    val amount: String,
    /** "12 Jun 2026 · Printing" — expense date + product/head meta (or "" ). */
    val meta: String,
    val statusLabel: String,
    /** Colour token for the status pill ("green" | "red" | "amber"). */
    val statusToken: String,
    /** "Paid · 14 Jun" / "Awaiting payout" / "Rejected" — the settlement line. */
    val settleLabel: String,
    val isPaid: Boolean,
    /** The bill / receipt link, if the claimant attached one. */
    val billUrl: String?,
    val notes: String?,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface ReimbursementsIntent {
    data class SelectView(val view: String) : ReimbursementsIntent
    data object Refresh : ReimbursementsIntent
    data object Retry : ReimbursementsIntent
}
