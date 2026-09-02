"use server";

/**
 * Server Actions for the per-task Checklist. Every mutation is authed +
 * rate-limited and revalidates the owning task's detail page so the server
 * component re-reads the list.
 */
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { taskChecklistItems, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditTaskFields } from "@/lib/auth/task-permissions";

type Result = { ok: true } | { ok: false; error: string };

const MAX_LABEL = 300;

/**
 * AUTHZ: every checklist mutation used to trust a client-supplied item/task id
 * with only `requireUser()`, so any employee could toggle/rename/delete/add
 * items on ANYONE's task (IDOR). Gate each on whether the caller may edit the
 * OWNING task's fields (creator / initiator / doer / admin — same predicate the
 * rest of the task-detail edits use).
 */
async function mayEditTask(taskId: string, me: { id: string; isAdmin: boolean }): Promise<boolean> {
  if (!taskId) return false;
  const [t] = await db
    .select({
      createdById: tasks.createdById,
      initiatorId: tasks.initiatorId,
      doerId: tasks.doerId,
      status: tasks.status,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return false;
  return canEditTaskFields({ employee: { id: me.id, isAdmin: me.isAdmin }, task: t });
}

const FORBIDDEN: Result = { ok: false, error: "You don't have access to this task." };

/** Append a checklist item to a task (next sort order). */
export async function addChecklistItem(taskId: string, label: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a checklist item." };
  if (clean.length > MAX_LABEL) return { ok: false, error: `Keep it under ${MAX_LABEL} characters.` };
  if (!taskId) return { ok: false, error: "Missing task." };
  if (!(await mayEditTask(taskId, me))) return FORBIDDEN;

  const [last] = await db
    .select({ sortOrder: taskChecklistItems.sortOrder })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(desc(taskChecklistItems.sortOrder))
    .limit(1);
  const nextOrder = (last?.sortOrder ?? -1) + 1;

  await db.insert(taskChecklistItems).values({
    taskId,
    label: clean,
    sortOrder: nextOrder,
    createdById: me.id,
  });

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/** Toggle an item's done state, stamping/clearing doneAt + doneById. */
export async function toggleChecklistItem(itemId: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [item] = await db
    .select({ taskId: taskChecklistItems.taskId, done: taskChecklistItems.done })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (!(await mayEditTask(item.taskId, me))) return FORBIDDEN;

  const nextDone = !item.done;
  await db
    .update(taskChecklistItems)
    .set({
      done: nextDone,
      doneAt: nextDone ? new Date() : null,
      doneById: nextDone ? me.id : null,
    })
    .where(eq(taskChecklistItems.id, itemId));

  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}

/** Rename an item's label. */
export async function renameChecklistItem(itemId: string, label: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a checklist item." };
  if (clean.length > MAX_LABEL) return { ok: false, error: `Keep it under ${MAX_LABEL} characters.` };

  const [item] = await db
    .select({ taskId: taskChecklistItems.taskId })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (!(await mayEditTask(item.taskId, me))) return FORBIDDEN;

  await db
    .update(taskChecklistItems)
    .set({ label: clean })
    .where(eq(taskChecklistItems.id, itemId));

  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}

/** Delete an item. */
export async function deleteChecklistItem(itemId: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [item] = await db
    .select({ taskId: taskChecklistItems.taskId })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (!(await mayEditTask(item.taskId, me))) return FORBIDDEN;

  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId));

  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}
