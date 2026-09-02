import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, employees, tasks, holidays } from "@/lib/db";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { countWorkingDays } from "@/lib/transforms/working-days";
import {
  PER_REPORT_PER_DAY,
  buildDelegationClassifier,
  type DelegationChannel,
} from "@/lib/transforms/initiator-scorecard";
import { isFounderEmail } from "@/lib/auth/founder";
import {
  deliveryOf,
  statusDonut,
  avgAgingDays,
  delegationDelta,
  type Delivery,
} from "@/lib/transforms/manager-drilldown";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** §4.3 return shape for the on-demand manager workload drill-down. */
export interface ManagerDrilldown {
  manager: { id: string; name: string; avatarUrl: string | null };
  totalInitiated: number;
  /** Daily counts of initiated tasks, oldest→newest, last 14 days. */
  initiatedSparkline: number[];
  delegationEfficiency: { pct: number; deltaPct: number };
  /** Mean age (days) of OPEN (non-done) initiated tasks. */
  avgTaskAgingDays: number;
  perReport: {
    employeeId: string;
    name: string;
    avatarUrl: string | null;
    given: number;
    goal: number;
    hit: boolean;
  }[];
  statusBreakdown: { onTime: number; late: number; aging: number; done: number };
  tasks: {
    /** Which delegation channel this task fell into for THIS manager. */
    channel: DelegationChannel;
    id: string;
    title: string;
    client: string | null;
    subject: string | null;
    description: string | null;
    doerId: string;
    doerName: string;
    doerAvatarUrl: string | null;
    priority: string;
    status: string;
    dueAt: Date;
    completedAt: Date | null;
    updatedAt: Date;
    delivery: Delivery;
  }[];
}

/** A scanned initiated-task row (effective due projected as `dueAt`). */
type Row = {
  id: string;
  title: string;
  client: string | null;
  subject: string | null;
  description: string | null;
  doerId: string;
  priority: string;
  status: string;
  dueAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Load a single manager's workload drill-down. ON-DEMAND only (fired when the
 * modal opens) — never on the dashboard load path, so it is allowed exactly one
 * fail-open scan of the manager's initiated tasks plus a couple of cheap counts.
 *
 * Fail-open: every DB read is `.catch`-guarded so a degraded section never
 * crashes the modal; on a hard failure the caller surfaces `{ error }`.
 *
 * @param managerId the manager whose card was clicked (already permission-gated
 *   by the server-action wrapper).
 * @param windowDays 3 or 7 — the initiated-task window (created_at >= now-N).
 */
