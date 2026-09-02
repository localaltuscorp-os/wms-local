package com.altuscorp.altus.feature.tasks.newtask

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.repository.NewTaskDraft
import com.altuscorp.altus.data.repository.TaskRepository
import com.altuscorp.altus.domain.model.PriorityOption
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalTime
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * New Task (S6): loads the /task-form pick-lists cache-first (the form opens
 * instantly on a warm cache), validates the draft, and POSTs it ONLINE-ONLY
 * via [TaskRepository.createTask] — success hands the fresh task id to the
 * NavHost, which swaps this screen for the detail.
 */
@HiltViewModel
class NewTaskViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NewTaskUiState())
    val state: StateFlow<NewTaskUiState> = _state.asStateFlow()

    private val _effects = Channel<NewTaskEffect>(Channel.BUFFERED)
    val effects: Flow<NewTaskEffect> = _effects.receiveAsFlow()

    init {
        observeOptions()
        refreshOptions()
    }

    fun onIntent(intent: NewTaskIntent) {
        when (intent) {
            is NewTaskIntent.TitleChanged ->
                _state.update { it.copy(title = intent.value, titleError = null, submitError = null) }

            is NewTaskIntent.DescriptionChanged ->
                _state.update { it.copy(description = intent.value, submitError = null) }

            is NewTaskIntent.DoerPicked ->
                _state.update { it.copy(doer = intent.employee, doerError = null, submitError = null) }

            is NewTaskIntent.InitiatorPicked ->
                _state.update { it.copy(initiator = intent.employee, submitError = null) }

            is NewTaskIntent.PriorityPicked ->
                _state.update { it.copy(priority = intent.priority, priorityError = null, submitError = null) }

            is NewTaskIntent.DuePicked ->
                _state.update { it.copy(dueDate = intent.date, dueError = null, submitError = null) }

            is NewTaskIntent.SubjectPicked ->
                _state.update { it.copy(subject = intent.subject, submitError = null) }

            is NewTaskIntent.SheetRequested ->
                _state.update { current ->
                    // No new decisions mid-commit; closing is always allowed.
                    if (current.submitting && intent.sheet != null) current
                    else current.copy(activeSheet = intent.sheet)
                }

            NewTaskIntent.RetryOptions -> refreshOptions()

            NewTaskIntent.Submit -> submit()
        }
    }

    /** Cache-first pick-lists; the first emission also seeds the defaults. */
    private fun observeOptions() {
        viewModelScope.launch {
            taskRepository.formOptions()
                .filterNotNull()
                .collect { options ->
                    _state.update { current ->
                        current.copy(
                            options = options,
                            optionsError = null,
                            initiator = current.initiator ?: options.me,
                            priority = current.priority ?: options.priorities.defaultPriority(),
                        )
                    }
                }
        }
    }

    private fun refreshOptions() {
        viewModelScope.launch {
            _state.update { it.copy(optionsError = null) }
            when (val result = taskRepository.refreshFormOptions()) {
                is ApiResult.Success -> Unit // the cache flow delivers it

                is ApiResult.ReAuth ->
                    setColdOptionsError("Your session ended — sign in again to continue.")

                is ApiResult.Enrollment ->
                    setColdOptionsError("Your account can't create tasks right now.")

                is ApiResult.Gate ->
                    setColdOptionsError(result.gate.message)

                is ApiResult.Failure -> setColdOptionsError(
                    if (result.isNetwork) {
                        "You're offline — the form needs a connection to load."
                    } else {
                        result.message ?: "Couldn't load the form."
                    },
                )
            }
        }
    }

    /** A refresh failure only matters on a cold cache; a warm form stays quiet. */
    private fun setColdOptionsError(message: String) {
        _state.update { current ->
            if (current.options == null) current.copy(optionsError = message) else current
        }
    }

    private fun submit() {
        val snapshot = _state.value
        if (snapshot.submitting) return

        val title = snapshot.title.trim()
        val doer = snapshot.doer
        val priority = snapshot.priority
        val dueDate = snapshot.dueDate

        val titleError = if (title.isEmpty()) "Give the task a title." else null
        val doerError = if (doer == null) "Pick who will do this." else null
        val priorityError = if (priority == null) "Pick a priority." else null
        val dueError = if (dueDate == null) "Pick a due date." else null

        if (titleError != null || doerError != null || priorityError != null || dueError != null) {
            _state.update {
                it.copy(
                    titleError = titleError,
                    doerError = doerError,
                    priorityError = priorityError,
                    dueError = dueError,
                )
            }
            _effects.trySend(NewTaskEffect.ValidationFailed)
            return
        }
        // Smart-cast safety: locals are non-null past the guard above.
        checkNotNull(doer)
        checkNotNull(priority)
        checkNotNull(dueDate)

        _state.update { it.copy(submitting = true, submitError = null, activeSheet = null) }
        viewModelScope.launch {
            val draft = NewTaskDraft(
                title = title,
                doerId = doer.id,
                initiatorId = snapshot.initiator?.id,
                priority = priority.value,
                // Due = end of the chosen day in the device zone.
                dueAt = dueDate.atTime(LocalTime.of(23, 59))
                    .atZone(ZoneId.systemDefault())
                    .toInstant(),
                subject = snapshot.subject?.takeIf { it.isNotBlank() },
                description = snapshot.description.trim().ifEmpty { null },
            )

            when (val result = taskRepository.createTask(draft)) {
                is ApiResult.Success -> {
                    // Keep `submitting` — the spinner holds until the NavHost
                    // swaps this screen for the fresh task's detail.
                    _effects.send(NewTaskEffect.Created(result.data))
                }

                is ApiResult.ReAuth ->
                    fail("Your session ended — sign in again. Your draft stays on this screen.")

                is ApiResult.Enrollment ->
                    fail("Your account can't create tasks right now.")

                is ApiResult.Gate -> fail(result.gate.message)

                is ApiResult.Failure -> fail(
                    when {
                        result.isNetwork -> "You're offline — creating a task needs a connection."
                        result.isRateLimited -> "Too many requests — try again in a moment."
                        else -> result.message ?: "Couldn't create the task — try again."
                    },
                )
            }
        }
    }

    private fun fail(message: String) {
        _state.update { it.copy(submitting = false, submitError = message) }
        _effects.trySend(NewTaskEffect.SubmitFailed)
    }
}

/** Sensible pre-selection so the fast path is title → doer → due → Create. */
private fun ImmutableList<PriorityOption>.defaultPriority(): PriorityOption? =
    firstOrNull { it.value.equals("normal", ignoreCase = true) }
        ?: firstOrNull { it.value.equals("medium", ignoreCase = true) }
        ?: firstOrNull()
