"use server";

import { and, eq, isNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, tasks } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Mark a task as read (read-receipt) the first time anyone opens its detail
 * page. Sets first_read_at only when currently NULL, so repeat opens are a
 * cheap no-op. Best-effort: never throws to the caller — the detail page calls
 * this fire-and-forget and must not be blocked or errored by it.
 *
 * Lives in its own file (not tasks/actions.ts) to stay isolated and avoid
 * churn in that large module.
 */
export async function markTaskRead(taskId: string): Promise<void> {
  try {
    await requireUser();
    await db
      .update(tasks)
      .set({ firstReadAt: new Date() })
      .where(and(eq(tasks.id, taskId), isNull(tasks.firstReadAt)));
    updateTag(CACHE_TAGS.tasks);
  } catch (err) {
    console.warn("[markTaskRead] non-fatal:", (err as Error)?.message ?? err);
  }
}
