package com.altuscorp.altus.feature.tasks.newtask

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.domain.model.EmployeeOption
import com.altuscorp.altus.domain.model.PriorityOption
import com.altuscorp.altus.domain.model.TaskFormOptions
import java.time.LocalDate

/**
 * S6 New Task — the keyboard-first create form. One @Immutable state, one
 * sealed intent, one sealed effect stream (haptics + navigation are one-shots,
 * never state).
 *
 * The form is decision-light on purpose: title autofocuses, Enter advances,
 * every pick-list is a bottom sheet (Part 3 rule 3), and Create is the single
 * 56dp commit whose label morphs to a spinner (`commit-morph`). Creation is
 * ONLINE-ONLY — the screen needs the fresh task id back, so failures surface
 * inline and nothing rides the outbox.
 */

/** Which decision sheet is up. Exactly one at a time, none while submitting. */
enum class NewTaskSheet { Doer, Initiator, Due, Subject }

@Immutable
data class NewTaskUiState(
    /** Pick-lists from /task-form; null = cold cache → skeleton silhouette. */
    val options: TaskFormOptions? = null,
    /** Cold cache AND the refresh failed → full-screen retry state. */
    val optionsError: String? = null,

    // Draft fields.
    val title: String = "",
    val description: String = "",
    val doer: EmployeeOption? = null,
    /** Defaults to `me` the moment options land; changeable via sheet. */
    val initiator: EmployeeOption? = null,
    val priority: PriorityOption? = null,
    val dueDate: LocalDate? = null,
    val subject: String? = null,

    // Field-level validation (set on submit attempt, cleared on edit).
    val titleError: String? = null,
    val doerError: String? = null,
    val priorityError: String? = null,
    val dueError: String? = null,

    // Submission.
    val submitting: Boolean = false,
    /** Inline danger-wash banner above the CTA (offline / server refusal). */
    val submitError: String? = null,

    val activeSheet: NewTaskSheet? = null,
) {
    /** The form silhouette resolves once the pick-lists exist. */
    val formReady: Boolean get() = options != null

    /** Cold-cache failure — nothing to draw but the retry state. */
    val showColdError: Boolean get() = options == null && optionsError != null
}

sealed interface NewTaskIntent {
    data class TitleChanged(val value: String) : NewTaskIntent
    data class DescriptionChanged(val value: String) : NewTaskIntent
    data class DoerPicked(val employee: EmployeeOption) : NewTaskIntent
    data class InitiatorPicked(val employee: EmployeeOption) : NewTaskIntent
    data class PriorityPicked(val priority: PriorityOption) : NewTaskIntent
    data class DuePicked(val date: LocalDate) : NewTaskIntent

    /** null clears back to "No subject". */
    data class SubjectPicked(val subject: String?) : NewTaskIntent

    /** Open ([sheet] != null) or settle-closed ([sheet] == null) a decision sheet. */
    data class SheetRequested(val sheet: NewTaskSheet?) : NewTaskIntent

    data object RetryOptions : NewTaskIntent
    data object Submit : NewTaskIntent
}

sealed interface NewTaskEffect {
    /** Server accepted — pop to the fresh task's detail. */
    data class Created(val taskId: String) : NewTaskEffect

    /** Validation refused the draft — the "uh-uh" double tick. */
    data object ValidationFailed : NewTaskEffect

    /** The POST failed — "uh-uh"; copy is already in [NewTaskUiState.submitError]. */
    data object SubmitFailed : NewTaskEffect
}
