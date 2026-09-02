import { and, eq, sql } from "drizzle-orm";
import { db, tasks, employees } from "@/lib/db";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";

const MS_PER_DAY = 86_400_000;

/** Whole-UTC-day index, so "days" here means CALENDAR days — the same unit the
 *  Age and Due columns use. Elapsed-hours arithmetic would disagree with them
 *  by up to a day on the same pair of dates. */
function dayIndex(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY,
  );
}

export interface DoneKpis {
  total: number;
  onTime: number;
  overdue: number;
  /** Share of DATED completions that landed on or before the due date. */
  onTimePct: number;
  /** Mean createdAt → completedAt, in whole calendar days. */
  avgResolutionDays: number;
  thisWeek: number;
  thisMonth: number;
  /** Completions with no comparable due date — excluded from the on-time split
   *  rather than silently counted as on time. */
  undated: number;
}

export interface DonePersonRow {
  employeeId: string;
  employeeName: string;
  department: string | null;
  totalDone: number;
  onTime: number;
  overdue: number;
  avgCompletionDays: number;
  lastCompletedAt: Date | null;
}

export interface DoneDashboardData {
  kpis: DoneKpis;
  people: DonePersonRow[];
  generatedAt: Date;
}

/**
 * Everything the Done Dashboard renders, from ONE pass over completed tasks.
 *
 * "Completed" is `status IN ('done','approved')`, matching the Task Summary's
 * DONE card (`?status=done,approved`) and the Status-by-Doer Done column. An
 * approved task is a done task that a manager then signed off; counting only
 * `done` would drop every task that finished its review.
 *
 * Archived rows are excluded — they are out of the working set everywhere else
 * on the dashboard, and including them here would make this the one surface
 * whose totals nobody could reconcile.
 *
 * ON-TIME is measured against the EFFECTIVE due date (revised ?? original), so
 * a task whose deadline was formally moved is judged on the date it actually
 * carried. That matches the Delivered-on-time gauge. Rows with no completion
 * stamp or no due date cannot be placed on that axis at all and are counted as
 * `undated` instead of being folded into either side.
 */
export async function loadDoneDashboard(now: Date = new Date()): Promise<DoneDashboardData> {
  const nowDay = dayIndex(now);

  // Week = the last 7 calendar days inclusive of today; month = the last 30.
  // Deliberately rolling windows rather than calendar boundaries: on the 1st of
  // a month a "this month" figure resets to near-zero and reads as a collapse
  // in output rather than a change of window.
  const weekStart = new Date(now.getTime() - 6 * MS_PER_DAY);
  const monthStart = new Date(now.getTime() - 29 * MS_PER_DAY);

  const rows = await db
    .select({
      doerId: tasks.doerId,
      doerName: employees.name,
      department: employees.department,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      effectiveDueAt: effectiveDueAtSql(),
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(
      and(
        sql`${tasks.status} IN ('done','approved')`,
        eq(tasks.archived, false),
      ),
    )
    .catch(() => []);

  const kpis: DoneKpis = {
    total: 0,
    onTime: 0,
    overdue: 0,
    onTimePct: 0,
    avgResolutionDays: 0,
    thisWeek: 0,
    thisMonth: 0,
    undated: 0,
  };

  const byPerson = new Map<
    string,
    DonePersonRow & { _resolutionSum: number; _resolutionCount: number }
  >();
  let resolutionSum = 0;
  let resolutionCount = 0;

  for (const r of rows) {
    if (!r.doerId) continue;
    kpis.total += 1;

    const completed = r.completedAt ? new Date(r.completedAt as unknown as string | Date) : null;
    const due = r.effectiveDueAt ? new Date(r.effectiveDueAt as unknown as string | Date) : null;

    let person = byPerson.get(r.doerId);
    if (!person) {
      person = {
        employeeId: r.doerId,
        employeeName: r.doerName ?? "Unknown",
        department: r.department ?? null,
        totalDone: 0,
        onTime: 0,
        overdue: 0,
        avgCompletionDays: 0,
        lastCompletedAt: null,
        _resolutionSum: 0,
        _resolutionCount: 0,
      };
      byPerson.set(r.doerId, person);
    }
    person.totalDone += 1;

    if (completed && due) {
      // <= : finishing ON the due date is hitting the deadline, not missing it.
      if (dayIndex(completed) <= dayIndex(due)) {
        kpis.onTime += 1;
        person.onTime += 1;
      } else {
        kpis.overdue += 1;
        person.overdue += 1;
      }
    } else {
      kpis.undated += 1;
    }

    if (completed) {
      const created = new Date(r.createdAt as unknown as string | Date);
      // Floored at 0: a completion stamped fractionally before creation (clock
      // skew on an imported row) would otherwise pull the average negative.
      const days = Math.max(0, dayIndex(completed) - dayIndex(created));
      resolutionSum += days;
      resolutionCount += 1;
      person._resolutionSum += days;
      person._resolutionCount += 1;

      if (completed >= weekStart) kpis.thisWeek += 1;
      if (completed >= monthStart) kpis.thisMonth += 1;
      if (!person.lastCompletedAt || completed > person.lastCompletedAt) {
        person.lastCompletedAt = completed;
      }
    }
  }

  // Percentage is of DATED completions, not of `total`. Dividing by total would
  // let a batch of undated rows drag the rate down and read as a delivery
  // problem when it is a data problem.
  const dated = kpis.onTime + kpis.overdue;
  kpis.onTimePct = dated > 0 ? Math.round((kpis.onTime / dated) * 100) : 0;
  kpis.avgResolutionDays =
    resolutionCount > 0 ? Math.round((resolutionSum / resolutionCount) * 10) / 10 : 0;

  const people = Array.from(byPerson.values())
    .map(({ _resolutionSum, _resolutionCount, ...p }) => ({
      ...p,
      avgCompletionDays:
        _resolutionCount > 0
          ? Math.round((_resolutionSum / _resolutionCount) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.totalDone - a.totalDone);

  void nowDay;
  return { kpis, people, generatedAt: now };
}
