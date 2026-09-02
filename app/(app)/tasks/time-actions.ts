"use server";

/**
 * Task Time Intelligence — Server Actions. Thin transport wrappers around the
 * shared engine (lib/tasks/time/engine.ts): auth + rate-limit + cache
 * revalidation. The rules, event log, session ledger and rollup all live in the
 * engine so the web + (future) mobile clients never diverge.
 */
import { CACHE_TAGS } from "@/lib/cache-tags";
import { revalidatePath, updateTag } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import {
  startWork,
  pauseWork,
  markDone,
  decideApproval,
  restartTimer,
} from "@/lib/tasks/time/engine";
import type { TimeResult, ApprovalVerdict } from "@/lib/tasks/time/types";

const OFF: TimeResult = { ok: false, error: "invalid", message: "Time tracking is disabled." };

function revalidate(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/tasks/time");
  // The task LIST is an unstable_cache keyed on CACHE_TAGS.tasks with a 30s
  // window, and revalidatePath does not touch it — only revalidateTag does.
  // Without this the inline timer in the table would keep reporting the old
  // state for up to 30s after a Start or Stop, because the row it reads comes
  // from that cache. Every other task mutation already does this
  // (tasks/actions.ts); the time actions were the gap.
  updateTag(CACHE_TAGS.tasks);
}

export async function startWorkAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await startWork({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function pauseWorkAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await pauseWork({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function restartTimerAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await restartTimer({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function markDoneAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await markDone({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function decideApprovalAction(
  taskId: string,
  verdict: ApprovalVerdict,
  comment?: string,
): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await decideApproval(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    taskId,
    verdict,
    comment,
  );
  if (res.ok) revalidate(taskId);
  return res;
}
