package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.GateKind
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.domain.model.AttendanceState
import com.altuscorp.altus.domain.model.DashboardSummary
import com.altuscorp.altus.domain.model.DayPlan
import com.altuscorp.altus.domain.model.DccBoard
import com.altuscorp.altus.domain.model.TaskBoard
import com.altuscorp.altus.navigation.DeepLinks
import com.altuscorp.altus.ui.designsystem.DayRingSegment
import com.altuscorp.altus.ui.designsystem.DayRingState
import com.altuscorp.altus.ui.designsystem.DaySegmentKind
import com.altuscorp.altus.ui.designsystem.DaySegmentState
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * Assembles THE [DayRingState] — the five-segment render of the server's gate
 * machine (Plan → Clock in → Tasks due → DCC → Clock out) that the Today hero,
 * the Day Strip and the punch stamp all draw from one object.
 *
 * Honesty contract (P1-1): the ring is a client-side join of independently
 * cached endpoints, so it can only be as fresh as its inputs. Every source
 * flow here re-emits the moment ANY repository patches its cache (optimistic
 * commits included) — a DCC fill sweeps the ring on the same frame — and
 * [refresh] reconciles all sources against the server in parallel. Where an
 * input is cold the segment degrades to Pending, never to a guess.
 */
interface DayRepository {

    /** The live ring. Emits [DayRingState.Empty]-shaped state on a cold cache. */
    fun dayRing(): Flow<DayRingState>

    /** Reconcile every source (dashboard, attendance, DCC, plan, tasks) in parallel. */
    suspend fun refresh()

    /**
     * Persist that today's Day Seal has played — the seal fires ONCE PER DAY,
     * EVER. Call from `DayRing(onSealFinished = …)`.
     */
    suspend fun markSealShown()
}

class DayRepositoryImpl @Inject constructor(
    private val dashboardRepository: DashboardRepository,
    private val attendanceRepository: AttendanceRepository,
    private val dccRepository: DccRepository,
    private val planRepository: PlanRepository,
    private val taskRepository: TaskRepository,
    private val cache: JsonCache,
) : DayRepository {

    override fun dayRing(): Flow<DayRingState> = flow {
        // Captured at collection start; screens re-collect on resume, so the
        // day rolls over with the first frame after midnight.
        val today = LocalDate.now()
        val todayKey = DateFormat.dayKey(today)
        val sources = combine(
            dashboardRepository.dashboard(),
            attendanceRepository.attendance(),
            dccRepository.board(todayKey),
            planRepository.plan(),
            taskRepository.board(),
        ) { dashboard, attendance, dcc, plan, tasks ->
            RingSources(dashboard, attendance, dcc, plan, tasks)
        }
        emitAll(
            combine(sources, sealShownToday(todayKey)) { s, sealShown ->
                assembleDayRing(s, today, sealShown)
            }.distinctUntilChanged(),
        )
    }

    override suspend fun refresh() {
        coroutineScope {
            launch { dashboardRepository.refresh() }
            launch { attendanceRepository.refresh() }
            launch { dccRepository.refresh(DateFormat.todayKey()) }
            launch { planRepository.refresh() }
            launch { taskRepository.refreshBoard() }
        }
    }

    override suspend fun markSealShown() {
        cache.write(SEAL_SHOWN_KEY, DaySealRecord.serializer(), DaySealRecord(DateFormat.todayKey()))
    }

    private fun sealShownToday(todayKey: String): Flow<Boolean> =
        cache.observe(SEAL_SHOWN_KEY, DaySealRecord.serializer())
            .map { it?.dayKey == todayKey }
            .distinctUntilChanged()

    private companion object {
        /**
         * Repo-local persisted state, NOT a response snapshot — hence not in
         * [com.altuscorp.altus.data.local.entity.CacheKeys]. Lives in the same
         * table so sign-out's `clearAll()` retires it with the identity.
         */
        const val SEAL_SHOWN_KEY = "day_seal_shown"
    }
}

/** Which `yyyy-MM-dd` the seal last played for. */
@Serializable
private data class DaySealRecord(
    val dayKey: String = "",
)

/** One emission's worth of source snapshots (any may be cold-null). */
private data class RingSources(
    val dashboard: DashboardSummary?,
    val attendance: AttendanceState?,
    val dcc: DccBoard?,
    val plan: DayPlan?,
    val tasks: TaskBoard?,
)

/**
 * The pure gate-machine projection. Attendance is authoritative for punches
 * when present (dashboard is the fallback); a cold source degrades its
 * segment to Pending. The Mon/Thu weekly-goals gate renders as a BLOCKED
 * clock-in segment — the one gate the ring can know about before a 409.
 */
