import { and, or, gte, lt, inArray, getTableColumns, sql } from "drizzle-orm";
import { db, employees, tasks, taskEvents, holidays } from "@/lib/db";
import type { Task } from "@/lib/db";
import type {
  DashboardData,
  DashboardFilters,
  KpiSet,
  KpiWithDelta,
  InitiatorBoard,
  WmsSummary,
} from "@/lib/types";
import {
  KPI_BUCKET_KEYS,
  type KpiBucketKey,
  inKpiBucket,
  isOpenTask,
} from "@/lib/dashboard/kpi-buckets";
import { isFounderEmail } from "@/lib/auth/founder";
import {
  distributeDoneFine,
  distributePendingFine,
} from "@/lib/transforms/aging-buckets-fine";
import type {
  DoneFineDistribution,
  NotApprovedPersonRow,
} from "@/lib/queries/task-report";
import {
  computeKpiTotals,
  computeAgingByDate,
  computeWeekOverWeekDelta,
  bucketForAge,
  computeTrendSeries,
  computeTrendWindows,
  computeTopPerformers,
  pickPerformersForEmployees,
  generatePullQuote,
  computeEmployeeStatusTable,
  computeEmployeeAgingTable,
  computePunctuality,
  computeDoneOnTime,
  computeNotApprovedAging,
  computeInitiatorScorecard,
  countWorkingDays,
} from "@/lib/transforms";
import { rankWholeRoster, splitLeaderboard } from "@/lib/transforms/performer-split";
import { PENDING_STATUSES } from "@/db/enums";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import type { TaskStatus } from "@/db/enums";
import type { AgingHeatmapData } from "@/lib/types";
import {
  employeeIdsInDepartments,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** How deep the Top Performers leaderboard runs: 3 podium cards + 7 list rows.
 *  The view caps to the same number (components/dashboard/top-performers.tsx),
 *  so neither side can quietly become the real limit. */
const TOP_PERFORMER_COUNT = 10;

/**
 * A real Date, or null — never a string that merely has the Date TYPE.
 *
 * Columns projected through raw `sql` fragments (the `effectiveDueAtSql()`
 * COALESCE, for one) are typed by the cast the caller writes, not by what the
 * driver actually returns, and a timestamp can arrive as an ISO string. Date
 * arithmetic on a string silently yields NaN, which turns a bucket count into
 * garbage rather than an error you can see.
 */
function toDateOrNull(value: unknown): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * COERCE `dueAt` IN PLACE, ONCE, AT THE SOURCE.
 *
 * `taskCols()` projects `dueAt` as `effectiveDueAtSql()` — a raw
 * `sql<Date>\`COALESCE(revised_target_date, due_at)\`` fragment. That type
 * parameter is an ASSERTION, not a conversion: drizzle runs its driver decoder
 * over real COLUMNS, not over raw fragments, so the value arrives as an ISO
 * STRING while the type system swears it is a Date.
 *
 * Every consumer then inherits a landmine. `summarize()` called `.getTime()` on
 * it and threw `t.dueAt.getTime is not a function`, which the page turned into
 * "Dashboard is taking longer than usual" — a crash wearing a timeout's
 * clothes. The quieter half is worse: anything doing date ARITHMETIC on the
 * string got NaN and silently produced garbage counts instead of an error,
 * which is exactly what the comment on toDateOrNull warned about.
 *
 * Fixed here rather than at each call site so no future transform has to know.
 * Mutates in place: these arrays are freshly built by the query above and owned
 * by this function, and re-spreading every row of three full scans would cost
 * real memory on a big period.
 */
function coerceDueAt(rows: { dueAt: unknown }[]): void {
  for (const r of rows) {
    if (!(r.dueAt instanceof Date)) r.dueAt = toDateOrNull(r.dueAt);
  }
}

// All task columns EXCEPT the large free-text fields. The dashboard transforms
// never read them, and shipping them on every row of three full scans bloats the
// payload over the remote connection — which is what makes a scan's RESULT SEND
// slow enough to be orphaned (stuck "sending to a dead client" for minutes,
// holding a pooled connection). CRITICAL: also drop `searchText` — it's a
// GENERATED column that concatenates title+description+client+subject+notes, so
// shipping it re-ships everything we just dropped. (Verified: no transform reads
// description / notes / searchText.)
const {
  description: _description,
  notes: _notes,
  searchText: _searchText,
  ...TASK_COLS_BASE
} = getTableColumns(tasks);

// Overdue/due-today/due-this-week counts must read the EFFECTIVE due
// (revised ?? original), so project `dueAt` as that COALESCE for every
// dashboard scan. `due_at` itself is immutable; revisions live in
// `revised_target_date`. A fresh projection per call keeps each query's
// sql fragment its own (drizzle chunks aren't meant to be shared).
const taskCols = () => ({ ...TASK_COLS_BASE, dueAt: effectiveDueAtSql(), originalDueAt: tasks.dueAt });

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
    // BUMP THIS WHENEVER THE PAYLOAD SHAPE CHANGES.
    //
    // v1 -> v2: `doneSpread` and `sentBack` were added to DashboardData without
    // touching the key, so after deploy this cache kept serving v1-shaped
    // entries that had neither. The page read `data.sentBack.total` on them and
    // threw a TypeError during RENDER — past the try/catch around the fetch, so
    // it surfaced as the generic error page with a digest ref rather than the
    // dashboard's own load-error card.
    //
    // The key is the real fix: a shape change and a stale entry cannot coexist.
    // The consumers are also defensive now, but that is the belt, not the
    // braces — the next field added still needs a bump here.
    //
    // v2 -> v3: the KPI payload changed shape again — `KpiWithDelta` gained
    // `window` / `changePct` / `trend`, and `wmsSummaryByKpi` was added. A v2
    // entry served after this deploy would hand the card a `trend` of
    // `undefined` and the tooltip would read `.length` off it during render.
    "dashboard-data:v3",
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
    // Own tag (NOT `tasks`): task writes no longer bust this expensive org
    // aggregate — it serves from the 60s TTL. Kills the per-write recompute
    // storm under concurrency (Operation Butter P0 / ARCHITECTURE.md Law 10).
    { revalidate: 60, tags: [CACHE_TAGS.dashboard] },
  )();
  return { ...data, generatedAt: new Date() };
}

