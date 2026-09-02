package com.altuscorp.altus.domain.model

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.data.remote.dto.AttendanceDayDto
import com.altuscorp.altus.data.remote.dto.AttendanceDto
import com.altuscorp.altus.data.remote.dto.DashboardDto
import com.altuscorp.altus.data.remote.dto.DccDto
import com.altuscorp.altus.data.remote.dto.DccItemDto
import com.altuscorp.altus.data.remote.dto.KanbanResponseDto
import com.altuscorp.altus.data.remote.dto.KanbanTaskDto
import com.altuscorp.altus.data.remote.dto.MeDto
import com.altuscorp.altus.data.remote.dto.NotificationDto
import com.altuscorp.altus.data.remote.dto.NotificationsDto
import com.altuscorp.altus.data.remote.dto.PlanDto
import com.altuscorp.altus.data.remote.dto.PlanItemDto
import com.altuscorp.altus.data.remote.dto.PunchResponseDto
import com.altuscorp.altus.data.remote.dto.SalaryDto
import com.altuscorp.altus.data.remote.dto.SalaryMonthDto
import com.altuscorp.altus.data.remote.dto.StatusDisplayDto
import com.altuscorp.altus.data.remote.dto.TaskDetailResponseDto
import com.altuscorp.altus.data.remote.dto.TaskFormDto
import com.altuscorp.altus.data.remote.dto.TaskListResponseDto
import com.altuscorp.altus.data.remote.dto.TaskSummaryDto
import com.altuscorp.altus.data.remote.dto.TimelineEventDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsFillDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsGateDto
import java.time.Instant
import java.time.LocalDate
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableMap
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.collections.immutable.toImmutableMap

/**
 * @Immutable domain models (Part 6 contract: one @Immutable UiState per screen
 * built from these, ImmutableList everywhere so Compose skipping stays
 * correct) + the mappers from the wire DTOs.
 *
 * Dates: ISO instants parse to [Instant]; `YYYY-MM-DD` strings parse to
 * [LocalDate]. Malformed values degrade to epoch / null — a mapper never
 * throws on server data (contract-hardening rule).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers (lenient, never throw)
// ─────────────────────────────────────────────────────────────────────────────

private fun instantOrNull(iso: String?): Instant? =
    if (iso.isNullOrBlank()) null else runCatching { Instant.parse(iso) }.getOrNull()

private fun instantOrEpoch(iso: String?): Instant = instantOrNull(iso) ?: Instant.EPOCH

private fun dateOrNull(ymd: String?): LocalDate? =
    if (ymd.isNullOrBlank()) null else runCatching { LocalDate.parse(ymd) }.getOrNull()

private fun dateOrEpoch(ymd: String?): LocalDate = dateOrNull(ymd) ?: LocalDate.EPOCH

// ─────────────────────────────────────────────────────────────────────────────
// Identity (S1 / S9)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class WeeklyGoalsGate(
    val required: Boolean,
    val unfilledCount: Int,
)

@Immutable
data class Identity(
    val id: String,
    val name: String,
    val email: String,
    val isAdmin: Boolean,
    val avatarUrl: String?,
    val department: String?,
    val weeklyGoalsGate: WeeklyGoalsGate,
) {
    val firstName: String get() = name.substringBefore(' ')
}

fun WeeklyGoalsGateDto.toDomain(): WeeklyGoalsGate =
    WeeklyGoalsGate(required = required, unfilledCount = unfilledCount)

fun MeDto.toDomain(): Identity = Identity(
    id = id,
    name = name,
    email = email,
    isAdmin = isAdmin,
    avatarUrl = avatarUrl,
    department = department,
    weeklyGoalsGate = weeklyGoalsGate.toDomain(),
)

// ─────────────────────────────────────────────────────────────────────────────
// Today (S2)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class DashboardSummary(
    val greetingName: String,
    val isAdmin: Boolean,
    /** Server-formatted local time ("09:14"), null until punched in. */
    val checkedInAt: String?,
    val checkedOutAt: String?,
    val pendingTasks: Int,
    val overdueTasks: Int,
    /** Org-wide task KPI strip — admins only, null otherwise. */
    val adminStats: AdminTaskStats?,
    /** Admin leaderboard (completions, last 30d) — admins only. */
    val topPerformers: List<TopPerformer>,
    val weeklyGoalsGate: WeeklyGoalsGate,
) {
    val isCheckedIn: Boolean get() = checkedInAt != null
    val isCheckedOut: Boolean get() = checkedOutAt != null
}

