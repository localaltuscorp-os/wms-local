import { afterResponse } from "@/lib/after";
import { db, tasks } from "@/lib/db";
import { taskEvents } from "@/db/schema";
import { notify } from "@/lib/notifications/dispatch";
import { reconcileTaskEvent } from "@/lib/google/sync";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";
import { CreateTaskSchema, type CreateTaskInput } from "@/lib/validators/task";
import { taskLabel } from "@/lib/tasks/set-status";
import { emit } from "@/lib/events/emit";
import { taskCreated } from "@/lib/events/task-events";
import { nudgeRelay } from "@/lib/relay/nudge";

/**
 * Transport-agnostic core for creating one or more tasks (multi-doer fan-out).
 * Shared by the web Server Action `createTask` and the mobile create API so the
 * short-id derivation, default status, audit event, deferred notifications and
 * Google-Calendar sync stay identical. Auth/rate-limit/revalidate live in the
 * callers.
 */
export async function createTasksCore(
  actor: { id: string; name: string },
  input: CreateTaskInput,
): Promise<{ ok: true; id: string; ids: string[] } | { ok: false; error: string }> {
  let parsed;
  try {
    parsed = CreateTaskSchema.parse(input);
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid input" };
  }

  const doerIds = parsed.doerIds ?? (parsed.doerId ? [parsed.doerId] : []);
  if (doerIds.length === 0) return { ok: false, error: "At least one doer is required" };

  const createdIds: string[] = [];
  const notifyIntents: Array<Parameters<typeof notify>[0]> = [];
  const label = taskLabel({ subject: parsed.subject ?? null, title: parsed.title });

  for (const doerId of doerIds) {
    const taskId = crypto.randomUUID();
    let attempt = 0;
    let row: { id: string } | undefined;
    while (attempt < 23) {
      const shortId =
        attempt === 0 ? deriveShortId(taskId) : nextShortIdCandidate(taskId, attempt);
      if (!shortId) return { ok: false, error: "Could not derive short_id (uuid exhausted)" };
      try {
        [row] = await db
          .insert(tasks)
          .values({
            id: taskId,
            title: parsed.title,
            client: parsed.title,
            description: parsed.description,
            subject: parsed.subject,
            notes: parsed.notes,
            doerId,
            initiatorId: parsed.initiatorId,
            priority: parsed.priority,
            dueAt: parsed.dueAt,
            tags: parsed.tags ?? null,
            startsAt: parsed.startsAt ?? null,
            endsAt: parsed.endsAt ?? null,
            allDay: parsed.allDay ?? false,
            recurrence: parsed.recurrence ?? null,
            recurrenceRule: parsed.recurrenceRule ?? null,
            projectNodeId: parsed.projectNodeId ?? null,
            createdById: actor.id,
            shortId,
            status: "dont_know",
          })
          .returning({ id: tasks.id });
        break;
      } catch (err: unknown) {
        const e = err as { code?: string; constraint?: string; message?: string };
        if (e?.code === "23505" && e?.constraint === "tasks_short_id_uidx") {
          attempt++;
          continue;
        }
        return { ok: false, error: `DB: ${e?.message ?? String(err)}` };
      }
    }
    if (!row) {
      return {
        ok: false,
        error:
          attempt >= 23
            ? "Could not allocate unique short_id after 23 attempts"
            : "Insert returned no row",
      };
    }

    try {
      // Phase B: the audit row AND the domain event commit together (Law 2).
      // The task row itself is already committed above; this pairs the audit +
      // event atomically. A task lacking a Created event is detectable by a
      // projection rebuild, so the tiny window here is recoverable.
      await db.transaction(async (tx) => {
        await tx.insert(taskEvents).values({
          taskId: row!.id,
          actorId: actor.id,
          eventType: "created",
          toValue: {
            title: parsed.title,
            doerId,
            initiatorId: parsed.initiatorId,
            priority: parsed.priority,
            dueAt: parsed.dueAt.toISOString(),
            tags: parsed.tags ?? null,
          },
        });
        await emit(
          tx,
          taskCreated(
            row!.id,
            {
              doerId,
              initiatorId: parsed.initiatorId,
              createdById: actor.id,
              title: parsed.title,
              subject: parsed.subject ?? null,
              priority: parsed.priority,
              status: "dont_know",
              dueAt: parsed.dueAt.toISOString(),
            },
            { actorId: actor.id },
          ),
        );
      });
    } catch (err) {
      console.warn("[createTask] created-event insert failed (non-fatal):", (err as Error)?.message ?? err);
    }

    if (doerId !== actor.id) {
      notifyIntents.push({
        userId: doerId,
        kind: "task_assigned",
        title: `${actor.name} assigned you '${label}'`,
        taskId: row.id,
        actorId: actor.id,
      });
    }
    if (parsed.initiatorId !== actor.id && parsed.initiatorId !== doerId) {
      notifyIntents.push({
        userId: parsed.initiatorId,
        kind: "task_initiated",
        title: `${actor.name} made you initiator on '${label}'`,
        taskId: row.id,
        actorId: actor.id,
      });
    }

    createdIds.push(row.id);
  }

  nudgeRelay(); // low-latency projection update; cron is the durable backstop
  if (notifyIntents.length > 0) {
    afterResponse(async () => {
      for (const intent of notifyIntents) await notify(intent);
    });
  }

  // Calendar sync runs INLINE (in the reliable request context), not in
  // after(): the post-response after() context was silently failing to create
  // events in production (verified — same code works from the cron route
  // handler). reconcileTaskEvent never throws and records its own retry state,
  // so a slow/failed Google call simply leaves the task for the hourly cron to
  // retry. Parallel + an 8s ceiling keeps multi-doer fan-out snappy.
  // DEFERRED (Operation Butter: "persist, then return"). Previously this raced
  // the Google Calendar fan-out inline with an 8s ceiling — task creation could
  // block up to 8s. The silent-failure that once forced inline was the
  // scheme-less source.url bug (fixed via siteUrl()); reconcileTaskEvent records
  // its own retry state and is backstopped by the daily calendar-sync cron, so
  // after() is now both safe and instant (mirrors the deferred notifications).
  afterResponse(() => Promise.allSettled(createdIds.map((id) => reconcileTaskEvent(id))));

  return { ok: true, id: createdIds[0]!, ids: createdIds };
}
