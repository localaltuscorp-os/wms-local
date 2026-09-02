import "server-only";
import { eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { employees } from "@/db/schema";
import { createTasksCore } from "@/lib/tasks/create-task";
import { applyTaskStatusChange } from "@/lib/tasks/set-status";
import { getHrAssignmentOwnerId } from "@/lib/hr/assignment-owner";

/**
 * Create the "assignment" task for a candidate, addressed to the configured HR
 * assignment owner (Rutvisha by default). Uses the transport-agnostic
 * createTasksCore (which BYPASSES the weekly-goals gate), then promotes the task
 * out of the default "dont_know" state into "initiated" via the set-status core.
 * Priority is the highest tier ("imp_urgent" → "Critical"), due in 3 days.
 */
export async function createHrAssignmentTask(args: {
  candidateName: string;
  position: string;
  brief: string;
  initiatorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ownerId = await getHrAssignmentOwnerId();
  if (!ownerId) return { ok: false, error: "Set the HR assignment owner in settings" };

  // Resolve the initiator (the actor creating + initiating the task).
  const [actor] = await db
    .select({ id: employees.id, name: employees.name, isAdmin: employees.isAdmin })
    .from(employees)
    .where(eq(employees.id, args.initiatorId))
    .limit(1);
  if (!actor) return { ok: false, error: "Initiator not found" };

  const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const created = await createTasksCore(
    { id: actor.id, name: actor.name },
    {
      title: `Assignment — ${args.candidateName} (${args.position})`,
      description: args.brief,
      initiatorId: args.initiatorId,
      doerId: ownerId,
      priority: "imp_urgent",
      dueAt,
    },
  );
  if (!created.ok) return { ok: false, error: created.error };

  // createTasksCore forces status "dont_know" — promote it to "initiated".
  const [row] = await db
    .select({ updatedAt: tasks.updatedAt })
    .from(tasks)
    .where(eq(tasks.id, created.id))
    .limit(1);
  if (row?.updatedAt) {
    await applyTaskStatusChange(
      { id: actor.id, name: actor.name, isAdmin: actor.isAdmin },
      created.id,
      "initiated",
      row.updatedAt.toISOString(),
    );
  }

  return { ok: true };
}