data class AdminTaskStats(
    val total: Int,
    val needInfo: Int,
    val notApproved: Int,
    val done: Int,
    val pending: Int,
    val notStarted: Int,
) {
    /** Share of all tasks that are done/approved — the completion-rate headline. */
    val completionPct: Int get() = if (total > 0) ((done.toFloat() / total) * 100).toInt() else 0
}

data class TopPerformer(val name: String, val done: Int)

fun DashboardDto.toDomain(): DashboardSummary = DashboardSummary(
    greetingName = greetingName,
    isAdmin = isAdmin,
    checkedInAt = attendance.checkedIn,
    checkedOutAt = attendance.checkedOut,
    pendingTasks = tasks.pending,
    overdueTasks = tasks.overdue,
    adminStats = adminStats?.let { AdminTaskStats(it.total, it.needInfo, it.notApproved, it.done, it.pending, it.notStarted) },
    topPerformers = topPerformers?.map { TopPerformer(it.name, it.done) } ?: emptyList(),
    weeklyGoalsGate = weeklyGoalsGate.toDomain(),
)

// ─────────────────────────────────────────────────────────────────────────────
// Attendance (S3 + history)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class AttendanceDay(
    val date: LocalDate,
    /** Server-formatted local times, mono in the ledger. */
    val checkIn: String?,
    val checkOut: String?,
)

@Immutable
data class Geofence(
    val enabled: Boolean,
    val radiusM: Int?,
)

@Immutable
data class AttendanceState(
    val today: AttendanceDay,
    /** Most-recent-first prior days (~14). */
    val history: ImmutableList<AttendanceDay>,
    val geofence: Geofence,
    val devicesEnrolled: Int,
    val biometricExempt: Boolean,
) {
    val isCheckedIn: Boolean get() = today.checkIn != null
    val isCheckedOut: Boolean get() = today.checkOut != null

    /** The Day Ring punch segments + the contextual hero action key off this. */
    val nextPunchKind: String? get() = when {
        !isCheckedIn -> "in"
        !isCheckedOut -> "out"
        else -> null
    }
}

@Immutable
data class PunchResult(
    val date: LocalDate?,
    /** True when this punch enrolled a new device. */
    val newDevice: Boolean,
)

private fun AttendanceDayDto.toDomain(): AttendanceDay = AttendanceDay(
    date = dateOrEpoch(date),
    checkIn = checkIn,
    checkOut = checkOut,
)

fun AttendanceDto.toDomain(): AttendanceState = AttendanceState(
    today = AttendanceDay(
        date = dateOrEpoch(today.date),
        checkIn = today.checkedIn,
        checkOut = today.checkedOut,
    ),
    history = history.map { it.toDomain() }.toImmutableList(),
    geofence = Geofence(enabled = geofence.enabled, radiusM = geofence.radiusM),
    devicesEnrolled = devicesEnrolled,
    biometricExempt = biometricExempt,
)

fun PunchResponseDto.toDomain(): PunchResult = PunchResult(
    date = dateOrNull(date),
    newDevice = newDevice,
)

// ─────────────────────────────────────────────────────────────────────────────
// Tasks (S6 / S7)
// ─────────────────────────────────────────────────────────────────────────────

/** Server-driven pill: label + colour TOKEN (resolved via StatusColorResolver,
 *  never a hex in a composable). */
@Immutable
data class StatusDisplay(
    val label: String,
    val color: String,
)

@Immutable
data class Task(
    val id: String,
    val taskNo: Int?,
    val title: String,
    val subject: String?,
    val client: String?,
    val status: String,
    val priority: String,
    /** EFFECTIVE due (revised ?? original) — sort + overdue by this. */
    val dueAt: Instant,
    /** Optimistic-lock token for status changes. */
    val updatedAt: Instant,
    val completedAt: Instant?,
    /** Legal next statuses for THIS user; [0] labels the swipe under-layer. */
    val allowedTransitions: ImmutableList<String>,
)

@Immutable
data class TaskBoard(
    val statusDisplay: ImmutableMap<String, StatusDisplay>,
    val tasks: ImmutableList<Task>,
) {
    fun displayFor(status: String): StatusDisplay =
        statusDisplay[status] ?: StatusDisplay(label = status, color = "neutral")
}

@Immutable
data class TimelineEvent(
    val id: String,
    val actorName: String?,
    val eventType: String,
    val note: String?,
    val fromValue: String?,
    val toValue: String?,
    val createdAt: Instant,
)

