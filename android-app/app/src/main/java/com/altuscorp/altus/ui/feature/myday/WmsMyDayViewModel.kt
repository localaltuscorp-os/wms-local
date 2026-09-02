package com.altuscorp.altus.feature.myday

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.data.repository.TaskRepository
import com.altuscorp.altus.domain.model.StatusDisplay
import com.altuscorp.altus.domain.model.Task
import com.altuscorp.altus.domain.model.TaskBoard
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The WMS My Day brain — web parity with `app/(app)/tasks/agenda/page.tsx` +
 * `components/tasks/my-day-workspace.tsx`'s Agenda view, collapsed to the
 * doer's own tasks bucketed by urgency (no drag-to-reschedule on mobile — the
 * per-row quick-status advance covers the "move it along" need instead).
 * Reads the ALREADY-CACHED [TaskRepository.board] (the same `/api/mobile/tasks`
 * board the Tasks tab and the WMS Dashboard's "Today" list use) so My Day
 * paints instantly and never disagrees with its sibling tabs — no new
 * endpoint. `doerId = me.id` is enforced server-side, so every row here is
 * already the signed-in user's own work.
 *
 * Three lifecycle buckets, mirroring the web page's Overdue / Due Now /
 * Upcoming split: OVERDUE (effective due < today), DUE TODAY (== today), and
 * UPCOMING (everything else pending, soonest first). A minute ticker re-runs
 * the bucketing so a task crossing midnight climbs into Overdue without a
 * pull-to-refresh (Signature 9, same as the Tasks tab).
 */
@HiltViewModel
class WmsMyDayViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private data class LocalState(
        val isRefreshing: Boolean = false,
        val refreshFailed: Boolean = false,
        val bannerMessage: String? = null,
    )

    private val local = MutableStateFlow(LocalState())

    private val minuteTicker: Flow<Long> = flow {
        while (true) {
            emit(System.currentTimeMillis())
            delay(TICK_INTERVAL_MS)
        }
    }

    private val _effects = Channel<WmsMyDayEffect>(Channel.BUFFERED)
    val effects: Flow<WmsMyDayEffect> = _effects.receiveAsFlow()

    val uiState =
        combine(taskRepository.board(), local, minuteTicker) { board, localState, _ ->
            reduce(board, localState)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            initialValue = WmsMyDayUiState(),
        )

    init {
        observeRejections()
        refresh()
    }

    fun onIntent(intent: WmsMyDayIntent) {
        when (intent) {
            WmsMyDayIntent.Refresh -> refresh()
            WmsMyDayIntent.Retry -> refresh()
            is WmsMyDayIntent.Advance -> advance(intent.taskId)
            WmsMyDayIntent.DismissBanner -> local.update { it.copy(bannerMessage = null) }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            local.update { it.copy(isRefreshing = true) }
            val result = taskRepository.refreshBoard()
            local.update {
                it.copy(isRefreshing = false, refreshFailed = result.isError())
            }
        }
    }

    /** Quick-status: commit `allowedTransitions[0]` optimistically, same grammar as the Tasks tab. */
    private fun advance(taskId: String) {
        val row = uiState.value.allRows().firstOrNull { it.id == taskId } ?: return
        val target = row.advanceToStatus ?: return
        viewModelScope.launch {
            taskRepository.changeStatus(
                taskId = taskId,
                newStatus = target,
                expectedUpdatedAt = row.task.updatedAt,
                note = null,
            )
            _effects.send(WmsMyDayEffect.Committed)
        }
    }

    private fun observeRejections() {
        viewModelScope.launch {
            taskRepository.rejections.collect { rejection ->
                local.update {
                    it.copy(
                        bannerMessage = if (rejection.isStaleConflict) {
                            "Task changed elsewhere — refreshed."
                        } else {
                            rejection.message.ifBlank { "Couldn't update the task — try again." }
                        },
                    )
                }
                _effects.send(WmsMyDayEffect.Rejected)
            }
        }
    }

    // ─── Reduction ───────────────────────────────────────────────────────────

    private fun reduce(board: TaskBoard?, localState: LocalState): WmsMyDayUiState {
        val contentLoaded = board != null
        if (!contentLoaded) {
            return WmsMyDayUiState(
                isLoading = !localState.refreshFailed,
                isRefreshing = localState.isRefreshing,
                loadFailed = localState.refreshFailed,
                dateLabel = TODAY.format(LocalDate.now()),
                bannerMessage = localState.bannerMessage,
            )
        }

        val now = Instant.now()
        val active = board!!.tasks.filter { it.completedAt == null }

        val overdue = mutableListOf<WmsMyDayTaskRow>()
        val dueToday = mutableListOf<WmsMyDayTaskRow>()
        val upcoming = mutableListOf<WmsMyDayTaskRow>()

        active
            .sortedBy { it.dueAt }
            .forEach { task ->
                val row = task.toRow(board, now)
                when (row.duePhase) {
                    EffectiveDue.DuePhase.OVERDUE -> overdue += row
                    EffectiveDue.DuePhase.TODAY -> dueToday += row
                    else -> upcoming += row
                }
            }

        return WmsMyDayUiState(
            isLoading = false,
            isRefreshing = localState.isRefreshing,
            loadFailed = false,
            refreshFailed = localState.refreshFailed,
            contentLoaded = true,
            dateLabel = TODAY.format(LocalDate.now()),
            overdueTasks = overdue.toImmutableList(),
            dueTodayTasks = dueToday.toImmutableList(),
            upcomingTasks = upcoming.toImmutableList(),
            hasAnyTasks = active.isNotEmpty(),
            bannerMessage = localState.bannerMessage,
        )
    }

    private fun Task.toRow(board: TaskBoard, now: Instant): WmsMyDayTaskRow {
        val phase = EffectiveDue.duePhase(dueAt, now)
        val advanceTo = allowedTransitions.firstOrNull()
        return WmsMyDayTaskRow(
            task = this,
            display = board.displayFor(status),
            duePhase = phase,
            duePhrase = EffectiveDue.duePhrase(dueAt, now),
            meta = listOfNotNull(client?.takeIf { it.isNotBlank() }, subject?.takeIf { it.isNotBlank() })
                .joinToString(" · ")
                .takeIf { it.isNotBlank() },
            advanceToStatus = advanceTo,
            advanceLabel = advanceTo?.let { board.displayFor(it).label },
        )
    }

    private fun ApiResult<*>.isError(): Boolean = when (this) {
        is ApiResult.Success -> false
        is ApiResult.Gate -> false
        else -> true
    }

    private companion object {
        const val TICK_INTERVAL_MS = 60_000L
        const val STOP_TIMEOUT_MS = 5_000L
        val TODAY: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.ENGLISH)
    }
}

