package com.altuscorp.altus.feature.tasks.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.repository.TaskRepository
import com.altuscorp.altus.navigation.TaskDetailRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * S7 Task Detail reducer.
 *
 * Reads are cache-first ([TaskRepository.detail]) so the screen paints
 * instantly behind the shared-element morph; a reconcile fires on entry.
 * Status changes and comments are optimistic fire-and-forget through the
 * outbox — the ONLY thing this ViewModel does with a permanent server refusal
 * is narrate it ([TaskDetailEffect]); the repository has already reverted the
 * cache before the rejection reaches us (one writer, one narrator).
 */
@HiltViewModel
class TaskDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TaskRepository,
) : ViewModel() {

    private val taskId: String = savedStateHandle.toRoute<TaskDetailRoute>().id

    /** Screen-local flags folded into the UiState alongside the repo flows. */
    private data class Locals(
        val refreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val notFound: Boolean = false,
        val composerText: String = "",
        val statusSheetFor: String? = null,
    )

    private val locals = MutableStateFlow(Locals())

    private val _effects = MutableSharedFlow<TaskDetailEffect>(
        replay = 0,
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /** One-shot narration: conflict shake / rejection snackbar. */
    val effects: Flow<TaskDetailEffect> = _effects.asSharedFlow()

    val uiState: StateFlow<TaskDetailUiState> = combine(
        repository.detail(taskId),
        repository.pendingMutations(taskId),
        locals,
    ) { detail, pending, local ->
        TaskDetailUiState(
            detail = detail,
            isRefreshing = local.refreshing,
            // A warm cache outranks a failed reconcile — never block content.
            loadFailed = local.loadFailed && detail == null,
            notFound = local.notFound && detail == null,
            pendingMutations = pending,
            composerText = local.composerText,
            statusSheetFor = local.statusSheetFor,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = TaskDetailUiState(),
    )

    init {
        refresh()
        narrateRejections()
    }

    fun onIntent(intent: TaskDetailIntent) {
        when (intent) {
            TaskDetailIntent.Refresh -> refresh()
            is TaskDetailIntent.CommitStatus -> commitStatus(intent.status, intent.note)
            is TaskDetailIntent.OpenStatusSheet ->
                locals.update { it.copy(statusSheetFor = intent.status) }

            TaskDetailIntent.DismissStatusSheet ->
                locals.update { it.copy(statusSheetFor = null) }

            is TaskDetailIntent.ComposerChanged ->
                locals.update { it.copy(composerText = intent.text) }

            TaskDetailIntent.SendComment -> sendComment()
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            locals.update { it.copy(refreshing = true) }
            when (val result = repository.refreshDetail(taskId)) {
                is ApiResult.Success ->
                    locals.update { it.copy(refreshing = false, loadFailed = false, notFound = false) }

                is ApiResult.Failure -> {
                    val gone = result.httpCode == 403 || result.httpCode == 404
                    locals.update {
                        it.copy(refreshing = false, loadFailed = !gone, notFound = gone)
                    }
                }

                // 401 / enrollment / gates are handled by the app shell; the
                // cached snapshot (if any) stays readable in the meantime.
                is ApiResult.ReAuth,
                is ApiResult.Enrollment,
                is ApiResult.Gate,
                -> locals.update { it.copy(refreshing = false) }
            }
        }
    }

    private fun commitStatus(status: String, note: String?) {
        // The optimistic-lock token is the updatedAt we last saw. Without a
        // snapshot there is nothing to transition — the rail isn't even shown.
        val lockToken = uiState.value.detail?.updatedAt
        if (lockToken == null) {
            Timber.w("Status commit without a lock token for task %s — ignored", taskId)
            return
        }
        locals.update { it.copy(statusSheetFor = null) }
        viewModelScope.launch {
            repository.changeStatus(
                taskId = taskId,
                newStatus = status,
                expectedUpdatedAt = lockToken,
                note = note?.takeIf { it.isNotBlank() },
            )
        }
    }

    private fun sendComment() {
        val body = uiState.value.composerText.trim()
        if (body.isEmpty()) return
        locals.update { it.copy(composerText = "") }
        viewModelScope.launch { repository.addComment(taskId, body) }
    }

    /**
     * The narrator half of the ordering contract: the repository already
     * reverted the cache (silent re-fetch); we only surface haptic + copy —
     * and only for rejections that belong to THIS task.
     */
    private fun narrateRejections() {
        viewModelScope.launch {
            repository.rejections
                .filter { it.targetId == taskId }
                .collect { rejection ->
                    _effects.emit(
                        if (rejection.isStaleConflict) {
                            TaskDetailEffect.ConflictShake
                        } else {
                            TaskDetailEffect.MutationRejected(
                                rejection.message.ifBlank { "Couldn't save — try again." },
                            )
                        },
                    )
                }
        }
    }
}
