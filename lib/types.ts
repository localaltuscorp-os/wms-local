import type { FineBucketKey } from "@/lib/transforms/aging-buckets-fine";
import type { TaskStatus, AgeBucketId, Department } from "@/db/enums";

export type ViewMode = "doer" | "initiator";

export type EisenhowerPriority =
  | "imp_urgent"
  | "imp_not_urgent"
  | "not_imp_urgent"
  | "not_imp_not_urgent";

export interface DashboardFilters {
  startDate: Date | null;
  endDate: Date | null;
  employeeIds: string[];
  view: ViewMode;
  departments: Department[];
  priorities: EisenhowerPriority[];
  subjects: string[];
  /**
   * HOW `employeeIds` was arrived at — the dashboard opens on the viewer's own
   * numbers, so "one person selected" and "nobody chose anything yet" are no
   * longer the same state and the bar has to be able to tell them apart.
   *
   *   default  — nothing in the URL; scoped to the viewer
   *   all      — `?emp=all`, the whole company, chosen deliberately
   *   specific — `?emp=<ids>`
   *
   * Optional so the existing literal constructions of this type (the diag
   * script, tests) keep compiling unchanged.
   */
  assigneeMode?: "default" | "all" | "specific";
}

export interface KpiTotals {
  total: number;
  pending: number;     // initiated + follow_up only
  notStarted: number;
  needHelp: number;
  done: number;        // done + approved
  notApproved: number;
}

/** One day of the 14-day velocity series. `date` is an ISO `YYYY-MM-DD` UTC
 *  day so the client can format the tooltip label without a second source of
 *  truth for which bar is which day. */
export interface TrendPoint {
  date: string;
  /** Tasks in this bucket CREATED that day (created_at). */
  created: number;
  /** Tasks in this bucket COMPLETED that day (completed_at). */
  completed: number;
}

/** Current window vs the one immediately before it — what the card's ▲/▼ badge
 *  reports. See computeTrendWindows for why `changePct` is nullable. */
export interface TrendWindows {
  windowDays: number;
  current: number;
  previous: number;
  /** (current − previous) / previous × 100, one decimal. Null when the
   *  previous window is empty (no percentage change from zero). */
  changePct: number | null;
}

export interface KpiWithDelta {
  /** The big number: tasks in this bucket across the ACTIVE dashboard filter. */
  current: number;
  /** Volume in the 7 days before last — the badge's baseline. NOT comparable
   *  with `current`, which spans the whole filtered range; use `window`. */
  previous: number;
  /** Volume in the last 7 days, the same measure as `previous`. */
  window: number;
  /** Percent change of `window` against `previous`, or null when previous = 0. */
  changePct: number | null;
  /** 14 daily creation counts, oldest → newest. Kept as bare numbers for the
   *  existing area-sparkline path; `trend` carries the same days with labels. */
  sparkline: number[];
  /** The 14-day created/completed series behind the hover tooltip. */
  trend: TrendPoint[];
}

export interface KpiSet {
  total: KpiWithDelta;
  pending: KpiWithDelta;
  notStarted: KpiWithDelta;
  needHelp: KpiWithDelta;
  done: KpiWithDelta;
  notApproved: KpiWithDelta;
}



/** The count columns the Status-by-Doer table renders, keyed by the field they
 *  read. Used to key the hover previews below.
 *
 *  EVERY status column is here, not just the three that used to be. The
 *  previews are what the hover popover draws, and a bucket missing from this
 *  union is a column whose non-zero cells hover dead — which is exactly what
 *  Approved, Follow Up, Need Info, Initiated, Not Started, Not Read, On Hold
 *  and Transferred did. */
export type StatusCellBucket =
  | "criticalCount"
  | "approved"
  | "notApproved"
  | "done"
  | "transferred"
  | "cancelled"
  | "followUp"
  | "needHelp"
  | "initiated"
  | "notStarted"
  | "dontKnow"
  | "onHold"
  | "pendingTotal"
  | "total";

/** One line in a status-cell hover preview. Deliberately minimal — this ships
 *  to the client for every non-zero cell, so it carries only what the popover
 *  draws. */
