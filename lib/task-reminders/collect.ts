import "server-only";
import { and, asc, eq, inArray, isNull, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import type { TaskReminderRule } from "@/db/schema";
import type { TaskPriority, TaskStatus } from "@/db/enums";
import { NEVER_REMIND_STATUSES, splitReminderStatuses } from "./rules";

export interface ReminderTask {
  id: string;
  title: string;
  dueAt: Date;
  priority: TaskPriority;
  status: TaskStatus;
  isOverdue: boolean;
}

export interface ReminderEmployeeGroup {
  employeeId: string;
  employeeName: string;
  tasks: ReminderTask[];
}

/**
 * Collect every incomplete task a rule should chase, grouped by the employee
 * doing it.
 *
 * Grouped by DOER, not initiator: the email answers "who is sitting on what",
 * and the person a reminder is about is the one the work is assigned to.
 *
 * Three filters stack, and the order matters:
 *
 *   1. ALIVE — not archived, not abandoned (Recycle Bin), not completed.
 *   2. NOT FINISHED — `NEVER_REMIND_STATUSES` is subtracted unconditionally, on
 *      top of whatever the rule asked for. That is the guarantee that Done and
 *      Cancelled work is never chased even if a rule is mis-configured.
 *   3. THE RULE — its employee scope, then its status checklist, where
 *      `overdue` widens the match to anything past its due date rather than
 *      narrowing it (a task can be Initiated AND overdue; both should match).
 *
 * A rule with no statuses at all matches nothing — deliberately. The
 * alternative, treating "none" as "everything", turns an empty checklist into
 * a mass mailing.
 */
export async function collectReminderTasks(
  rule: Pick<TaskReminderRule, "scope" | "employeeIds" | "statuses">,
  now: Date,
): Promise<ReminderEmployeeGroup[]> {
  const { statuses, includeOverdue } = splitReminderStatuses(rule.statuses ?? []);
  if (statuses.length === 0 && !includeOverdue) return [];

  const scopedIds =
    rule.scope === "selected" ? (rule.employeeIds ?? []).filter(Boolean) : null;
  // "Selected" with an empty roster means the admin has not chosen anyone yet.
  // Matching every employee here would be the opposite of what was asked.
  if (scopedIds !== null && scopedIds.length === 0) return [];

  // The rule's own match: any chosen status, OR past due when `overdue` is on.
  const statusMatch = statuses.length > 0 ? inArray(tasks.status, statuses) : undefined;
  const overdueMatch = includeOverdue ? lt(tasks.dueAt, now) : undefined;
  const ruleMatch =
    statusMatch && overdueMatch
      ? or(statusMatch, overdueMatch)
      : (statusMatch ?? overdueMatch);

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      status: tasks.status,
      employeeId: employees.id,
      employeeName: employees.name,
    })
    .from(tasks)
    .innerJoin(employees, eq(employees.id, tasks.doerId))
    .where(
      and(
        eq(tasks.archived, false),
        isNull(tasks.abandonedAt),
        isNull(tasks.completedAt),
        notInArray(tasks.status, [...NEVER_REMIND_STATUSES]),
        eq(employees.isActive, true),
        scopedIds ? inArray(employees.id, scopedIds) : undefined,
        ruleMatch,
      ),
    )
    // Most urgent first within each person: oldest due date leads.
    .orderBy(asc(employees.name), asc(tasks.dueAt));

  const byEmployee = new Map<string, ReminderEmployeeGroup>();
  for (const r of rows) {
    let group = byEmployee.get(r.employeeId);
    if (!group) {
      group = { employeeId: r.employeeId, employeeName: r.employeeName, tasks: [] };
      byEmployee.set(r.employeeId, group);
    }
    group.tasks.push({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt,
      priority: r.priority,
      status: r.status,
      isOverdue: r.dueAt.getTime() < now.getTime(),
    });
  }

  return [...byEmployee.values()];
}

/** Recipients of a rule, skipping anyone deactivated or without an email. */
export async function resolveReminderRecipients(
  recipientIds: string[],
): Promise<{ id: string; name: string; email: string }[]> {
  const ids = (recipientIds ?? []).filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(and(inArray(employees.id, ids), eq(employees.isActive, true)))
    .orderBy(asc(employees.name));
  return rows.filter((r) => Boolean(r.email));
}

/** Total tasks across every group — the number the subject line quotes. */
export function countReminderTasks(groups: ReminderEmployeeGroup[]): number {
  return groups.reduce((sum, g) => sum + g.tasks.length, 0);
}
