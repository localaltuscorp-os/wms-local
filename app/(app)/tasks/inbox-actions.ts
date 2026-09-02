"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, tasks } from "@/lib/db";
import { pinnedItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { CACHE_TAGS, PROFILE_CACHE_TAGS } from "@/lib/cache-tags";
import { rateLimitOrError } from "@/lib/rate-limit";

/**
 * Actions behind the Gmail-style task inbox: the read/unread toggle and the
 * star. Kept out of tasks/actions.ts for the same reason read-actions.ts is —
 * that module is already very large and these are self-contained.
 *
 * Read state reuses `tasks.first_read_at`, the column the NOT READ KPI already
 * counts, so "unread" means the same thing in the inbox as it does on the
 * dashboard. Starring reuses `pinned_items` (kind = "task"), the same shelf
 * /profile pins onto — star a task here and it shows up there, deliberately.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BULK = 500;

type Result = { ok: true } | { ok: false; error: string };

/** Only a participant (or an admin) may touch a task's read receipt —
 *  otherwise anyone could flip first_read_at on an arbitrary task id. */
function visibleToMe(me: { id: string; isAdmin: boolean }) {
  return me.isAdmin
    ? undefined
    : or(
        eq(tasks.doerId, me.id),
        eq(tasks.initiatorId, me.id),
        eq(tasks.createdById, me.id),
      );
}

/**
 * Flip one task between read and unread.
 *
 * Unlike `markTaskRead` (fire-and-forget, NULL-guarded, only ever sets), this
 * is the deliberate user action, so it writes in both directions: `read: false`
 * clears first_read_at and the row goes bold again.
 */
export async function setTaskRead(
  taskId: string,
  read: boolean,
): Promise<Result> {
  if (!UUID.test(taskId)) return { ok: false, error: "Invalid task id." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  try {
    await db
      .update(tasks)
      .set({ firstReadAt: read ? new Date() : null })
      .where(and(eq(tasks.id, taskId), visibleToMe(me)));
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  updateTag(CACHE_TAGS.tasks);
  return { ok: true };
}

/** Batch read/unread for the selection toolbar. */
export async function bulkSetRead(
  taskIds: string[],
  read: boolean,
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const ids = Array.from(
    new Set(taskIds.filter((x): x is string => typeof x === "string")),
  );
  if (ids.length === 0 || ids.length > MAX_BULK || !ids.every((i) => UUID.test(i)))
    return { ok: false, error: "Invalid selection." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  try {
    await db
      .update(tasks)
      .set({ firstReadAt: read ? new Date() : null })
      .where(and(inArray(tasks.id, ids), visibleToMe(me)));
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  updateTag(CACHE_TAGS.tasks);
  return { ok: true, updated: ids.length };
}

/**
 * Star / unstar a task for the CURRENT user.
 *
 * `unpinItem` in profile/actions.ts keys on the pin's own id, which the inbox
 * row doesn't know — it knows the task id. So this resolves the row by
 * (employee, kind, item) instead of threading pin ids through the list.
 */
export async function setTaskStarred(
  taskId: string,
  starred: boolean,
): Promise<Result> {
  if (!UUID.test(taskId)) return { ok: false, error: "Invalid task id." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const where = and(
    eq(pinnedItems.employeeId, me.id),
    eq(pinnedItems.kind, "task"),
    eq(pinnedItems.itemId, taskId),
  );

  try {
    if (starred) {
      // Guard against double-insert: the table has no unique constraint on
      // (employee, kind, item), so a double-click would otherwise leave two
      // pins for one task and the star would need two clicks to clear.
      const existing = await db
        .select({ id: pinnedItems.id })
        .from(pinnedItems)
        .where(where)
        .limit(1);
      if (existing.length === 0) {
        await db
          .insert(pinnedItems)
          .values({ employeeId: me.id, kind: "task", itemId: taskId });
      }
    } else {
      await db.delete(pinnedItems).where(where);
    }
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  updateTag(PROFILE_CACHE_TAGS.pinnedItems(me.id));
  return { ok: true };
}