export interface StatusCellTask {
  id: string;
  taskNo: number | null;
  /** CLIENT NAME — the New Task form's "Client Name" writes to tasks.title.
   *  Use `description` to label a row; this is context, not the task. */
  title: string;
  description: string | null;
  client: string | null;
  subject: string | null;
  dueAt: Date | null;
}

export interface EmployeeStatusRow {
  employeeId: string;
  employeeName: string;
  /** Every department this person belongs to. One row per EMPLOYEE (not per
   *  department), so the metric columns below count each task exactly once. */
  departments: string[];
  approved: number;
  notApproved: number;
  done: number;
  transferred: number;
  cancelled: number;
  pendingTotal: number;
  needHelp: number;
  followUp: number;
  initiated: number;
  notStarted: number;
  /** "Not Read" (`dont_know`). Split out of notStarted: the table now renders a
   *  column per status, and folding two statuses into one made the Not Started
   *  column overstate itself. */
  dontKnow: number;
  /** Paused work. It had no sub-bucket and lived only inside pendingTotal, so
   *  once the Pending aggregate stopped being rendered it would have counted
   *  toward Total while appearing in no column at all. */
  onHold: number;
  total: number;
  /** tasks with priority = imp_urgent */
  criticalCount: number;
  /** Hover-preview tasks per count column, most-urgent first, capped.
   *  Built in the SAME pass as the counts (see computeEmployeeStatusTable), so
   *  a preview can never disagree with the badge above it. Absent for any
   *  bucket whose count is 0, which is what keeps the payload small. */
  previews: Partial<Record<StatusCellBucket, StatusCellTask[]>>;
}

export interface TopPerformer {
  employeeId: string;
  employeeName: string;
  doneCount: number;
  weeklySparkline: number[];
  /** 1-based position in the GLOBAL ranking (ties share the better rank) —
   *  stays honest even when the dashboard is filtered to a subset of people. */
  rank: number;
  /** Free-text department, for the row's role pill. Null when unset. */
  department: string | null;
  /** Completions finished on or before the due date. The numerator. */
  completedOnTime: number;
  /** Completions that carry BOTH a completion and a due date — the only ones
   *  that can be judged on time. The denominator, and the reason `onTimeRate`
   *  can be null while `doneCount` is high: undated work is unmeasurable, not
   *  late. Surfaced so the card can show "7 / 9 on time" and the percentage is
   *  auditable rather than a bare number the viewer has to trust. */
  datedCompletions: number;
  /** `completedOnTime / datedCompletions * 100`, 0-100. Null when
   *  `datedCompletions` is 0 — distinct from 0%, which would libel someone with
   *  no measurable work. */
  onTimeRate: number | null;
  /** Mean days from creation to completion. Null when nothing is measurable. */
  avgTurnaroundDays: number | null;
}

export interface AgingRow {
  employeeId: string;
  employeeName: string;
  buckets: Record<AgeBucketId, number>;
  total: number;
  /** Legacy free-text department, used to split the heatmap into App vs
   *  Non-App lanes. Null when the employee has none set. */
  department: string | null;
}

export interface AgingHeatmapCell {
  employeeId: string;
  bucket: AgeBucketId;
  count: number;
}

export interface AgingByDate {
  bucket: AgeBucketId;
  count: number;
}

/**
 * One pending task behind an aging-heatmap cell.
 *
 * Carries enough to render the drill-down drawer's table WITHOUT a second
 * query: the drawer opens on the same rows the lane counted, bucketed by the
 * same rule, so it can never disagree with the bar that opened it. The
 * permission/lock fields (createdById, initiatorId, doerId, updatedAt) are what
 * let the drawer host the same inline status cell the tasks table uses.
 */
export interface HeatmapCellTask {
  id: string;
  taskNo: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: EisenhowerPriority;
  ageDays: number;
  /** Effective due date (revised ?? original) — what `ageDays` measures against. */
  dueAt: Date | null;
  /** The raw, pre-revision due date. Differs from `dueAt` only when moved. */
  originalDueAt: Date | null;
  doerId: string;
  doerName: string | null;
  initiatorId: string;
  initiatorName: string | null;
  createdById: string | null;
  updatedAt: Date;
  archived: boolean;
}