@Immutable
data class TaskDetail(
    val id: String,
    val taskNo: Int?,
    val title: String,
    val subject: String?,
    val client: String?,
    val description: String?,
    val notes: String?,
    val status: String,
    val priority: String,
    val approvalStatus: String?,
    /** ORIGINAL due — immutable per the due-date rule. */
    val dueAt: Instant?,
    /** Revised target — rendered as `info` "Revised → …" under the original. */
    val revisedTargetDate: Instant?,
    val createdAt: Instant?,
    val completedAt: Instant?,
    /** Optimistic-lock token. */
    val updatedAt: Instant?,
    val doerName: String?,
    val initiatorName: String?,
    val creatorName: String?,
    val allowedTransitions: ImmutableList<String>,
    val canComment: Boolean,
    val statusDisplay: ImmutableMap<String, StatusDisplay>,
    val timeline: ImmutableList<TimelineEvent>,
) {
    /** COALESCE(revised, original) — the effective due for phrase/keyline. */
    val effectiveDueAt: Instant? get() = revisedTargetDate ?: dueAt

    fun displayFor(status: String): StatusDisplay =
        statusDisplay[status] ?: StatusDisplay(label = status, color = "neutral")
}

private fun Map<String, StatusDisplayDto>.toDomain(): ImmutableMap<String, StatusDisplay> =
    mapValues { (_, v) -> StatusDisplay(label = v.label, color = v.color) }.toImmutableMap()

private fun TaskSummaryDto.toDomain(): Task = Task(
    id = id,
    taskNo = taskNo,
    title = title,
    subject = subject,
    client = client,
    status = status,
    priority = priority,
    dueAt = instantOrEpoch(dueAt),
    updatedAt = instantOrEpoch(updatedAt),
    completedAt = instantOrNull(completedAt),
    allowedTransitions = allowedTransitions.toImmutableList(),
)

fun TaskListResponseDto.toDomain(): TaskBoard = TaskBoard(
    statusDisplay = statusDisplay.toDomain(),
    tasks = tasks.map { it.toDomain() }.toImmutableList(),
)

private fun TimelineEventDto.toDomain(): TimelineEvent = TimelineEvent(
    id = id,
    actorName = actorName,
    eventType = eventType,
    note = note,
    fromValue = fromValue,
    toValue = toValue,
    createdAt = instantOrEpoch(createdAt),
)

fun TaskDetailResponseDto.toDomain(): TaskDetail = TaskDetail(
    id = task.id,
    taskNo = task.taskNo,
    title = task.title,
    subject = task.subject,
    client = task.client,
    description = task.description,
    notes = task.notes,
    status = task.status,
    priority = task.priority,
    approvalStatus = task.approvalStatus,
    dueAt = instantOrNull(task.dueAt),
    revisedTargetDate = instantOrNull(task.revisedTargetDate),
    createdAt = instantOrNull(task.createdAt),
    completedAt = instantOrNull(task.completedAt),
    updatedAt = instantOrNull(task.updatedAt),
    doerName = task.doerName,
    initiatorName = task.initiatorName,
    creatorName = task.creatorName,
    allowedTransitions = allowedTransitions.toImmutableList(),
    canComment = canComment,
    statusDisplay = statusDisplay.toDomain(),
    timeline = timeline.map { it.toDomain() }.toImmutableList(),
)

// ─────────────────────────────────────────────────────────────────────────────
// Kanban board (WMS — GET /api/mobile/tasks/kanban)
// ─────────────────────────────────────────────────────────────────────────────

/** One board card — the lean shape the status board renders (no transitions;
 *  the mobile board is read-only). */
@Immutable
data class KanbanTask(
    val id: String,
    val taskNo: Int?,
    val title: String,
    val subject: String?,
    val client: String?,
    val status: String,
    val priority: String,
    val archived: Boolean,
    /** EFFECTIVE due (revised ?? original) — the due phrase + overdue key off this. */
    val dueAt: Instant,
    val updatedAt: Instant,
    val completedAt: Instant?,
)

