import { and, gte, lt, inArray, eq } from "drizzle-orm";
import { db, employees, tasks } from "@/lib/db";
import type { DashboardFilters } from "@/lib/types";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { employeeIdsInDepartments } from "@/lib/queries/departments";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Which half of the gauge the drill-down is showing — or `all`, both halves at
 * once, which is what the "Total Completed" KPI card selects.
 *
 * `all` costs NO extra database work: the query below already fetches every
 * dated done task in scope and splits them in JS, so this only skips that
 * in-memory filter.
 */
export type PunctualityBucket = "onTime" | "late" | "all";
export type PunctualityBasisId = "original" | "revised";

/** One delivered task in the drill-down list. */
export interface PunctualityTask {
  id: string;
  taskNo: number | null;
  title: string;
  /** The task body — what the work actually is. `title` is the CLIENT NAME in
   *  this schema (the New Task form's "Client Name" writes to tasks.title), so
   *  it is the wrong field to label a row with in a triage list. */
  description: string | null;
  doerName: string | null;
  subject: string | null;
  client: string | null;
  /** The due date the row was measured against (per the active basis). */
  dueAt: string;
  completedAt: string;
  /** Whole days late; 0 for on-time rows, negative days are reported as `daysEarly`. */
  daysLate: number;
  daysEarly: number;
}

export interface PunctualityDrilldown {
  bucket: PunctualityBucket;
  basis: PunctualityBasisId;
  /** Total matching rows BEFORE the display cap. */
  total: number;
  /** Rows returned, worst-first for `late`, most-early-first for `onTime`. */
  tasks: PunctualityTask[];
  /** True when `total` exceeded the cap and `tasks` is a slice. */
  truncated: boolean;
}

/** Matches the transform: whole-day comparison in UTC, so a task completed at
 *  23:50 on its due date is on time, not 10 minutes late. */
function dayNumber(d: Date | string): number {
  const key = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return Math.floor(new Date(`${key}T00:00:00Z`).getTime() / MS_PER_DAY);
}

/** Hard cap so a wide date range can't stream thousands of rows into a drawer. */
const MAX_ROWS = 200;

/**
 * The delivered tasks behind one half of the on-time gauge.
 *
 * ON-DEMAND ONLY — called from a server action when the user clicks the
 * "On time"/"Late" legend, never on dashboard load, so it stays off the load
 * path (Operation Butter). It deliberately re-derives the SAME scope the
 * dashboard used (date range → priority → subject → employee/department) from
 * the caller's filters, so the list can never disagree with the gauge above it.
 *
 * Classification is redone here rather than trusted from the client: the client
 * only says which bucket it wants.
 */
export async function loadPunctualityDrilldown(
  filters: DashboardFilters,
  basis: PunctualityBasisId,
  bucket: PunctualityBucket,
): Promise<PunctualityDrilldown> {
  const start = filters.startDate ?? new Date(0);
  const end = filters.endDate ?? new Date();

  // Same scoping shape as loadDashboardData's `conditions`.
  const conditions = [
    gte(tasks.createdAt, start),
    lt(tasks.createdAt, new Date(end.getTime() + MS_PER_DAY)),
    eq(tasks.status, "done"),
    eq(tasks.archived, false),
  ];
  if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0) conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.employeeIds.length > 0) {
    const idCol = filters.view === "doer" ? tasks.doerId : tasks.initiatorId;
    conditions.push(inArray(idCol, filters.employeeIds));
  }
  if (filters.departments.length > 0) {
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return { bucket, basis, total: 0, tasks: [], truncated: false };
    conditions.push(inArray(tasks.doerId, ids));
  }

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      description: tasks.description,
      subject: tasks.subject,
      client: tasks.client,
      completedAt: tasks.completedAt,
      // Both bases, so one query serves either toggle position.
      originalDueAt: tasks.dueAt,
      revisedDueAt: effectiveDueAtSql(),
      doerName: employees.name,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(and(...conditions))
    .limit(5000);

  const out: PunctualityTask[] = [];
  for (const r of rows) {
    const due = basis === "original" ? r.originalDueAt : r.revisedDueAt;
    // Undated rows are excluded from the gauge's denominator, so they must not
    // appear in either list.
    if (!r.completedAt || !due) continue;
    const signed = dayNumber(due as Date | string) - dayNumber(r.completedAt);
    const isOnTime = signed >= 0;
    if (bucket !== "all" && (bucket === "onTime") !== isOnTime) continue;
    out.push({
      id: r.id,
      taskNo: r.taskNo,
      title: r.title,
      description: r.description ?? null,
      doerName: r.doerName ?? null,
      subject: r.subject ?? null,
      client: r.client ?? null,
      dueAt: new Date(due as string | Date).toISOString(),
      completedAt: new Date(r.completedAt).toISOString(),
      daysLate: isOnTime ? 0 : -signed,
      daysEarly: isOnTime ? signed : 0,
    });
  }

  // Worst offenders first when late; the earliest deliveries first when on time.
  // `all` mixes both, so it sorts by lateness descending — the late rows lead
  // (most overdue first), then the on-time ones. That keeps the thing you need
  // to act on at the top of an unfiltered list.
  out.sort((a, b) =>
    bucket === "onTime" ? b.daysEarly - a.daysEarly : b.daysLate - a.daysLate,
  );

  return {
    bucket,
    basis,
    total: out.length,
    tasks: out.slice(0, MAX_ROWS),
    truncated: out.length > MAX_ROWS,
  };
}
