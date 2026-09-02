package com.altuscorp.altus.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room-as-truth read cache: ONE keyed table of last-good response snapshots.
 *
 * Every screen paints instantly from its snapshot (skeletons only on a true
 * cold cache), then reconciles with the network. Snapshots are stored as the
 * response DTO's [com.altuscorp.altus.core.network.ApiJson] encoding — the
 * repository decodes with the same lenient Json it uses for the wire, so a
 * cached body can never be *more* fragile than a live one. A generic table
 * (instead of one entity per screen) means adding a module never needs a
 * schema migration — new screens just mint a new [CacheKeys] key.
 */
@Entity(tableName = "cache_entries")
data class CacheEntryEntity(
    /** One of [CacheKeys] — the response's identity. */
    @PrimaryKey
    val cacheKey: String,
    /** The response DTO, ApiJson-encoded. */
    val json: String,
    /** When this snapshot was fetched, epoch millis (staleness display). */
    val fetchedAtEpochMs: Long,
)

/**
 * The full vocabulary of cache keys. Repositories MUST build keys through
 * these helpers — never inline strings — so a key typo is a compile error,
 * not a permanently-cold screen.
 */
object CacheKeys {
    /** GET /me → MeDto. */
    const val ME = "me"

    /** GET /dashboard → DashboardDto (Today strips). */
    const val DASHBOARD = "dashboard"

    /** GET /attendance → AttendanceDto (punch ledger + history). */
    const val ATTENDANCE = "attendance"

    /** GET /tasks → TaskListResponseDto. */
    const val TASK_LIST = "tasks"

    /** GET /tasks/kanban -> KanbanResponseDto (owner-scoped status board). */
    const val TASK_KANBAN = "tasks_kanban"

    /** GET /plan → PlanDto (Plan Your Day). */
    const val PLAN = "plan"

    /** GET /daily-checklist → DailyChecklistDto (WMS Daily Checklist page). */
    const val DAILY_CHECKLIST = "daily_checklist"

    /** GET /weekly-goals/fill → WeeklyGoalsFillDto. */
    const val WEEKLY_GOALS_FILL = "weekly_goals_fill"

    /** GET /notifications (first page) → NotificationsDto. */
    const val NOTIFICATIONS = "notifications"

    /** GET /task-form → TaskFormDto (new-task pick-lists). */
    const val TASK_FORM = "task_form"

    /** GET /salary → SalaryDto (the signed-in user's own payslip history). */
    const val SALARY = "salary"

    /** GET /overtime → OvertimeDto (the signed-in user's own overtime ledger). */
    const val OVERTIME = "overtime"

    /** GET /training → TrainingDto (material library + the viewer's induction path). */
    const val TRAINING = "training"

    /** GET /performance → PerformanceDto (own PMS score). */
    const val PERFORMANCE = "performance"

    /** GET /signals → SignalsDto (own recognition + promotion-signal feed). */
    const val SIGNALS = "signals"

    /** GET /projects → ProjectsDto (WMS projects overview). */
    const val PROJECTS = "projects"

    /** GET /accounts → AccountsDto (Admin · Accounts section registry). */
    const val ACCOUNTS = "accounts"

    /** GET /accounts/due-dates → AccountsDueDto (Due Dates Checklist). */
    const val ACCOUNTS_DUE = "accounts_due"

    /** GET /outstanding → OutstandingDto (Sales receivables dashboard). */
    const val OUTSTANDING = "outstanding"

    /** GET /people-gives → PeopleGivesDto (Sales referral network). */
    const val PEOPLE_GIVES = "people_gives"

    /** GET /ambassadors → AmbassadorsDto (Sales Partner Intelligence). */
    const val AMBASSADORS = "ambassadors"

    /** GET /team/performance → TeamPerformanceDto (WMS · Team performance). */
    const val TEAM_PERFORMANCE = "team_performance"

    /** GET /tasks/{id} → TaskDetailResponseDto. */
    fun taskDetail(taskId: String): String = "task:$taskId"

    /** GET /dcc?date= → DccDto for one board day (`yyyy-MM-dd`). */
    fun dcc(dayKey: String): String = "dcc:$dayKey"

    /** GET /incentive?year= -> IncentiveDto for one calendar year. */
    fun incentive(year: Int): String = "incentive:$year"

    /** GET /reimbursements?view= → ReimbursementsDto for one shelf ("active" | "archived"). */
    fun reimbursements(view: String): String = "reimbursements:$view"

    /** GET /hr-record?month= → HrRecordDto for one month bucket ("latest" = newest). */
    fun hrRecord(monthKey: String): String = "hr_record:$monthKey"

    /** GET /weekly-goals/board?week= → WeeklyGoalsBoardDto for one week (`yyyy-MM-dd` Monday). */
    fun weeklyGoalsBoard(weekKey: String): String = "weekly_goals_board:$weekKey"
}
