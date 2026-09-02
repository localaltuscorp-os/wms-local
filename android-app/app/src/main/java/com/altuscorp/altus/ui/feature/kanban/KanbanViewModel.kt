package com.altuscorp.altus.feature.kanban

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.di.DefaultDispatcher
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.data.repository.KanbanRepository
import com.altuscorp.altus.domain.model.KanbanBoard
import com.altuscorp.altus.domain.model.KanbanTask
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * WMS Kanban (S6 companion). Reads [KanbanRepository.board] cache-first (the
 * board paints instantly on a warm cache), reduces it into the server-resolved
 * columns + resolved cards, and re-evaluates every minute so a card crossing
 * into overdue re-phrases in place. Read-only: refresh + retry are the only
 * intents; the board never mutates a card.
 */
@HiltViewModel
class KanbanViewModel @Inject constructor(
    private val repository: KanbanRepository,
    @DefaultDispatcher private val defaultDispatcher: CoroutineDispatcher,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    /** Re-emits every minute so due phrases (and overdue gravity) stay honest. */
    private val minuteTicker: Flow<Long> = flow {
        while (true) {
            emit(System.currentTimeMillis())
            delay(TICK_INTERVAL_MS)
        }
    }

    val uiState: StateFlow<KanbanUiState> = combine(
        repository.board(),
        refreshing,
        loadFailed,
        refreshFailed,
        minuteTicker,
    ) { board, isRefreshing, coldFailed, warmFailed, _ ->
        if (board == null) {
            KanbanUiState(
                isLoading = !coldFailed,
                isRefreshing = isRefreshing,
                loadFailed = coldFailed,
            )
        } else {
            reduce(board, isRefreshing = isRefreshing, refreshFailed = warmFailed)
        }
    }
        .flowOn(defaultDispatcher)
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            initialValue = KanbanUiState(),
        )

    init {
        refresh()
    }

    fun onIntent(intent: KanbanIntent) {
        when (intent) {
            KanbanIntent.Refresh,
            KanbanIntent.Retry,
            -> refresh()
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success -> Unit // cache emission repaints the board
                else -> {
                    loadFailed.value = true
                    refreshFailed.value = true
                }
            }
            refreshing.value = false
        }
    }

    // ─── Reduction ────────────────────────────────────────────────────────────

    private fun reduce(
        board: KanbanBoard,
        isRefreshing: Boolean,
        refreshFailed: Boolean,
    ): KanbanUiState {
        val now = Instant.now()

        // Group tasks the way the web board does: archived cards live ONLY in
        // the Archived column (dropped from their status column); every other
        // column takes its non-archived, status-matched cards.
        val columns = board.columns.map { columnId ->
            val cards = board.tasks
                .asSequence()
                .filter { task ->
                    if (columnId == board.archiveColumnId) task.archived
                    else !task.archived && task.status == columnId
                }
                .sortedBy { it.dueAt } // soonest-effective-due first; overdue floats up
                .map { it.toCard(now) }
                .toList()
                .toImmutableList()
            KanbanColumn(
                id = columnId,
                display = board.displayForColumn(columnId),
                cards = cards,
            )
        }.toImmutableList()

        return KanbanUiState(
            isLoading = false,
            isRefreshing = isRefreshing,
            loadFailed = false,
            refreshFailed = refreshFailed,
            columns = columns,
            totalCards = columns.sumOf { it.count },
        )
    }

    private fun KanbanTask.toCard(now: Instant): KanbanCard {
        val phase = EffectiveDue.duePhase(dueAt, now)
        val meta = listOfNotNull(client, subject).joinToString("  ·  ")
        return KanbanCard(
            id = id,
            numberLabel = taskNo?.let { "#$it" } ?: "—",
            title = title,
            meta = meta,
            priority = priority,
            // Completed cards don't nag with a due phrase; the column already
            // reads as terminal.
            duePhrase = if (completedAt != null) "" else EffectiveDue.duePhrase(dueAt, now),
            duePhase = phase,
            isOverdue = completedAt == null && phase == EffectiveDue.DuePhase.OVERDUE,
        )
    }

    private companion object {
        const val TICK_INTERVAL_MS = 60_000L
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
