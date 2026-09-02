package com.altuscorp.altus.feature.dailychecklist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.DailyChecklistDto
import com.altuscorp.altus.data.remote.dto.DailyChecklistItemDto
import com.altuscorp.altus.data.repository.DailyChecklistRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.toImmutableList
import kotlinx.collections.immutable.toPersistentSet
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Daily Checklist (WMS page) — web parity with `app/(app)/daily-checklist/page.tsx`.
 * The board reads cache-first (instant paint on a warm cache); every mutation is
 * ONLINE-ONLY and returns the fresh FULL board (no hand-patched lists), so the
 * repository simply reconciles the cache and this ViewModel re-derives the UI
 * state from whatever the cache flow next emits.
 */
@HiltViewModel
class DailyChecklistViewModel @Inject constructor(
    private val repository: DailyChecklistRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DailyChecklistUiState())
    val state: StateFlow<DailyChecklistUiState> = _state.asStateFlow()

    private val _effects = Channel<DailyChecklistEffect>(Channel.BUFFERED)
    val effects: Flow<DailyChecklistEffect> = _effects.receiveAsFlow()

    init {
        observeBoard()
        refresh()
    }

    fun onIntent(intent: DailyChecklistIntent) {
        when (intent) {
            DailyChecklistIntent.Refresh, DailyChecklistIntent.Retry -> refresh()

            is DailyChecklistIntent.DraftTitleChanged ->
                _state.update { it.copy(draftTitle = intent.value) }

            DailyChecklistIntent.AddPersonal -> addPersonal()

            is DailyChecklistIntent.PullGoal ->
                mutate(BusyKeys.goal(intent.goalId)) { repository.pullGoal(intent.goalId) }

            is DailyChecklistIntent.ToggleAssigned ->
                mutate(BusyKeys.task(intent.taskId)) { repository.setTaskDone(intent.taskId, intent.done) }

            is DailyChecklistIntent.TogglePersonal ->
                mutate(BusyKeys.item(intent.itemId)) { repository.closeItem(intent.itemId, intent.done) }

            is DailyChecklistIntent.RemovePersonal -> removePersonal(intent.itemId)

            DailyChecklistIntent.CarryForward -> carryForward()

            is DailyChecklistIntent.OpenNote ->
                _state.update {
                    it.copy(noteDraft = NoteDraft(itemId = intent.itemId, done = intent.done, text = intent.currentNote))
                }

            DailyChecklistIntent.DismissNote -> _state.update { it.copy(noteDraft = null) }

            is DailyChecklistIntent.NoteChanged ->
                _state.update { current ->
                    val draft = current.noteDraft ?: return@update current
                    current.copy(noteDraft = draft.copy(text = intent.value))
                }

            DailyChecklistIntent.SaveNote -> saveNote()

            DailyChecklistIntent.MessageShown -> _state.update { it.copy(message = null) }
        }
    }

    /** Cache-first board; the first non-null emission resolves the skeleton. */
    private fun observeBoard() {
        viewModelScope.launch {
            repository.board().collect { dto ->
                _state.update { current ->
                    if (dto == null) {
                        current
                    } else {
                        dto.toUiState(current)
                    }
                }
            }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true) }
            when (val result = repository.refresh()) {
                is ApiResult.Success -> _state.update { it.copy(isLoading = false, isRefreshing = false, loadFailed = false) }
                else -> _state.update { current ->
                    current.copy(
                        isRefreshing = false,
                        isLoading = if (current.totalCount == 0 && current.pullable.isEmpty()) false else current.isLoading,
                        loadFailed = current.totalCount == 0 && current.pullable.isEmpty(),
                    )
                }
            }
        }
    }

    private fun addPersonal() {
        val title = _state.value.draftTitle.trim()
        if (title.isEmpty() || _state.value.addingPersonal) return
        _state.update { it.copy(addingPersonal = true) }
        viewModelScope.launch {
            when (val result = repository.addPersonalItem(title)) {
                is ApiResult.Success -> {
                    _state.update { it.copy(addingPersonal = false, draftTitle = "") }
                    _effects.send(DailyChecklistEffect.Committed)
                }
                else -> {
                    _state.update { it.copy(addingPersonal = false) }
                    reject(result)
                }
            }
        }
    }

    private fun removePersonal(itemId: String) {
        mutate(BusyKeys.item(itemId)) { repository.removeItem(itemId) }
    }

    private fun carryForward() {
        if (_state.value.carryingForward) return
        _state.update { it.copy(carryingForward = true) }
        viewModelScope.launch {
            when (val result = repository.carryForward()) {
                is ApiResult.Success -> {
                    _state.update { it.copy(carryingForward = false) }
                    _effects.send(DailyChecklistEffect.Committed)
                }
                else -> {
                    _state.update { it.copy(carryingForward = false) }
                    reject(result)
                }
            }
        }
    }

    private fun saveNote() {
        val draft = _state.value.noteDraft ?: return
        if (draft.submitting) return
        _state.update { it.copy(noteDraft = draft.copy(submitting = true)) }
        viewModelScope.launch {
            when (val result = repository.closeItem(draft.itemId, draft.done, draft.text.trim().ifEmpty { null })) {
                is ApiResult.Success -> {
                    _state.update { it.copy(noteDraft = null) }
                    _effects.send(DailyChecklistEffect.Committed)
                }
                else -> {
                    _state.update { current -> current.copy(noteDraft = current.noteDraft?.copy(submitting = false)) }
                    reject(result)
                }
            }
        }
    }

    /** Shared mutation shape: pending face on, commit, ack replaces the cache (board recomposes). */
    private fun mutate(key: String, call: suspend () -> ApiResult<DailyChecklistDto>) {
        if (key in _state.value.busyKeys) return
        _state.update { it.copy(busyKeys = it.busyKeys.toPersistentSet().add(key)) }
        viewModelScope.launch {
            val result = call()
            _state.update { it.copy(busyKeys = it.busyKeys.toPersistentSet().remove(key)) }
            when (result) {
                is ApiResult.Success -> _effects.send(DailyChecklistEffect.Committed)
                else -> reject(result)
            }
        }
    }

    private fun reject(result: ApiResult<*>) {
        _state.update { it.copy(message = messageFor(result)) }
        viewModelScope.launch { _effects.send(DailyChecklistEffect.Reject) }
    }
}

