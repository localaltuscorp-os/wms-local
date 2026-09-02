import "server-only";
import { and, asc, eq, inArray, lt, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { PENDING_STATUSES, TASK_PRIORITIES } from "@/db/enums";
import type { TaskStatus, TaskPriority } from "@/db/enums";

export interface MyDayCounts {
  dueToday: number;
  overdue: number;
  doneToday: number;
}

const TZ = "Asia/Kolkata";

function istBoundaries(now: Date = new Date()): { start: Date; end: Date } {
  // Compute IST midnight + next-IST-midnight as UTC instants.
  const dayLabel = now.toLocaleDateString("en-CA", { timeZone: TZ }); // yyyy-mm-dd
  // IST is UTC+5:30 with no DST — the literal-IST midnight = `<day>T00:00:00+05:30`.
  const start = new Date(`${dayLabel}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Three counters for the dashboard "Your day" card. Pending = anything in
 * the canonical PENDING_STATUSES set; "done today" means status='done'
 * AND completed_at falls within today's IST window.
 *
 * Cheap — three `count(*)` queries that all hit the existing
 * (doer_id, archived, status) index family. No join.
 */
export async function getMyDayCounts(userId: string): Promise<MyDayCounts> {
  const { start, end } = istBoundaries();
  const pendingList = [...PENDING_STATUSES];

  const [dueTodayRow, overdueRow, doneTodayRow] = await Promise.all([
    // Pending tasks whose due_at falls within today (IST).
    db
      .select({ n: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.archived, false),
          eq(tasks.doerId, userId),
          inArray(tasks.status, pendingList),
          gte(tasks.dueAt, start),
          lt(tasks.dueAt, end),
        ),
      ),
    // Pending tasks whose due_at is before today's IST midnight.
    db
      .select({ n: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.archived, false),
          eq(tasks.doerId, userId),
          inArray(tasks.status, pendingList),
          lt(tasks.dueAt, start),
        ),
      ),
    // Tasks I marked done today.
    db
      .select({ n: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.archived, false),
          eq(tasks.doerId, userId),
          eq(tasks.status, "done"),
          gte(tasks.completedAt, start),
          lt(tasks.completedAt, end),
        ),
      ),
  ]);

  return {
    dueToday: dueTodayRow.length,
    overdue: overdueRow.length,
    doneToday: doneTodayRow.length,
  };
}

export interface MyTodayTask {
  id: string;
  taskNo: number | null;
  title: string | null;
  client: string | null;
  subject: string | null;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  /** Due before today's IST midnight (vs. due within today). */
  overdue: boolean;
}

// Priority rank in the canonical TASK_PRIORITIES order
// (Critical → Important → Urgent → Normal).
const PRIORITY_RANK = Object.fromEntries(
  TASK_PRIORITIES.map((p, i) => [p, i]),
) as Record<TaskPriority, number>;

/**
 * The mobile "Today" home: every pending task assigned to the user that is
 * overdue or due today (IST), sorted priority-first (Critical → Normal),
 * then by due date. One indexed query — same predicate family as the
 * counters above, so the list always agrees with the counts.
 */
export async function getMyTodayTasks(userId: string): Promise<MyTodayTask[]> {
  const { start, end } = istBoundaries();

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.archived, false),
        eq(tasks.doerId, userId),
        inArray(tasks.status, [...PENDING_STATUSES]),
        lt(tasks.dueAt, end),
      ),
    )
    .orderBy(asc(tasks.dueAt))
    .limit(200);

  return rows
    .map((r) => ({ ...r, overdue: r.dueAt != null && r.dueAt < start }))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0),
    );
}
