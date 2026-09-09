"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { tasks, employees, dailyChecklist } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

/**
 * Recycle Bin actions (manager / admin only). Abandoned tasks (`abandoned_at`
 * set) sit here until a manager RESTORES them (back into the daily loop) or
 * PERMANENTLY deletes them. Scope: an admin sees everyone; a manager sees only
 * their own active direct reports' abandoned tasks (+ their own).
 */

type Result = { ok: true } | { ok: false; error: string };
const UUID = z.string().uuid();

/** The set of doer ids this actor may act on: self + active direct reports. */
async function scopedDoerIds(me: { id: string; isAdmin: boolean }): Promise<string[] | "all"> {
  if (me.isAdmin) return "all";
  const reports = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)));
  return [me.id, ...reports.map((r) => r.id)];
}

async function assertCanManage(taskId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(taskId).success) return { ok: false, error: "Invalid task." };
  const [t] = await db.select({ doerId: tasks.doerId, abandonedAt: tasks.abandonedAt }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!t) return { ok: false, error: "Task not found." };
  if (!t.abandonedAt) return { ok: false, error: "That task isn't in the Recycle Bin." };
  const scope = await scopedDoerIds(me);
  if (scope !== "all" && (t.doerId == null || !scope.includes(t.doerId))) {
    return { ok: false, error: "That task isn't in your team." };
  }
  return { ok: true };
}

/** Restore an abandoned task back into the daily loop. */
export async function restoreTask(taskId: string): Promise<Result> {
  const guard = await assertCanManage(taskId);
  if (!guard.ok) return guard;
  try {
    await db
      .update(tasks)
      .set({ abandonedAt: null, abandonedById: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Permanently delete an abandoned task (manager-only, irreversible). */
export async function purgeTask(taskId: string): Promise<Result> {
  const guard = await assertCanManage(taskId);
  if (!guard.ok) return guard;
  try {
    await db.delete(tasks).where(and(eq(tasks.id, taskId), isNotNull(tasks.abandonedAt)));
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        "Couldn't permanently delete — it may be linked to other records. Restore it instead. (" +
        (err instanceof Error ? err.message : String(err)) +
        ")",
    };
  }
}

/** Empty the whole bin the manager can see (bulk permanent delete). */
export async function purgeAllInScope(): Promise<Result & { deleted?: number }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const scope = await scopedDoerIds(me);
  try {
    const rows = await db
      .delete(tasks)
      .where(
        scope === "all"
          ? isNotNull(tasks.abandonedAt)
          : and(isNotNull(tasks.abandonedAt), inArray(tasks.doerId, scope)),
      )
      .returning({ id: tasks.id });
    return { ok: true, deleted: rows.length };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ───────────────── cancelled DAILY COMMITMENTS (migration 0186) ───────────────── */

/**
 * A cancelled commitment is a soft-deleted `daily_checklist` row — the card's ×
 * on a row with no WMS task behind it. Same two verbs as a task: put it back on
 * its day, or delete it for good.
 *
 * Scope mirrors the task rules above: an admin sees everyone, a manager sees
 * themselves and their active direct reports.
 */
async function assertCanManageCommitment(
  itemId: string,
): Promise<{ ok: true; ownerId: string } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  const [row] = await db
    .select({ employeeId: dailyChecklist.employeeId, abandonedAt: dailyChecklist.abandonedAt })
    .from(dailyChecklist)
    .where(eq(dailyChecklist.id, itemId))
    .limit(1);
  if (!row) return { ok: false, error: "Commitment not found." };
  if (!row.abandonedAt) return { ok: false, error: "That commitment isn't in the Recycle Bin." };
  const scope = await scopedDoerIds(me);
  if (scope !== "all" && !scope.includes(row.employeeId)) {
    return { ok: false, error: "That commitment isn't in your team." };
  }
  return { ok: true, ownerId: row.employeeId };
}

/** Put a cancelled commitment back on its day. */
export async function restoreCommitment(itemId: string): Promise<Result> {
  const guard = await assertCanManageCommitment(itemId);
  if (!guard.ok) return guard;
  try {
    await db
      .update(dailyChecklist)
      .set({ abandonedAt: null, abandonedById: null, updatedAt: new Date() })
      .where(eq(dailyChecklist.id, itemId));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Permanently delete a cancelled commitment (irreversible). */
export async function purgeCommitment(itemId: string): Promise<Result> {
  const guard = await assertCanManageCommitment(itemId);
  if (!guard.ok) return guard;
  try {
    await db.delete(dailyChecklist).where(eq(dailyChecklist.id, itemId));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
