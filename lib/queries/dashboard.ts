import { and, gte, lt, inArray, getTableColumns } from "drizzle-orm";
import { db, employees, tasks } from "@/lib/db";
import type { Task } from "@/lib/db";
import type { DashboardData, DashboardFilters, KpiSet } from "@/lib/types";
import {
  computeKpiTotals,
  computeStatusDistribution,
  computeAgingByDate,
  computeWeekOverWeekDelta,
  computeDailySparkline,
  computeTopPerformers,
  pickPerformersForEmployees,
  computeVelocity,
  generatePullQuote,
  computeEmployeeStatusTable,
  computeEmployeeAgingTable,
} from "@/lib/transforms";
import { AGE_BUCKETS, PENDING_STATUSES } from "@/db/enums";
import type { TaskStatus } from "@/db/enums";
import type { AgingHeatmapData } from "@/lib/types";
import {
  employeeIdsInDepartments,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// All task columns EXCEPT the large free-text fields (`description`, `notes`)
// — the dashboard transforms never read them, and shipping them on every row
// of three full scans bloats the payload over the remote connection. Dropping
// them keeps the scans lean. (Verified: no transform accesses these fields.)
const { description: _description, notes: _notes, ...TASK_COLS } =
  getTableColumns(tasks);

/**
 * Cached dashboard aggregate. The three task scans + transforms are
 * expensive against the remote DB (multiple seconds each), and the data
 * only needs to be near-real-time — so we memoise per filter-set for 60s,
 * tagged with CACHE_TAGS.tasks. Every task create/edit/delete already calls
 * updateTag(CACHE_TAGS.tasks), so mutations bust this instantly
 * (read-your-writes); otherwise repeated dashboard views are served from
 * cache instead of re-paying the multi-second query cost.
 *
 * `generatedAt` is stamped fresh OUTSIDE the cache so the header time stays
 * current and we avoid the unstable_cache Date→string round-trip.
 */
export async function loadDashboardData(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const keyParts = [
    "dashboard-data:v1",
    filters.startDate?.toISOString() ?? "_",
    filters.endDate?.toISOString() ?? "_",
    filters.view,
    filters.employeeIds.join(","),
    filters.departments.join(","),
    filters.priorities.join(","),
    filters.subjects.join(","),
  ];
  const data = await unstable_cache(
    () => loadDashboardDataUncached(filters),
    keyParts,
    { revalidate: 60, tags: [CACHE_TAGS.tasks] },
  )();
  return { ...data, generatedAt: new Date() };
}

async function loadDashboardDataUncached(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const start =
    filters.startDate ?? new Date(Date.now() - 30 * MS_PER_DAY);
  const end = filters.endDate ?? new Date();

  // Base = date/priority/subject scoping; people = the employee/department
  // narrowing. Kept separate so the Top-Performers ranking can run on the
  // base scope — a user filtered to themselves must see their TRUE position
  // in the whole team, not "1st of 1".
  const baseConditions = [
    gte(tasks.createdAt, start),
    lt(tasks.createdAt, new Date(end.getTime() + MS_PER_DAY)),
  ];
  if (filters.priorities.length > 0) {
    baseConditions.push(inArray(tasks.priority, filters.priorities));
  }
  if (filters.subjects.length > 0) {
    baseConditions.push(inArray(tasks.subject, filters.subjects));
  }

  const peopleConditions = [];
  let departmentEmployeeIds: string[] = [];
  if (filters.employeeIds.length > 0) {
    const idCol =
      filters.view === "doer" ? tasks.doerId : tasks.initiatorId;
    peopleConditions.push(inArray(idCol, filters.employeeIds));
  }
  if (filters.departments.length > 0) {
    // Match doers who belong to ANY selected department via the membership
    // join table (not just their primary department).
    departmentEmployeeIds = await employeeIdsInDepartments(filters.departments);
    if (departmentEmployeeIds.length === 0) {
      // no matching employees → no matching tasks
      peopleConditions.push(inArray(tasks.doerId, ["00000000-0000-0000-0000-000000000000"]));
    } else {
      peopleConditions.push(inArray(tasks.doerId, departmentEmployeeIds));
    }
  }
  const conditions = [...baseConditions, ...peopleConditions];
  const peopleFilterActive = peopleConditions.length > 0;

  const fourteenAgo = new Date(Date.now() - 14 * MS_PER_DAY);
  const ninetyAgo = new Date(Date.now() - 90 * MS_PER_DAY);

  const [allEmployees, periodTasksRaw, wideTasksRaw, velocityTasksRaw, departmentMap, rankingTasksRaw] =
    await Promise.all([
      db.select().from(employees),
      db.select(TASK_COLS).from(tasks).where(and(...conditions)),
      db.select(TASK_COLS).from(tasks).where(gte(tasks.createdAt, fourteenAgo)),
      db.select(TASK_COLS).from(tasks).where(gte(tasks.createdAt, ninetyAgo)),
      getEmployeeDepartmentMap(),
      // Ranking scope: only fetched when a people filter narrows the period
      // set — otherwise the period set IS the ranking set.
      peopleFilterActive
        ? db.select(TASK_COLS).from(tasks).where(and(...baseConditions))
        : Promise.resolve(null),
    ]);
  // Cast back to Task[] for the transform signatures — the dropped
  // description/notes fields are simply absent and never accessed.
  const periodTasks = periodTasksRaw as unknown as Task[];
  const wideTasks = wideTasksRaw as unknown as Task[];
  const velocityTasks = velocityTasksRaw as unknown as Task[];
  const rankingTasks = (rankingTasksRaw ?? periodTasksRaw) as unknown as Task[];

  const now = new Date();

  const totals = computeKpiTotals(periodTasks);

  const approvedCount = periodTasks.filter((t) => t.status === "approved").length;
  const statusDistributionDenominator = totals.total - approvedCount;

  const sparklineFor = (predicate: (s: TaskStatus) => boolean) =>
    computeDailySparkline(
      wideTasks.filter((t) => predicate(t.status)),
      now,
      14,
    );

  const wow = (predicate: (s: TaskStatus) => boolean) =>
    computeWeekOverWeekDelta(
      wideTasks.filter((t) => predicate(t.status)),
      now,
    );

  const isDone = (s: TaskStatus) => s === "done" || s === "approved";
  // Tier-3 (2026-05-20) — `pending` covers every non-terminal status EXCEPT
  // the dedicated `need_info` tile + `not_started` (which has its own tile).
  // That mirrors computeKpiTotals. (need_help retired 2026-06-10 → need_info.)
  const PENDING_SET = new Set<TaskStatus>(PENDING_STATUSES);
  const isPending = (s: TaskStatus) =>
    PENDING_SET.has(s) && s !== "not_started" && s !== "need_info";
  const isNeedHelp = (s: TaskStatus) => s === "need_info";

  const kpis: KpiSet = {
    total: {
      current: totals.total,
      previous: wow(() => true).previous,
      sparkline: sparklineFor(() => true),
    },
    pending: {
      current: totals.pending,
      previous: wow(isPending).previous,
      sparkline: sparklineFor(isPending),
    },
    notStarted: {
      current: totals.notStarted,
      previous: wow((s) => s === "not_started").previous,
      sparkline: sparklineFor((s) => s === "not_started"),
    },
    needHelp: {
      current: totals.needHelp,
      previous: wow(isNeedHelp).previous,
      sparkline: sparklineFor(isNeedHelp),
    },
    done: {
      current: totals.done,
      previous: wow(isDone).previous,
      sparkline: sparklineFor(isDone),
    },
    notApproved: {
      current: totals.notApproved,
      previous: wow((s) => s === "not_approved").previous,
      sparkline: sparklineFor((s) => s === "not_approved"),
    },
  };

  // ── WMS operational summary (shown when a KPI card is expanded) ──────────
  // Day boundaries in UTC; form-created tasks store dueAt at noon UTC, so UTC
  // day comparison classifies them correctly without timezone drift.
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowUTC = new Date(todayUTC.getTime() + MS_PER_DAY);
  const weekUTC = new Date(todayUTC.getTime() + 7 * MS_PER_DAY);

  const openTasks = periodTasks.filter((t) => !t.archived && PENDING_SET.has(t.status));
  const doneTasks = periodTasks.filter((t) => isDone(t.status));
  const approvedN = periodTasks.filter(
    (t) => t.status === "approved" || t.approvalStatus === "approved",
  ).length;
  const notApprovedN = periodTasks.filter(
    (t) => t.status === "not_approved" || t.approvalStatus === "not_approved",
  ).length;
  const completed = periodTasks.filter((t) => t.completedAt != null);

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const avgDays = (rows: Task[], to: (t: Task) => number) =>
    rows.length > 0
      ? Math.round(rows.reduce((s, t) => s + (to(t) - t.createdAt.getTime()), 0) / rows.length / MS_PER_DAY)
      : 0;

  const wmsSummary = {
    overdue: openTasks.filter((t) => t.dueAt < todayUTC).length,
    dueToday: openTasks.filter((t) => t.dueAt >= todayUTC && t.dueAt < tomorrowUTC).length,
    dueThisWeek: openTasks.filter((t) => t.dueAt >= todayUTC && t.dueAt < weekUTC).length,
    completionRate: pct(doneTasks.length, totals.total),
    approvalRate: pct(approvedN, approvedN + notApprovedN),
    avgAgeDays: avgDays(openTasks, () => now.getTime()),
    avgTimeToDoneDays: avgDays(completed, (t) => t.completedAt!.getTime()),
  };

  const wowDone = computeWeekOverWeekDelta(
    wideTasks.filter((t) => isDone(t.status)),
    now,
  );

  // Rank the WHOLE team on the base scope, then narrow the display to the
  // filtered people (keeping their global rank). No people filter → top 6.
  const globalRanking = computeTopPerformers(
    rankingTasks,
    allEmployees,
    now,
    Number.MAX_SAFE_INTEGER,
  );
  const focusEmployeeIds =
    filters.employeeIds.length > 0
      ? filters.employeeIds
      : departmentEmployeeIds;
  const topPerformers =
    focusEmployeeIds.length > 0
      ? pickPerformersForEmployees(globalRanking, focusEmployeeIds, allEmployees, 10)
      : globalRanking.slice(0, 6);

  // Aging heatmap shows EVERY pending task (any non-terminal status),
  // sourced from the canonical enum list so Tier-3 statuses appear.
  const PENDING_AGES: Set<TaskStatus> = new Set(PENDING_STATUSES);
  const byCell: AgingHeatmapData["byCell"] = {};
  for (const t of periodTasks) {
    if (!PENDING_AGES.has(t.status)) continue;
    const ageDays = Math.floor((now.getTime() - t.createdAt.getTime()) / MS_PER_DAY);
    const bucket = AGE_BUCKETS.find((b) => ageDays >= b.min && ageDays <= b.max);
    if (!bucket) continue;
    if (!byCell[t.doerId]) byCell[t.doerId] = {};
    const empBuckets = byCell[t.doerId];
    if (!empBuckets) continue;
    if (!empBuckets[bucket.id]) empBuckets[bucket.id] = [];
    const bucketList = empBuckets[bucket.id];
    if (!bucketList) continue;
    bucketList.push({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      ageDays,
    });
  }

  return {
    kpis,
    wmsSummary,
    pullQuote: generatePullQuote({
      doneThisWeek: wowDone.current,
      doneLastWeek: wowDone.previous,
      // Always the GLOBAL #1 — never the first of a filtered selection.
      topPerformerName: globalRanking[0]?.employeeName ?? "the team",
      topPerformerCount: globalRanking[0]?.doneCount ?? 0,
    }),
    velocity: computeVelocity(velocityTasks, ninetyAgo, now),
    statusTable: computeEmployeeStatusTable(
      periodTasks,
      allEmployees,
      filters.view,
      departmentMap,
    ),
    statusDistribution: {
      rows: computeStatusDistribution(periodTasks).filter((r) => r.status !== "approved"),
      denominator: statusDistributionDenominator,
      summary: {
        // Open work still awaiting a verdict (non-terminal, not archived,
        // no approval decision recorded yet).
        pending: periodTasks.filter(
          (t) =>
            !t.archived &&
            PENDING_SET.has(t.status) &&
            t.approvalStatus == null &&
            t.status !== "done",
        ).length,
        // Declined — either the legacy status or the new approval column.
        notApproved: periodTasks.filter(
          (t) =>
            !t.archived &&
            (t.status === "not_approved" || t.approvalStatus === "not_approved"),
        ).length,
        archived: periodTasks.filter((t) => t.archived).length,
      },
    },
    topPerformers,
    agingTable: computeEmployeeAgingTable(periodTasks, allEmployees, now),
    agingHeatmap: [],
    agingByDate: computeAgingByDate(periodTasks, now),
    agingHeatmapData: { byCell },
    generatedAt: now,
  };
}
