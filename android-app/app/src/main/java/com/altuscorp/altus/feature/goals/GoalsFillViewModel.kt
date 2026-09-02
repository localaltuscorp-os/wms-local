package com.altuscorp.altus.feature.goals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.repository.GoalFillDraft
import com.altuscorp.altus.data.repository.GoalsRepository
import com.altuscorp.altus.domain.model.UnfilledWeekGoal
import com.altuscorp.altus.domain.model.WeeklyGoalsFill
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * S8 — Weekly-goals fill, the surface that clears the Mon/Thu `needsGoals`
 * gate.
 *
 * Reads are cache-first ([GoalsRepository.fillSheet] paints instantly, null =
 * skeletons); drafts (%Done per 5% detent + explanation) live here so process
 * recreation of the composition never loses a slider position mid-fill; submit
 * is ONLINE-ONLY — a success clears the gate in every local mirror on the same
 * frame (repository contract) and this ViewModel emits [GoalsFillEvent.Submitted]
 * so the screen can commit-tick and pop back to whatever the gate blocked.
 */
@HiltViewModel
class GoalsFillViewModel @Inject constructor(
    private val goalsRepository: GoalsRepository,
) : ViewModel() {

    /** A per-goal draft; null fields fall back to the server's last-saved value. */
    private data class GoalDraft(
        val pctDone: Int? = null,
        val explanation: String? = null,
    )

    private data class LocalState(
        val drafts: Map<String, GoalDraft> = emptyMap(),
        val isSubmitting: Boolean = false,
        val isRefreshing: Boolean = false,
        /** A rejected submit turns on per-row explanation validation. */
        val attemptedSubmit: Boolean = false,
        val submitError: String? = null,
        /** Refresh failure copy — only surfaced while the cache is still cold. */
        val refreshError: String? = null,
        /** Guards the empty state from flashing between submit-success and pop. */
        val hasSubmitted: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    private val _events = Channel<GoalsFillEvent>(Channel.BUFFERED)
    val events: Flow<GoalsFillEvent> = _events.receiveAsFlow()

    val uiState: StateFlow<GoalsFillUiState> =
        combine(goalsRepository.fillSheet(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = GoalsFillUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: GoalsFillIntent) {
        when (intent) {
            GoalsFillIntent.Refresh -> refresh()
            is GoalsFillIntent.ChangePct -> changePct(intent.goalId, intent.pctDone)
            is GoalsFillIntent.ChangeExplanation ->
                changeExplanation(intent.goalId, intent.text)
            GoalsFillIntent.Submit -> submit()
            GoalsFillIntent.DismissSubmitError ->
                local.update { it.copy(submitError = null) }
        }
    }

    // ─── Intents ─────────────────────────────────────────────────────────────

    private fun refresh() {
        viewModelScope.launch {
            local.update { it.copy(isRefreshing = true, refreshError = null) }
            val result = goalsRepository.refresh()
            local.update { it.copy(isRefreshing = false, refreshError = messageFor(result)) }
        }
    }

    private fun changePct(goalId: String, pctDone: Int) {
        local.update { state ->
            val draft = state.drafts[goalId] ?: GoalDraft()
            state.copy(
                drafts = state.drafts +
                    (goalId to draft.copy(pctDone = pctDone.coerceIn(0, 100))),
            )
        }
    }

    private fun changeExplanation(goalId: String, text: String) {
        local.update { state ->
            val draft = state.drafts[goalId] ?: GoalDraft()
            state.copy(drafts = state.drafts + (goalId to draft.copy(explanation = text)))
        }
    }

    private fun submit() {
        val state = uiState.value
        if (state.isSubmitting || state.isLoading || state.goals.isEmpty()) return

        // Validation gate: every goal under 100% needs an explanation.
        if (state.readyCount < state.totalCount) {
            local.update { it.copy(attemptedSubmit = true, submitError = null) }
            _events.trySend(GoalsFillEvent.SubmitRejected)
            return
        }

        viewModelScope.launch {
            local.update { it.copy(isSubmitting = true, submitError = null) }
            val fills = state.goals.map { row ->
                GoalFillDraft(
                    goalId = row.id,
                    pctDone = row.pctDone,
                    explanation = row.explanation.trim().takeIf { text -> text.isNotEmpty() },
                )
            }
            when (val result = goalsRepository.submit(fills)) {
                is ApiResult.Success -> {
                    local.update { it.copy(isSubmitting = false, hasSubmitted = true) }
                    _events.send(GoalsFillEvent.Submitted)
                }
                else -> {
                    local.update {
                        it.copy(isSubmitting = false, submitError = messageFor(result))
                    }
                    _events.send(GoalsFillEvent.SubmitRejected)
                }
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(sheet: WeeklyGoalsFill?, local: LocalState): GoalsFillUiState {
        if (sheet == null) {
            // Cold cache: skeletons while a refresh runs; retryable error after.
            return if (local.refreshError != null && !local.isRefreshing) {
                GoalsFillUiState(isLoading = false, loadErrorMessage = local.refreshError)
            } else {
                GoalsFillUiState(isLoading = true)
            }
        }

        val rows = sheet.goals
            .sortedBy { it.position }
            .map { goal -> rowFor(goal, local) }
            .toImmutableList()

        return GoalsFillUiState(
            isLoading = false,
            loadErrorMessage = null,
            weekLabel = sheet.weekStart?.let { "Week of ${DAY_MONTH.format(it)}" },
            goals = rows,
            readyCount = rows.count { it.isReady },
            totalCount = rows.size,
            isSubmitting = local.isSubmitting,
            submitError = local.submitError,
            showEmpty = rows.isEmpty() && !local.hasSubmitted && !local.isSubmitting,
        )
    }

    private fun rowFor(goal: UnfilledWeekGoal, local: LocalState): GoalFillRowUi {
        val draft = local.drafts[goal.id]
        val pct = (draft?.pctDone ?: goal.pctDone ?: 0).coerceIn(0, 100)
        val explanation = draft?.explanation ?: goal.explanation ?: ""
        val required = pct < 100
        val ready = !required || explanation.isNotBlank()

        val title = goal.subject?.takeIf { it.isNotBlank() }
            ?: goal.client?.takeIf { it.isNotBlank() }
            ?: "Goal ${goal.position}"

        return GoalFillRowUi(
            id = goal.id,
            position = goal.position,
            eyebrow = buildString {
                append("Goal ${goal.position}")
                goal.priority?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
            },
            title = title,
            target = goal.targetDone?.takeIf { it.isNotBlank() },
            meta = goal.client?.takeIf { it.isNotBlank() && it != title },
            dueLabel = goal.targetDate?.let { "by ${DAY_MONTH.format(it)}" },
            pctDone = pct,
            explanation = explanation,
            explanationRequired = required,
            explanationError = if (local.attemptedSubmit && required && explanation.isBlank()) {
                EXPLANATION_ERROR
            } else {
                null
            },
            isReady = ready,
        )
    }

    /** Human copy for every non-success result; null for a success. */
    private fun messageFor(result: ApiResult<*>): String? = when (result) {
        is ApiResult.Success -> null
        is ApiResult.ReAuth -> "Your session has ended — sign in again to continue."
        is ApiResult.Enrollment ->
            "Your account can't access weekly goals — contact your admin."
        is ApiResult.Gate -> result.gate.message
        is ApiResult.Failure -> when {
            result.isNetwork -> "You're offline — submitting weekly goals needs a connection."
            result.isRateLimited -> "Too many attempts — give it a moment, then retry."
            else -> result.message ?: "Something went wrong — try again."
        }
    }

    private companion object {
        val DAY_MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
        const val EXPLANATION_ERROR = "Add a short explanation for anything under 100%."
    }
}
