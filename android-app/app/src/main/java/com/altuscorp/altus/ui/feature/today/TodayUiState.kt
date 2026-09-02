package com.altuscorp.altus.feature.today

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.ui.designsystem.DayRingState
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * Today — S2, "the paced ledger" (canonical spec Part 4 / §S2).
 *
 * One [Immutable] UiState + one sealed [TodayIntent] (Part 6 contract). Every
 * strip's contents are pre-resolved here so the composables stay dumb renders:
 * the ViewModel composes /dashboard + the assembled DayRingState + the DCC
 * board + the cached identity into fixed-order strips (an obligation ledger,
 * never a feed).
 */

/** The contextual hero action — the largest target on the screen changes with
 *  where the day is (canonical §S2, Strip 1). */
enum class PunchKind {
    /** Not yet clocked in — a 96dp circular Clock-in. */
    ClockIn,

    /** Clocked in, not out — "In since …" + an outlined Clock out. */
    ClockOut,

    /** Both punches recorded — the day's ends are sealed. */
    Done,
}

/** The hero's punch context, derived from the dashboard attendance summary. */
@Immutable
data class PunchContext(
    val kind: PunchKind = PunchKind.ClockIn,
    /** Server-formatted local time ("09:14"), null until punched. */
    val checkedInAt: String? = null,
    val checkedOutAt: String? = null,
)

/** DCC compliance pressure feeding the Strip-3 card (and mirrored by the ring). */
@Immutable
data class DccPressure(
    val filled: Int,
    val due: Int,
    val pct: Int,
    val complete: Boolean,
) {
    /** 0..1 for the compliance ring; guards a null/zero due-set. */
    val fraction: Float get() = if (due > 0) (filled.toFloat() / due).coerceIn(0f, 1f) else 0f
}

/** The single ranked weekly-goals gate (Strip 4 / the hero inset row). */
@Immutable
data class GoalsGateBanner(
    val unfilledCount: Int,
)

/** The six modules the Today module row can surface (Strip 5). */
enum class ModuleId { Attendance, Tasks, Dcc, Goals, Inbox, More }

/** One pre-formatted horizontal module card. */
@Immutable
data class ModuleTile(
    val id: ModuleId,
    val title: String,
    /** Mono-ish status meta ("6/11", "3 open", "In 09:14"). */
    val meta: String,
)

/** The screen's single source of truth. */
@Immutable
data class TodayUiState(
    /** Cold cache and the first reconcile is in flight. */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** Dashboard payload present — the strips can paint (vs. skeleton). */
    val contentLoaded: Boolean = false,

    // Collapsing header.
    val greeting: String = "",
    val dateLabel: String = "",
    val avatarName: String = "",
    val avatarUrl: String? = null,

    // Strip 1 — Day Ring hero.
    val ring: DayRingState = DayRingState.Empty,
    val punch: PunchContext = PunchContext(),

    // Strip 2 — task pressure.
    val pendingTasks: Int = 0,
    val overdueTasks: Int = 0,

    // Strip 3 — DCC.
    val dcc: DccPressure? = null,

    // Strip 4 — the single ranked gate.
    val goalsGate: GoalsGateBanner? = null,

    // Strip 5 — module row.
    val modules: ImmutableList<ModuleTile> = persistentListOf(),
) {
    val hasContent: Boolean get() = greeting.isNotEmpty()

    /** The goals gate blocks clock-in, so it rides the hero inset row while the
     *  user is not yet in; once in it drops to a Strip-4 banner. */
    val heroGate: GoalsGateBanner? get() = if (punch.kind == PunchKind.ClockIn) goalsGate else null
    val bannerGate: GoalsGateBanner? get() = if (punch.kind != PunchKind.ClockIn) goalsGate else null
}

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface TodayIntent {
    /** Pull-to-refresh reconcile of every strip source. */
    data object Refresh : TodayIntent

    /** Retry after a cold-cache load failure. */
    data object Retry : TodayIntent

    /** Persist that today's Day Seal has played — once per day, ever. */
    data object MarkSealShown : TodayIntent
}
