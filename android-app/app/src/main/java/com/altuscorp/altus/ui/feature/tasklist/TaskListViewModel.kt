package com.altuscorp.altus.feature.tasks.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.di.DefaultDispatcher
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.domain.model.Task
import com.altuscorp.altus.domain.model.TaskBoard
import com.altuscorp.altus.data.repository.TaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Task List (S6). Reads [TaskRepository.board] cache-first (the list paints
 * instantly on a warm cache), reduces it against the local view inputs
 * (filter · search · completed-expanded) and a minute ticker (so a task
 * crossing into overdue re-evaluates its due phase — Signature 9). A swipe past
 * the anchor commits `allowedTransitions[0]` optimistically with the row's
 * `expectedUpdatedAt` lock token; a later server refusal comes back on
 * [TaskRepository.rejections] with the cache ALREADY reverted here — this VM
 * only narrates (banner + "uh-uh").
 */
@HiltViewModel
class TaskListViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
    @DefaultDispatcher private val defaultDispatcher: CoroutineDispatcher,
) : ViewModel() {

    /** Local view inputs — the only things the user changes without a network trip. */
    private data class Inputs(
        val filter: TaskFilter,
        val query: String,
        val searchActive: Boolean,
        val completedExpanded: Boolean,
    )

    private val inputs = MutableStateFlow(
        Inputs(filter = TaskFilter.All, query = "", searchActive = false, completedExpanded = false),
    )

    /** Transient banner (refresh error / revert copy); folded into the reduced state. */
    private val banner = MutableStateFlow<String?>(null)

    /** True while a user-initiated pull-to-refresh is in flight. */
    private val isRefreshing = MutableStateFlow(false)

    /** Re-emits every minute so due phases (and overdue gravity) stay honest. */
    private val minuteTicker: Flow<Long> = flow {
        while (true) {
            emit(System.currentTimeMillis())
            delay(TICK_INTERVAL_MS)
        }
    }

    private val _effects = Channel<TaskListEffect>(Channel.BUFFERED)
    val effects: Flow<TaskListEffect> = _effects.receiveAsFlow()

    val state: StateFlow<TaskListUiState> =
        combine(taskRepository.board(), inputs, banner, isRefreshing, minuteTicker) { board, inp, bannerMsg, refreshing, _ ->
            reduce(board, inp, bannerMsg, refreshing)
        }
            .flowOn(defaultDispatcher)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = TaskListUiState.initial(inputs.value.filter),
            )

    init {
        observeRejections()
        refresh()
    }

    /** Seed the chip pre-selection from the deep-link filter (Today pressure cards). */
    fun applyInitialFilter(filter: String?) {
        val resolved = TaskFilter.fromRoute(filter)
        inputs.update { current ->
            if (current.filter == resolved) current else current.copy(filter = resolved)
        }
    }

    fun onIntent(intent: TaskListIntent) {
        when (intent) {
            is TaskListIntent.QueryChanged ->
                inputs.update { it.copy(query = intent.query) }

            TaskListIntent.SearchToggled ->
                inputs.update { it.copy(searchActive = !it.searchActive, query = if (it.searchActive) "" else it.query) }

            is TaskListIntent.FilterSelected ->
                inputs.update { it.copy(filter = intent.filter) }

            TaskListIntent.CompletedToggled ->
                inputs.update { it.copy(completedExpanded = !it.completedExpanded) }

            TaskListIntent.Refresh -> refresh()

            TaskListIntent.DismissBanner -> banner.value = null

            is TaskListIntent.Advance -> advance(intent.taskId)
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            isRefreshing.value = true
            try {
                when (val result = taskRepository.refreshBoard()) {
                    is ApiResult.Success -> Unit // the cache flow delivers it

                    is ApiResult.ReAuth ->
                        setColdBanner("Your session ended — sign in again to see your tasks.")

                    is ApiResult.Enrollment ->
                        setColdBanner("Your account can't load tasks right now.")

                    is ApiResult.Gate ->
                        setColdBanner(result.gate.message)

                    is ApiResult.Failure -> setColdBanner(
                        if (result.isNetwork) {
                            "You're offline — showing the last synced tasks."
                        } else {
                            result.message ?: "Couldn't refresh the list."
                        },
                    )
                }
            } finally {
                isRefreshing.value = false
            }
        }
    }

    /** A refresh failure only earns a banner on a cold list; a warm one stays quiet. */
    private fun setColdBanner(message: String) {
        if (!state.value.hasAnyTasks) banner.value = message
    }

    /**
     * Swipe-to-advance: look the row up in the current reduction (it carries the
     * legal transition + the lock token), commit optimistically, and let the
     * board flow morph the pill in place. Fire-and-forget — the outbox owns the
     * replay; a refusal returns on [observeRejections].
     */
    private fun advance(taskId: String) {
        val row = state.value.pending.firstOrNull { it.id == taskId } ?: return
        val target = row.advanceToStatus ?: return
        viewModelScope.launch {
            taskRepository.changeStatus(
                taskId = taskId,
                newStatus = target,
                expectedUpdatedAt = row.task.updatedAt,
                note = null,
            )
            _effects.send(TaskListEffect.Committed)
        }
    }

    private fun observeRejections() {
        viewModelScope.launch {
            taskRepository.rejections.collect { rejection ->
                banner.value = when {
                    rejection.isStaleConflict -> "Task changed elsewhere — refreshed."
                    rejection.message.isNotBlank() -> rejection.message
                    else -> "Couldn't update the task — try again."
                }
                _effects.send(TaskListEffect.Rejected(isStale = rejection.isStaleConflict))
                launch {
                    delay(BANNER_LINGER_MS)
                    banner.compareAndClear(rejection)
                }
            }
        }
    }

    // ─── Reduction ────────────────────────────────────────────────────────────

    private fun reduce(
        board: TaskBoard?,
        inp: Inputs,
        bannerMsg: String?,
        refreshing: Boolean,
    ): TaskListUiState {
        if (board == null) {
            return TaskListUiState.initial(inp.filter).copy(
                query = inp.query,
                searchActive = inp.searchActive,
                completedExpanded = inp.completedExpanded,
                bannerMessage = bannerMsg,
                isRefreshing = refreshing,
            )
        }

        val now = Instant.now()
        val q = inp.query.trim()

        val active = board.tasks.filter { it.completedAt == null }
        val done = board.tasks.filter { it.completedAt != null }

        val pendingRows = active
            .asSequence()
            .filter { it.matches(q) }
            .sortedBy { it.dueAt }
            .map { it.toRow(board, now) }
            .toList()
            .toImmutableList()

        val completedRows = done
            .asSequence()
            .filter { it.matches(q) }
            .sortedByDescending { it.completedAt ?: it.updatedAt }
            .map { it.toRow(board, now) }
            .toList()
            .toImmutableList()

        val counts = FilterCounts(
            all = board.tasks.size,
            pending = active.size,
            overdue = active.count { EffectiveDue.isOverdue(it.dueAt, now) },
            done = done.size,
        )

        return TaskListUiState(
            loading = false,
            filter = inp.filter,
            query = inp.query,
            searchActive = inp.searchActive,
            counts = counts,
            pending = pendingRows,
            completed = completedRows,
            completedExpanded = inp.completedExpanded,
            bannerMessage = bannerMsg,
            hasAnyTasks = board.tasks.isNotEmpty(),
            isRefreshing = refreshing,
        )
    }

    private fun Task.matches(query: String): Boolean {
        if (query.isEmpty()) return true
        val needle = query.lowercase()
        if (needle.startsWith("#")) {
            return taskNo?.toString()?.contains(needle.removePrefix("#")) == true
        }
        return title.contains(needle, ignoreCase = true) ||
            client?.contains(needle, ignoreCase = true) == true ||
            subject?.contains(needle, ignoreCase = true) == true ||
            taskNo?.toString()?.contains(needle) == true
    }

    private fun Task.toRow(board: TaskBoard, now: Instant): TaskRow {
        val phase = EffectiveDue.duePhase(dueAt, now)
        val advanceTo = allowedTransitions.firstOrNull()
        return TaskRow(
            task = this,
            display = board.displayFor(status),
            duePhase = phase,
            duePhrase = EffectiveDue.duePhrase(dueAt, now),
            isOverdue = phase == EffectiveDue.DuePhase.OVERDUE,
            advanceToStatus = advanceTo,
            advanceLabel = advanceTo?.let { board.displayFor(it).label },
        )
    }

    /** Clear the banner only if nothing newer replaced this rejection's copy. */
    private fun MutableStateFlow<String?>.compareAndClear(rejection: com.altuscorp.altus.data.sync.MutationRejection) {
        val expected = when {
            rejection.isStaleConflict -> "Task changed elsewhere — refreshed."
            rejection.message.isNotBlank() -> rejection.message
            else -> "Couldn't update the task — try again."
        }
        if (value == expected) value = null
    }

    private companion object {
        const val TICK_INTERVAL_MS = 60_000L
        const val STOP_TIMEOUT_MS = 5_000L
        const val BANNER_LINGER_MS = 4_000L
    }
}