export interface AgingHeatmapData {
  // employeeId -> bucketId -> HeatmapCellTask[]
  byCell: Record<string, Record<string, HeatmapCellTask[]>>;
}

/** Operational summary metrics surfaced when a KPI card is expanded. All
 *  respect the active dashboard filters (date / employee / department / etc.). */
export interface WmsSummary {
  overdue: number;          // open & past due
  dueToday: number;         // open & due today
  dueThisWeek: number;      // open & due within 7 days
  completionRate: number;   // done ÷ total, %
  approvalRate: number;     // approved ÷ (approved + not_approved), %
  avgAgeDays: number;       // mean age of open tasks
  avgTimeToDoneDays: number; // mean created→completed for completed tasks
}

/** D16 — punctuality of DELIVERED work. "On time" = a `done` task whose
 *  completion day is on/before its EFFECTIVE due day (revised ?? original).
 *  Uses the live `done` status only — never `approved` or archived. */
export interface PunctualityPerson {
  employeeId: string;
  employeeName: string;
  /** Dated done tasks (onTime + late). */
  done: number;
  onTime: number;
  late: number;
  /** onTime ÷ done, % (0 when none). */
  rate: number;
  /** Late done tasks bucketed by days late (sums ≤ late). */
  lateSpread: { d1_3: number; d4_7: number; d8_14: number; d15: number };
  /** Mean days late across this person's LATE tasks only — null when they have
   *  none. A true mean, not an estimate from `lateSpread`: the per-task figure
   *  is already computed in done-on-time.ts, so averaging the buckets'
   *  midpoints would be inventing precision the transform can simply state. */
  avgDaysLate: number | null;
  /** Primary department, for the row's role subtext. Null when unset or when
   *  the caller supplied no membership map. */
  department: string | null;
}

/**
 * A punctuality row carrying its position on the single team leaderboard.
 * Lives here rather than beside the split so `DashboardData` does not have to
 * import from a transform that imports from this file.
 */
export interface RankedPunctualityPerson extends PunctualityPerson {
  /** 1-based position in the WHOLE-TEAM ranking. Always past the top-performer
   *  cut for a row on the pull-up board — that is what put it there. */
  rank: number;
}

export interface Punctuality {
  /** All done & non-archived tasks in scope (incl. undated). */
  total: number;
  /** Done tasks that carry a completed_at (the on-time/late denominator). */
  dated: number;
  onTime: number;
  late: number;
  /** Done but with no completed_at timestamp — can't be classified. */
  undated: number;
  /** onTime ÷ dated, %. */
  onTimeRate: number;
  /** Per-doer breakdown, busiest first. */
  byPerson: PunctualityPerson[];
}

/** A single signed early/late aging band with its done-task count. */
export interface DoneAgingBandCount { id: string; label: string; count: number }

/** On-time delivery rolled up to a department, for the gauge's expanded view.
 *  A doer is counted under their PRIMARY department only, so the rows never
 *  double-count someone who belongs to several. */
export interface PunctualityDepartment {
  departmentId: string;
  departmentName: string;
  /** Dated done tasks (onTime + late). */
  done: number;
  onTime: number;
  late: number;
  /** onTime ÷ done, % (0 when none). */
  rate: number;
}

/** Punctuality computed against ONE due-date basis (original or revised). */
export interface PunctualityBasis {
  basis: "original" | "revised";
  total: number; dated: number; onTime: number; late: number; undated: number;
  onTimeRate: number;
  byPerson: PunctualityPerson[];      // reuse existing PunctualityPerson
  histogram: DoneAgingBandCount[];     // 12 signed bands, always all present
  byDepartment: PunctualityDepartment[]; // busiest first; [] when unmapped
}

/** On-time delivery measured against both the original and the revised due date. */
export interface DoneOnTime { original: PunctualityBasis; revised: PunctualityBasis }

/** A single positive "days waiting" band with its declined-task count. */
export interface NotApprovedBandCount { id: string; label: string; count: number }

/** One declined task, aged by days since it was sent back. */
export interface NotApprovedTask { id: string; title: string; waitingDays: number }

