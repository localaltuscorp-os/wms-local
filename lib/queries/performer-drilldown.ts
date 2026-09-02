import "server-only";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks } from "@/db/schema";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { employeeIdsInDepartments } from "@/lib/queries/departments";
import type { DashboardFilters, EisenhowerPriority } from "@/lib/types";

/**
 * The COMPLETED task list behind one leaderboard row.
 *
 * Scoped by the same dashboard filters as the leaderboard itself (date window,
 * priorities, subjects, departments) so the drawer's rows always add up to the
 * count on the card that opened it. The one filter deliberately overridden is
 * `employeeIds`: the drawer is about ONE person, and inheriting a people filter
 * that excludes them would open an empty panel.
 *
 * Client/priority/due-date narrowing inside the drawer happens client-side over
 * this result — the list is one person's completions in a bounded window, small
 * enough that a round-trip per filter change would cost more than it saves.
 */

const MS_PER_DAY = 86_400_000;
const ROW_CAP = 2000;

export interface CompletedTaskRow {
  id: string;
  taskNo: number | null;
  title: string;
  /** The work itself. `title` is the CLIENT NAME in this schema, so the row
   *  label has to come from here or it just repeats the Client column. */
  description: string | null;
  client: string | null;
  subject: string | null;
  priority: EisenhowerPriority;
  /** Effective due date (revised ?? original), ISO. Null when never dated. */
  dueAt: string | null;
  /** Raw pre-revision due date, ISO. */
  originalDueAt: string | null;
  completedAt: string | null;
  /** Whole days from creation to completion. Null when not measurable. */
  turnaroundDays: number | null;
  /** Positive = finished late, 0 = on the day, negative = early. Null undated. */
  daysLate: number | null;
  initiatorName: string | null;
}

export interface PerformerDrilldown {
  employeeId: string;
  employeeName: string;
  total: number;
  tasks: CompletedTaskRow[];
  truncated: boolean;
}

/** Whole-UTC-day index — timezone-stable day maths. */
function dayNumber(d: Date): number {
  return Math.floor(
    new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`).getTime() / MS_PER_DAY,
  );
}

export async function loadPerformerDrilldown(
  filters: DashboardFilters,
  employeeId: string,
): Promise<PerformerDrilldown> {
  const start = filters.startDate ?? new Date(0);
  const end = filters.endDate ?? new Date();

  const conditions = [
    gte(tasks.createdAt, start),
    lt(tasks.createdAt, new Date(end.getTime() + MS_PER_DAY)),
    eq(tasks.archived, false),
    eq(tasks.doerId, employeeId),
    // "Completed" matches the leaderboard's own rule (done + approved), not
    // just `done` — otherwise an approved task would count on the card and
    // vanish from the drawer.
    inArray(tasks.status, ["done", "approved"]),
  ];
  if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0) conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.departments.length > 0) {
    const ids = await employeeIdsInDepartments(filters.departments);
    // The person is outside the filtered departments — an empty list is the
    // honest answer, not the unscoped one.
    if (!ids.includes(employeeId)) {
      return { employeeId, employeeName: "", total: 0, tasks: [], truncated: false };
    }
  }

  const [person] = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId));

  const initiator = employees;
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      description: tasks.description,
      client: tasks.client,
      subject: tasks.subject,
      priority: tasks.priority,
      dueAt: effectiveDueAtSql(),
      originalDueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      initiatorName: initiator.name,
    })
    .from(tasks)
    .leftJoin(initiator, eq(tasks.initiatorId, initiator.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.completedAt))
    .limit(ROW_CAP + 1);

  const truncated = rows.length > ROW_CAP;
  const page = truncated ? rows.slice(0, ROW_CAP) : rows;

  const out: CompletedTaskRow[] = page.map((r) => {
    const due = r.dueAt ? new Date(r.dueAt as string | Date) : null;
    const done = r.completedAt ? new Date(r.completedAt) : null;
    return {
      id: r.id,
      taskNo: r.taskNo ?? null,
      title: r.title,
      description: r.description ?? null,
      client: r.client ?? null,
      subject: r.subject ?? null,
      priority: r.priority,
      dueAt: due ? due.toISOString() : null,
      originalDueAt: r.originalDueAt ? new Date(r.originalDueAt).toISOString() : null,
      completedAt: done ? done.toISOString() : null,
      turnaroundDays: done
        ? Math.max(0, Math.round((done.getTime() - r.createdAt.getTime()) / MS_PER_DAY))
        : null,
      daysLate: due && done ? dayNumber(done) - dayNumber(due) : null,
    initiatorName: r.initiatorName ?? null,
    };
  });

  return {
    employeeId,
    employeeName: person?.name ?? "",
    total: out.length,
    tasks: out,
    truncated,
  };
}
