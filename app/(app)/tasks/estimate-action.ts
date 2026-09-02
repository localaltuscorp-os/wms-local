"use server";

/** Set/clear a task's Estimated Time (minutes). Doer, manager, or admin. */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

export async function setTaskEstimatedMinutes(
  taskId: string,
  minutes: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [row] = await db
    .select({ doerId: tasks.doerId, managerId: employees.managerId })
    .from(tasks)
    .leftJoin(employees, eq(employees.id, tasks.doerId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) return { ok: false, error: "Task not found." };
  const allowed = me.isAdmin || me.id === row.doerId || me.id === row.managerId;
  if (!allowed) return { ok: false, error: "Not allowed." };

  const clean = minutes == null || minutes <= 0 ? null : Math.min(100000, Math.round(minutes));
  await db.update(tasks).set({ estimatedMinutes: clean, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
