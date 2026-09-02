package com.altuscorp.altus.feature.team

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.TeamMemberPerfDto
import com.altuscorp.altus.data.remote.dto.TeamPerformanceDto
import com.altuscorp.altus.data.repository.TeamRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * WMS · Team performance. Reads [TeamRepository.performance] cache-first
 * (the board paints instantly on a warm cache), reduces the A-to-Z scoped
 * roster snapshot into the four summary tiles and a sorted member-card list —
 * the mobile rendition of the web `/weekly-goals/team` page: who's working,
 * who's blocked, who has no plan, and who's behind, live, today. Read-only:
 * unlike the web there is no drill-in to a member's goals or checklist
 * review here (those remain web-only for this pass). All sorting + status
 * resolution happens here so the composables stay dumb renders of one
 * [Immutable] state.
 */

/** Live working-state label a card shows, mirroring the web's `statusOf`. */
enum class TeamMemberStatus { NeedsHelp, Blocked, Working, ClockedOut, NoPlan, NotInYet }

/** The team-wide summary strip (mirrors the web's four `Stat` tiles). */
@Immutable
data class TeamSummary(
    val teamSize: Int = 0,
    val workingNow: Int = 0,
    val noPlanToday: Int = 0,
    val needHelp: Int = 0,
)

/** One fully-resolved member card. */
@Immutable
data class TeamMemberCard(
    val id: String,
    val name: String,
    val avatarUrl: String?,
    val department: String?,
    val status: TeamMemberStatus,
    val goalsDone: Int,
    val goalsCount: Int,
    val goalScorePct: Int?,
    val assignedToday: Int,
    val doneToday: Int,
    val pendingTasks: Int,
    val overdueTasks: Int,
    val blockedTasks: Int,
    val needHelp: Int,
    val dccCompliancePct: Int?,
    val trainingHoursMonth: Double,
    val lastInLabel: String?,
    val lastOutLabel: String?,
)

/** The screen's single source of truth (Part 6: one @Immutable UiState). */
@Immutable
data class TeamUiState(
    /** True only while the cache is cold and the first fetch is in flight. */
    val isLoading: Boolean = true,
    /** Pull-to-refresh spinner. */
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    val summary: TeamSummary = TeamSummary(),
    val members: ImmutableList<TeamMemberCard> = persistentListOf(),
) {
    val isEmpty: Boolean get() = members.isEmpty()
}

sealed interface TeamIntent {
    /** Pull-to-refresh reconcile. */
    data object Refresh : TeamIntent

    /** Retry after a cold-cache load failure. */
    data object Retry : TeamIntent
}

@HiltViewModel
class TeamViewModel @Inject constructor(
    private val repository: TeamRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    val uiState: StateFlow<TeamUiState> = combine(
        repository.performance(),
        refreshing,
        loadFailed,
        refreshFailed,
    ) { snapshot, isRefreshing, coldFailed, warmFailed ->
        if (snapshot == null) {
            TeamUiState(
                isLoading = !coldFailed,
                isRefreshing = isRefreshing,
                loadFailed = coldFailed,
            )
        } else {
            snapshot.toUiState(isRefreshing = isRefreshing, refreshFailed = warmFailed)
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = TeamUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: TeamIntent) {
        when (intent) {
            TeamIntent.Refresh, TeamIntent.Retry -> refresh()
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success -> Unit // the cache emission repaints the board
                else -> {
                    loadFailed.value = true
                    refreshFailed.value = true
                }
            }
            refreshing.value = false
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

/** Mirrors the web's `statusOf(p)` — same precedence, same fields. */
private fun TeamMemberPerfDto.status(): TeamMemberStatus = when {
    needHelp > 0 -> TeamMemberStatus.NeedsHelp
    blockedTasks > 0 -> TeamMemberStatus.Blocked
    working -> TeamMemberStatus.Working
    lastOutLabel != null -> TeamMemberStatus.ClockedOut
    !plannedToday -> TeamMemberStatus.NoPlan
    else -> TeamMemberStatus.NotInYet
}

private fun TeamMemberPerfDto.toCard() = TeamMemberCard(
    id = id,
    name = name,
    avatarUrl = avatarUrl,
    department = department,
    status = status(),
    goalsDone = goalsDone,
    goalsCount = goalsCount,
    goalScorePct = goalScorePct,
    assignedToday = assignedToday,
    doneToday = doneToday,
    pendingTasks = pendingTasks,
    overdueTasks = overdueTasks,
    blockedTasks = blockedTasks,
    needHelp = needHelp,
    dccCompliancePct = dccCompliancePct,
    trainingHoursMonth = trainingHoursMonth,
    lastInLabel = lastInLabel,
    lastOutLabel = lastOutLabel,
)

private fun TeamPerformanceDto.toUiState(
    isRefreshing: Boolean,
    refreshFailed: Boolean,
): TeamUiState {
    // Sort: needs-help + behind (overdue) first, then by goal score — mirrors the web.
    val sorted = members.sortedWith(
        compareByDescending<TeamMemberPerfDto> { it.needHelp * 100 + it.overdueTasks }
            .thenByDescending { it.goalScorePct ?: -1 },
    )

    return TeamUiState(
        isLoading = false,
        isRefreshing = isRefreshing,
        loadFailed = false,
        refreshFailed = refreshFailed,
        summary = TeamSummary(
            teamSize = members.size,
            workingNow = members.count { it.working },
            noPlanToday = members.count { !it.plannedToday },
            needHelp = members.count { it.needHelp > 0 },
        ),
        members = sorted.map { it.toCard() }.toImmutableList(),
    )
}
