package com.altuscorp.altus.feature.overtime

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * OVERTIME — Employees-workspace ledger for the signed-in user. One @Immutable
 * UiState reduced from the cache-first
 * [com.altuscorp.altus.data.repository.OvertimeRepository] snapshot plus local
 * view state (refresh / error flags). Every field is render-ready so the
 * composable stays a dumb render: hours are pre-formatted ("6h" / "1.5h"), the
 * KPI accents are already chosen, and status tokens are mapped to colour roles.
 *
 * Faithful to the web `/overtime` page (glass hero + a 4-up KPI strip, then the
 * entries ledger), narrowed to the one person the phone belongs to.
 */
@Immutable
data class OvertimeUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** "Log the extra hours you put in. Your manager approves them." */
    val subtitle: String = "",
    /** The 4-up KPI strip: total · approved · pending · this month. */
    val kpis: ImmutableList<OvertimeKpiUi> = persistentListOf(),
    val entries: ImmutableList<OvertimeEntryUi> = persistentListOf(),
) {
    val hasContent: Boolean get() = kpis.isNotEmpty()
}

/** Which token an accent / meter draws from — resolved to a colour in the composable. */
enum class OvertimeAccent { Employees, Success, Warn, Neutral }

/** One KPI stat card (mirrors the web `KpiCard`). */
@Immutable
data class OvertimeKpiUi(
    /** Stable key. */
    val id: String,
    /** UPPERCASE eyebrow ("TOTAL OT HOURS"). */
    val label: String,
    /** Pre-formatted value ("18h" / "3" / "1.5h"). */
    val value: String,
    val caption: String,
    val accent: OvertimeAccent,
    /** 0..1 fill for the thin meter, or null to hide it. */
    val progress: Float? = null,
)

/** One overtime entry the user logged, with its decision status. */
@Immutable
data class OvertimeEntryUi(
    val id: String,
    /** Pre-formatted work date ("12 Jun 2026"). */
    val dateLabel: String,
    /** Pre-formatted hours ("6h" / "1.5h"). */
    val hoursLabel: String,
    /** Reason + decision meta ("Month-end close · Approved by Manan"), render-ready. */
    val meta: String,
    val statusLabel: String,
    /** Colour token for the status pill ("green" | "red" | "amber"). */
    val statusToken: String,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface OvertimeIntent {
    data object Refresh : OvertimeIntent
    data object Retry : OvertimeIntent
}
