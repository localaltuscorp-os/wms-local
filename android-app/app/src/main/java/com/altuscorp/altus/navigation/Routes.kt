package com.altuscorp.altus.navigation

import kotlinx.serialization.Serializable

/**
 * altus:// deep-link vocabulary. Every FCM payload carries exactly one of
 * these; the manifest's VIEW intent filter declares the matching hosts.
 *
 * `*_BASE` values are `navDeepLink<T>(basePath = …)` bases — navigation
 * appends the route's path/query args ({id}, ?date=) automatically.
 */
object DeepLinks {
    const val SCHEME = "altus"

    /** altus://task/{id} → [TaskDetailRoute] */
    const val TASK_BASE = "altus://task"

    /** altus://punch → [PunchRoute] */
    const val PUNCH = "altus://punch"

    /** altus://dcc?date=YYYY-MM-DD → [DccRoute] */
    const val DCC_BASE = "altus://dcc"

    /** altus://goals-fill → [GoalsFillRoute] */
    const val GOALS_FILL = "altus://goals-fill"

    /** altus://inbox → [InboxRoute] */
    const val INBOX = "altus://inbox"
}

// ─── Auth (outside the tab graphs) ──────────────────────────────────────────

/** S1 login: deep canvas + rising panel; also the biometric returning-user path. */
@Serializable
data object LoginRoute

/**
 * S1 enrollment gate. [kind] is the server's 403 reason:
 * [EnrollmentGateRoute.KIND_NOT_ENROLLED] or [EnrollmentGateRoute.KIND_DEACTIVATED].
 */
@Serializable
data class EnrollmentGateRoute(val kind: String) {
    companion object {
        const val KIND_NOT_ENROLLED = "not-enrolled"
        const val KIND_DEACTIVATED = "deactivated"
    }
}

/**
 * THE UNIFIED DAILY GATE — the post-login wall (outside the tab graphs, so no
 * bottom bar). Shown after a successful sign-in / enrollment and BEFORE the tab
 * app; enters the app ([TodayGraph]) once both morning rituals clear, or
 * immediately on fail-open. Mirrors the web layout's gate chain in
 * `app/(app)/layout.tsx` (`needsDailyPlan` → DCC `dccGateTarget`).
 */
@Serializable
data object DailyGateRoute

// ─── Tab graphs (state-preserving bottom destinations) ──────────────────────

@Serializable
data object HubGraph

@Serializable
data object TodayGraph

@Serializable
data object TasksGraph

@Serializable
data object FillGraph

@Serializable
data object YouGraph

// ─── Today stack: Today → Punch → PlanYourDay → GoalsFill →
//     AttendanceHistory → Inbox ────────────────────────────────────────────

/** S2 — the paced ledger. */
@Serializable
data object TodayRoute

/** S3 — full-screen punch modal (sheet-rise entrance, drag-dismiss). */
@Serializable
data object PunchRoute

/** S4 — Plan Your Day (clears the needsPlan clock-in gate). */
@Serializable
data object PlanYourDayRoute

/** Weekly-goals fill (clears the Mon/Thu needsGoals gate). */
@Serializable
data object GoalsFillRoute

/** The workspace hub / home tab — mirrors the web `/hub` front door. */
@Serializable
data object HubRoute

/**
 * A per-workspace module list (the landing for workspaces without a native
 * module screen yet). [workspace] is the workspace slug ("sales", "admin", …).
 */
@Serializable
data class WorkspaceRoute(val workspace: String)

/**
 * WMS workspace SHELL — the landing the WMS hub card drops onto (Dashboard
 * selected). Hosts the eight WMS pages over the bottom pill-bar (mirrors the web
 * main-nav `wms` group); lives in the Hub graph. Other workspaces keep the
 * generic [WorkspaceRoute] module list.
 */
@Serializable
data object WmsShellRoute

/** Sales · Ambassadors — the "Partner Intelligence" dashboard (KPI roll-up +
 *  referral-pipeline funnel + score-ranked partner registry). Reached from the
 *  Sales WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object AmbassadorsRoute

/** WMS module — projects list + completion (read-only). Reached from the WMS
 *  WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object ProjectsRoute

/** WMS · Team agenda ("My Day") — the owner-scoped, day-bucketed task board
 *  (mobile rendition of the web `/tasks/agenda`). Reached from the WMS
 *  WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object TeamRoute

/** WMS module — the weekly-goals board (read-only per-week goal cards). Reached
 *  from the WMS WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object WeeklyGoalsBoardRoute

/** 14-day attendance history ledger. */
@Serializable
data object AttendanceHistoryRoute

/** Admin · Accounts — the read-only Accounts front door (the section registry:
 *  checklists, compliance trackers & master registers). Reached from the Accounts
 *  WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object AccountsRoute

/** Admin · Accounts → Due Dates Checklist (read-only). Reached from the Accounts
 *  front-door section list. */
@Serializable
data object AccountsDueDatesRoute

