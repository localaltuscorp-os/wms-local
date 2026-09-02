package com.altuscorp.altus.core.network

import com.altuscorp.altus.data.remote.dto.AddPlanItemRequestDto
import com.altuscorp.altus.data.remote.dto.AccountsDto
import com.altuscorp.altus.data.remote.dto.AccountsDueDto
import com.altuscorp.altus.data.remote.dto.AccountsSectionDetailDto
import com.altuscorp.altus.data.remote.dto.AmbassadorsDto
import com.altuscorp.altus.data.remote.dto.IndexHubDto
import com.altuscorp.altus.data.remote.dto.ModuleFormDto
import com.altuscorp.altus.data.remote.dto.ModuleSubmitBody
import com.altuscorp.altus.data.remote.dto.ModuleSubmitResult
import com.altuscorp.altus.data.remote.dto.AttendanceDashboardDto
import com.altuscorp.altus.data.remote.dto.AttendanceDto
import com.altuscorp.altus.data.remote.dto.CommentRequestDto
import com.altuscorp.altus.data.remote.dto.CreateTaskRequestDto
import com.altuscorp.altus.data.remote.dto.CreateTaskResponseDto
import com.altuscorp.altus.data.remote.dto.DailyChecklistActionRequestDto
import com.altuscorp.altus.data.remote.dto.DailyChecklistDto
import com.altuscorp.altus.data.remote.dto.DashboardDto
import com.altuscorp.altus.data.remote.dto.DccDto
import com.altuscorp.altus.data.remote.dto.DccEntryRequestDto
import com.altuscorp.altus.data.remote.dto.DccParticipantsRequestDto
import com.altuscorp.altus.data.remote.dto.KanbanResponseDto
import com.altuscorp.altus.data.remote.dto.GoalActualRequestDto
import com.altuscorp.altus.data.remote.dto.HrRecordDto
import com.altuscorp.altus.data.remote.dto.IncentiveDto
import com.altuscorp.altus.data.remote.dto.MarkReadRequestDto
import com.altuscorp.altus.data.remote.dto.MeDto
import com.altuscorp.altus.data.remote.dto.NotificationsDto
import com.altuscorp.altus.data.remote.dto.OkDto
import com.altuscorp.altus.data.remote.dto.OutstandingDto
import com.altuscorp.altus.data.remote.dto.OvertimeDto
import com.altuscorp.altus.data.remote.dto.PeopleGivesDto
import com.altuscorp.altus.data.remote.dto.ReimbursementsDto
import com.altuscorp.altus.data.remote.dto.PerformanceDto
import com.altuscorp.altus.data.remote.dto.PlanDto
import com.altuscorp.altus.data.remote.dto.PlanMutationResponseDto
import com.altuscorp.altus.data.remote.dto.ProjectsDto
import com.altuscorp.altus.data.remote.dto.PunchRequestDto
import com.altuscorp.altus.data.remote.dto.PunchResponseDto
import com.altuscorp.altus.data.remote.dto.RegisterPushRequestDto
import com.altuscorp.altus.data.remote.dto.Review360Dto
import com.altuscorp.altus.data.remote.dto.SalaryDto
import com.altuscorp.altus.data.remote.dto.SignalsDto
import com.altuscorp.altus.data.remote.dto.StatusChangeRequestDto
import com.altuscorp.altus.data.remote.dto.StatusChangeResponseDto
import com.altuscorp.altus.data.remote.dto.StorageSignRequestDto
import com.altuscorp.altus.data.remote.dto.StorageSignResponseDto
import com.altuscorp.altus.data.remote.dto.TaskDetailResponseDto
import com.altuscorp.altus.data.remote.dto.TaskFormDto
import com.altuscorp.altus.data.remote.dto.TaskListResponseDto
import com.altuscorp.altus.data.remote.dto.TeamPerformanceDto
import com.altuscorp.altus.data.remote.dto.TrainingDto
import com.altuscorp.altus.data.remote.dto.UnregisterPushRequestDto
import com.altuscorp.altus.data.remote.dto.TeamDashboardDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsBoardDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsDashboardDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsFillDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsFillRequestDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The complete typed surface of `/api/mobile/...`. Auth is the Firebase Bearer
 * injected by [AuthInterceptor]; every call is wrapped in [safeApiCall] by the
 * repositories, so methods declare only the happy-path DTO and let non-2xx
 * flow out as HttpException.
 *
 * Live endpoints are verified against the actual route.ts files. The four NEW
 * endpoint groups (plan, weekly-goals/fill, notifications, storage/sign) are
 * declared per the canonical spec S4/S8/S10 + the architecture's backend asks;
 * ship the features behind flags until the server lands them (P0 punch-list).
 */