/** A doer with their outstanding declined tasks, oldest-waiting first. */
export interface NotApprovedPerson {
  employeeId: string; employeeName: string; count: number; tasks: NotApprovedTask[];
  /** Free-text department, for the roster's role tag. Null when unset. */
  department: string | null;
}

/** Declined ("not approved") tasks grouped per doer + a waiting-days histogram. */
export interface NotApprovedAging {
  total: number; byPerson: NotApprovedPerson[]; bands: NotApprovedBandCount[];
}

/** One of a manager's direct reports + how many tasks they were given vs the goal. */
export interface InitiatorReportRow {
  employeeId: string; employeeName: string; given: number; goal: number; hit: boolean;
  /** How many direct reports THIS person has — the hierarchy context. */
  reportCount: number;
  /** Tasks the manager pushed past this report, into their own team. */
  downlineGiven: number;
}

/** Per-manager target-vs-actual: every initiated task classified into exactly
 *  one delegation channel — Direct (the only one that counts toward target),
 *  Downline, Counterpart, Founder/Management, or Self. */
export interface InitiatorScorecard {
  managerId: string; managerName: string; directReports: number;
  totalInitiated: number;
  toDirectReports: number; toDownline: number; toCounterparts: number;
  toFounderMgmt: number; toSelf: number;
  target: number; actual: number; attainmentPct: number;
  /** Carried so the card can render its own "Target = 5 × N × reports" caption
   *  from the same numbers the target was computed with. */
  workingDays: number; perReportPerDay: number;
  perReport: InitiatorReportRow[];
}

export interface InitiatorBoard { windowDays: number; workingDays: number; managers: InitiatorScorecard[] }

export interface DashboardData {
  kpis: KpiSet;
  /** The unfiltered operational summary — every task in the active filter.
   *  Identical to `wmsSummaryByKpi.total`; kept as its own field because it is
   *  what the strip shows before any card is expanded. */
  wmsSummary: WmsSummary;
  /** One operational summary PER CARD, computed over that card's task subset.
   *  Expanding NOT APPROVED now re-reads Overdue / Due Today / Avg Age against
   *  the sent-back tasks alone, instead of repeating the org-wide numbers. */
  wmsSummaryByKpi: Record<import("@/lib/dashboard/kpi-buckets").KpiBucketKey, WmsSummary>;
  punctuality: Punctuality;
  doneOnTime: DoneOnTime;
  notApprovedAging: NotApprovedAging;
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
  pullQuote: string;
  /** The 12-bucket delivery spread, over every non-archived done task (not the
   *  filtered period) — see the note beside its computation in queries/dashboard. */
  doneSpread: import("@/lib/queries/task-report").DoneFineDistribution;
  /** Sent-back (declined) work — who carries it and how overdue it is. Not
   *  scoped to the filtered period: a task declined weeks ago is still open
   *  today, so a date filter would under-report the backlog. */
  sentBack: {
    total: number;
    byPerson: import("@/lib/queries/task-report").NotApprovedPersonRow[];
    buckets: import("@/lib/transforms/aging-buckets-fine").FineBucketCount[];
    undated: number;
  };
  statusTable: EmployeeStatusRow[];
  /** Ranks 1…TOP_PERFORMER_RANKS only — see lib/transforms/performer-split.ts.
   *  The tail of the same ranking is `pullUpBoard`, and the two never overlap. */
  topPerformers: TopPerformer[];
  /** Rank TOP_PERFORMER_RANKS+1 and below, worst first. Split from the SAME
   *  ranking as `topPerformers`, so a person is in exactly one of the two and
   *  carries the same position number in either. */
  pullUpBoard: RankedPunctualityPerson[];
  agingTable: AgingRow[];
  agingHeatmap: AgingHeatmapCell[];
  agingByDate: AgingByDate[];
  agingHeatmapData: AgingHeatmapData;
  generatedAt: Date;
}

