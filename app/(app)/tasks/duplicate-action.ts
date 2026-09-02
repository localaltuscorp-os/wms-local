"use server";

/** Duplicate a task — a fresh not-started copy owned by the same doer. Returns
 *  the new task id so the client can navigate to it. */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

export async function duplicateTask(
  taskId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [src] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!src) return { ok: false, error: "Task not found." };

  const [row] = await db
    .insert(tasks)
    .values({
      title: `${src.title} (copy)`,
      description: src.description,
      subject: src.subject,
      client: src.client,
      priority: src.priority,
      status: "not_started",
      doerId: src.doerId,
      initiatorId: me.id,
      createdById: me.id,
      dueAt: src.dueAt,
      tags: src.tags,
      estimatedMinutes: src.estimatedMinutes,
      notes: src.notes,
    })
    .returning({ id: tasks.id });
  if (!row) return { ok: false, error: "Could not duplicate the task." };

  revalidatePath("/tasks");
  return { ok: true, id: row.id };
}