@Immutable
data class KanbanBoard(
    /** The synthetic Archived-column sentinel; archived cards route here. */
    val archiveColumnId: String,
    /** Server-resolved column order (status ids + [archiveColumnId]). */
    val columns: ImmutableList<String>,
    val statusDisplay: ImmutableMap<String, StatusDisplay>,
    val tasks: ImmutableList<KanbanTask>,
) {
    /** The display for a status id; the Archived sentinel has no server entry,
     *  so it degrades to a neutral "Archived" pill. */
    fun displayForColumn(columnId: String): StatusDisplay = when (columnId) {
        archiveColumnId -> StatusDisplay(label = "Archived", color = "slate")
        else -> statusDisplay[columnId] ?: StatusDisplay(label = columnId, color = "neutral")
    }
}

private fun KanbanTaskDto.toDomain(): KanbanTask = KanbanTask(
    id = id,
    taskNo = taskNo,
    title = title,
    subject = subject,
    client = client,
    status = status,
    priority = priority,
    archived = archived,
    dueAt = instantOrEpoch(dueAt),
    updatedAt = instantOrEpoch(updatedAt),
    completedAt = instantOrNull(completedAt),
)

fun KanbanResponseDto.toDomain(): KanbanBoard = KanbanBoard(
    archiveColumnId = archiveColumnId,
    columns = columns.toImmutableList(),
    statusDisplay = statusDisplay.toDomain(),
    tasks = tasks.map { it.toDomain() }.toImmutableList(),
)

// ─────────────────────────────────────────────────────────────────────────────
// New-task form (S6)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class EmployeeOption(
    val id: String,
    val name: String,
)

@Immutable
data class PriorityOption(
    val value: String,
    val label: String,
)

@Immutable
data class TaskFormOptions(
    val me: EmployeeOption,
    val employees: ImmutableList<EmployeeOption>,
    val subjects: ImmutableList<String>,
    val clients: ImmutableList<String>,
    val priorities: ImmutableList<PriorityOption>,
)

fun TaskFormDto.toDomain(): TaskFormOptions = TaskFormOptions(
    me = EmployeeOption(id = me.id, name = me.name),
    employees = employees.map { EmployeeOption(id = it.id, name = it.name) }.toImmutableList(),
    subjects = subjects.toImmutableList(),
    clients = clients.toImmutableList(),
    priorities = priorities.map { PriorityOption(value = it.value, label = it.label) }.toImmutableList(),
)

// ─────────────────────────────────────────────────────────────────────────────
// DCC (S5)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class DccStats(
    val due: Int,
    val filled: Int,
    /** 0–100; server guards divide-by-zero. Feeds the pinned + Day rings. */
    val pct: Int,
) {
    val isComplete: Boolean get() = due > 0 && filled >= due
}

@Immutable
data class DccItem(
    val id: String,
    val code: String?,
    val title: String,
    val frequency: String?,
    /** Committed status for the date, or null when unfilled. */
    val status: String?,
    val value: String?,
    val note: String?,
) {
    val isFilled: Boolean get() = status != null
}

@Immutable
data class DccSection(
    /** Stable `section∷clientId` key — LazyColumn key. */
    val key: String,
    val section: String,
    val clientName: String?,
    val items: ImmutableList<DccItem>,
) {
    val filledCount: Int get() = items.count { it.isFilled }
}

@Immutable
data class DccParticipantSubject(
    val id: String,
    val name: String,
    val kind: String?,
    val status: String?,
)

@Immutable
data class DccParticipantKpi(
    val id: String,
    val code: String?,
    val title: String,
    val frequency: String?,
    val total: Int,
    val doneCount: Int,
    val subjects: ImmutableList<DccParticipantSubject>,
)

@Immutable
data class DccTrays(
    val weekly: ImmutableList<DccItem>,
    val monthly: ImmutableList<DccItem>,
    val adhoc: ImmutableList<DccItem>,
)

@Immutable
data class DccBoard(
    val date: LocalDate,
    val today: LocalDate,
    val ownerName: String,
    /** Server status vocabulary ("Done", "Not done", "NA", "Pending"). */
    val statuses: ImmutableList<String>,
    val stats: DccStats,
    val sections: ImmutableList<DccSection>,
    val participants: ImmutableList<DccParticipantKpi>,
    val trays: DccTrays,
) {
    val isToday: Boolean get() = date == today
}

private fun DccItemDto.toDomain(): DccItem = DccItem(
    id = id,
    code = code,
    title = title,
    frequency = frequency,
    status = status,
    value = value,
    note = note,
)

