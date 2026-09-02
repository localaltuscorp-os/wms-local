import { eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { taskEvents } from "@/db/schema";
import { CommentSchema, type CommentInput } from "@/lib/validators/task";
import { canComment } from "@/lib/auth/task-permissions";
import { notifyManyForTask } from "@/lib/notifications/dispatch";
import { taskLabel } from "@/lib/tasks/set-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CommentActor {
  id: string;
  name: string;
  isAdmin: boolean;
}

export type AddCommentResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden"; message?: string };

/**
 * Shared core for posting a comment on a task — validates the body, checks the
 * participant/admin permission, records the `commented` event, and notifies the
 * other participants. Transport-agnostic (auth/rate-limit/revalidate live in the
 * callers) so the web Server Action and the mobile API stay in lockstep.
 */
export async function addTaskComment(
  actor: CommentActor,
  taskId: string,
  input: CommentInput,
): Promise<AddCommentResult> {
  if (!UUID_RE.test(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  let parsed;
  try {
    parsed = CommentSchema.parse(input);
  } catch (err: unknown) {
    return { ok: false, error: "invalid", message: err instanceof Error ? err.message : "Invalid input" };
  }

  const current = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canComment({
      employee: { id: actor.id, isAdmin: actor.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  await db.insert(taskEvents).values({
    taskId,
    actorId: actor.id,
    eventType: "commented",
    toValue: { body: parsed.body },
  });

  const label = taskLabel({ subject: current.subject, title: current.title });
  const preview = parsed.body.length > 140 ? `${parsed.body.slice(0, 140)}…` : parsed.body;
  await notifyManyForTask(taskId, {
    actorId: actor.id,
    kind: "commented",
    title: `${actor.name} commented on '${label}'`,
    body: preview,
    recipients: [current.createdById, current.initiatorId, current.doerId],
  });

  return { ok: true };
}
