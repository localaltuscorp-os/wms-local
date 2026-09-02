package com.altuscorp.altus.feature.wms

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.data.repository.DashboardRepository
import com.altuscorp.altus.data.repository.DccRepository
import com.altuscorp.altus.data.repository.TaskRepository
import com.altuscorp.altus.domain.model.DashboardSummary
import com.altuscorp.altus.domain.model.DccBoard
import com.altuscorp.altus.domain.model.StatusDisplay
import com.altuscorp.altus.domain.model.Task
import com.altuscorp.altus.domain.model.TaskBoard
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The WMS Dashboard brain — the workspace landing (web parity with
 * `app/(app)/dashboard/page.tsx` + `lib/queries/my-day.ts`). Everything is
 * read cache-first and composed from three EXISTING sources so the landing
 * paints instantly and never disagrees with the sibling tabs:
 *
 *  - [DashboardRepository] — greeting, the pending/overdue task pressure, and
 *    the weekly-goals fill gate (`/api/mobile/dashboard`).
 *  - [DccRepository] — the day's daily-compliance ring (`/api/mobile/dcc`),
 *    the same board the Fill tab and the Today ring draw.
 *  - [TaskRepository] — the full task board (`/api/mobile/tasks`); the "Today"
 *    list (overdue + due-today, the doer's own tasks) is derived here in memory,
 *    mirroring `getMyTodayTasks`. No dedicated endpoint is added — reusing the
 *    already-cached board keeps the paint instant and shares state with the
 *    Tasks tab (read-your-writes for free). See the surface note for the shape
 *    the additive `/api/mobile/my-day` endpoint WOULD take if a lighter payload
 *    is ever wanted.
 *
 * A minute ticker re-evaluates due phases so a task crossing into overdue
 * climbs into the Today list without a refresh (mirrors the Tasks tab).
 */
@HiltViewModel
class WmsDashboardViewModel @Inject constructor(
    private val dashboardRepository: DashboardRepository,
    private val dccRepository: DccRepository,
    private val taskRepository: TaskRepository,
) : ViewModel() {

    /** Screen-local, non-persisted concerns not owned by any repository. */
    private data class LocalState(
        val isRefreshing: Boolean = false,
        /** The last reconcile failed (drives the cold retry / stale surface). */
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    private val todayKey: String = DateFormat.todayKey()

    /** Re-emits every minute so overdue gravity in the Today list stays honest. */
    private val minuteTicker: Flow<Long> = flow {
        while (true) {
            emit(System.currentTimeMillis())
            delay(TICK_INTERVAL_MS)
        }
    }

    val uiState: StateFlow<WmsDashboardUiState> =
        combine(
            dashboardRepository.dashboard(),
            dccRepository.board(todayKey),
            taskRepository.board(),
            local,
            minuteTicker,
        ) { dashboard, dcc, board, localState, _ ->
            reduce(dashboard, dcc, board, localState)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            initialValue = WmsDashboardUiState(),
        )

    init {
        refresh()
    }

    fun onIntent(intent: WmsDashboardIntent) {
        when (intent) {
            WmsDashboardIntent.Refresh -> refresh()
            WmsDashboardIntent.Retry -> refresh()
        }
    }

    /** Reconcile every source in parallel; the dashboard probe drives the surface. */
    private fun refresh() {
        viewModelScope.launch {
            local.update { it.copy(isRefreshing = true) }
            val dashResult = coroutineScope {
                val dash = async { dashboardRepository.refresh() }
                launch { dccRepository.refresh(todayKey) }
                launch { taskRepository.refreshBoard() }
                dash.await()
            }
            local.update {
                it.copy(isRefreshing = false, refreshFailed = dashResult.isError())
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(
        dashboard: DashboardSummary?,
        dcc: DccBoard?,
        board: TaskBoard?,
        localState: LocalState,
    ): WmsDashboardUiState {
        val contentLoaded = dashboard != null

        val compliance = dcc?.let {
            WmsCompliance(
                filled = it.stats.filled,
                due = it.stats.due,
                pct = it.stats.pct,
                complete = it.stats.isComplete,
            )
        }

        val goalsUnfilled = dashboard?.weeklyGoalsGate
            ?.takeIf { it.required }
            ?.unfilledCount
            ?.takeIf { it > 0 }
            ?: 0

        return WmsDashboardUiState(
            isLoading = !contentLoaded && !localState.refreshFailed,
            isRefreshing = localState.isRefreshing,
            loadFailed = !contentLoaded && localState.refreshFailed,
            refreshFailed = contentLoaded && localState.refreshFailed,
            contentLoaded = contentLoaded,
            greeting = if (contentLoaded) greetingFor(dashboard?.greetingName.orEmpty()) else "",
            dateLabel = TODAY.format(LocalDate.now()),
            pending = dashboard?.pendingTasks ?: 0,
            overdue = dashboard?.overdueTasks ?: 0,
            adminStats = dashboard?.adminStats,
            topPerformers = dashboard?.topPerformers?.toImmutableList() ?: persistentListOf(),
            compliance = compliance,
            goalsUnfilled = goalsUnfilled,
            todayLoading = board == null,
            todayTasks = board?.let(::buildTodayTasks) ?: persistentListOf(),
        )
    }

    /**
     * The doer's own tasks that are OVERDUE or DUE TODAY (pending only), overdue
     * first then earliest due — the in-memory rendition of `getMyTodayTasks`.
     */
    private fun buildTodayTasks(board: TaskBoard): ImmutableList<WmsTodayTaskRow> {
        val now = Instant.now()
        return board.tasks
            .asSequence()
            .filter { it.completedAt == null }
            .map { it to EffectiveDue.duePhase(it.dueAt, now) }
            .filter { (_, phase) ->
                phase == EffectiveDue.DuePhase.OVERDUE || phase == EffectiveDue.DuePhase.TODAY
            }
            .sortedWith(
                compareByDescending<Pair<Task, EffectiveDue.DuePhase>> {
                    it.second == EffectiveDue.DuePhase.OVERDUE
                }.thenBy { it.first.dueAt },
            )
            .map { (task, phase) -> task.toRow(board.displayFor(task.status), phase, now) }
            .toList()
            .toImmutableList()
    }

    private fun Task.toRow(
        display: StatusDisplay,
        phase: EffectiveDue.DuePhase,
        now: Instant,
    ): WmsTodayTaskRow = WmsTodayTaskRow(
        id = id,
        taskNo = taskNo,
        title = title,
        meta = listOfNotNull(client?.takeIf { it.isNotBlank() }, subject?.takeIf { it.isNotBlank() })
            .joinToString(" · ")
            .takeIf { it.isNotBlank() },
        display = display,
        duePhrase = EffectiveDue.duePhrase(dueAt, now),
        isOverdue = phase == EffectiveDue.DuePhase.OVERDUE,
    )

    private fun greetingFor(name: String): String {
        val part = when (LocalTime.now().hour) {
            in 0..11 -> "Good morning"
            in 12..16 -> "Good afternoon"
            else -> "Good evening"
        }
        val first = name.substringBefore(' ').trim()
        return if (first.isBlank()) part else "$part, $first"
    }

    private fun ApiResult<*>.isError(): Boolean = when (this) {
        is ApiResult.Success -> false
        // A gate on the dashboard read is not a hard failure — never a dead end.
        is ApiResult.Gate -> false
        else -> true
    }

    private companion object {
        const val TICK_INTERVAL_MS = 60_000L
        const val STOP_TIMEOUT_MS = 5_000L
        val TODAY: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UiState + Intent (Part 6 contract: one @Immutable UiState + one sealed intent)
// ─────────────────────────────────────────────────────────────────────────────

/** The daily-compliance ring status (mirrors the DCC board stats). */
@Immutable
data class WmsCompliance(
    val filled: Int,
    val due: Int,
    val pct: Int,
    val complete: Boolean,
) {
    /** 0..1 for the compliance ring; guards a null/zero due-set. */
    val fraction: Float get() = if (due > 0) (filled.toFloat() / due).coerceIn(0f, 1f) else 0f
}

/** One "Today" row (overdue / due-today), pre-resolved so the card stays a dumb render. */
@Immutable
data class WmsTodayTaskRow(
    val id: String,
    val taskNo: Int?,
    val title: String,
    /** "Client · Subject" meta, null when both are blank. */
    val meta: String?,
    val display: StatusDisplay,
    /** "Overdue 3d" / "Due today". */
    val duePhrase: String,
    val isOverdue: Boolean,
)

/** The WMS Dashboard's single source of truth. */
@Immutable
data class WmsDashboardUiState(
    /** Cold cache and the first reconcile is in flight. */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** Dashboard payload present — the cards can paint (vs. skeleton). */
    val contentLoaded: Boolean = false,

    val greeting: String = "",
    val dateLabel: String = "",

    // Task pressure.
    val pending: Int = 0,
    val overdue: Int = 0,

    // Org-wide KPI strip (admins only; null hides it).
    val adminStats: com.altuscorp.altus.domain.model.AdminTaskStats? = null,

    // Admin leaderboard (completions, last 30d; empty for non-admins).
    val topPerformers: ImmutableList<com.altuscorp.altus.domain.model.TopPerformer> = persistentListOf(),

    // Daily compliance.
    val compliance: WmsCompliance? = null,

    // Weekly-goals fill gate (0 = up to date).
    val goalsUnfilled: Int = 0,

    // The "Today" list (overdue + due today).
    val todayLoading: Boolean = true,
    val todayTasks: ImmutableList<WmsTodayTaskRow> = persistentListOf(),
)

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface WmsDashboardIntent {
    /** Pull-to-refresh reconcile of every source. */
    data object Refresh : WmsDashboardIntent

    /** Retry after a cold-cache load failure. */
    data object Retry : WmsDashboardIntent
}