fun DccDto.toDomain(): DccBoard = DccBoard(
    date = dateOrEpoch(date),
    today = dateOrEpoch(today),
    ownerName = ownerName,
    statuses = statuses.toImmutableList(),
    stats = DccStats(due = stats.due, filled = stats.filled, pct = stats.pct),
    sections = sections.map { s ->
        DccSection(
            key = s.key,
            section = s.section,
            clientName = s.clientName,
            items = s.items.map { it.toDomain() }.toImmutableList(),
        )
    }.toImmutableList(),
    participants = participants.map { p ->
        DccParticipantKpi(
            id = p.id,
            code = p.code,
            title = p.title,
            frequency = p.frequency,
            total = p.total,
            doneCount = p.doneCount,
            subjects = p.subjects.map { s ->
                DccParticipantSubject(id = s.id, name = s.name, kind = s.kind, status = s.status)
            }.toImmutableList(),
        )
    }.toImmutableList(),
    trays = DccTrays(
        weekly = trays.weekly.map { it.toDomain() }.toImmutableList(),
        monthly = trays.monthly.map { it.toDomain() }.toImmutableList(),
        adhoc = trays.adhoc.map { it.toDomain() }.toImmutableList(),
    ),
)

// ─────────────────────────────────────────────────────────────────────────────
// Plan Your Day (S4 — new endpoint)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class PlanItem(
    val id: String,
    /** "assigned" | "personal". */
    val source: String,
    val title: String,
    val client: String?,
    val subject: String?,
    /** "goal_related" | "standalone". */
    val origin: String,
    val goalId: String?,
    val taskId: String?,
    val done: Boolean,
)

@Immutable
data class PullableGoal(
    val id: String,
    val client: String?,
    val subject: String?,
    val targetDone: String?,
    val weight: Int,
)

@Immutable
data class PlannerGoal(
    val id: String,
    val client: String?,
    val subject: String?,
    val targetDone: String?,
    val weight: Int,
    val pctDone: Int,
    val loggedToday: Boolean,
    val todayNote: String?,
)

@Immutable
data class DayPlan(
    val date: LocalDate,
    /** MIN_DAILY_ITEMS — meter denominator. */
    val minItems: Int,
    val plannedCount: Int,
    val satisfied: Boolean,
    val needsGoalActuals: Boolean,
    val items: ImmutableList<PlanItem>,
    val assignedTasks: ImmutableList<PlanItem>,
    val pullableGoals: ImmutableList<PullableGoal>,
    val goals: ImmutableList<PlannerGoal>,
    val overdue: ImmutableList<PlanItem>,
) {
    /** Mono meter copy source ("2/5"). */
    val remaining: Int get() = (minItems - plannedCount).coerceAtLeast(0)
}

private fun PlanItemDto.toDomain(): PlanItem = PlanItem(
    id = id,
    source = source,
    title = title,
    client = client,
    subject = subject,
    origin = origin,
    goalId = goalId,
    taskId = taskId,
    done = done,
)

fun PlanDto.toDomain(): DayPlan = DayPlan(
    date = dateOrEpoch(date),
    minItems = minItems,
    plannedCount = plannedCount,
    satisfied = satisfied,
    needsGoalActuals = needsGoalActuals,
    items = items.map { it.toDomain() }.toImmutableList(),
    assignedTasks = assignedTasks.map { it.toDomain() }.toImmutableList(),
    pullableGoals = pullableGoals.map {
        PullableGoal(id = it.id, client = it.client, subject = it.subject, targetDone = it.targetDone, weight = it.weight)
    }.toImmutableList(),
    goals = goals.map {
        PlannerGoal(
            id = it.id,
            client = it.client,
            subject = it.subject,
            targetDone = it.targetDone,
            weight = it.weight,
            pctDone = it.pctDone,
            loggedToday = it.loggedToday,
            todayNote = it.todayNote,
        )
    }.toImmutableList(),
    overdue = overdue.map {
        PlanItem(
            id = it.id,
            source = "personal",
            title = it.title,
            client = it.client,
            subject = it.subject,
            origin = it.origin,
            goalId = it.goalId,
            taskId = null,
            done = false,
        )
    }.toImmutableList(),
)

// ─────────────────────────────────────────────────────────────────────────────
// Weekly goals fill (S8 — new endpoint)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class UnfilledWeekGoal(
    val id: String,
    val position: Int,
    val client: String?,
    val subject: String?,
    val targetDone: String?,
    val priority: String?,
    val targetDate: LocalDate?,
    /** Last saved %Done, null when never filled. */
    val pctDone: Int?,
    val explanation: String?,
)

@Immutable
data class WeeklyGoalsFill(
    val weekStart: LocalDate?,
    val goals: ImmutableList<UnfilledWeekGoal>,
)

