import "server-only";
import { and, gte, lt, sql } from "drizzle-orm";
import { db, employees, tasks, holidays } from "@/lib/db";
import { isFounderEmail } from "@/lib/auth/founder";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import {
  computeInitiatorScorecard,
  countWorkingDays,
} from "@/lib/transforms";
import {
  distributeDoneFine,
  distributePendingFine,
  type FineBucketCount,
} from "@/lib/transforms/aging-buckets-fine";
import type { InitiatorBoard } from "@/lib/types";

const MS_PER_DAY = 86_400_000;

/** One doer's not-approved task count, busiest first. */
export interface NotApprovedPersonRow {
  employeeId: string;
  employeeName: string;
  count: number;
}

/** A done-distribution measured against one due-date basis (original | revised). */
export interface DoneFineDistribution {
  basis: "original" | "revised";
  buckets: FineBucketCount[];
  dated: number;
  undated: number;
  /** Tasks landing in any non-late bucket (offset >= 0) — on or before due. */
  onTime: number;
  late: number;
}

export interface TaskReportData {
  /** Two DONE dashboards: by ORIGINAL due date and by REVISED (effective) due date. */
  doneByOriginal: DoneFineDistribution;
  doneByRevised: DoneFineDistribution;
  /** Not-approved: person-wise counts + the same-tasks aged across the fine buckets. */
  notApproved: {
    total: number;
    byPerson: NotApprovedPersonRow[];
    buckets: FineBucketCount[];
    /** Not-approved tasks lacking an effective due date (not placeable on the scale). */
    undated: number;
  };
  /** Task-initiator scorecards (manager → report counts) for 3-day and 7-day windows. */
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
  generatedAt: Date;
}

interface DoneRow {
  status: string;
  archived: boolean;
  completedAt: Date | null;
  originalDueAt: Date | null;
  effectiveDueAt: Date | null;
}

interface NotApprovedRow {
  doerId: string;
  effectiveDueAt: Date | null;
}

interface InitiatorTaskRow {
  initiatorId: string;
  doerId: string;
  createdAt: Date;
}

/**
 * Task Analytics report data — Manan's four dashboards.
 *
 * LOAD-NEUTRAL: this is an ON-DEMAND read for the dedicated /dashboard/task-report
 * route only. It is NOT wired into the hot dashboard path, and it never touches
 * the dashboard's cached aggregate or the auth/DB pool tuning. Each scan is
 * narrowly projected (only the columns the transforms read) and fail-open so a
 * hiccup degrades a section to empty rather than throwing the page.
 *
 * @param now injectable clock (defaults to wall time) so the pending/overdue
 *            offsets and working-day windows are deterministic in tests.
 */
export async function loadTaskReportData(now: Date = new Date()): Promise<TaskReportData> {
  const sevenAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
  const threeAgo = new Date(now.getTime() - 3 * MS_PER_DAY);

  const [allEmployees, doneRows, notApprovedRows, initiatorTasks, holidayRows] =
    await Promise.all([
      db
        .select({ id: employees.id, name: employees.name, managerId: employees.managerId, email: employees.email })
        .from(employees)
        .catch(() => [] as { id: string; name: string; managerId: string | null; email: string | null }[]),

      // DONE tasks — both due-date bases needed (original raw due_at + effective).
      db
        .select({
          status: tasks.status,
          archived: tasks.archived,
          completedAt: tasks.completedAt,
          originalDueAt: tasks.dueAt,
          effectiveDueAt: effectiveDueAtSql(),
        })
        .from(tasks)
        .where(and(sql`${tasks.status} = 'done'`, sql`${tasks.archived} = false`))
        .catch(() => [] as DoneRow[]),

      // NOT-APPROVED tasks (status OR approval_status), not archived.
      db
        .select({ doerId: tasks.doerId, effectiveDueAt: effectiveDueAtSql() })
        .from(tasks)
        .where(
          and(
            sql`(${tasks.status} = 'not_approved' OR ${tasks.approvalStatus} = 'not_approved')`,
            sql`${tasks.archived} = false`,
          ),
        )
        .catch(() => [] as NotApprovedRow[]),

      // Initiator window: tasks created in the last 7 days (covers both toggles).
      db
        .select({ initiatorId: tasks.initiatorId, doerId: tasks.doerId, createdAt: tasks.createdAt })
        .from(tasks)
        .where(and(gte(tasks.createdAt, sevenAgo), sql`${tasks.archived} = false`))
        .catch(() => [] as InitiatorTaskRow[]),

      db
        .select({ holidayDate: holidays.holidayDate })
        .from(holidays)
        .where(gte(holidays.holidayDate, sevenAgo.toISOString().slice(0, 10)))
        .catch(() => [] as { holidayDate: string }[]),
    ]);

  const nameById = new Map(allEmployees.map((e) => [e.id, e.name] as const));

  // ── ① + ② Two DONE distributions (original vs revised) across the 9 buckets ──
  const buildDone = (
    basis: "original" | "revised",
    pick: (r: DoneRow) => Date | null,
  ): DoneFineDistribution => {
    const { buckets, dated, undated } = distributeDoneFine(
      doneRows.map((r) => ({ effectiveDue: pick(r), completedAt: r.completedAt })),
    );
    // "On time" = any non-late bucket (offset >= 0, i.e. finished on/before due).
    const late = buckets.filter((b) => b.late).reduce((s, b) => s + b.count, 0);
    return { basis, buckets, dated, undated, onTime: dated - late, late };
  };
  const doneByOriginal = buildDone("original", (r) => r.originalDueAt);
  const doneByRevised = buildDone("revised", (r) => r.effectiveDueAt);

  // ── ③ NOT-APPROVED — person-wise counts + fine-bucket aging vs effective due ──
  const perCount = new Map<string, number>();
  for (const r of notApprovedRows) {
    perCount.set(r.doerId, (perCount.get(r.doerId) ?? 0) + 1);
  }
  const byPerson: NotApprovedPersonRow[] = [...perCount.entries()]
    .map(([employeeId, count]) => ({
      employeeId,
      employeeName: nameById.get(employeeId) ?? "Unknown",
      count,
    }))
    .sort((a, b) => b.count - a.count || a.employeeName.localeCompare(b.employeeName));

  const naDist = distributePendingFine(
    notApprovedRows.map((r) => ({ effectiveDue: r.effectiveDueAt })),
    now,
  );

  // ── ④ TASK-INITIATOR scorecards (reuse the existing transform) ──
  const holidaySet = new Set(holidayRows.map((h) => h.holidayDate));
  const initEmployees = allEmployees.map((e) => ({
    id: e.id,
    name: e.name,
    managerId: e.managerId,
    email: e.email,
  }));
  const board = (since: Date, windowDays: number): InitiatorBoard => {
    const wd = countWorkingDays(since, now, holidaySet); // Sunday off (default)
    const windowTasks = initiatorTasks
      .filter((t) => t.createdAt >= since)
      .map((t) => ({ initiatorId: t.initiatorId, doerId: t.doerId }));
    return {
      windowDays,
      workingDays: wd,
      managers: computeInitiatorScorecard(windowTasks, initEmployees, wd, isFounderEmail),
    };
  };

  return {
    doneByOriginal,
    doneByRevised,
    notApproved: {
      total: notApprovedRows.length,
      byPerson,
      buckets: naDist.buckets,
      undated: naDist.undated,
    },
    initiator: { d3: board(threeAgo, 3), d7: board(sevenAgo, 7) },
    generatedAt: now,
  };
}
