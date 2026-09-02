/**
 * PMS Layer 2 — OPTIONAL one-time backfill (mig 0095).
 *
 * Projections only see events that are IN the event_log. Operational rows that
 * predate the new employee-domain emits (attendance / goal / dcc / training /
 * feedback) are NOT in the log, so the twin / score-daily projections start
 * empty for historical activity. This script reads those operational tables and
 * appends SYNTHETIC v1 events carrying their ORIGINAL occurredAt, so a one-time
 * rebuild materialises the back-history.
 *
 * Manual + run-once. Idempotency: it ABORTS if any employee-domain event already
 * exists in the log (so it never double-seeds). After it runs, do a rebuild:
 *   pnpm tsx --env-file=.env.local scripts/seed-pms-events.ts
 *   pnpm tsx --env-file=.env.local scripts/rebuild-employee-twin.ts
 *   pnpm tsx --env-file=.env.local scripts/rebuild-employee-score.ts
 *
 * `late` is seeded null (ungradable from history without per-employee schedule
 * + check-in clock) — presence still counts; the projection ignores null late.
 */
import { and, eq, isNotNull, inArray } from "drizzle-orm";
import {
  db,
  eventLog,
  attendanceLogs,
  weeklyGoalActuals,
  weeklyGoals,
  dccEntries,
  dccKpiItems,
  tcAttempts,
  tcWatchProgress,
  tcFeedback,
} from "@/lib/db";
import { emitMany } from "@/lib/events/emit";
import { attendancePunched } from "@/lib/events/attendance-events";
import { goalProgressLogged } from "@/lib/events/goal-events";
import { dccEntryFilled } from "@/lib/events/dcc-events";
import { trainingTestAttempted, trainingMaterialWatched } from "@/lib/events/training-events";
import { feedbackReceived } from "@/lib/events/feedback-events";
import type { EventEnvelope } from "@/lib/events/types";
import {
  ATTENDANCE_AGGREGATE,
  GOAL_AGGREGATE,
  DCC_AGGREGATE,
  TRAINING_AGGREGATE,
  FEEDBACK_AGGREGATE,
} from "@/lib/events/types";

const PMS_AGGREGATES = [
  ATTENDANCE_AGGREGATE,
  GOAL_AGGREGATE,
  DCC_AGGREGATE,
  TRAINING_AGGREGATE,
  FEEDBACK_AGGREGATE,
];