/** A normalized record section rendered by the shared section screen. Default
 *  [api] "accounts" hits the Accounts registers (Vasa · Shares · IT · SIP ·
 *  Bank); [api] "section" hits the cross-module endpoint (training, etc.).
 *  [eyebrow] labels the header band ("ADMIN · ACCOUNTS", "TRAINING", …). */
@Serializable
data class AccountsSectionRoute(
    val slug: String,
    val api: String = "accounts",
    val eyebrow: String = "ADMIN · ACCOUNTS",
)

/** Employees · Att Report — the admin org-wide monthly attendance summary.
 *  Reached from the Employees WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object AttReportRoute

/** Sales · form-driven module (Record a Reference / Participant Breakthrough).
 *  [key] is the module key ("reference" | "breakthrough"). Reached from the Sales
 *  WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data class ModuleFormRoute(val key: String)

/** Marketing · Index Hub — the curated campaign/lead-gen link directory. */
@Serializable
data object IndexHubRoute

/** WMS · Weekly Goals dashboard — team weekly-score overview (admin analytics). */
@Serializable
data object WgDashboardRoute

/** A normalized admin team dashboard. [type] = "overtime" | "reimbursements". */
@Serializable
data class TeamDashboardRoute(val type: String)

/** Employees · Monthly 360 — the read-only peer/subordinate review surface.
 *  Reached from the Employees WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object Review360Route

/** Employees · HR attendance record — the signed-in user's read-only mirror of
 *  the HR "Attendance log" sheet. Reached from the Employees WorkspaceScreen
 *  module list; lives in the Hub graph. */
@Serializable
data object HrRecordRoute

/** Employees · Salary — the signed-in user's own payslip (net pay + breakdown +
 *  recent months). Reached from the Employees WorkspaceScreen module list; lives
 *  in the Hub graph. */
@Serializable
data object SalaryRoute

/** Employees · Performance — the signed-in user's own 5-pillar PMS score summary.
 *  Reached from the Employees WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object PerformanceRoute

/** Employees · Signals — the signed-in user's own recognition + promotion-signal
 *  feed (the personal, read-only mirror of the admin `/pms/signals` console).
 *  Reached from the Employees WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object SignalsRoute

/** Employees · Incentive — the signed-in user's incentive analytics + requests
 *  for one year. Reached from the Employees WorkspaceScreen module list; lives
 *  in the Hub graph. */
@Serializable
data object IncentiveRoute

/** Sales · Outstanding — the receivables dashboard (totals, overdue buckets,
 *  month splits, roll-ups, PDC, collections & the two ledgers). Reached from the
 *  Sales WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object OutstandingRoute

/** Employees · Reimbursements — the signed-in user's own expense claims + KPIs
 *  (active / archived shelves). Reached from the Employees WorkspaceScreen
 *  module list; lives in the Hub graph. */
@Serializable
data object ReimbursementsRoute

/** Employees · Overtime — the signed-in user's own overtime ledger (logged hours
 *  + KPI roll-up, read-only). Reached from the Employees WorkspaceScreen module
 *  list; lives in the Hub graph. */
@Serializable
data object OvertimeRoute

/** Sales · People Gives — the referral network (who can introduce Altus to whom),
 *  read-only. Reached from the Sales WorkspaceScreen module list; lives in the
 *  Hub graph. */
@Serializable
data object PeopleGivesRoute

/** Training · Training Centre — the material library (with the viewer's watched
 *  flag) + the viewer's own personalised induction path (read-only). Reached from
 *  the Training WorkspaceScreen module list; lives in the Hub graph. */
@Serializable
data object TrainingRoute

/** S10 — notifications inbox. */
@Serializable
data object InboxRoute

// ─── Tasks stack: List → Detail → NewTask ───────────────────────────────────

/**
 * S6 task list; also the Tasks tab root. [filter] pre-selects a chip when the
 * list is opened from a Today pressure card ("pending" / "overdue" / "done").
 */
@Serializable
data class TaskListRoute(val filter: String? = null) {
    companion object {
        const val FILTER_PENDING = "pending"
        const val FILTER_OVERDUE = "overdue"
        const val FILTER_DONE = "done"
    }
}

/** S7 task detail — shared-element key `task-{id}` rides the transition. */
@Serializable
data class TaskDetailRoute(val id: String)

/** Keyboard-first new-task form. */
@Serializable
data object NewTaskRoute

/** WMS Kanban -- the owner-scoped, read-only status board (tasks grouped into
 *  status columns). Reached from the WMS WorkspaceScreen module list. */
@Serializable
data object KanbanRoute

// ─── Fill stack ──────────────────────────────────────────────────────────────

/**
 * S5 DCC fill board; the Fill tab root. [date] (YYYY-MM-DD) targets a past day
 * from the date-chip row or an altus://dcc?date= deep link; null = today.
 */
@Serializable
data class DccRoute(val date: String? = null)

// ─── You stack ───────────────────────────────────────────────────────────────

/** S9 profile / settings ledger. */
@Serializable
data object ProfileRoute
