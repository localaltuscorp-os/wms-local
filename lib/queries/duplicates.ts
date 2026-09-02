import "server-only";
import { and, eq, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import type { TaskStatus, TaskPriority } from "@/db/enums";

export interface DuplicateTask {
  id: string;
  taskNo: number | null;
  title: string | null;
  description: string | null;
  client: string | null;
  subject: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string; // ISO
  createdAt: string; // ISO
}

export interface DuplicateGroup {
  key: string;
  doerName: string;
  dueAt: string; // ISO of the shared due date
  client: string | null;
  subject: string | null;
  /** Sorted oldest-first — the first row is the natural "keeper". */
  tasks: DuplicateTask[];
}

const norm = (s: string | null): string =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Duplicate finder for the admin cleanup tool (built for the CSV bulk-upload
 * era): a duplicate set is 2+ non-archived, non-recurring tasks with the SAME
 * doer, the SAME due date and identical details (description + client +
 * subject, whitespace/case-insensitive). Recurring originals and materialised
 * occurrences are excluded — their repeats are intentional ("no frequency to
 * duplicate" — Manan).
 */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      description: tasks.description,
      client: tasks.client,
      subject: tasks.subject,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      createdAt: tasks.createdAt,
      doerId: tasks.doerId,
      doerName: employees.name,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(
      and(
        eq(tasks.archived, false),
        isNotNull(tasks.dueAt),
        // "No frequency": plain tasks only — no repeat pattern, not spawned
        // from a recurring template.
        or(isNull(tasks.recurrence), eq(tasks.recurrence, "none")),
        isNull(tasks.recurrenceParentId),
        sql`${tasks.recurrenceRule} is null or ${tasks.recurrenceRule} = ''`,
      ),
    )
    .limit(5000);

  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const day = r.dueAt!.toISOString().slice(0, 10);
    // Title is part of identity too — without it, distinct tasks that all
    // have an empty description (same doer + day) would be falsely grouped.
    const key = [r.doerId ?? "-", day, norm(r.title), norm(r.description), norm(r.client), norm(r.subject)].join("|");
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const first = list[0]!;
    groups.push({
      key,
      doerName: first.doerName ?? "Unassigned",
      dueAt: first.dueAt!.toISOString(),
      client: first.client,
      subject: first.subject,
      tasks: list.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        description: t.description,
        client: t.client,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt!.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
    });
  }

  // Biggest piles first, then nearest due date.
  groups.sort(
    (a, b) =>
      b.tasks.length - a.tasks.length || a.dueAt.localeCompare(b.dueAt),
  );
  return groups;
}
