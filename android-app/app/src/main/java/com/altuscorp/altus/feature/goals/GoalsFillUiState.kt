package com.altuscorp.altus.feature.goals

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * One goal row on the S8 weekly-goals fill sheet: the server's unfilled goal
 * merged with the user's local draft (%Done + explanation).
 *
 * The row is fully pre-rendered by the ViewModel — the composable only lays
 * out strings and the two inputs, so recomposition stays cheap and skippable.
 */
@Immutable
data class GoalFillRowUi(
    val id: String,
    val position: Int,
    /** "GOAL 2 · HIGH" — rendered UPPERCASE in `caption`. */
    val eyebrow: String,
    /** Subject (falls back to client, then "Goal n"). */
    val title: String,
    /** The week's committed target ("Close 4 demos"), when the server sent one. */
    val target: String?,
    /** Client line when it isn't already the title. */
    val meta: String?,
    /** "by 4 Jul" — mono, from targetDate. */
    val dueLabel: String?,
    /** Draft %Done, 0–100, snapped to 5% detents. */
    val pctDone: Int,
    /** Draft explanation text. */
    val explanation: String,
    /** True while pctDone < 100 — the gate wants a reason. */
    val explanationRequired: Boolean,
    /** Inline error under the explanation field, only after a rejected submit. */
    val explanationError: String?,
    /** True when this row satisfies the gate (100%, or an explanation given). */
    val isReady: Boolean,
)

/**
 * The single immutable state of the GoalsFill screen (Part 6: one
 * `@Immutable` UiState per screen).
 *
 * Phases, in precedence order:
 *  1. [isLoading] — cold cache, skeletons in final geometry.
 *  2. [loadErrorMessage] — cold cache AND the refresh failed; retryable.
 *  3. [showEmpty] — nothing unfilled this week ("All filled.").
 *  4. content — the fill ledger + submit dock.
 */
@Immutable
data class GoalsFillUiState(
    val isLoading: Boolean = true,
    val loadErrorMessage: String? = null,
    /** "Week of 30 Jun" when the server sent a weekStart. */
    val weekLabel: String? = null,
    val goals: ImmutableList<GoalFillRowUi> = persistentListOf(),
    val readyCount: Int = 0,
    val totalCount: Int = 0,
    val isSubmitting: Boolean = false,
    /** Human copy for a failed submit; shown in the dock banner. */
    val submitError: String? = null,
    val showEmpty: Boolean = false,
) {
    /** Mono header counter — "2/5". */
    val progressLabel: String get() = "$readyCount/$totalCount"

    val showContent: Boolean get() = !isLoading && loadErrorMessage == null && !showEmpty
}

/** Everything the screen can ask of the ViewModel. */
sealed interface GoalsFillIntent {
    data object Refresh : GoalsFillIntent
    data class ChangePct(val goalId: String, val pctDone: Int) : GoalsFillIntent
    data class ChangeExplanation(val goalId: String, val text: String) : GoalsFillIntent
    data object Submit : GoalsFillIntent
    data object DismissSubmitError : GoalsFillIntent
}

/** One-shot effects (haptics + navigation live in the screen, never in state). */
sealed interface GoalsFillEvent {
    /** Submit accepted — the gate is cleared everywhere; pop back. */
    data object Submitted : GoalsFillEvent

    /** Submit rejected (validation or server) — fire the "uh-uh" double tick. */
    data object SubmitRejected : GoalsFillEvent
}
