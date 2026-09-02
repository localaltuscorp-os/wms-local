package com.altuscorp.altus.feature.weeklygoals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.remote.dto.WeeklyGoalDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsBoardDto
import com.altuscorp.altus.data.repository.WeeklyGoalsBoardRepository
import com.altuscorp.altus.domain.model.StatusDisplay
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Weekly Goals BOARD brain (WMS). Reads are cache-first —
 * [WeeklyGoalsBoardRepository.board] paints the last-decoded week instantly
 * (null → skeletons) while [refresh] reconciles against the server. The board is
 * read-only (a mirror of the web `/weekly-goals` page), so there are no commits;
 * the pager re-subscribes the board flow to the neighbouring Monday, cache-first
 * again. Every field the composable reads is pre-formatted here.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class WeeklyGoalsViewModel @Inject constructor(
    private val repository: WeeklyGoalsBoardRepository,
) : ViewModel() {

    private data class LocalState(
        /** null = the current week (a stable cold-start key); else a Monday key. */
        val selectedWeek: String? = null,
        val isRefreshing: Boolean = false,
        val loadError: String? = null,
    )

    private val local = MutableStateFlow(LocalState())

    /** Board flow re-subscribed whenever the selected week changes. */
    private val board =
        local
            .map { it.selectedWeek }
            .distinctUntilChanged()
            .flatMapLatest { repository.board(it) }

    val uiState: StateFlow<WeeklyGoalsUiState> =
        combine(board, local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = WeeklyGoalsUiState(),
            )

    init {
        refresh(null)
    }

    fun onIntent(intent: WeeklyGoalsIntent) {
        when (intent) {
            WeeklyGoalsIntent.Refresh -> refresh(local.value.selectedWeek)
            WeeklyGoalsIntent.PrevWeek -> selectWeek(uiState.value.prevWeek)
            WeeklyGoalsIntent.NextWeek -> selectWeek(uiState.value.nextWeek)
            WeeklyGoalsIntent.ThisWeek -> selectWeek(null)
            WeeklyGoalsIntent.DismissLoadError -> local.update { it.copy(loadError = null) }
        }
    }

    private fun selectWeek(weekKey: String?) {
        if (weekKey == local.value.selectedWeek) return
        local.update { it.copy(selectedWeek = weekKey, loadError = null) }
        refresh(weekKey)
    }

    private fun refresh(weekKey: String?) {
        viewModelScope.launch {
            local.update { it.copy(isRefreshing = true) }
            val result = repository.refresh(weekKey)
            local.update { it.copy(isRefreshing = false, loadError = messageFor(result)) }
        }
    }

    // ─── Reducer ────────────────────────────────────────────────────────────

    private fun reduce(board: WeeklyGoalsBoardDto?, local: LocalState): WeeklyGoalsUiState {
        if (board == null) {
            return if (local.loadError != null && !local.isRefreshing) {
                WeeklyGoalsUiState(isLoading = false, loadError = local.loadError, isRefreshing = false)
            } else {
                WeeklyGoalsUiState(isLoading = true, isRefreshing = local.isRefreshing)
            }
        }

        val budget = if (board.weightBudget > 0) board.weightBudget else 100
        val goals = board.goals.map { it.toUi(board.statusDisplay) }.toImmutableList()

        return WeeklyGoalsUiState(
            isLoading = false,
            loadError = null,
            isRefreshing = local.isRefreshing,
            ownerName = board.ownerName,
            weekLabel = board.weekLabel,
            isCurrentWeek = board.isCurrentWeek,
            prevWeek = board.prevWeek.takeIf { it.isNotBlank() },
            nextWeek = board.nextWeek.takeIf { it.isNotBlank() },
            scoreValue = board.weeklyScore.coerceIn(0, 100),
            weightLabel = "${board.weightTotal} / $budget",
            weightFraction = (board.weightTotal.toFloat() / budget).coerceIn(0f, 1f),
            weightOffBudget = goals.isNotEmpty() && board.weightTotal != budget,
            goals = goals,
            showEmpty = goals.isEmpty(),
        )
    }

    private fun WeeklyGoalDto.toUi(
        statusDisplay: Map<String, com.altuscorp.altus.data.remote.dto.StatusDisplayDto>,
    ): WeeklyGoalCardUi {
        val eff = effectivePct.coerceIn(0, 100)
        val display = statusDisplay[status]
            ?.let { StatusDisplay(label = it.label, color = it.color) }
            ?: StatusDisplay(label = status, color = "neutral")
        val eyebrow = listOfNotNull(
            client?.takeIf { it.isNotBlank() },
            subject?.takeIf { it.isNotBlank() },
        ).takeIf { it.isNotEmpty() }?.joinToString(" · ")?.uppercase()

        val accept = acceptPct
        val reviewNote = if (reviewed && accept != null && accept != pctDone) {
            "Reported $pctDone% · accepted $accept%"
        } else {
            null
        }

        return WeeklyGoalCardUi(
            id = id,
            indexLabel = position.toString(),
            eyebrow = eyebrow,
            title = title,
            notes = notes?.takeIf { it.isNotBlank() },
            weightLabel = weight.toString(),
            dueLabel = targetDate?.let(::formatDue),
            status = display,
            effectivePct = eff,
            pctLabel = "$eff%",
            pctFraction = (eff.toFloat() / 100f).coerceIn(0f, 1f),
            isComplete = eff >= 100,
            reviewNote = reviewNote,
            incentiveLabel = incentiveLabel?.takeIf { it.isNotBlank() },
            carried = carried,
        )
    }

    /** `yyyy-MM-dd` → "Mon, 6 Jul"; falls back to the raw key on a parse miss. */
    private fun formatDue(key: String): String =
        DateFormat.parseDayKey(key)?.let { DUE_FORMAT.format(it) } ?: key

    private fun messageFor(result: ApiResult<*>): String? = when (result) {
        is ApiResult.Success -> null
        is ApiResult.ReAuth -> "Your session has ended — sign in again to continue."
        is ApiResult.Enrollment -> "Your account can't access weekly goals — contact your admin."
        is ApiResult.Gate -> result.gate.message
        is ApiResult.Failure -> when {
            result.isNetwork -> "You're offline — showing the last synced week."
            result.isRateLimited -> "Too many requests — give it a moment, then retry."
            else -> result.message ?: "Couldn't refresh — try again."
        }
    }

    private companion object {
        val DUE_FORMAT: DateTimeFormatter =
            DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)
    }
}
