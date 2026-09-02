import "server-only";
import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import type { TaskStatus } from "@/db/enums";

export interface RecurringTemplateRow {
  id: string;
  shortId: string | null;
  title: string;
  subject: string | null;
  rule: string;
  doerName: string | null;
  initiatorName: string | null;
  status: TaskStatus;
  dueAt: Date;
  /** Number of materialized children currently in the system (across
   *  the past + future). Surfaces "this template has spawned N tasks". */
  childCount: number;
  /** Earliest future child due-date, if any — gives admins a sense of
   *  what's coming. */
  nextChildDueAt: Date | null;
}

/**
 * Phase 5.2 surface — list active recurring-template tasks (rule-holders)
 * with each one's child count + next scheduled child. Used by /admin/settings
 * Integrations tab so an admin can audit what's spawning.
 */
export async function listRecurringTemplates(): Promise<RecurringTemplateRow[]> {
  const doerEmp = sql.raw("doer_emp").mapWith(String);
  const initEmp = sql.raw("init_emp").mapWith(String);
  // Two-step approach: pick templates first, then count children +
  // earliest-future-due in a second join — simpler than a 3-way self-join
  // in drizzle's builder.
  const templates = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      subject: tasks.subject,
      rule: tasks.recurrenceRule,
      doerId: tasks.doerId,
      initiatorId: tasks.initiatorId,
      status: tasks.status,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.recurrenceRule),
        isNull(tasks.recurrenceParentId),
        eq(tasks.archived, false),
      ),
    )
    .orderBy(asc(tasks.title));

  if (templates.length === 0) return [];

  // Build doer/initiator name lookup in one round-trip.
  const peopleIds = Array.from(
    new Set(templates.flatMap((t) => [t.doerId, t.initiatorId])),
  );
  const people = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(sql`${employees.id} = ANY(${peopleIds})`);
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  // Child counts + earliest future due per template in one query.
  // Bind the cutoff as an ISO string + ::timestamptz cast — postgres-js can
  // choke on a raw Date object inside an ad-hoc sql fragment (the same gotcha
  // documented in lib/queries/activity.ts); a throw here crashes /admin/settings.
  const nowIso = new Date().toISOString();
  const counts = (await db
    .select({
      parentId: tasks.recurrenceParentId,
      n: sql<number>`count(*)::int`,
      nextDue: sql<Date | null>`min(case when ${tasks.dueAt} > ${nowIso}::timestamptz then ${tasks.dueAt} else null end)`,
    })
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.recurrenceParentId),
        eq(tasks.archived, false),
      ),
    )
    .groupBy(tasks.recurrenceParentId)) as Array<{
      parentId: string | null;
      n: number;
      nextDue: Date | null;
    }>;
  const countsByParent = new Map(counts.map((c) => [c.parentId, c]));

  return templates.map((t) => {
    const c = countsByParent.get(t.id);
    return {
      id: t.id,
      shortId: t.shortId,
      title: t.title,
      subject: t.subject,
      rule: t.rule ?? "",
      doerName: nameById.get(t.doerId) ?? null,
      initiatorName: nameById.get(t.initiatorId) ?? null,
      status: t.status,
      dueAt: t.dueAt,
      childCount: c?.n ?? 0,
      nextChildDueAt: c?.nextDue ?? null,
    };
  });
}
