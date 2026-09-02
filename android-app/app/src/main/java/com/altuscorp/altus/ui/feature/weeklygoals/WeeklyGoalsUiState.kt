package com.altuscorp.altus.feature.weeklygoals

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.domain.model.StatusDisplay
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * WEEKLY GOALS BOARD (WMS) — read-only per-week goal cards. One @Immutable
 * UiState reduced from the cache-first
 * [com.altuscorp.altus.data.repository.WeeklyGoalsBoardRepository] board plus the
 * ViewModel's local view state (selected week, refresh / error flags). Every
 * field is render-ready so the composable stays dumb: labels are pre-formatted,
 * counters are pre-built mono copy, and each goal's status is already a resolved
 * [StatusDisplay] so the shared `StatusPill` renders it without the client ever
 * naming a status label or colour.
 */
@Immutable
data class WeeklyGoalsUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    /** Cold-cache load failure copy; only surfaced while still cold. */
    val loadError: String? = null,
    val isRefreshing: Boolean = false,
    val ownerName: String = "",
    /** "Jun 30 – Jul 6, 2026". */
    val weekLabel: String = "",
    val isCurrentWeek: Boolean = true,
    /** Pager targets (`yyyy-MM-dd` Mondays); null while cold. */
    val prevWeek: String? = null,
    val nextWeek: String? = null,
    /** Mono "72" weekly weighted score readout, 0–100. */
    val scoreValue: Int = 0,
    /** Mono "80 / 100" weight-budget readout. */
    val weightLabel: String = "",
    /** 0..1 for the weight-budget meter (total ÷ budget, clamped). */
    val weightFraction: Float = 0f,
    /** True when the live weight total ≠ the budget (an off-budget week). */
    val weightOffBudget: Boolean = false,
    val goals: ImmutableList<WeeklyGoalCardUi> = persistentListOf(),
    /** No active goals this week — the calm empty ledger. */
    val showEmpty: Boolean = false,
) {
    /** Content is ready to render (a warm board, even mid-refresh). */
    val showContent: Boolean get() = !isLoading && loadError == null && !showEmpty
}

/** One read-only goal card. */
@Immutable
data class WeeklyGoalCardUi(
    val id: String,
    /** "1" — the goal's index badge. */
    val indexLabel: String,
    /** UPPERCASE "ACME · SEO", or null when neither client nor subject is set. */
    val eyebrow: String?,
    /** targetDone, else client·subject, else "Untitled goal". */
    val title: String,
    /** Planning notes under the title, or null. */
    val notes: String?,
    /** Mono weight readout ("20"). */
    val weightLabel: String,
    /** "Mon, 6 Jul" target-date label, or null. */
    val dueLabel: String?,
    /** Resolved server status → shared StatusPill. */
    val status: StatusDisplay,
    /** effective % (acceptPct ?? pctDone), 0–100. */
    val effectivePct: Int,
    /** Mono "80%" readout. */
    val pctLabel: String,
    /** 0..1 for the completion bar. */
    val pctFraction: Float,
    /** effective % ≥ 100 — the bar turns evergreen. */
    val isComplete: Boolean,
    /** "Reported 60% · accepted 80%" when a review moved the number, else null. */
    val reviewNote: String?,
    /** Pre-formatted incentive chip ("Routine incentive · ₹5,000"), or null. */
    val incentiveLabel: String?,
    /** Carried over from a prior week. */
    val carried: Boolean,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface WeeklyGoalsIntent {
    data object Refresh : WeeklyGoalsIntent
    data object PrevWeek : WeeklyGoalsIntent
    data object NextWeek : WeeklyGoalsIntent
    data object ThisWeek : WeeklyGoalsIntent
    data object DismissLoadError : WeeklyGoalsIntent
}