private fun assembleDayRing(s: RingSources, today: LocalDate, sealShown: Boolean): DayRingState {
    val checkedIn = s.attendance?.isCheckedIn ?: s.dashboard?.isCheckedIn ?: false
    val checkedOut = s.attendance?.isCheckedOut ?: s.dashboard?.isCheckedOut ?: false
    val goalsGate = s.dashboard?.weeklyGoalsGate

    // ── Plan ─────────────────────────────────────────────────────────────
    val plan = s.plan
    val planSegment = when {
        plan != null && plan.satisfied ->
            DayRingSegment(DaySegmentKind.Plan, DaySegmentState.Done, counter = "${plan.plannedCount}/${plan.minItems}")

        plan != null -> DayRingSegment(
            DaySegmentKind.Plan,
            if (plan.plannedCount > 0) DaySegmentState.InProgress else DaySegmentState.Pending,
            fraction = if (plan.minItems > 0) plan.plannedCount.toFloat() / plan.minItems else 0f,
            counter = "${plan.plannedCount}/${plan.minItems}",
        )

        // Plan source cold (endpoint dark / cold cache): a successful clock-in
        // proves the server's plan gate passed — the only honest inference.
        checkedIn -> DayRingSegment(DaySegmentKind.Plan, DaySegmentState.Done)

        else -> DayRingSegment(DaySegmentKind.Plan, DaySegmentState.Pending)
    }

    // ── Clock in ─────────────────────────────────────────────────────────
    val goalsBlocking = goalsGate != null && goalsGate.required && !checkedIn
    val clockInSegment = when {
        checkedIn -> DayRingSegment(DaySegmentKind.ClockIn, DaySegmentState.Done)
        goalsBlocking -> DayRingSegment(
            DaySegmentKind.ClockIn,
            DaySegmentState.Blocked,
            counter = goalsGate?.unfilledCount?.takeIf { it > 0 }?.let { "$it left" },
        )

        else -> DayRingSegment(DaySegmentKind.ClockIn, DaySegmentState.Pending)
    }

    // ── Tasks due today ──────────────────────────────────────────────────
    val zone = ZoneId.systemDefault()
    val tasksSegment = when {
        s.tasks != null -> {
            val relevant = s.tasks.tasks.filter { !it.dueAt.atZone(zone).toLocalDate().isAfter(today) }
            val done = relevant.count { it.completedAt != null }
            val total = relevant.size
            when {
                total == 0 -> DayRingSegment(DaySegmentKind.TasksDue, DaySegmentState.Done)
                done >= total ->
                    DayRingSegment(DaySegmentKind.TasksDue, DaySegmentState.Done, counter = "$done/$total")

                else -> DayRingSegment(
                    DaySegmentKind.TasksDue,
                    DaySegmentState.InProgress,
                    fraction = done.toFloat() / total,
                    counter = "$done/$total",
                )
            }
        }

        s.dashboard != null -> {
            val open = s.dashboard.pendingTasks
            if (open == 0) {
                DayRingSegment(DaySegmentKind.TasksDue, DaySegmentState.Done)
            } else {
                DayRingSegment(DaySegmentKind.TasksDue, DaySegmentState.InProgress, counter = "$open open")
            }
        }

        else -> DayRingSegment(DaySegmentKind.TasksDue, DaySegmentState.Pending)
    }

    // ── DCC ──────────────────────────────────────────────────────────────
    val stats = s.dcc?.stats
    val dccSegment = when {
        stats == null -> DayRingSegment(DaySegmentKind.Dcc, DaySegmentState.Pending)
        stats.due == 0 -> DayRingSegment(DaySegmentKind.Dcc, DaySegmentState.Done)
        stats.filled >= stats.due ->
            DayRingSegment(DaySegmentKind.Dcc, DaySegmentState.Done, counter = "${stats.filled}/${stats.due}")

        else -> DayRingSegment(
            DaySegmentKind.Dcc,
            if (stats.filled > 0) DaySegmentState.InProgress else DaySegmentState.Pending,
            fraction = stats.filled.toFloat() / stats.due,
            counter = "${stats.filled}/${stats.due}",
        )
    }

    // ── Clock out ────────────────────────────────────────────────────────
    val clockOutSegment = DayRingSegment(
        DaySegmentKind.ClockOut,
        if (checkedOut) DaySegmentState.Done else DaySegmentState.Pending,
    )

    val segments = listOf(planSegment, clockInSegment, tasksSegment, dccSegment, clockOutSegment)

    // ── The single next-blocker line + FIX route (Day Strip) ─────────────
    val nextBlocker = segments.firstOrNull { it.state != DaySegmentState.Done }
    val (copy, route) = if (nextBlocker == null) {
        "Day cleared" to null
    } else {
        when (nextBlocker.kind) {
            DaySegmentKind.Plan ->
                "Plan ${nextBlocker.counter ?: "your day"} · then clock in" to GateKind.NeedsPlan.route

            DaySegmentKind.ClockIn ->
                if (goalsBlocking) {
                    "Fill weekly goals${nextBlocker.counter?.let { " · $it" } ?: ""} · then clock in" to
                        GateKind.NeedsGoals.route
                } else {
                    "Clock in to start the day" to DeepLinks.PUNCH
                }

            DaySegmentKind.TasksDue ->
                "Tasks ${nextBlocker.counter ?: "due today"} · close what's due" to null

            DaySegmentKind.Dcc ->
                "DCC ${nextBlocker.counter ?: "due"} → Fill" to GateKind.NeedsDcc.route

            DaySegmentKind.ClockOut ->
                "Clock out to seal the day" to DeepLinks.PUNCH
        }
    }

    return DayRingState.fromSegments(
        segments = segments,
        nextStepCopy = copy,
        fixRoute = route,
        sealShownToday = sealShown,
    )
}