interface AltusApi {

    // ── Identity ─────────────────────────────────────────────────────────────

    /** Who am I / am I enrolled (S1 post-login gate). */
    @GET("api/mobile/me")
    suspend fun me(): MeDto

    // ── Today ────────────────────────────────────────────────────────────────

    /** Today screen: greeting, punches, task pressure, goals gate (S2). */
    @GET("api/mobile/dashboard")
    suspend fun dashboard(): DashboardDto

    // ── Attendance ───────────────────────────────────────────────────────────

    /** Punch-screen state + 14-day history + geofence + device trust (S3). */
    @GET("api/mobile/attendance")
    suspend fun attendance(): AttendanceDto

    /** Admin "Att Report": the org-wide monthly attendance summary. */
    @GET("api/mobile/attendance/dashboard")
    suspend fun attendanceDashboard(
        @Query("year") year: Int? = null,
        @Query("month") month: Int? = null,
    ): AttendanceDashboardDto

    /** Biometric check-in / check-out. 409s carry the WMS gate machine. */
    @POST("api/mobile/attendance/punch")
    suspend fun punch(@Body body: PunchRequestDto): PunchResponseDto

    /**
     * The signed-in user's read-only HR "Attendance log" sheet mirror for one
     * month (Employees workspace). [month] is `YYYY-MM`; null = newest month.
     */
    @GET("api/mobile/hr-record")
    suspend fun hrRecord(@Query("month") month: String? = null): HrRecordDto

    // ── Tasks ────────────────────────────────────────────────────────────────

    /** My tasks as doer, pending-first, with statusDisplay + transitions (S6). */
    @GET("api/mobile/tasks")
    suspend fun tasks(): TaskListResponseDto

    /** My tasks grouped into the status board columns (WMS Kanban, read-only). */
    @GET("api/mobile/tasks/kanban")
    suspend fun kanban(): KanbanResponseDto

    /** Create a task (S6 New Task). */
    @POST("api/mobile/tasks")
    suspend fun createTask(@Body body: CreateTaskRequestDto): CreateTaskResponseDto

    /** Full detail + timeline + canComment (S7). 403 forbidden for strangers. */
    @GET("api/mobile/tasks/{id}")
    suspend fun taskDetail(@Path("id") id: String): TaskDetailResponseDto

    /** Status change with optimistic lock — 409 `stale` on conflict. */
    @POST("api/mobile/tasks/{id}/status")
    suspend fun changeTaskStatus(
        @Path("id") id: String,
        @Body body: StatusChangeRequestDto,
    ): StatusChangeResponseDto

    /** Add a comment (S7 composer). */
    @POST("api/mobile/tasks/{id}/comment")
    suspend fun addTaskComment(
        @Path("id") id: String,
        @Body body: CommentRequestDto,
    ): OkDto

    /** New-task pick-lists: employees, subjects, clients, priorities. */
    @GET("api/mobile/task-form")
    suspend fun taskForm(): TaskFormDto

    // ── Team (WMS · Team performance) ────────────────────────────────────────

    /** The A-to-Z scoped roster + live per-member performance snapshot. */
    @GET("api/mobile/team/performance")
    suspend fun teamPerformance(): TeamPerformanceDto

    // ── DCC ──────────────────────────────────────────────────────────────────

    /** The DCC board for a date (default: today in the user's timezone) (S5). */
    @GET("api/mobile/dcc")
    suspend fun dcc(@Query("date") date: String? = null): DccDto

    /** Fill or clear one KPI slot (tri-state commit / numeric sheet). */
    @POST("api/mobile/dcc/entry")
    suspend fun dccEntry(@Body body: DccEntryRequestDto): OkDto

    /** Bulk-set every participant of a participant-list KPI (roster wave). */
    @POST("api/mobile/dcc/participants")
    suspend fun dccParticipants(@Body body: DccParticipantsRequestDto): OkDto

