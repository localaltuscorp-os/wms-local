import "server-only";
import { count, and, eq, inArray, isNull, lt, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks, taskEvents } from "@/db/schema";
import type { ActivityRow } from "@/lib/transforms/activity";
import type { TaskEventType } from "@/lib/events";
import { PENDING_STATUSES, type TaskStatus } from "@/db/enums";

export interface AdminOverview {
  activeEmployees: number;
  pendingInvites: number;
  openTasks: number;
  overdueTasks: number;
  recentActivity: ActivityRow[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  // Tier-3 — count every pending status (incl. new need_info / follow_up_1/2/3)
  // by sourcing from the canonical PENDING_STATUSES export.
  const pendingStatusList = PENDING_STATUSES as readonly TaskStatus[];
  const now = new Date();

  // All five queries are independent; on a remote Postgres each
  // serial await added a full network round-trip to the page render.
  // Running them in parallel is bounded by the connection pool
  // (max=10) and turns ~5×RTT into ~1×RTT.
  const [
    [activeRow],
    [pendingInvites],
    [openTasks],
    [overdueTasks],
    recentRows,
  ] = await Promise.all([
    db.select({ n: count() }).from(employees).where(eq(employees.isActive, true)),
    db
      .select({ n: count() })
      .from(employees)
      .where(and(eq(employees.isActive, true), isNull(employees.joinedAt))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.archived, false), inArray(tasks.status, pendingStatusList))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.archived, false),
          inArray(tasks.status, pendingStatusList),
          lt(tasks.dueAt, now),
        ),
      ),
    db
      .select({
        id: taskEvents.id,
        taskId: taskEvents.taskId,
        taskSubject: tasks.subject,
        taskTitle: tasks.title,
        taskStatus: tasks.status,
        actorId: taskEvents.actorId,
        actorName: employees.name,
        actorAvatarUrl: employees.avatarUrl,
        eventType: taskEvents.eventType,
        fromValue: taskEvents.fromValue,
        toValue: taskEvents.toValue,
        note: taskEvents.note,
        createdAt: taskEvents.createdAt,
      })
      .from(taskEvents)
      .leftJoin(employees, eq(taskEvents.actorId, employees.id))
      .leftJoin(tasks, eq(taskEvents.taskId, tasks.id))
      .orderBy(desc(taskEvents.createdAt))
      .limit(5),
  ]);

  const recentActivity: ActivityRow[] = recentRows.map((r) => ({
    id: r.id,
    source: "task" as const,
    taskId: r.taskId,
    taskSubject: r.taskSubject ?? null,
    taskTitle: r.taskTitle ?? "(deleted task)",
    taskStatus: (r.taskStatus ?? "not_started") as TaskStatus,
    targetEmployeeId: null,
    targetEmployeeName: null,
    settingScope: null,
    settingTargetId: null,
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    actorAvatarUrl: r.actorAvatarUrl ?? null,
    eventType: r.eventType as TaskEventType,
    fromValue: r.fromValue,
    toValue: r.toValue,
    note: r.note,
    createdAt: r.createdAt,
  }));

  return {
    activeEmployees: activeRow?.n ?? 0,
    pendingInvites:  pendingInvites?.n ?? 0,
    openTasks:       openTasks?.n ?? 0,
    overdueTasks:    overdueTasks?.n ?? 0,
    recentActivity,
  };
}
