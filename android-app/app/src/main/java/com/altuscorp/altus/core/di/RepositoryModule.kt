package com.altuscorp.altus.core.di

import com.altuscorp.altus.data.repository.AmbassadorsRepository
import com.altuscorp.altus.data.repository.AmbassadorsRepositoryImpl
import com.altuscorp.altus.data.repository.AttendanceReportRepository
import com.altuscorp.altus.data.repository.AttendanceReportRepositoryImpl
import com.altuscorp.altus.data.repository.IndexHubRepository
import com.altuscorp.altus.data.repository.IndexHubRepositoryImpl
import com.altuscorp.altus.data.repository.TeamDashboardRepository
import com.altuscorp.altus.data.repository.TeamDashboardRepositoryImpl
import com.altuscorp.altus.data.repository.ModuleFormRepository
import com.altuscorp.altus.data.repository.ModuleFormRepositoryImpl
import com.altuscorp.altus.data.repository.AttendanceRepository
import com.altuscorp.altus.data.repository.AttendanceRepositoryImpl
import com.altuscorp.altus.data.repository.AuthRepository
import com.altuscorp.altus.data.repository.AuthRepositoryImpl
import com.altuscorp.altus.data.repository.DashboardRepository
import com.altuscorp.altus.data.repository.DashboardRepositoryImpl
import com.altuscorp.altus.data.repository.DailyChecklistRepository
import com.altuscorp.altus.data.repository.DailyChecklistRepositoryImpl
import com.altuscorp.altus.data.repository.DayRepository
import com.altuscorp.altus.data.repository.DayRepositoryImpl
import com.altuscorp.altus.data.repository.KanbanRepository
import com.altuscorp.altus.data.repository.KanbanRepositoryImpl
import com.altuscorp.altus.data.repository.DccRepository
import com.altuscorp.altus.data.repository.DccRepositoryImpl
import com.altuscorp.altus.data.repository.GoalsRepository
import com.altuscorp.altus.data.repository.GoalsRepositoryImpl
import com.altuscorp.altus.data.repository.IncentiveRepository
import com.altuscorp.altus.data.repository.IncentiveRepositoryImpl
import com.altuscorp.altus.data.repository.HrRecordRepository
import com.altuscorp.altus.data.repository.HrRecordRepositoryImpl
import com.altuscorp.altus.data.repository.NotificationRepository
import com.altuscorp.altus.data.repository.NotificationRepositoryImpl
import com.altuscorp.altus.data.repository.AccountsRepository
import com.altuscorp.altus.data.repository.AccountsRepositoryImpl
import com.altuscorp.altus.data.repository.OutstandingRepository
import com.altuscorp.altus.data.repository.OutstandingRepositoryImpl
import com.altuscorp.altus.data.repository.OvertimeRepository
import com.altuscorp.altus.data.repository.OvertimeRepositoryImpl
import com.altuscorp.altus.data.repository.PerformanceRepository
import com.altuscorp.altus.data.repository.PerformanceRepositoryImpl
import com.altuscorp.altus.data.repository.PlanRepository
import com.altuscorp.altus.data.repository.PlanRepositoryImpl
import com.altuscorp.altus.data.repository.PeopleGivesRepository
import com.altuscorp.altus.data.repository.PeopleGivesRepositoryImpl
import com.altuscorp.altus.data.repository.ProjectsRepository
import com.altuscorp.altus.data.repository.ProjectsRepositoryImpl
import com.altuscorp.altus.data.repository.ReimbursementsRepository
import com.altuscorp.altus.data.repository.ReimbursementsRepositoryImpl
import com.altuscorp.altus.data.repository.Review360Repository
import com.altuscorp.altus.data.repository.Review360RepositoryImpl
import com.altuscorp.altus.data.repository.SalaryRepository
import com.altuscorp.altus.data.repository.SalaryRepositoryImpl
import com.altuscorp.altus.data.repository.SignalsRepository
import com.altuscorp.altus.data.repository.SignalsRepositoryImpl
import com.altuscorp.altus.data.repository.TaskRepository
import com.altuscorp.altus.data.repository.TaskRepositoryImpl
import com.altuscorp.altus.data.repository.TeamRepository
import com.altuscorp.altus.data.repository.TeamRepositoryImpl
import com.altuscorp.altus.data.repository.TrainingRepository
import com.altuscorp.altus.data.repository.TrainingRepositoryImpl
import com.altuscorp.altus.data.repository.WeeklyGoalsBoardRepository
import com.altuscorp.altus.data.repository.WeeklyGoalsBoardRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Interface→implementation bindings for the repository layer
 * (`data.repository`). Every repository is an interface (ViewModels depend on
 * the abstraction; tests bind fakes) with a single `*Impl` bound here as
 * `@Singleton` — repositories hold hot flows (cache observation, Realtime
 * merge) that must be shared across screens, not duplicated per ViewModel.
 *
 * Contract with the repository layer: each file `data/repository/X.kt`
 * declares `interface XRepository` + `class XRepositoryImpl @Inject
 * constructor(…)`.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    /** Sign-in / biometric unlock / enrollment + push register-unregister. */
    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    /** Today data: cache-first read + reconcile. */
    @Binds
    @Singleton
    abstract fun bindDashboardRepository(impl: DashboardRepositoryImpl): DashboardRepository

    /** Attendance state/history + the ONLINE-ONLY punch + gate parsing. */
    @Binds
    @Singleton
    abstract fun bindAttendanceRepository(impl: AttendanceRepositoryImpl): AttendanceRepository

    /** Admin org-wide monthly attendance report (Att Report). */
    @Binds
    @Singleton
    abstract fun bindAttendanceReportRepository(impl: AttendanceReportRepositoryImpl): AttendanceReportRepository

    /** Form-driven Sales modules (Record a Reference · Participant Breakthrough). */
    @Binds
    @Singleton
    abstract fun bindModuleFormRepository(impl: ModuleFormRepositoryImpl): ModuleFormRepository

    /** Marketing "Index Hub" link directory. */
    @Binds
    @Singleton
    abstract fun bindIndexHubRepository(impl: IndexHubRepositoryImpl): IndexHubRepository

    /** Admin team dashboards (overtime · reimbursements). */
    @Binds
    @Singleton
    abstract fun bindTeamDashboardRepository(impl: TeamDashboardRepositoryImpl): TeamDashboardRepository

    /** Read-only HR "Attendance log" sheet mirror for the signed-in user. */
    @Binds
    @Singleton
    abstract fun bindHrRecordRepository(impl: HrRecordRepositoryImpl): HrRecordRepository

    /** The signed-in user's own payslip history (read-only, cache-first). */
    @Binds
    @Singleton
    abstract fun bindSalaryRepository(impl: SalaryRepositoryImpl): SalaryRepository

    /** Task list/detail/create + optimistic status/comment via the outbox. */
    @Binds
    @Singleton
    abstract fun bindTaskRepository(impl: TaskRepositoryImpl): TaskRepository

    /** WMS · Team performance (roster + live per-member snapshot): read-only, cache-first. */
    @Binds
    @Singleton
    abstract fun bindTeamRepository(impl: TeamRepositoryImpl): TeamRepository

    /** DCC board read + optimistic entry/participant commits. */
    @Binds
    @Singleton
    abstract fun bindDccRepository(impl: DccRepositoryImpl): DccRepository

    /** Incentive analytics (Employees): cache-first per-year read + reconcile. */
    @Binds
    @Singleton
    abstract fun bindIncentiveRepository(impl: IncentiveRepositoryImpl): IncentiveRepository

    /** Reimbursement claims (Employees): cache-first per-shelf read + reconcile. */
    @Binds
    @Singleton
    abstract fun bindReimbursementsRepository(
        impl: ReimbursementsRepositoryImpl,
    ): ReimbursementsRepository

    /** Overtime ledger (Employees): cache-first owner-scoped read + reconcile. */
    @Binds
    @Singleton
    abstract fun bindOvertimeRepository(impl: OvertimeRepositoryImpl): OvertimeRepository

    /** WMS Projects overview: cache-first read + reconcile (read-only). */
    @Binds
    @Singleton
    abstract fun bindProjectsRepository(impl: ProjectsRepositoryImpl): ProjectsRepository

    /** Admin · Accounts section registry: cache-first read + reconcile (read-only). */
    @Binds
    @Singleton
    abstract fun bindAccountsRepository(impl: AccountsRepositoryImpl): AccountsRepository

    /** Sales Outstanding receivables dashboard: cache-first read + reconcile. */
    @Binds
    @Singleton
    abstract fun bindOutstandingRepository(impl: OutstandingRepositoryImpl): OutstandingRepository

    /** Sales Ambassadors partner-intelligence dashboard: cache-first read + reconcile. */
    @Binds
    @Singleton
    abstract fun bindAmbassadorsRepository(impl: AmbassadorsRepositoryImpl): AmbassadorsRepository

    /** Sales People Gives referral network: cache-first read + reconcile (read-only). */
    @Binds
    @Singleton
    abstract fun bindPeopleGivesRepository(impl: PeopleGivesRepositoryImpl): PeopleGivesRepository

    /** Plan Your Day read + item/goal-actual commits. */
    @Binds
    @Singleton
    abstract fun bindPlanRepository(impl: PlanRepositoryImpl): PlanRepository

    /** Own PMS score (Employees) — read-only cache-first + reconcile. */
    @Binds
    @Singleton
    abstract fun bindPerformanceRepository(impl: PerformanceRepositoryImpl): PerformanceRepository

    /** Own recognition + promotion-signal feed (Employees) — read-only cache-first. */
    @Binds
    @Singleton
    abstract fun bindSignalsRepository(impl: SignalsRepositoryImpl): SignalsRepository

    /** Weekly-goals fill list + submit. */
    @Binds
    @Singleton
    abstract fun bindGoalsRepository(impl: GoalsRepositoryImpl): GoalsRepository

    /** Weekly-goals board (read-only) per week. */
    @Binds
    @Singleton
    abstract fun bindWeeklyGoalsBoardRepository(
        impl: WeeklyGoalsBoardRepositoryImpl,
    ): WeeklyGoalsBoardRepository

    /** Employees · Monthly 360 read-only roster + prior ratings + personal goals. */
    @Binds
    @Singleton
    abstract fun bindReview360Repository(impl: Review360RepositoryImpl): Review360Repository

    /** Inbox list + unread count + mark-read. */
    @Binds
    @Singleton
    abstract fun bindNotificationRepository(impl: NotificationRepositoryImpl): NotificationRepository

    /** Assembles the single DayRingState for Ring / Strip / Punch. */
    @Binds
    @Singleton
    abstract fun bindDayRepository(impl: DayRepositoryImpl): DayRepository

    /** WMS Kanban board: owner-scoped status columns, read-only. */
    @Binds
    @Singleton
    abstract fun bindKanbanRepository(impl: KanbanRepositoryImpl): KanbanRepository

    /** Training Centre (Training): cache-first material library + induction path. */
    @Binds
    @Singleton
    abstract fun bindTrainingRepository(impl: TrainingRepositoryImpl): TrainingRepository

    /** WMS Daily Checklist: cache-first board read + add/close/remove/carry-forward commits. */
    @Binds
    @Singleton
    abstract fun bindDailyChecklistRepository(impl: DailyChecklistRepositoryImpl): DailyChecklistRepository
}