    // ── Projects (WMS workspace) ─────────────────────────────────────────────

    /** Projects overview: per-project structure counts + a completion meter. */
    @GET("api/mobile/projects")
    suspend fun projects(): ProjectsDto

    // ── Accounts (Admin workspace) ───────────────────────────────────────────

    /** The Accounts module front door: the ordered section registry + roll-up. */
    @GET("api/mobile/accounts")
    suspend fun accounts(): AccountsDto

    /** The "Due Dates Checklist" section: recurring bills & statutory items. */
    @GET("api/mobile/accounts/due-dates")
    suspend fun accountsDueDates(): AccountsDueDto

    /** A normalized register section (Vasa · Shares · IT · SIP · Bank). */
    @GET("api/mobile/accounts/section/{slug}")
    suspend fun accountsSection(@Path("slug") slug: String): AccountsSectionDetailDto

    /** A normalized cross-module record section (training, etc.). Same shape. */
    @GET("api/mobile/section/{slug}")
    suspend fun moduleSection(@Path("slug") slug: String): AccountsSectionDetailDto

    // ── Outstanding (Sales workspace) ────────────────────────────────────────

    /** The Sales receivables dashboard: totals, buckets, roll-ups + ledgers. */
    @GET("api/mobile/outstanding")
    suspend fun outstanding(): OutstandingDto

    // ── People Gives (Sales workspace) ───────────────────────────────────────

    /** The People Gives referral network: every logged introduction, newest first. */
    @GET("api/mobile/people-gives")
    suspend fun peopleGives(): PeopleGivesDto

    // ── Index Hub (Marketing workspace) ──────────────────────────────────────

    /** Curated campaign / reach / lead-gen link directory, grouped by section. */
    @GET("api/mobile/index-hub")
    suspend fun indexHub(): IndexHubDto

    // ── Ambassadors (Sales workspace) ────────────────────────────────────────

    /** Partner Intelligence: executive KPIs + pipeline funnel + partner registry. */
    @GET("api/mobile/ambassadors")
    suspend fun ambassadors(): AmbassadorsDto

    /** Form-driven Sales module (reference / breakthrough): schema + own entries. */
    @GET("api/mobile/module/{key}")
    suspend fun moduleForm(@Path("key") key: String): ModuleFormDto

    /** Submit a new entry to a form-driven Sales module. */
    @POST("api/mobile/module/{key}")
    suspend fun submitModule(
        @Path("key") key: String,
        @Body body: ModuleSubmitBody,
    ): ModuleSubmitResult

    // ── Salary (Employees workspace) ─────────────────────────────────────────

    /** The signed-in user's own payslip history — net pay + breakdown + months. */
    @GET("api/mobile/salary")
    suspend fun salary(): SalaryDto

    // -- Incentive (Employees workspace) --
    /** The signed-in user's own incentive analytics for a year (default: now). */
    @GET("api/mobile/incentive")
    suspend fun incentive(@Query("year") year: Int? = null): IncentiveDto

    // ── Overtime (Employees workspace) ─────────────────────────────────────────
    /** The signed-in user's own overtime ledger + KPI roll-up (read-only). */
    @GET("api/mobile/overtime")
    suspend fun overtime(): OvertimeDto

    // ── Training Centre (Training workspace) ───────────────────────────────────
    /** The material library (with the viewer's watched flag) + the viewer's own
     *  personalised induction path (read-only). */
    @GET("api/mobile/training")
    suspend fun training(): TrainingDto

    // ── Reimbursements (Employees workspace) ───────────────────────────────────
    /** The signed-in user's own reimbursement claims + KPIs (default: active). */
    @GET("api/mobile/reimbursements")
    suspend fun reimbursements(@Query("view") view: String? = null): ReimbursementsDto

    // ── Employees · Monthly 360 ──────────────────────────────────────────────

    /** The signed-in user's 360 review roster + prior ratings + personal goals. */
    @GET("api/mobile/review-360")
    suspend fun review360(): Review360Dto

    // ── Performance (PMS) ──────────────────────────────────────────────────────

    /** The signed-in user's own 5-pillar PMS score summary (Employees). */
    @GET("api/mobile/performance")
    suspend fun performance(): PerformanceDto