export async function loadManagerDrilldown(
  managerId: string,
  windowDays: 3 | 7,
): Promise<ManagerDrilldown> {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const priorSince = new Date(now.getTime() - 2 * windowDays * MS_PER_DAY);
  const fourteenAgo = new Date(now.getTime() - 14 * MS_PER_DAY);

  // ── One fail-open scan of the manager's in-window initiated tasks, plus
  //    the cheap side-reads (manager row, direct reports, prior-window count,
  //    14-day sparkline counts, holidays). All guarded so the modal degrades
  //    instead of crashing. ──────────────────────────────────────────────
  const [
    managerRow,
    rowsRaw,
    directReports,
    priorCounts,
    sparkRows,
    holidayRows,
  ] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
      .from(employees)
      .where(eq(employees.id, managerId))
      .then((r) => r[0] ?? null)
      .catch(() => null),

    // THE scan: initiator_id = managerId, in window, not archived.
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        client: tasks.client,
        subject: tasks.subject,
        description: tasks.description,
        doerId: tasks.doerId,
        priority: tasks.priority,
        status: tasks.status,
        dueAt: effectiveDueAtSql(),
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.initiatorId, managerId),
          gte(tasks.createdAt, since),
          sql`${tasks.archived} = false`,
        ),
      )
      .then((r) => r as unknown as Row[])
      .catch(() => [] as Row[]),

    // Direct reports = employees with manager_id === managerId (direct query,
    // NOT the transitive downline).
    db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
      .from(employees)
      .where(and(eq(employees.managerId, managerId), eq(employees.isActive, true)))
      .catch(() => [] as { id: string; name: string; avatarUrl: string | null }[]),

    // Prior equal window: cheap counts of total + to-direct-reports, for the
    // delegation-efficiency delta. (doerId only — joined to reports in JS.)
    db
      .select({ doerId: tasks.doerId })
      .from(tasks)
      .where(
        and(
          eq(tasks.initiatorId, managerId),
          gte(tasks.createdAt, priorSince),
          sql`${tasks.createdAt} < ${since.toISOString()}`,
          sql`${tasks.archived} = false`,
        ),
      )
      .catch(() => [] as { doerId: string }[]),

    // 14-day sparkline: created_at of every (non-archived) initiated task in
    // the last 14 days. Bucketed into daily counts in JS.
    db
      .select({ createdAt: tasks.createdAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.initiatorId, managerId),
          gte(tasks.createdAt, fourteenAgo),
          sql`${tasks.archived} = false`,
        ),
      )
      .catch(() => [] as { createdAt: Date }[]),

    // Holidays inside the working-day window (for the perReport goal math).
    db
      .select({ holidayDate: holidays.holidayDate })
      .from(holidays)
      .where(gte(holidays.holidayDate, utcDay(since)))
      .catch(() => [] as { holidayDate: string }[]),
  ]);

  const holidaySet = new Set(holidayRows.map((h) => h.holidayDate));

  // Avatar/name lookup for doers — direct reports first, then a fallback scan
  // of any other doers referenced by the in-window tasks.
  const empById = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const r of directReports) empById.set(r.id, { name: r.name, avatarUrl: r.avatarUrl });
  const missingDoerIds = [
    ...new Set(rowsRaw.map((t) => t.doerId).filter((id) => !empById.has(id))),
  ];
  if (missingDoerIds.length > 0) {
    const extra = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
      .from(employees)
      .where(inArray(employees.id, missingDoerIds))
      .catch(() => [] as { id: string; name: string; avatarUrl: string | null }[]);
    for (const e of extra) empById.set(e.id, { name: e.name, avatarUrl: e.avatarUrl });
  }

  const totalInitiated = rowsRaw.length;
  const reportIds = new Set(directReports.map((r) => r.id));

  // ── perReport: given (count to this report) vs goal. ──
  // Imports PER_REPORT_PER_DAY rather than repeating the number: this drill-down
  // and the scorecard card show the same manager's goal side by side, and a
  // second literal here is how they silently disagreed at 3-vs-5.
  const goal = PER_REPORT_PER_DAY * countWorkingDays(since, now, holidaySet);
  const givenByReport = new Map<string, number>();
  let toDirectReports = 0;
  for (const t of rowsRaw) {
    if (reportIds.has(t.doerId)) {
      toDirectReports++;
      givenByReport.set(t.doerId, (givenByReport.get(t.doerId) ?? 0) + 1);
    }
  }
  const perReport = directReports
    .map((r) => {
      const given = givenByReport.get(r.id) ?? 0;
      return {
        employeeId: r.id,
        name: r.name,
        avatarUrl: r.avatarUrl,
        given,
        goal,
        hit: given >= goal,
      };
    })
    .sort((a, b) => a.given - b.given || a.name.localeCompare(b.name));

  // ── delegationEfficiency: toDirectReports / total, vs the prior window. ──
  const curPct = totalInitiated > 0 ? Math.round((toDirectReports / totalInitiated) * 100) : 0;
  const priorTotal = priorCounts.length;
  const priorToReports = priorCounts.filter((p) => reportIds.has(p.doerId)).length;
  const priorPct = priorTotal > 0 ? Math.round((priorToReports / priorTotal) * 100) : 0;
  const delegationEfficiency = delegationDelta(curPct, priorPct);

  // ── avgTaskAgingDays: mean age of OPEN (non-done) initiated tasks. ──
  const openCreatedAts = rowsRaw
    .filter((t) => t.status !== "done")
    .map((t) => t.createdAt);
  const avgTaskAgingDays = avgAgingDays(openCreatedAts, now);

  // ── statusBreakdown donut (Task 3). ──
  const statusBreakdown = statusDonut(rowsRaw, now);

  // ── initiatedSparkline: 14 daily counts, oldest→newest. ──
  const initiatedSparkline = new Array<number>(14).fill(0);
  const todayNum = Math.floor(now.getTime() / MS_PER_DAY);
  for (const s of sparkRows) {
    const dayNum = Math.floor(new Date(s.createdAt).getTime() / MS_PER_DAY);
    const idx = 13 - (todayNum - dayNum);
    if (idx >= 0 && idx < 14) initiatedSparkline[idx] = (initiatedSparkline[idx] ?? 0) + 1;
  }

  // ── Delegation channel per task, so the drawer can be opened pre-filtered
  //    to the column that was clicked. Needs the WHOLE active org (not just
  //    this manager's direct reports) because "downline" is a transitive
  //    relationship — a task given to someone three levels down is still this
  //    manager's downline. One narrow id/manager/email scan.
  const orgRows = await db
    .select({ id: employees.id, name: employees.name, managerId: employees.managerId, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true))
    .catch(() => [] as { id: string; name: string; managerId: string | null; email: string | null }[]);
  const classify = buildDelegationClassifier(managerId, orgRows, isFounderEmail);

  // ── tasks[] table rows with delivery badge. ──
  const taskRows = rowsRaw.map((t) => {
    const doer = empById.get(t.doerId);
    return {
      channel: classify(t.doerId),
      id: t.id,
      title: t.title,
      client: t.client,
      subject: t.subject,
      description: t.description,
      doerId: t.doerId,
      doerName: doer?.name ?? "Unknown",
      doerAvatarUrl: doer?.avatarUrl ?? null,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      updatedAt: t.updatedAt,
      delivery: deliveryOf(t, now),
    };
  });

  return {
    manager: {
      id: managerId,
      name: managerRow?.name ?? "Unknown",
      avatarUrl: managerRow?.avatarUrl ?? null,
    },
    totalInitiated,
    initiatedSparkline,
    delegationEfficiency,
    avgTaskAgingDays,
    perReport,
    statusBreakdown,
    tasks: taskRows,
  };
}