export interface TaskListFilters {
  startDate: Date | null;
  endDate: Date | null;
  statuses: TaskStatus[];
  doerIds: string[];
  initiatorIds: string[];
  departments: Department[];
  priorities: EisenhowerPriority[];
  subjects: string[];
  clients: string[];
  taskId: string | null;
  archived: boolean;
  /** `true` on the Project Plan board: narrow to tasks that belong to a plan
   *  row (`tasks.project_node_id IS NOT NULL`). Optional because every other
   *  caller wants the whole task list; `parseTaskFilters` never sets it, so the
   *  WMS board is untouched and only the plan page opts in. */
  projectOnly?: boolean;
  /** `?type=goals|tasks|commitments` -- which activity family a manager-board
   *  click came from. Null when absent or unrecognised. */
  activityType: import("@/lib/task-filters").ActivityType | null;
  /** `?unread=1` — pending work nobody has opened yet: `first_read_at IS
   *  NULL` AND the status is one of PENDING_STATUSES. Both halves matter —
   *  a DONE task with no read receipt is finished, not unread, and counting it
   *  would make the figure larger than the "Not Read" pill that links here.
   *  A cross-cut like `overdue`, not a status: there is no `not_read` value in
   *  the enum, which is exactly why the pill had no filter to point at. */
  unread: boolean;
  /** `?overdue=true` — only OPEN tasks whose effective due date is already
   *  past. A cross-cut, not a status: it narrows within whatever statuses are
   *  selected rather than replacing them. Terminal work is excluded because a
   *  task that is done is no longer late, it is finished. */
  overdue: boolean;
  /** `?age_range=<slug>` — one of the nine fine aging buckets, as a signed
   *  day-window around the effective due date. Null when unset. Stored as the
   *  bucket KEY (the human label) because that is what the chart, the chip and
   *  FINE_BUCKET_OFFSETS all key on; the slug exists only for the URL. */
  ageRange: FineBucketKey | null;
  /** Team scope from the toolbar's Team dropdown. Comma-separated in the URL,
   *  and a UNION when several are picked — "Sales or App Dev", not the
   *  intersection, because nobody is in two teams at once and an intersection
   *  would always be empty.
   *  - []        : no team scoping
   *  - "mine"    : the viewer + everyone below them in the org chart
   *  - a Department name : that department group
   *  Resolved to concrete employee ids in lib/queries/tasks.ts, because
   *  expanding "mine" needs the org tree and the parser is intentionally
   *  DB-free. */
  teams: string[];
  /** The signed-in employee, carried so `team=mine` can be expanded server-side. */
  viewerId: string | null;
  /** How the assignee filter was resolved.
   *  - "default":  no `emp` URL param + a defaultDoerId was supplied (non-admin
   *                default-to-me scope). `doerIds` will be `[defaultDoerId]`.
   *  - "all":      either `emp` was absent for an admin, or `emp=all` was
   *                explicitly set. `doerIds` is `[]`.
   *  - "specific": `emp=<one-or-more-ids>` was explicitly set. */
  assigneeMode: "default" | "all" | "specific";
}

export interface TaskListRow {
  id: string;
  /** Friendly sequential task number (#1042). Null only until the backfill
   *  migration has run. */
  taskNo: number | null;
  title: string;
  subject: string | null;
  client: string | null;
  /** Full task body — used by the hover-to-preview popover in the table. */
  description: string | null;
  status: TaskStatus;
  priority: EisenhowerPriority;
  doerId: string;
  doerName: string | null;
  doerDept: string | null;
  initiatorId: string;
  initiatorName: string | null;
  createdAt: Date;
  dueAt: Date;
  ageDays: number;
  archived: boolean;
  createdById: string | null;
  updatedAt: Date;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | null;
  firstReadAt: Date | null;
  /** When work was FIRST started on this task — task_time_rollup.first_started_at,
   *  i.e. the first `work_started` time event. Null until someone hits Start.
   *  Distinct from createdAt (when it was raised) and firstReadAt (when the doer
   *  opened it): a task can sit read-but-untouched for days. */
  startedAt: Date | null;
  completedAt: Date | null;
  /** A work session is open right now — task_time_rollup.open_session_count > 0.
   *  Drives the inline Start/Stop control in the table. Read from the rollup
   *  rather than task_work_sessions so it costs no extra join: the rollup is
   *  already joined for `startedAt`. */
  timerRunning: boolean;
}