/** One agenda row: the domain [Task] plus everything the card needs pre-resolved. */
@Immutable
data class WmsMyDayTaskRow(
    val task: Task,
    val display: StatusDisplay,
    val duePhase: EffectiveDue.DuePhase,
    val duePhrase: String,
    /** "Client · Subject", null when both are blank. */
    val meta: String?,
    /** `allowedTransitions[0]` — null when the task can't be advanced (no quick-status action). */
    val advanceToStatus: String?,
    val advanceLabel: String?,
) {
    val id: String get() = task.id
    val isOverdue: Boolean get() = duePhase == EffectiveDue.DuePhase.OVERDUE
    val canAdvance: Boolean get() = advanceToStatus != null && advanceLabel != null
}

@Immutable
data class WmsMyDayUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val refreshFailed: Boolean = false,
    val contentLoaded: Boolean = false,
    val dateLabel: String = "",
    val overdueTasks: ImmutableList<WmsMyDayTaskRow> = persistentListOf(),
    val dueTodayTasks: ImmutableList<WmsMyDayTaskRow> = persistentListOf(),
    val upcomingTasks: ImmutableList<WmsMyDayTaskRow> = persistentListOf(),
    val hasAnyTasks: Boolean = false,
    val bannerMessage: String? = null,
) {
    val totalCount: Int get() = overdueTasks.size + dueTodayTasks.size + upcomingTasks.size
    fun allRows(): List<WmsMyDayTaskRow> = overdueTasks + dueTodayTasks + upcomingTasks
}

sealed interface WmsMyDayIntent {
    data object Refresh : WmsMyDayIntent
    data object Retry : WmsMyDayIntent
    data object DismissBanner : WmsMyDayIntent
    data class Advance(val taskId: String) : WmsMyDayIntent
}

sealed interface WmsMyDayEffect {
    data object Committed : WmsMyDayEffect
    data object Rejected : WmsMyDayEffect
}
