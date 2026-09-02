package com.altuscorp.altus.feature.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.repository.AuthRepository
import com.altuscorp.altus.data.repository.DashboardRepository
import com.altuscorp.altus.data.repository.DayRepository
import com.altuscorp.altus.data.repository.DccRepository
import com.altuscorp.altus.domain.model.DashboardSummary
import com.altuscorp.altus.domain.model.DccBoard
import com.altuscorp.altus.domain.model.Identity
import com.altuscorp.altus.ui.designsystem.DayRingState
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Today brain (S2 — the paced ledger). Reads are cache-first: the four
 * source flows ([DashboardRepository.dashboard], [DayRepository.dayRing],
 * [DccRepository.board], [AuthRepository.identity]) paint the last-decoded
 * ledger instantly (a cold dashboard → skeletons) while [refresh] reconciles
 * every strip source in parallel.
 *
 * The Day Ring is assembled once by [DayRepository] and shared with the Day
 * Strip and the punch stamp, so the hero on this screen can never disagree with
 * the strip docked above the tabs. Every optimistic commit anywhere (a DCC
 * fill, a punch) re-emits the ring on the same frame — progress is felt
 * accruing, never announced.
 *
 * The seal is persisted from the hero's `DayRing(onSealFinished)` via
 * [TodayIntent.MarkSealShown] → [DayRepository.markSealShown] — once per day,
 * ever.
 */
@HiltViewModel
class TodayViewModel @Inject constructor(
    private val dashboardRepository: DashboardRepository,
    private val dayRepository: DayRepository,
    private val dccRepository: DccRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    /** Screen-local, non-persisted UI concerns not owned by any repository. */
    private data class LocalState(
        val isRefreshing: Boolean = false,
        /** The last reconcile failed (drives the cold-cache retry / stale banner). */
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    private val todayKey: String = DateFormat.todayKey()

    val uiState: StateFlow<TodayUiState> =
        combine(
            dashboardRepository.dashboard(),
            dayRepository.dayRing(),
            dccRepository.board(todayKey),
            authRepository.identity(),
            local,
        ) { dashboard, ring, dcc, identity, localState ->
            reduce(dashboard, ring, dcc, identity, localState)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = TodayUiState(),
        )

    init {
        refresh()
    }

    fun onIntent(intent: TodayIntent) {
        when (intent) {
            TodayIntent.Refresh -> refresh()
            TodayIntent.Retry -> refresh()
            TodayIntent.MarkSealShown -> viewModelScope.launch { dayRepository.markSealShown() }
        }
    }

    /**
     * Reconcile every strip source in parallel. The dashboard result is the
     * representative network probe that drives the load/stale error surface; the
     * remaining sources fan out through [DayRepository.refresh] (attendance,
     * plan, tasks) and the day's DCC board so the whole ledger comes back
     * together.
     */
    private fun refresh() {
        viewModelScope.launch {
            local.update { it.copy(isRefreshing = true) }
            val dashResult = coroutineScope {
                val dash = async { dashboardRepository.refresh() }
                launch { dayRepository.refresh() }
                launch { dccRepository.refresh(todayKey) }
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
        ring: DayRingState,
        dcc: DccBoard?,
        identity: Identity?,
        local: LocalState,
    ): TodayUiState {
        val contentLoaded = dashboard != null

        // Header identity — prefer the live /me snapshot for the avatar, fall
        // back to the dashboard greeting name while /me is still cold.
        val name = identity?.name ?: dashboard?.greetingName.orEmpty()

        val punch = dashboard?.let {
            PunchContext(
                kind = when {
                    it.isCheckedOut -> PunchKind.Done
                    it.isCheckedIn -> PunchKind.ClockOut
                    else -> PunchKind.ClockIn
                },
                checkedInAt = it.checkedInAt,
                checkedOutAt = it.checkedOutAt,
            )
        } ?: PunchContext()

        val dccPressure = dcc?.let {
            DccPressure(
                filled = it.stats.filled,
                due = it.stats.due,
                pct = it.stats.pct,
                complete = it.stats.isComplete,
            )
        }

        val gate = dashboard?.weeklyGoalsGate
            ?.takeIf { it.required && it.unfilledCount > 0 }
            ?.let { GoalsGateBanner(unfilledCount = it.unfilledCount) }

        return TodayUiState(
            isLoading = !contentLoaded && !local.refreshFailed,
            isRefreshing = local.isRefreshing,
            loadFailed = !contentLoaded && local.refreshFailed,
            refreshFailed = contentLoaded && local.refreshFailed,
            contentLoaded = contentLoaded,
            greeting = if (contentLoaded) greetingFor(name) else "",
            dateLabel = TODAY.format(LocalDate.now()),
            avatarName = name,
            avatarUrl = identity?.avatarUrl,
            ring = ring,
            punch = punch,
            pendingTasks = dashboard?.pendingTasks ?: 0,
            overdueTasks = dashboard?.overdueTasks ?: 0,
            dcc = dccPressure,
            goalsGate = gate,
            modules = if (contentLoaded) {
                buildModules(dashboard, punch, dccPressure, gate).toImmutableList()
            } else {
                persistentListOf()
            },
        )
    }

    private fun buildModules(
        dashboard: DashboardSummary?,
        punch: PunchContext,
        dcc: DccPressure?,
        gate: GoalsGateBanner?,
    ): List<ModuleTile> = listOf(
        ModuleTile(
            id = ModuleId.Attendance,
            title = "Attendance",
            meta = punch.checkedInAt?.let { "In $it" } ?: "Not in",
        ),
        ModuleTile(
            id = ModuleId.Tasks,
            title = "Tasks",
            meta = "${dashboard?.pendingTasks ?: 0} open",
        ),
        ModuleTile(
            id = ModuleId.Dcc,
            title = "Compliance",
            meta = dcc?.let { "${it.filled}/${it.due}" } ?: "—",
        ),
        ModuleTile(
            id = ModuleId.Goals,
            title = "Weekly goals",
            meta = gate?.let { "${it.unfilledCount} to fill" } ?: "Up to date",
        ),
        ModuleTile(
            id = ModuleId.Inbox,
            title = "Inbox",
            meta = "Open",
        ),
        ModuleTile(
            id = ModuleId.More,
            title = "All modules",
            meta = "Hub",
        ),
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
        val TODAY: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)
    }
}