    // ── Signals (Employees · PMS recognition & promotion feed) ─────────────────

    /** The signed-in user's OWN recognition + promotion-signal feed (read-only). */
    @GET("api/mobile/signals")
    suspend fun signals(): SignalsDto

    // ── Push ─────────────────────────────────────────────────────────────────

    /** Register this device's FCM token (on login + onNewToken). */
    @POST("api/mobile/register-push")
    suspend fun registerPush(@Body body: RegisterPushRequestDto): OkDto

    /** Unregister on sign-out. Retrofit needs @HTTP for DELETE-with-body. */
    @HTTP(method = "DELETE", path = "api/mobile/register-push", hasBody = true)
    suspend fun unregisterPush(@Body body: UnregisterPushRequestDto): OkDto

    // ── NEW: Plan Your Day (S4 — server endpoint pending, P0) ────────────────

    /** Today's plan: items, meter, pullable goals, planner goals, rollovers. */
    @GET("api/mobile/plan")
    suspend fun plan(): PlanDto

    /** Add one commitment (ad-hoc title / taskId / goalId). */
    @POST("api/mobile/plan/item")
    suspend fun addPlanItem(@Body body: AddPlanItemRequestDto): PlanMutationResponseDto

    /** Log today's %Done on one weekly goal (the detent slider). */
    @POST("api/mobile/plan/goal-actual")
    suspend fun logGoalActual(@Body body: GoalActualRequestDto): PlanMutationResponseDto

    // ── Daily Checklist (web parity: app/(app)/daily-checklist/page.tsx) ─────

    /** Today's committed items (assigned + personal), overdue carry-overs, pullable goals. */
    @GET("api/mobile/daily-checklist")
    suspend fun dailyChecklist(): DailyChecklistDto

    /** One action-discriminated mutation (add/close/remove/carryForward/taskDone) → the fresh board. */
    @POST("api/mobile/daily-checklist")
    suspend fun dailyChecklistAction(@Body body: DailyChecklistActionRequestDto): DailyChecklistDto

    // ── NEW: Weekly Goals fill (S8 — server endpoint pending, P0) ────────────

    /** The current week's unfilled goals for the fill gate. */
    @GET("api/mobile/weekly-goals/fill")
    suspend fun weeklyGoalsFill(): WeeklyGoalsFillDto

    /**
     * The signed-in user's own weekly-goals BOARD for one week (read-only).
     * [week] (`YYYY-MM-DD`, any day in the week) selects the Monday→Sunday
     * window; null = the current week.
     */
    @GET("api/mobile/weekly-goals/board")
    suspend fun weeklyGoalsBoard(@Query("week") week: String? = null): WeeklyGoalsBoardDto

    /** The team weekly-score overview (admins: everyone; else: own score). */
    @GET("api/mobile/weekly-goals/dashboard")
    suspend fun weeklyGoalsDashboard(): WeeklyGoalsDashboardDto

    /** A normalized admin team dashboard (overtime · reimbursements). */
    @GET("api/mobile/team-dashboard/{type}")
    suspend fun teamDashboard(@Path("type") type: String): TeamDashboardDto

    /** Submit fills; clears the Mon/Thu weeklyGoalsGate. */
    @POST("api/mobile/weekly-goals/fill")
    suspend fun submitWeeklyGoalsFill(@Body body: WeeklyGoalsFillRequestDto): OkDto

    // ── NEW: Inbox (S10 — server endpoint pending, P1) ───────────────────────

    /** Cursor-paged inbox, newest first, with the unread badge count. */
    @GET("api/mobile/notifications")
    suspend fun notifications(
        @Query("before") before: String? = null,
        @Query("limit") limit: Int? = null,
    ): NotificationsDto

    /** Mark one (`id`) or all (`all=true`) notifications read. */
    @POST("api/mobile/notifications/read")
    suspend fun markNotificationsRead(@Body body: MarkReadRequestDto): OkDto

    // ── NEW: Storage signing (media — server endpoint pending, P0) ───────────

    /** Mint a short-lived signed upload/download URL (avatars/documents). */
    @POST("api/mobile/storage/sign")
    suspend fun signStorage(@Body body: StorageSignRequestDto): StorageSignResponseDto
}
