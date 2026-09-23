import "server-only";
import { and, eq, inArray, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcSessions, tcSessionAttendees, tcShareSchedule, employees } from "@/db/schema";
import { listEmployees } from "@/lib/queries/employees";
import { learningRoleGroupFor } from "@/lib/training/roles";
import { computePersonActuals, effectiveTargetFor } from "@/lib/queries/learning-targets";
import { notify } from "@/lib/notifications/dispatch";

/**
 * The reminder pass, run daily by `app/api/cron/training-reminders`. Emits the
 * reminder-kind notifications that no single user action produces:
 *   · learning_target_incomplete / learning_target_approaching — per person,
 *     against their role's targets.
 *   · learning_share_reminder — to a presenter whose share is due today.
 *   · training_recording_incomplete — to attendees who missed a completed
 *     session and have not yet been marked completed-via-recording.
 * Best-effort; never throws.
 */

export interface ReminderStats {
  targetIncomplete: number;
  targetApproaching: number;
  shareReminders: number;
  recordingIncomplete: number;
}

function monthWindow(now: Date): { start: string; end: string; lastDay: number } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, lastDay };
}

export async function runTrainingReminders(now: Date = new Date()): Promise<ReminderStats> {
  const stats: ReminderStats = { targetIncomplete: 0, targetApproaching: 0, shareReminders: 0, recordingIncomplete: 0 };
  const { start, end, lastDay } = monthWindow(now);
  const today = now.toISOString().slice(0, 10);
  const approaching = lastDay - now.getDate() <= 5;

  const people = await listEmployees({ includeInactive: false }).catch(() => []);

  for (const e of people) {
    const role = await learningRoleGroupFor(e).catch(() => "employee" as const);
    const actuals = await computePersonActuals(e.id, start, end).catch(() => null);
    if (!actuals) continue;
    const attendTarget = await effectiveTargetFor(role, "trainings_attend", end).catch(() => 0);
    const selfTarget = await effectiveTargetFor(role, "self_learning_hours", end).catch(() => 0);

    const behind =
      (attendTarget > 0 && actuals.trainingsAttended < attendTarget) ||
      (selfTarget > 0 && actuals.selfLearningHours < selfTarget);

    if (behind) {
      if (approaching) {
        await notify({
          userId: e.id,
          kind: "learning_target_approaching",
          title: "Monthly learning target approaching",
          body: `Trainings ${actuals.trainingsAttended}/${attendTarget} · self-learning ${actuals.selfLearningHours}/${selfTarget}h.`,
        });
        stats.targetApproaching++;
      } else if (now.getDate() >= Math.max(7, Math.floor(lastDay / 2))) {
        await notify({
          userId: e.id,
          kind: "learning_target_incomplete",
          title: "Monthly learning target incomplete",
          body: `Trainings ${actuals.trainingsAttended}/${attendTarget} · self-learning ${actuals.selfLearningHours}/${selfTarget}h.`,
        });
        stats.targetIncomplete++;
      }
    }
  }

  // Share reminder — presenters due today.
  const dueShares = await db
    .select({ id: tcShareSchedule.id, presenterId: tcShareSchedule.presenterId })
    .from(tcShareSchedule)
    .where(and(eq(tcShareSchedule.shareDate, today), eq(tcShareSchedule.status, "scheduled")))
    .catch(() => []);
  for (const s of dueShares) {
    if (!s.presenterId) continue;
    await notify({
      userId: s.presenterId,
      kind: "learning_share_reminder",
      title: "Your learning share is today",
      body: "10 minutes — juniors 1:30 PM, team leads 1:40 PM.",
    });
    stats.shareReminders++;
  }

  // Recording incomplete — missed a completed session and not yet marked.
  const missed = await db
    .select({
      employeeId: tcSessionAttendees.employeeId,
      topic: tcSessions.topic,
    })
    .from(tcSessionAttendees)
    .innerJoin(tcSessions, eq(tcSessions.id, tcSessionAttendees.sessionId))
    .where(
      and(
        inArray(tcSessions.status, ["done", "completed", "closed"]),
        inArray(tcSessionAttendees.status, ["invited", "absent"]),
      ),
    )
    .catch(() => []);
  for (const m of missed) {
    await notify({
      userId: m.employeeId,
      kind: "training_recording_incomplete",
      title: `Recording to watch: ${m.topic}`,
      body: "Watch the full recording to count this training as completed.",
    });
    stats.recordingIncomplete++;
  }

  return stats;
}