fun WeeklyGoalsFillDto.toDomain(): WeeklyGoalsFill = WeeklyGoalsFill(
    weekStart = dateOrNull(weekStart),
    goals = goals.map {
        UnfilledWeekGoal(
            id = it.id,
            position = it.position,
            client = it.client,
            subject = it.subject,
            targetDone = it.targetDone,
            priority = it.priority,
            targetDate = dateOrNull(it.targetDate),
            pctDone = it.pctDone,
            explanation = it.explanation,
        )
    }.toImmutableList(),
)

// ─────────────────────────────────────────────────────────────────────────────
// Inbox (S10 — new endpoint)
// ─────────────────────────────────────────────────────────────────────────────

@Immutable
data class Notification(
    val id: String,
    val taskId: String?,
    val kind: String,
    val title: String,
    val body: String?,
    val actorName: String?,
    val taskTitle: String?,
    val taskSubject: String?,
    val taskStatus: String?,
    val readAt: Instant?,
    val createdAt: Instant,
    /** `altus://` deep link for tap-through. */
    val link: String?,
) {
    val isUnread: Boolean get() = readAt == null
}

@Immutable
data class NotificationPage(
    val items: ImmutableList<Notification>,
    /** ISO cursor for `?before=`, null when the feed is exhausted. */
    val nextCursor: String?,
    val hasMore: Boolean,
    val unreadCount: Int,
) {
    companion object {
        val Empty = NotificationPage(
            items = persistentListOf(),
            nextCursor = null,
            hasMore = false,
            unreadCount = 0,
        )
    }
}

private fun NotificationDto.toDomain(): Notification = Notification(
    id = id,
    taskId = taskId,
    kind = kind,
    title = title,
    body = body,
    actorName = actorName,
    taskTitle = taskTitle,
    taskSubject = taskSubject,
    taskStatus = taskStatus,
    readAt = instantOrNull(readAt),
    createdAt = instantOrEpoch(createdAt),
    link = link,
)

fun NotificationsDto.toDomain(): NotificationPage = NotificationPage(
    items = notifications.map { it.toDomain() }.toImmutableList(),
    nextCursor = nextCursor,
    hasMore = hasMore,
    unreadCount = unreadCount,
)

// ─────────────────────────────────────────────────────────────────────────────
// Salary (Employees workspace — the signed-in user's own payslip history)
// ─────────────────────────────────────────────────────────────────────────────

/** One month's payslip: net pay ([finalPayment]) + the full component ladder +
 *  the sheet's own attendance figures. Amounts stay raw here; the ViewModel
 *  formats them into mono ₹ strings for the ledger. */
@Immutable
data class SalaryMonth(
    /** `YYYY-MM` — the stable list key + selection identity. */
    val month: String,
    /** "June 2026". */
    val monthLabel: String,
    val designation: String?,
    val companyName: String?,
    // The sheet's own attendance figures (not the app's punch ledger).
    val present: Double,
    val absent: Double,
    val halfDay: Double,
    val weeklyOff: Double,
    val totalDaysWorked: Double,
    val finalWorkingDays: Double,
    // The pay ladder, top to net.
    val monthlyCtc: Double,
    val payableAfterLeave: Double,
    val pt: Double,
    val payableAfterPt: Double,
    val advance: Double,
    val previousPending: Double,
    val finalPayment: Double,
    val remarks: String?,
    val mananRemarks: String?,
)

@Immutable
data class SalaryState(
    val ownerName: String,
    /** Newest month first, exactly as the server ordered them. */
    val months: ImmutableList<SalaryMonth>,
)

private fun SalaryMonthDto.toDomain(): SalaryMonth = SalaryMonth(
    month = month,
    monthLabel = monthLabel,
    designation = designation,
    companyName = companyName,
    present = present,
    absent = absent,
    halfDay = halfDay,
    weeklyOff = weeklyOff,
    totalDaysWorked = totalDaysWorked,
    finalWorkingDays = finalWorkingDays,
    monthlyCtc = monthlyCtc,
    payableAfterLeave = payableAfterLeave,
    pt = pt,
    payableAfterPt = payableAfterPt,
    advance = advance,
    previousPending = previousPending,
    finalPayment = finalPayment,
    remarks = remarks,
    mananRemarks = mananRemarks,
)

fun SalaryDto.toDomain(): SalaryState = SalaryState(
    ownerName = ownerName,
    months = months.map { it.toDomain() }.toImmutableList(),
)
