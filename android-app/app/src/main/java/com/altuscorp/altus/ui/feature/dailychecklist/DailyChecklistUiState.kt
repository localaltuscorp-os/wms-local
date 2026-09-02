package com.altuscorp.altus.feature.dailychecklist

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.persistentSetOf

/**
 * Daily Checklist (WMS page) — web parity with `app/(app)/daily-checklist/page.tsx`
 * (`DayLedger`). One @Immutable UiState + one sealed intent (Part 6). Rows are
 * pre-formatted here so the composables stay dumb — mirrors the ProjectsUiState /
 * PlanUiState convention already used across the app.
 */

/** One row in "Today's commitments" — an assigned task OR a personal item. */
@Immutable
data class ChecklistRow(
    /** Task id (assigned) or daily_checklist row id (personal) — LazyColumn key. */
    val id: String,
    val assigned: Boolean,
    val title: String,
    /** "Client · Subject", or null. */
    val meta: String?,
    val goalRelated: Boolean,
    val done: Boolean,
    /** Assigned rows only — the underlying task id to toggle status on. */
    val taskId: String?,
    /** Personal rows only — night close-out note. */
    val doneNote: String,
    /** Assigned rows only — "Due 4 Jul" / "Overdue · 4 Jul", or null. */
    val duePhrase: String?,
    val overdue: Boolean,
    /** True once a personal item has been carried forward from an earlier day. */
    val carried: Boolean,
)

/** One pullable current-week goal, ready to commit to today with one tap. */
@Immutable
data class PullableGoalRow(
    val id: String,
    val title: String,
    /** "Target … · Weight n", or null. */
    val meta: String?,
)

@Immutable
data class DailyChecklistUiState(
    /** Cold cache, first fetch still in flight → geometry-true skeleton. */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the refresh failed → retry empty state. */
    val loadFailed: Boolean = false,
    val weekday: String = "",
    val date: String = "",
    val minItems: Int = 5,
    val assigned: ImmutableList<ChecklistRow> = persistentListOf(),
    val personal: ImmutableList<ChecklistRow> = persistentListOf(),
    val pullable: ImmutableList<PullableGoalRow> = persistentListOf(),
    /** Count of unfinished items rolled over from earlier days (the carry-forward strip). */
    val overdueCount: Int = 0,
    val totalCount: Int = 0,
    val doneCount: Int = 0,
    /** Row keys with an in-flight online mutation (spinner face on that row's control). */
    val busyKeys: ImmutableSet<String> = persistentSetOf(),
    /** The "add your own commitment" composer text. */
    val draftTitle: String = "",
    val addingPersonal: Boolean = false,
    val carryingForward: Boolean = false,
    /** Non-null while the note-editor sheet is up. */
    val noteDraft: NoteDraft? = null,
    /** One-shot banner copy; cleared via [DailyChecklistIntent.MessageShown]. */
    val message: String? = null,
) {
    val pendingCount: Int get() = totalCount - doneCount
    val hasAnyContent: Boolean get() = totalCount > 0 || pullable.isNotEmpty() || overdueCount > 0
    /** "Your day is planned" once at least one item is committed (web `DailyMin5`). */
    val dayPlanned: Boolean get() = totalCount >= 1
}

/** The personal-item note-editor sheet draft. */
@Immutable
data class NoteDraft(
    val itemId: String,
    val done: Boolean,
    val text: String,
    val submitting: Boolean = false,
)

sealed interface DailyChecklistIntent {
    data object Refresh : DailyChecklistIntent
    data object Retry : DailyChecklistIntent

    data class DraftTitleChanged(val value: String) : DailyChecklistIntent
    data object AddPersonal : DailyChecklistIntent

    /** Pull a current-week goal into today. */
    data class PullGoal(val goalId: String) : DailyChecklistIntent

    /** Toggle a manager-ASSIGNED task done/not-done — writes to the task itself. */
    data class ToggleAssigned(val taskId: String, val done: Boolean) : DailyChecklistIntent

    /** Toggle a PERSONAL item done/not-done (keeps its current note). */
    data class TogglePersonal(val itemId: String, val done: Boolean) : DailyChecklistIntent

    /** Remove a personal item from today's checklist. */
    data class RemovePersonal(val itemId: String) : DailyChecklistIntent

    /** Carry every unfinished item from earlier days onto today. */
    data object CarryForward : DailyChecklistIntent

    data class OpenNote(val itemId: String, val done: Boolean, val currentNote: String) : DailyChecklistIntent
    data object DismissNote : DailyChecklistIntent
    data class NoteChanged(val value: String) : DailyChecklistIntent
    data object SaveNote : DailyChecklistIntent

    data object MessageShown : DailyChecklistIntent
}

/** One-shot effects — haptics never live in state. */
sealed interface DailyChecklistEffect {
    /** An online mutation was rejected — the "uh-uh" double tick. */
    data object Reject : DailyChecklistEffect

    /** A commit landed clean — the single commit tick. */
    data object Committed : DailyChecklistEffect
}
