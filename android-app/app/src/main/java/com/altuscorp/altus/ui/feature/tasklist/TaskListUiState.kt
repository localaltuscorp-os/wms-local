package com.altuscorp.altus.feature.tasks.list

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.domain.model.StatusDisplay
import com.altuscorp.altus.domain.model.Task
import com.altuscorp.altus.navigation.TaskListRoute
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * S6 Task List — MVI surface.
 *
 * One [Immutable] [TaskListUiState] (the reduced view), one sealed
 * [TaskListIntent] (everything the user can do), one sealed [TaskListEffect]
 * (the one-shots: haptics on an optimistic commit or a revert). Lists are
 * [ImmutableList] so Compose skipping stays correct; every row is pre-resolved
 * ([TaskRow]) so the card composables stay dumb.
 */

/** The four counted filter chips (mono counts, single-select). */
enum class TaskFilter(val label: String) {
    All("All"),
    Pending("Pending"),
    Overdue("Overdue"),
    Done("Done"),
    ;

    companion object {
        /** Map a nav-route filter arg (a Today pressure card deep-links one). */
        fun fromRoute(filter: String?): TaskFilter = when (filter) {
            TaskListRoute.FILTER_PENDING -> Pending
            TaskListRoute.FILTER_OVERDUE -> Overdue
            TaskListRoute.FILTER_DONE -> Done
            else -> All
        }
    }
}

/** Mono counts painted on the filter chips. */
@Immutable
data class FilterCounts(
    val all: Int,
    val pending: Int,
    val overdue: Int,
    val done: Int,
) {
    fun forFilter(filter: TaskFilter): Int = when (filter) {
        TaskFilter.All -> all
        TaskFilter.Pending -> pending
        TaskFilter.Overdue -> overdue
        TaskFilter.Done -> done
    }
}

/**
 * A fully-resolved list row: the domain [Task] plus everything the card needs
 * pre-computed off the composition thread — the server-driven status pill, the
 * due phase + human phrase, and the single-step swipe target
 * ([advanceToStatus] = `allowedTransitions[0]`, labelled by the server's
 * `statusDisplay`).
 */
@Immutable
data class TaskRow(
    val task: Task,
    val display: StatusDisplay,
    val duePhase: EffectiveDue.DuePhase,
    val duePhrase: String,
    val isOverdue: Boolean,
    /** `allowedTransitions[0]` — null when the task can't be advanced (no swipe). */
    val advanceToStatus: String?,
    /** The server label for [advanceToStatus] shown on the swipe under-layer. */
    val advanceLabel: String?,
) {
    val id: String get() = task.id
    val canAdvance: Boolean get() = advanceToStatus != null && advanceLabel != null
}

@Immutable
data class TaskListUiState(
    /** Cold cache — the list has never resolved; show the skeleton. */
    val loading: Boolean,
    val filter: TaskFilter,
    val query: String,
    val searchActive: Boolean,
    val counts: FilterCounts,
    /** Active tasks, query-filtered, soonest-effective-due first (overdue floats up). */
    val pending: ImmutableList<TaskRow>,
    /** Completed tasks, query-filtered, most-recent first. */
    val completed: ImmutableList<TaskRow>,
    val completedExpanded: Boolean,
    /** Transient error / revert copy (auto-clears); null the rest of the time. */
    val bannerMessage: String?,
    /** True once the board has resolved with ≥1 task — separates empty from cold. */
    val hasAnyTasks: Boolean,
    /** True while a user-initiated pull-to-refresh is in flight (warm list only). */
    val isRefreshing: Boolean = false,
) {
    companion object {
        fun initial(filter: TaskFilter): TaskListUiState = TaskListUiState(
            loading = true,
            filter = filter,
            query = "",
            searchActive = false,
            counts = FilterCounts(0, 0, 0, 0),
            pending = persistentListOf(),
            completed = persistentListOf(),
            completedExpanded = false,
            bannerMessage = null,
            hasAnyTasks = false,
            isRefreshing = false,
        )
    }
}

sealed interface TaskListIntent {
    data class QueryChanged(val query: String) : TaskListIntent
    data object SearchToggled : TaskListIntent
    data class FilterSelected(val filter: TaskFilter) : TaskListIntent
    data object CompletedToggled : TaskListIntent
    data object Refresh : TaskListIntent
    data object DismissBanner : TaskListIntent

    /** Swipe-to-advance released past the anchor — commit `allowedTransitions[0]`. */
    data class Advance(val taskId: String) : TaskListIntent
}

sealed interface TaskListEffect {
    /** Optimistic status commit landed in cache — fire `EFFECT_TICK`. */
    data object Committed : TaskListEffect

    /** A queued mutation was refused; the cache is already reverted — "uh-uh". */
    data class Rejected(val isStale: Boolean) : TaskListEffect
}
