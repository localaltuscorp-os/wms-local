package com.altuscorp.altus.feature.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.repository.PlanMeter
import com.altuscorp.altus.data.repository.PlanRepository
import com.altuscorp.altus.domain.model.PlanItem
import com.altuscorp.altus.domain.model.PlannerGoal
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
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
 * Plan Your Day (S4) — the surface that clears the clock-in `needsPlan` gate.
 *
 * The plan reads cache-first (the pinned "2/5" paints instantly on a warm
 * cache); every commit is ONLINE-ONLY (the gate that consumes this state is
 * itself online, so an offline outbox replay would clear the gate minutes too
 * late — see critique P1-2). Each add is optimistic at the fingertip (the chip
 * fires one commit tick and shows its pending face) while the repository patches
 * the meter from the server's ack and reconciles the full board in the
 * background. When the meter is satisfied the screen pops back to the blocked
 * clock-in surface.
 */
@HiltViewModel
class PlanViewModel @Inject constructor(
    private val planRepository: PlanRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(PlanUiState())
    val state: StateFlow<PlanUiState> = _state.asStateFlow()

    private val _effects = Channel<PlanEffect>(Channel.BUFFERED)
    val effects: Flow<PlanEffect> = _effects.receiveAsFlow()

    init {
        observePlan()
        refresh()
    }

    fun onIntent(intent: PlanIntent) {
        when (intent) {
            PlanIntent.Refresh -> refresh()

            is PlanIntent.DraftTitleChanged ->
                _state.update { it.copy(draftTitle = intent.value) }

            PlanIntent.AddPersonal -> addPersonal()

            is PlanIntent.PullTask ->
                mutate(PlanPendingKeys.task(intent.taskId)) { planRepository.pullTask(intent.taskId) }

            is PlanIntent.PullGoal ->
                mutate(PlanPendingKeys.goal(intent.goalId)) { planRepository.pullGoal(intent.goalId) }

            is PlanIntent.AddOverdue -> addOverdue(intent.item)

            is PlanIntent.OpenActuals -> openActuals(intent.goal)
            PlanIntent.DismissActuals -> _state.update { it.copy(actuals = null) }

            is PlanIntent.ActualPctChanged ->
                _state.update { current ->
                    val draft = current.actuals ?: return@update current
                    current.copy(actuals = draft.copy(pct = snapToDetent(intent.pct)))
                }

            is PlanIntent.ActualNoteChanged ->
                _state.update { current ->
                    val draft = current.actuals ?: return@update current
                    current.copy(actuals = draft.copy(note = intent.note))
                }

            PlanIntent.SubmitActual -> submitActual()

            PlanIntent.MessageShown -> _state.update { it.copy(message = null) }
        }
    }

    /** Cache-first plan; the first non-null emission resolves the skeleton. */
    private fun observePlan() {
        viewModelScope.launch {
            planRepository.plan().collect { plan ->
                _state.update { current ->
                    current.copy(
                        plan = plan,
                        isLoading = if (plan != null) false else current.isLoading,
                        loadFailed = if (plan != null) false else current.loadFailed,
                    )
                }
            }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loadFailed = false) }
            when (val result = planRepository.refresh()) {
                is ApiResult.Success -> Unit // the cache flow repaints the board

                else -> {
                    // A refresh miss only surfaces on a cold cache; a warm plan
                    // stays on screen (a stale plan still lets you commit more).
                    _state.update { current ->
                        if (current.plan == null) {
                            current.copy(isLoading = false, loadFailed = true)
                        } else {
                            current
                        }
                    }
                    if (_state.value.plan != null) {
                        surface(messageFor(result))
                    }
                }
            }
        }
    }

    // ─── Commits (online-only, optimistic at the fingertip) ────────────────────

    private fun addPersonal() {
        val title = _state.value.draftTitle.trim()
        if (title.isEmpty() || _state.value.addingPersonal) return

        _state.update { it.copy(addingPersonal = true) }
        viewModelScope.launch {
            when (val result = planRepository.addPersonalItem(title)) {
                is ApiResult.Success -> {
                    _state.update { it.copy(addingPersonal = false, draftTitle = "") }
                    onMeterCommitted(result.data)
                }

                else -> {
                    _state.update { it.copy(addingPersonal = false) }
                    reject(result)
                }
            }
        }
    }

    /** Overdue item re-commit: goal-linked → pull the goal; else re-plan by title. */
    private fun addOverdue(item: PlanItem) {
        val key = PlanPendingKeys.overdue(item.id)
        val goalId = item.goalId
        if (goalId != null) {
            mutate(key) { planRepository.pullGoal(goalId) }
        } else {
            mutate(key) { planRepository.addPersonalItem(item.title) }
        }
    }

    /** Shared add/pull shape: pending face on, commit, then reconcile the meter. */
    private fun mutate(key: String, call: suspend () -> ApiResult<PlanMeter>) {
        if (key in _state.value.pendingKeys) return
        _state.update { it.copy(pendingKeys = it.pendingKeys.toPersistentSet().add(key)) }
        viewModelScope.launch {
            val result = call()
            _state.update { it.copy(pendingKeys = it.pendingKeys.toPersistentSet().remove(key)) }
            when (result) {
                is ApiResult.Success -> onMeterCommitted(result.data)
                else -> reject(result)
            }
        }
    }

    private fun openActuals(goal: PlannerGoal) {
        _state.update {
            it.copy(
                actuals = ActualsDraft(
                    goal = goal,
                    pct = snapToDetent(goal.pctDone),
                    note = goal.todayNote.orEmpty(),
                ),
            )
        }
    }

    private fun submitActual() {
        val draft = _state.value.actuals
        if (draft == null || draft.submitting) return

        _state.update { it.copy(actuals = draft.copy(submitting = true)) }
        viewModelScope.launch {
            val result = planRepository.logGoalActual(
                goalId = draft.goal.id,
                pctDone = draft.pct,
                note = draft.note.trim().ifEmpty { null },
            )
            when (result) {
                is ApiResult.Success -> {
                    _state.update { it.copy(actuals = null) }
                    _effects.send(PlanEffect.ActualsSaved)
                    if (result.data.clearsGate) _effects.send(PlanEffect.PopBack)
                }

                else -> {
                    _state.update { current ->
                        current.copy(actuals = current.actuals?.copy(submitting = false))
                    }
                    reject(result)
                }
            }
        }
    }

    /** A successful add: if it crossed the gate, pop back to clock-in. */
    private fun onMeterCommitted(meter: PlanMeter) {
        if (meter.clearsGate) {
            viewModelScope.launch { _effects.send(PlanEffect.PopBack) }
        }
    }

    private fun reject(result: ApiResult<*>) {
        surface(messageFor(result))
        viewModelScope.launch { _effects.send(PlanEffect.Reject) }
    }

    private fun surface(message: String) {
        _state.update { it.copy(message = message) }
    }
}

/** The clock-in gate wants both the count (MIN 5) AND actuals on live goals. */
private val PlanMeter.clearsGate: Boolean
    get() = satisfied && !needsGoalActuals

/** 5% detents — the slider snaps, `CLOCK_TICK` fires per crossing (S4). */
private fun snapToDetent(pct: Int): Int =
    (((pct + 2) / 5) * 5).coerceIn(0, 100)

/** One copy table for every rejected commit, mirroring the app's voice. */
private fun messageFor(result: ApiResult<*>): String = when (result) {
    is ApiResult.ReAuth -> "Your session ended — sign in again to keep planning."
    is ApiResult.Enrollment -> "Your account can't plan the day right now."
    is ApiResult.Gate -> result.gate.message
    is ApiResult.Failure -> when {
        result.isNetwork -> "You're offline — planning needs a connection."
        result.isRateLimited -> "Too many requests — try again in a moment."
        else -> result.message ?: "Couldn't save — try again."
    }

    is ApiResult.Success -> "Couldn't save — try again."
}
