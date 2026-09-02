import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import { notify } from "@/lib/notifications/dispatch";

/**
 * Nudge core — the on-demand "⚡ ping" path.
 *
 * Permission gate: only the task's **initiator**, the **doer's direct
 * manager** (`doer.managerId === me.id`), or an **admin** may nudge the
 * doer. Everyone else (including the doer themselves) is rejected.
 *
 * On success we dispatch a single in-app notification of the new
 * `"nudged"` kind to the doer. Web-push rides along automatically when
 * the doer is subscribed — `notify()` fans the same payload out to every
 * channel the recipient (and the org matrix) allows; nudges are routed
 * inbox + push only (email is suppressed in lib/email/resend.ts, and no
 * Slack/WhatsApp template is registered beyond the placeholder).
 *
 * I/O-only; no mutation of the task itself, so this never touches the
 * dashboard load path. Returns the codebase's standard Result shape.
 */
export async function nudgeTaskCore(
  me: { id: string; name: string; isAdmin: boolean },
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: {
      id: true,
      title: true,
      initiatorId: true,
      doerId: true,
    },
  });
  if (!task) return { ok: false, error: "Task not found." };

  // Can't nudge yourself.
  if (task.doerId === me.id) {
    return { ok: false, error: "You can't nudge yourself." };
  }

  // Permission: admin OR initiator OR the doer's direct manager.
  let allowed = me.isAdmin || task.initiatorId === me.id;
  if (!allowed) {
    const doer = await db.query.employees.findFirst({
      where: eq(employees.id, task.doerId),
      columns: { managerId: true },
    });
    allowed = !!doer && doer.managerId === me.id;
  }
  if (!allowed) {
    return {
      ok: false,
      error: "Only the initiator, the doer's manager, or an admin can nudge.",
    };
  }

  // In-app + push fan-out to the doer. notify() is best-effort and never
  // throws — a channel hiccup can't fail the nudge.
  await notify({
    userId: task.doerId,
    kind: "nudged",
    title: `⚡ ${me.name} nudged you on: ${task.title}`,
    taskId: task.id,
    actorId: me.id,
  });

  return { ok: true };
}