/** Exported for diagnostics: scripts/diag-dashboard.ts calls this directly
 *  because unstable_cache needs a Next request context that a tsx script has
 *  no way to provide. Application code should call loadDashboardData(). */
export async function loadDashboardDataUncached(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const start =
    filters.startDate ?? new Date(Date.now() - 30 * MS_PER_DAY);
  const end = filters.endDate ?? new Date();

  // Base = date/priority/subject scoping; people = the employee/department
  // narrowing. Kept separate so the Top-Performers ranking can run on the
  // base scope — a user filtered to themselves must see their TRUE position
  // in the whole team, not "1st of 1".
  // Scope = the filters that are NOT about the date window (priority, subject).
  // Split out of `baseConditions` because the 14-day TREND scan needs them
  // without the date window — see `trendConditions` below.
  const scopeConditions = [];
  if (filters.priorities.length > 0) {
    scopeConditions.push(inArray(tasks.priority, filters.priorities));
  }
  if (filters.subjects.length > 0) {
    scopeConditions.push(inArray(tasks.subject, filters.subjects));
  }

  const baseConditions = [
    gte(tasks.createdAt, start),
    lt(tasks.createdAt, new Date(end.getTime() + MS_PER_DAY)),
    ...scopeConditions,
  ];

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

  // THE 14-DAY TREND SCAN. Two things were wrong with it:
  //
  //  1. It ignored every active filter. Filter the dashboard to one person and
  //     their card read (say) 12 while the trend line under it and the "vs last
  //     week" badge beside it still described the whole company. It now carries
  //     the same priority / subject / employee / department narrowing as the
  //     cards; only the DATE window differs, because a 14-day trend is by
  //     definition a different window from the one the user picked.
  //
  //  2. It keyed on `created_at` alone, so the completed series could never see
  //     a task created 3 weeks ago and finished yesterday — the exact rows that
  //     make up most of a week's throughput. The window is now an OR over
  //     created_at / completed_at.
  const trendConditions = [
    or(gte(tasks.createdAt, fourteenAgo), gte(tasks.completedAt, fourteenAgo))!,
    ...scopeConditions,
    ...peopleConditions,
  ];

  const [allEmployees, periodTasksRaw, wideTasksRaw, departmentMap, rankingTasksRaw] =
    await Promise.all([
      db.select().from(employees),
      db.select(taskCols()).from(tasks).where(and(...conditions)),
      db.select(taskCols()).from(tasks).where(and(...trendConditions)),
      getEmployeeDepartmentMap(),
      // Ranking scope: only fetched when a people filter narrows the period
      // set — otherwise the period set IS the ranking set.
      peopleFilterActive
        ? db.select(taskCols()).from(tasks).where(and(...baseConditions))
        : Promise.resolve(null),
    ]);
  // Cast back to Task[] for the transform signatures — the dropped
  // description/notes fields are simply absent and never accessed.
  //
  // `periodTasks` is widened with `originalDueAt`: `taskCols()` projects
  // `dueAt` as the EFFECTIVE date and selects the raw column alongside it, but
  // the plain `Task` cast hid that second field from the type system while it
  // was present at runtime. The heatmap's drill-down reads it.
  // Before any cast: all three scans project `dueAt` through the raw COALESCE
  // fragment, so all three need the same coercion. `rankingTasksRaw` is skipped
  // when it is null (it then aliases periodTasksRaw, already coerced).
  coerceDueAt(periodTasksRaw);
  coerceDueAt(wideTasksRaw);
  if (rankingTasksRaw) coerceDueAt(rankingTasksRaw);

  const periodTasks = periodTasksRaw as unknown as (Task & { originalDueAt: Date | null })[];
  const wideTasks = wideTasksRaw as unknown as Task[];
  const rankingTasks = (rankingTasksRaw ?? periodTasksRaw) as unknown as Task[];

  const now = new Date();

  // ── Three extra dashboard datasets (each FAIL-OPEN so they can never crash
  //    the dashboard). Run alongside the main work via their own Promise.all. ──
  const MS = MS_PER_DAY;
  const sevenAgo = new Date(now.getTime() - 7 * MS);
  const threeAgo = new Date(now.getTime() - 3 * MS);

  const [notApprovedRows, sentBackEvents, initiatorTasksRaw, holidayRows] = await Promise.all([
    // Declined tasks (STRICT) — id, title, doer, completed_at, created_at.
    db.select({
        id: tasks.id, title: tasks.title, doerId: tasks.doerId,
        completedAt: tasks.completedAt, createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(
        sql`(${tasks.approvalStatus} = 'not_approved' OR ${tasks.status} = 'not_approved')`,
        sql`${tasks.archived} = false`,
      ))
      .catch(() => [] as { id: string; title: string; doerId: string; completedAt: Date | null; createdAt: Date }[]),

    // Latest "entered not_approved" event time per task. Real shape (verified
    // against prod): event_type='status_changed', to_value->>'status'. The
    // extra 'declined'/'approvalStatus' checks are harmless robustness.
    db.execute(sql`
      SELECT task_id, MAX(created_at) AS sent_back_at
        FROM ${taskEvents}
       WHERE event_type IN ('status_changed','declined')
         AND (to_value->>'status' = 'not_approved' OR to_value->>'approvalStatus' = 'not_approved')
       GROUP BY task_id
    `).then((r) => (r as unknown as { task_id: string; sent_back_at: string }[]))
      .catch(() => [] as { task_id: string; sent_back_at: string }[]),

    // Initiator window: tasks created in the last 7 days (covers both toggles).
    db.select({ initiatorId: tasks.initiatorId, doerId: tasks.doerId, createdAt: tasks.createdAt })
      .from(tasks)
      .where(and(gte(tasks.createdAt, sevenAgo), sql`${tasks.archived} = false`))
      .catch(() => [] as { initiatorId: string; doerId: string; createdAt: Date }[]),

    // Holidays within the 7-day window for working-day math.
    db.select({ holidayDate: holidays.holidayDate }).from(holidays)
      .where(gte(holidays.holidayDate, sevenAgo.toISOString().slice(0, 10)))
      .catch(() => [] as { holidayDate: string }[]),
  ]);

  const totals = computeKpiTotals(periodTasks);

  // ── The six cards, all off ONE classification ────────────────────────────
  //
  // `current` is the count in the ACTIVE FILTER (what the big number shows).
  // `trend` / `window` / `previous` describe the rolling 14- and 7-day windows,
  // computed over the same filtered scope. Both halves now ask
  // `inKpiBucket(task, key)` — previously the number and the line beneath it
  // used two different definitions of the same bucket.
  const buildKpi = (key: KpiBucketKey, current: number): KpiWithDelta => {
    const trend = computeTrendSeries(
      wideTasks.filter((t) => inKpiBucket(t, key)),
      now,
      14,
    );
    const windows = computeTrendWindows(trend, 7, "created");
    return {
      current,
      previous: windows.previous,
      window: windows.current,
      changePct: windows.changePct,
      // The bare-number series the area sparkline draws. Same days as `trend`,
      // so the tooltip and the line can never point at different dates.
      sparkline: trend.map((p) => p.created),
      trend,
    };
  };

  const kpis: KpiSet = {
    total: buildKpi("total", totals.total),
    pending: buildKpi("pending", totals.pending),
    notStarted: buildKpi("notStarted", totals.notStarted),
    needHelp: buildKpi("needHelp", totals.needHelp),
    done: buildKpi("done", totals.done),
    notApproved: buildKpi("notApproved", totals.notApproved),
  };

  // ── WMS operational summary (shown when a KPI card is expanded) ──────────
  // Day boundaries in UTC; form-created tasks store dueAt at noon UTC, so UTC
  // day comparison classifies them correctly without timezone drift.
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowUTC = new Date(todayUTC.getTime() + MS_PER_DAY);
  // END OF WEEK = the instant after Sunday, the calendar week the user is
  // standing in. It used to be `today + 7 days`, a rolling window: on a
  // Thursday that reached into the middle of NEXT week, so "Due This Week"
  // counted work the reader would not call this week's.
  const daysToSunday = (7 - todayUTC.getUTCDay()) % 7;
  const endOfWeekUTC = new Date(todayUTC.getTime() + (daysToSunday + 1) * MS_PER_DAY);

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const avgDays = (rows: Task[], to: (t: Task) => number) =>
    rows.length > 0
      ? Math.round(rows.reduce((s, t) => s + (to(t) - t.createdAt.getTime()), 0) / rows.length / MS_PER_DAY)
      : 0;

  /**
   * The seven operational chips, over an arbitrary slice of the filtered
   * period. Computed PER CARD (below) so expanding NOT APPROVED answers
   * "how overdue is the sent-back work" rather than repeating the org-wide
   * figures under every card — which is what it did when there was one
   * global summary shared by all six.
   *
   * "Open" is `isOpenTask`: countable and not delivered. That is wider than
   * the old PENDING_STATUSES test, which silently dropped sent-back tasks
   * from Overdue even though they are the most overdue work there is.
   */
  const summarize = (rows: (Task & { dueAt: Date | null })[]): WmsSummary => {
    const open = rows.filter(isOpenTask);
    const dated = (t: { dueAt: Date | null }) => t.dueAt != null;
    const doneRows = rows.filter((t) => inKpiBucket(t, "done"));
    const approvedN = doneRows.length;
    const notApprovedN = rows.filter((t) => inKpiBucket(t, "notApproved")).length;
    const completed = rows.filter((t) => t.completedAt != null);
    const countable = rows.filter((t) => inKpiBucket(t, "total")).length;

    return {
      overdue: open.filter((t) => dated(t) && t.dueAt!.getTime() < todayUTC.getTime()).length,
      dueToday: open.filter(
        (t) =>
          dated(t) &&
          t.dueAt!.getTime() >= todayUTC.getTime() &&
          t.dueAt!.getTime() < tomorrowUTC.getTime(),
      ).length,
      // Everything still open and due on or before the end of this week —
      // overdue work included, per the brief's `due_date <= END_OF_WEEK`.
      // It is therefore a SUPERSET of Overdue and Due Today, not a third
      // slice beside them.
      dueThisWeek: open.filter((t) => dated(t) && t.dueAt!.getTime() < endOfWeekUTC.getTime())
        .length,
      completionRate: pct(doneRows.length, countable),
      approvalRate: pct(approvedN, approvedN + notApprovedN),
      avgAgeDays: avgDays(open, () => now.getTime()),
      avgTimeToDoneDays: avgDays(completed, (t) => t.completedAt!.getTime()),
    };
  };

  // One summary per card. `total` is the whole filtered period, so it is also
  // what `wmsSummary` (the pre-expansion default) reports.
  const wmsSummaryByKpi = Object.fromEntries(
    KPI_BUCKET_KEYS.map((key) => [
      key,
      summarize(periodTasks.filter((t) => inKpiBucket(t, key))),
    ]),
  ) as Record<KpiBucketKey, WmsSummary>;

  const wmsSummary = wmsSummaryByKpi.total;

  const wowDone = computeWeekOverWeekDelta(
    wideTasks.filter((t) => inKpiBucket(t, "done")),
    now,
  );

  // Rank the WHOLE team on the base scope, then narrow the display to the
  // filtered people (keeping their global rank). No people filter → top 6.
  /* EVERY member of staff is ranked, not only the ones who completed
     something. `computeTopPerformers` counts completions, so a person who
     closed nothing simply was not in it — and was therefore in NEITHER of the
     page's two leaderboards, invisible on the one page whose job is to say who
     needs a conversation. rankWholeRoster carries them at the bottom of the
     standings, which is where the split then puts them. */
  const globalRanking = rankWholeRoster(
    computeTopPerformers(rankingTasks, allEmployees, now, Number.MAX_SAFE_INTEGER),
    allEmployees,
  );
  const focusEmployeeIds =
    filters.employeeIds.length > 0
      ? filters.employeeIds
      : departmentEmployeeIds;
  // TEN, not six. THIS was the cap — the component slices 3 for the podium and
  // renders whatever is left as the list, so a payload of six could only ever
  // yield three list rows no matter what the view asked for. The filtered
  // branch already sent 10; the two now agree, so the leaderboard is the same
  // depth whether or not a people filter is on.
  const selectedPerformers =
    focusEmployeeIds.length > 0
      ? pickPerformersForEmployees(globalRanking, focusEmployeeIds, allEmployees, TOP_PERFORMER_COUNT)
      : globalRanking.slice(0, TOP_PERFORMER_COUNT);

  // Aging heatmap shows EVERY pending task (any non-terminal status),
  // sourced from the canonical enum list so Tier-3 statuses appear.
  // Hoisted above the heatmap loop, which now stamps doer/initiator names
  // onto each cell task so the drill-down drawer needs no second query.
  const nameById = new Map(allEmployees.map((e) => [e.id, e.name] as const));
  const PENDING_AGES: Set<TaskStatus> = new Set(PENDING_STATUSES);
  const byCell: AgingHeatmapData["byCell"] = {};
  for (const t of periodTasks) {
    if (!PENDING_AGES.has(t.status)) continue;
    // THE LANE COUNT AND THIS LIST MUST BE THE SAME PASS, IN EFFECT.
    //
    // The number on a heatmap cell comes from computeEmployeeAgingTable; the
    // rows the drawer shows when you click that cell come from here. Two walks
    // over the same tasks, and they bucketed differently:
    //
    //   • the count uses `bucketForAge`, which FALLS BACK to "60+" for an age
    //     that matches no range;
    //   • this loop used `AGE_BUCKETS.find(...)` and `continue`d — it DROPPED
    //     the task.
    //
    // The ranges cover 0..Infinity contiguously, so the only ages that match
    // nothing are NEGATIVE ones: a task created in the future by clock skew, a
    // back-dated import, or a timezone artifact. Those were counted in the 60+
    // lane and then missing from its drawer — a cell reading 3 that opens onto
    // 2 rows, which is the "half-empty drawer" this was reported as.
    //
    // Reading the same helper the count reads makes that impossible by
    // construction rather than by both sides being careful.
    const ageDays = Math.floor((now.getTime() - t.createdAt.getTime()) / MS_PER_DAY);
    const bucketId = bucketForAge(ageDays);
    // The count also skips tasks whose doer is not on the roster (`if (!emp)
    // continue`), because it has no row to put them in. Skipped here too, or
    // the drawer gains rows the lane never counted — the same divergence in
    // the other direction.
    if (!nameById.has(t.doerId)) continue;
    if (!byCell[t.doerId]) byCell[t.doerId] = {};
    const empBuckets = byCell[t.doerId];
    if (!empBuckets) continue;
    if (!empBuckets[bucketId]) empBuckets[bucketId] = [];
    const bucketList = empBuckets[bucketId];
    if (!bucketList) continue;
    bucketList.push({
      id: t.id,
      taskNo: t.taskNo ?? null,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      priority: t.priority,
      ageDays,
      // `dueAt` is the EFFECTIVE date (revised ?? original) — the one the age
      // is measured against. `originalDueAt` is carried alongside so the
      // drill-down can show a revision instead of hiding it: a task pushed from
      // the 4th to the 20th looks on-track by the effective date alone.
      dueAt: t.dueAt ?? null,
      originalDueAt: t.originalDueAt ?? null,
      doerId: t.doerId,
      doerName: nameById.get(t.doerId) ?? null,
      initiatorId: t.initiatorId,
      initiatorName: nameById.get(t.initiatorId) ?? null,
      createdById: t.createdById ?? null,
      updatedAt: t.updatedAt,
      archived: t.archived ?? false,
    });
  }

  // D16 — on-time vs late delivery, off the same filtered period scan
  // (`periodTasks.dueAt` is already the effective revised-or-original due).
  const punctuality = computePunctuality(periodTasks, nameById);

  /* THE ONE SPLIT between the page's two leaderboards. Top Performers keeps
     ranks 1-15; everyone from 16 down is the pull-up board, carrying the SAME
     position number. Before this the two cards were built from two lists that
     had never heard of each other and both admitted the whole roster, so a
     person was praised at the top of the page and flagged for a pull-up
     conversation 600px below it. See lib/transforms/performer-split.ts. */
  const { top: topPerformers, pullUp: pullUpBoard } = splitLeaderboard(
    selectedPerformers,
    punctuality.byPerson,
  );

  // ① Done on-time + aging (Original vs Revised). periodTasks already carry
  //    originalDueAt (Step 1) + effective dueAt.
  //    `departmentMap` is already loaded above for the status table, so the
  //    per-department on-time rollup costs no extra query.
  const doneOnTime = computeDoneOnTime(
    periodTasks as unknown as Parameters<typeof computeDoneOnTime>[0],
    nameById,
    departmentMap,
  );

  // ② Not Approved — anchor = event time → completed_at → created_at.
  const sentBackByTask = new Map(sentBackEvents.map((e) => [e.task_id, e.sent_back_at] as const));
  const notApprovedAging = computeNotApprovedAging(
    notApprovedRows.map((t) => ({
      id: t.id, title: t.title, doerId: t.doerId,
      sentBackAt: sentBackByTask.get(t.id) ?? t.completedAt ?? t.createdAt,
    })),
    nameById,
    now,
    new Map(allEmployees.map((e) => [e.id, e.department ?? null] as const)),
  );

  // ③ Manager Initiator — split the 7-day scan into 3-day and 7-day windows.
  const holidaySet = new Set(holidayRows.map((h) => h.holidayDate));
  const initEmployees = allEmployees.map((e) => ({ id: e.id, name: e.name, managerId: e.managerId, email: e.email }));
  const board = (since: Date, windowDays: number): InitiatorBoard => {
    const wd = countWorkingDays(since, now, holidaySet); // Sunday off (default)
    const windowTasks = initiatorTasksRaw.filter((t) => t.createdAt >= since)
      .map((t) => ({ initiatorId: t.initiatorId, doerId: t.doerId }));
    return { windowDays, workingDays: wd, managers: computeInitiatorScorecard(windowTasks, initEmployees, wd, isFounderEmail) };
  };
  // DESCRIPTIONS FOR THE DRILL-DOWNS.
  //
  // The main scan drops `description` on purpose (see TASK_COLS_BASE above) —
  // it is a large column and no transform needed it. The heatmap's drill-down
  // and its hover preview DO now, and reading `t.description` off the stripped
  // projection silently yielded null for every row, so every task rendered as
  // its placeholder.
  //
  // Rather than un-drop the column for every dashboard scan, fetch it for
  // exactly the pending tasks that reached a cell — a bounded set, one extra
  // round trip — and attach it. The big scan stays lean; the drill-down gets
  // real text.
  // ── ONE parallel batch for everything still outstanding ───────────────────
  //
  // These reads used to run as FOUR SEQUENTIAL awaits appended to the end of
  // this function, two of them unbounded scans. On a real dataset that is four
  // round trips in series on the critical page-load path, and it is what made
  // /dashboard time out. They do not depend on each other, so they run
  // together.
  //
  // The two description back-fills are also merged into ONE query: they read
  // the same column of the same table and differed only in their id list.
  const initiator = { d3: board(threeAgo, 3), d7: board(sevenAgo, 7) };

  const statusTable = computeEmployeeStatusTable(
    periodTasks,
    allEmployees,
    filters.view,
    departmentMap,
  );

  const cellTaskIds = Object.values(byCell)
    .flatMap((buckets) => Object.values(buckets))
    .flat()
    .map((t) => t.id);
  const previewIds = statusTable.flatMap((row) =>
    Object.values(row.previews ?? {}).flatMap((list) => (list ?? []).map((t) => t.id)),
  );
  const descIds = [...new Set([...cellTaskIds, ...previewIds])];

  const [descRows, sentBackRows, doneForSpread] = await Promise.all([
    descIds.length > 0
      ? db
          .select({ id: tasks.id, description: tasks.description })
          .from(tasks)
          .where(inArray(tasks.id, descIds))
          .catch(() => [] as { id: string; description: string | null }[])
      : Promise.resolve([] as { id: string; description: string | null }[]),

    db
      .select({ doerId: tasks.doerId, effectiveDueAt: effectiveDueAtSql() })
      .from(tasks)
      .where(
        and(
          sql`(${tasks.status} = 'not_approved' OR ${tasks.approvalStatus} = 'not_approved')`,
          sql`${tasks.archived} = false`,
        ),
      )
      .catch(() => [] as { doerId: string; effectiveDueAt: unknown }[]),

    db
      .select({ completedAt: tasks.completedAt, originalDueAt: tasks.dueAt })
      .from(tasks)
      .where(and(sql`${tasks.status} = 'done'`, sql`${tasks.archived} = false`))
      .catch(() => [] as { completedAt: Date | null; originalDueAt: Date | null }[]),
  ]);

  // Descriptions land on BOTH consumers from the one result set. The main scan
  // drops `description` for payload size, so anything reading it off
  // `periodTasks` sees null; these are the two paths that need real text.
  if (descRows.length > 0) {
    const descById = new Map(descRows.map((r) => [r.id, r.description] as const));
    for (const buckets of Object.values(byCell)) {
      for (const list of Object.values(buckets)) {
        for (const t of list) t.description = descById.get(t.id) ?? null;
      }
    }
    for (const row of statusTable) {
      for (const list of Object.values(row.previews ?? {})) {
        for (const t of list ?? []) t.description = descById.get(t.id) ?? null;
      }
    }
  }

  // SENT-BACK WORK — declined by status OR approval_status, not archived, and
  // deliberately NOT scoped to the dashboard's period: a task sent back weeks
  // ago is still on someone's plate today.
  //
  // FAIL-OPEN, LIKE THE READ ABOVE IT. The query already degrades to `[]` via
  // its own `.catch`, but the assembly did not: `distributePendingFine` reads a
  // date off every row, and one row whose `effective_due_at` came back as
  // something other than a Date threw HERE — outside any catch, in the middle
  // of loadDashboardData, which takes the WHOLE dashboard down to its load-error
  // card rather than just this widget. A fail-open read whose transform can
  // still throw is not fail-open.
  const sentBack = ((): DashboardData["sentBack"] => {
    try {
      const perCount = new Map<string, number>();
      for (const r of sentBackRows) {
        if (!r?.doerId) continue;
        perCount.set(r.doerId, (perCount.get(r.doerId) ?? 0) + 1);
      }
      const names = new Map(allEmployees.map((e) => [e.id, e.name] as const));
      const byPerson: NotApprovedPersonRow[] = [...perCount.entries()]
        .map(([employeeId, count]) => ({
          employeeId,
          employeeName: names.get(employeeId) ?? "Unknown",
          count,
        }))
        .sort((a, b) => b.count - a.count || a.employeeName.localeCompare(b.employeeName));

      // Coerced, not cast. `effectiveDueAt` is a COALESCE over two columns and
      // the driver can hand back a string for it; `as Date | null` only silenced
      // the type system, it did not make the value a Date, so the bucketing
      // maths ran on a string and produced NaN — or threw.
      const dist = distributePendingFine(
        sentBackRows.map((r) => ({ effectiveDue: toDateOrNull(r.effectiveDueAt) })),
        now,
      );

      return {
        // DERIVED FROM byPerson, not counted separately. The header badge
        // renders this number directly above a list whose rows are the
        // `byPerson` counts, so a reader adds the rows up and expects to land
        // on it. Two independent tallies of "the same" set is how those two
        // stop matching — and there was already a way in: the loop above skips
        // any row with no `doerId`, which `sentBackRows.length` still counted.
        // (`tasks.doer_id` is NOT NULL today, so that guard is a backstop
        // rather than a live path — but the badge should not depend on a
        // schema constraint holding.)
        total: byPerson.reduce((sum, p) => sum + p.count, 0),
        byPerson,
        buckets: dist.buckets,
        undated: dist.undated,
      };
    } catch (err) {
      console.error("[dashboard] sent-back rollup failed:", err);
      return { total: 0, byPerson: [], buckets: [], undated: 0 };
    }
  })();

  // DELIVERY SPREAD — every non-archived done task, matching how the Task
  // Analytics report computed it so the on-time percentage reads the same here.
  const spreadParts = distributeDoneFine(
    doneForSpread.map((r) => ({ effectiveDue: r.originalDueAt, completedAt: r.completedAt })),
  );
  const spreadLate = spreadParts.buckets
    .filter((b) => b.late)
    .reduce((sum, b) => sum + b.count, 0);
  const doneSpread: DoneFineDistribution = {
    basis: "original",
    buckets: spreadParts.buckets,
    dated: spreadParts.dated,
    undated: spreadParts.undated,
    onTime: spreadParts.dated - spreadLate,
    late: spreadLate,
  };


  return {
    kpis,
    wmsSummary,
    wmsSummaryByKpi,
    punctuality,
    pullQuote: generatePullQuote({
      doneThisWeek: wowDone.current,
      doneLastWeek: wowDone.previous,
      // Always the GLOBAL #1 — never the first of a filtered selection.
      topPerformerName: globalRanking[0]?.employeeName ?? "the team",
      topPerformerCount: globalRanking[0]?.doneCount ?? 0,
    }),
    doneSpread,
    sentBack,
    statusTable,
    topPerformers,
    pullUpBoard,
    agingTable: computeEmployeeAgingTable(periodTasks, allEmployees, now),
    agingHeatmap: [],
    agingByDate: computeAgingByDate(periodTasks, now),
    agingHeatmapData: { byCell },
    doneOnTime,
    notApprovedAging,
    initiator,
    generatedAt: now,
  };
}
