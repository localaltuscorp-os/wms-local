package com.altuscorp.altus.feature.plan

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.domain.model.DayPlan
import com.altuscorp.altus.domain.model.PlanItem
import com.altuscorp.altus.domain.model.PlannerGoal
import com.altuscorp.altus.domain.model.PullableGoal
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.persistentSetOf

/**
 * Plan Your Day (S4) — one @Immutable UiState + one sealed intent (Part 6).
 *
 * The screen reuses the DCC row grammar: pullable weekly goals and today's
 * assigned tasks as 64dp rows with a one-tap "+ Add to today" morph chip, a
 * pinned mono "2/5" commitment meter (MIN_DAILY_ITEMS), and a goal-actuals
 * sheet with a 5%-detent slider. Satisfying the meter pops back to the
 * blocked surface (the clock-in gate).
 */

/** The goal-actuals sheet draft (5%-detent slider + optional note). */
@Immutable
data class ActualsDraft(
    val goal: PlannerGoal,
    /** Snapped to 5% detents. */
    val pct: Int,
    val note: String,
    val submitting: Boolean = false,
)

@Immutable
data class PlanUiState(
    /** Cold cache, first fetch still in flight → geometry-true skeletons. */
    val isLoading: Boolean = true,
    /** Cold cache AND the refresh failed → retry empty state. */
    val loadFailed: Boolean = false,
    val plan: DayPlan? = null,
    /** Row keys with an in-flight online mutation (spinner face on the chip). */
    val pendingKeys: ImmutableSet<String> = persistentSetOf(),
    /** The "add your own commitment" composer text. */
    val draftTitle: String = "",
    val addingPersonal: Boolean = false,
    /** Non-null while the goal-actuals sheet is up. */
    val actuals: ActualsDraft? = null,
    /** One-shot snackbar copy; cleared via [PlanIntent.MessageShown]. */
    val message: String? = null,
)

sealed interface PlanIntent {
    data object Refresh : PlanIntent
    data class DraftTitleChanged(val value: String) : PlanIntent

    /** Commit the composer text as a personal plan item. */
    data object AddPersonal : PlanIntent

    /** Pull one of today's assigned tasks into the plan. */
    data class PullTask(val taskId: String) : PlanIntent

    /** Pull a current-week goal into today. */
    data class PullGoal(val goalId: String) : PlanIntent

    /** Re-commit an overdue item (goal-linked → pull the goal, else personal). */
    data class AddOverdue(val item: PlanItem) : PlanIntent

    data class OpenActuals(val goal: PlannerGoal) : PlanIntent
    data object DismissActuals : PlanIntent
    data class ActualPctChanged(val pct: Int) : PlanIntent
    data class ActualNoteChanged(val note: String) : PlanIntent
    data object SubmitActual : PlanIntent

    data object MessageShown : PlanIntent
}

/** One-shot effects — haptics and navigation never live in state. */
sealed interface PlanEffect {
    /** Meter satisfied (and actuals clear) → back to the blocked surface. */
    data object PopBack : PlanEffect

    /** Goal actual accepted → commit tick + slide the sheet away. */
    data object ActualsSaved : PlanEffect

    /** Online mutation rejected → the "uh-uh" double tick + snackbar. */
    data object Reject : PlanEffect
}

/** Stable pending-mutation keys shared by ViewModel and rows. */
internal object PlanPendingKeys {
    fun task(taskId: String): String = "task-$taskId"
    fun goal(goalId: String): String = "goal-$goalId"
    fun overdue(itemId: String): String = "overdue-$itemId"
}

/** "Client · Subject" display line; goals without either stay readable. */
internal fun PlannerGoal.displayTitle(): String =
    listOfNotNull(client, subject).filter { it.isNotBlank() }
        .joinToString(" · ")
        .ifBlank { "Weekly goal" }

internal fun PullableGoal.displayTitle(): String =
    listOfNotNull(client, subject).filter { it.isNotBlank() }
        .joinToString(" · ")
        .ifBlank { "Weekly goal" }
