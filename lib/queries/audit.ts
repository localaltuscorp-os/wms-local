import { desc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { taskEvents } from "@/db/schema";
import type { TaskEventType } from "@/lib/events";

export type AuditFeedRow = {
  id: string;
  taskId: string;
  actorId: string;
  actorName: string | null;
  eventType: TaskEventType;
  fromValue: unknown;
  toValue: unknown;
  note: string | null;
  createdAt: Date;
};

/**
 * Returns every event for the task, newest first.  Joins the actor
 * employee row for the rendered name.  RLS enforces the spec's
 * "task participants OR admin" read rule (migration 0008).
 */
export async function listTaskEvents(taskId: string): Promise<AuditFeedRow[]> {
  const rows = await db
    .select({
      id: taskEvents.id,
      taskId: taskEvents.taskId,
      actorId: taskEvents.actorId,
      actorName: employees.name,
      eventType: taskEvents.eventType,
      fromValue: taskEvents.fromValue,
      toValue: taskEvents.toValue,
      note: taskEvents.note,
      createdAt: taskEvents.createdAt,
    })
    .from(taskEvents)
    .leftJoin(employees, eq(taskEvents.actorId, employees.id))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    eventType: r.eventType as TaskEventType,
    fromValue: r.fromValue,
    toValue: r.toValue,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