/** Stable pending-mutation keys shared by ViewModel and rows. */
internal object BusyKeys {
    fun task(taskId: String): String = "task-$taskId"
    fun goal(goalId: String): String = "goal-$goalId"
    fun item(itemId: String): String = "item-$itemId"
}

/** One copy table for every rejected commit, mirroring the app's voice. */
private fun messageFor(result: ApiResult<*>): String = when (result) {
    is ApiResult.ReAuth -> "Your session ended — sign in again."
    is ApiResult.Enrollment -> "Your account can't use the checklist right now."
    is ApiResult.Gate -> result.gate.message
    is ApiResult.Failure -> when {
        result.isNetwork -> "You're offline — the checklist needs a connection."
        result.isRateLimited -> "Too many requests — try again in a moment."
        else -> result.message ?: "Couldn't save — try again."
    }
    is ApiResult.Success -> "Couldn't save — try again."
}

// ─── DTO → UiState ──────────────────────────────────────────────────────────────

private val DUE_FMT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"))

private fun DailyChecklistDto.toUiState(current: DailyChecklistUiState): DailyChecklistUiState {
    val assignedRows = items.filter { it.source == "assigned" }.map { it.toRow() }
    val personalRows = items.filter { it.source != "assigned" }.map { it.toRow() }
    val doneCount = items.count { it.done }
    return current.copy(
        isLoading = false,
        loadFailed = false,
        weekday = weekday,
        date = date,
        minItems = minItems,
        assigned = assignedRows.toImmutableList(),
        personal = personalRows.toImmutableList(),
        pullable = pullable.map {
            PullableGoalRow(
                id = it.id,
                title = it.targetDone?.trim()?.ifEmpty { null } ?: it.subject?.trim()?.ifEmpty { null } ?: "Weekly goal",
                meta = listOfNotNull(it.targetDone?.let { t -> "Target $t" }, "Weight ${it.weight}")
                    .joinToString(" · ")
                    .ifBlank { null },
            )
        }.toImmutableList(),
        overdueCount = overdue.size,
        totalCount = items.size,
        doneCount = doneCount,
    )
}

private fun DailyChecklistItemDto.toRow(): ChecklistRow {
    val assignedRow = source == "assigned"
    val overdueNow = assignedRow && dueAt != null && runCatching { Instant.parse(dueAt).isBefore(Instant.now()) }.getOrDefault(false)
    val duePhrase = if (assignedRow && dueAt != null) {
        val label = runCatching { DUE_FMT.format(Instant.parse(dueAt)) }.getOrNull()
        label?.let { if (overdueNow) "Overdue · $it" else "Due $it" }
    } else {
        null
    }
    return ChecklistRow(
        id = id,
        assigned = assignedRow,
        title = title,
        meta = listOfNotNull(client?.trim()?.ifEmpty { null }, subject?.trim()?.ifEmpty { null })
            .joinToString(" · ")
            .ifBlank { null },
        goalRelated = origin == "goal_related",
        done = done,
        taskId = taskId,
        doneNote = doneNote.orEmpty(),
        duePhrase = duePhrase,
        overdue = overdueNow,
        carried = movedFromDate != null,
    )
}