function ymd(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

async function main() {
  if (process.env.OUTBOX_EMIT_OFF === "true") {
    throw new Error("OUTBOX_EMIT_OFF is set — unset it before seeding.");
  }
  const existing = await db
    .select({ seq: eventLog.seq })
    .from(eventLog)
    .where(inArray(eventLog.aggregateType, PMS_AGGREGATES))
    .limit(1);
  if (existing.length > 0) {
    throw new Error(
      "event_log already contains employee-domain events — backfill aborted (would double-seed). " +
        "Run only on a log with no PMS events.",
    );
  }

  const events: EventEnvelope[] = [];

  // ── Attendance (IN punches drive presence/late). ──
  const punches = await db
    .select({
      employeeId: attendanceLogs.employeeId,
      logDate: attendanceLogs.logDate,
      kind: attendanceLogs.kind,
      verifyMethod: attendanceLogs.verifyMethod,
      source: attendanceLogs.source,
      loggedAt: attendanceLogs.loggedAt,
    })
    .from(attendanceLogs);
  for (const p of punches) {
    events.push(
      attendancePunched(
        p.employeeId,
        {
          employeeId: p.employeeId,
          logDate: ymd(p.logDate),
          kind: p.kind,
          late: null,
          verifyMethod: p.verifyMethod ?? null,
          source: p.source ?? "self",
        },
        { actorId: p.employeeId, occurredAt: new Date(p.loggedAt) },
      ),
    );
  }

  // ── Goal progress (denormalise weight + weekStart from the goal). ──
  const actuals = await db
    .select({
      goalId: weeklyGoalActuals.goalId,
      employeeId: weeklyGoalActuals.employeeId,
      entryDate: weeklyGoalActuals.entryDate,
      pct: weeklyGoalActuals.pct,
      createdAt: weeklyGoalActuals.createdAt,
      weekStart: weeklyGoals.weekStart,
      weight: weeklyGoals.weight,
    })
    .from(weeklyGoalActuals)
    .innerJoin(weeklyGoals, eq(weeklyGoalActuals.goalId, weeklyGoals.id));
  for (const a of actuals) {
    events.push(
      goalProgressLogged(
        a.goalId,
        {
          employeeId: a.employeeId,
          goalId: a.goalId,
          entryDate: ymd(a.entryDate),
          weekStart: ymd(a.weekStart),
          pctDone: a.pct,
          weight: a.weight,
          filledOnTime: true,
        },
        { actorId: a.employeeId, occurredAt: new Date(a.createdAt) },
      ),
    );
  }

  // ── DCC entries (denormalise owner + target from the item). ──
  const entries = await db
    .select({
      itemId: dccEntries.itemId,
      entryDate: dccEntries.entryDate,
      status: dccEntries.status,
      valueNumber: dccEntries.valueNumber,
      updatedAt: dccEntries.updatedAt,
      owner: dccKpiItems.ownerEmployeeId,
      target: dccKpiItems.targetNumber,
    })
    .from(dccEntries)
    .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id));
  for (const e of entries) {
    events.push(
      dccEntryFilled(
        e.itemId,
        {
          employeeId: e.owner,
          itemId: e.itemId,
          entryDate: ymd(e.entryDate),
          status: (e.status ?? "Pending") as "Done" | "Not done" | "NA" | "Pending",
          valueNumber: e.valueNumber === null ? null : Number(e.valueNumber),
          targetNumber: e.target === null ? null : Number(e.target),
        },
        { actorId: e.owner, occurredAt: new Date(e.updatedAt) },
      ),
    );
  }

  // ── Training test attempts. ──
  const attempts = await db
    .select({
      id: tcAttempts.id,
      testId: tcAttempts.testId,
      employeeId: tcAttempts.employeeId,
      score: tcAttempts.score,
      passed: tcAttempts.passed,
      takenAt: tcAttempts.takenAt,
    })
    .from(tcAttempts);
  for (const at of attempts) {
    events.push(
      trainingTestAttempted(
        at.testId,
        {
          employeeId: at.employeeId,
          testId: at.testId,
          score: at.score,
          passed: at.passed,
          takenAt: new Date(at.takenAt).toISOString(),
        },
        { actorId: at.employeeId, occurredAt: new Date(at.takenAt) },
      ),
    );
  }

  // ── Training materials watched. ──
  const watched = await db
    .select({
      materialId: tcWatchProgress.materialId,
      employeeId: tcWatchProgress.employeeId,
      watchedAt: tcWatchProgress.watchedAt,
    })
    .from(tcWatchProgress);
  for (const w of watched) {
    events.push(
      trainingMaterialWatched(
        w.materialId,
        { employeeId: w.employeeId, materialId: w.materialId },
        { actorId: w.employeeId, occurredAt: new Date(w.watchedAt) },
      ),
    );
  }

  // ── Feedback received (only rows tied to a staff member). ──
  const feedback = await db
    .select({
      id: tcFeedback.id,
      ratedEmployeeId: tcFeedback.ratedEmployeeId,
      rating: tcFeedback.rating,
      type: tcFeedback.type,
      createdAt: tcFeedback.createdAt,
    })
    .from(tcFeedback)
    .where(and(isNotNull(tcFeedback.ratedEmployeeId)));
  for (const f of feedback) {
    events.push(
      feedbackReceived(
        f.id,
        { employeeId: f.ratedEmployeeId, feedbackId: f.id, rating: f.rating ?? null, type: f.type ?? null },
        { actorId: f.ratedEmployeeId ?? f.id, occurredAt: new Date(f.createdAt) },
      ),
    );
  }

  console.log(
    `seeding ${events.length} synthetic PMS events ` +
      `(${punches.length} punches, ${actuals.length} goal-actuals, ${entries.length} dcc, ` +
      `${attempts.length} attempts, ${watched.length} watched, ${feedback.length} feedback)…`,
  );

  // Append in chunks inside transactions (large back-history shouldn't be one
  // giant statement).
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    const slice = events.slice(i, i + CHUNK);
    await db.transaction(async (tx) => {
      await emitMany(tx, slice);
    });
  }
  console.log(`✓ seeded ${events.length} events — now run the two rebuild scripts.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
