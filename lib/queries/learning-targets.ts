import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcLearningTargets,
  tcSessionAttendees,
  tcSessions,
  tcSelfLearning,
  tcShareSchedule,
  employees,
} from "@/db/schema";
import type { LearningMetric, LearningRoleGroup } from "@/db/enums";
import { LEARNING_METRICS, LEARNING_ROLE_GROUPS } from "@/db/enums";
import { isFounderEmail } from "@/lib/auth/founder";

/**
 * The DEFAULT targets, per role — used when no explicit `tc_learning_targets`
 * row is in effect, and shown as the starting point on the configuration page.
 * These are FALLBACKS, not the source of truth: an admin's explicit row wins.
 */
export const DEFAULT_TARGETS: Record<LearningRoleGroup, Record<LearningMetric, number>> = {
  employee: {
    trainings_attend: 4,
    trainings_conduct: 0,
    trainings_attend_from_manan: 0,
    self_learning_hours: 4,
    learning_shares: 4,
  },
  tl: {
    trainings_attend: 2,
    trainings_conduct: 4,
    trainings_attend_from_manan: 2,
    self_learning_hours: 2,
    learning_shares: 4,
  },
  manager: {
    trainings_attend: 2,
    trainings_conduct: 4,
    trainings_attend_from_manan: 2,
    self_learning_hours: 2,
    learning_shares: 4,
  },
  manan: {
    trainings_attend: 0,
    trainings_conduct: 0,
    trainings_attend_from_manan: 0,
    self_learning_hours: 4,
    learning_shares: 0,
  },
};

export interface LearningTargetRow {
  id: string;
  roleGroup: LearningRoleGroup;
  metric: LearningMetric;
  value: number;
  unit: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export async function listLearningTargets(): Promise<LearningTargetRow[]> {
  const rows = await db
    .select({
      id: tcLearningTargets.id,
      roleGroup: tcLearningTargets.roleGroup,
      metric: tcLearningTargets.metric,
      value: tcLearningTargets.value,
      unit: tcLearningTargets.unit,
      effectiveFrom: tcLearningTargets.effectiveFrom,
      effectiveTo: tcLearningTargets.effectiveTo,
    })
    .from(tcLearningTargets)
    .orderBy(tcLearningTargets.roleGroup, tcLearningTargets.metric, tcLearningTargets.effectiveFrom);

  return rows.map((r) => ({
    id: r.id,
    roleGroup: r.roleGroup as LearningRoleGroup,
    metric: r.metric as LearningMetric,
    value: Number(r.value),
    unit: r.unit,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));
}

/** The single effective target for a role/metric on `onDate`, else the default. */
export async function effectiveTargetFor(
  roleGroup: LearningRoleGroup,
  metric: LearningMetric,
  onDate: string,
): Promise<number> {
  const [row] = await db
    .select({ value: tcLearningTargets.value })
    .from(tcLearningTargets)
    .where(
      and(
        eq(tcLearningTargets.roleGroup, roleGroup),
        eq(tcLearningTargets.metric, metric),
        lte(tcLearningTargets.effectiveFrom, onDate),
        sql`(${tcLearningTargets.effectiveTo} is null or ${tcLearningTargets.effectiveTo} >= ${onDate})`,
      ),
    )
    .orderBy(sql`${tcLearningTargets.effectiveFrom} desc`)
    .limit(1);

  return row ? Number(row.value) : DEFAULT_TARGETS[roleGroup][metric];
}

export interface PersonActuals {
  trainingsAttended: number;
  trainingsConducted: number;
  selfLearningHours: number;
  learningShares: number;
}

/** Attendee statuses that count as "attended" toward the monthly target. */
const ATTENDED = ["attended", "present", "late", "partial", "completed_via_recording", "left_halfway"] as const;

/** Count the concrete activity a person actually did in the given month. */
export async function computePersonActuals(
  employeeId: string,
  monthStart: string,
  monthEnd: string,
): Promise<PersonActuals> {
  const [attended, conducted, selfLearn, shares] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${tcSessionAttendees.sessionId})::int` })
      .from(tcSessionAttendees)
      .innerJoin(tcSessions, eq(tcSessions.id, tcSessionAttendees.sessionId))
      .where(
        and(
          eq(tcSessionAttendees.employeeId, employeeId),
          inArray(tcSessionAttendees.status, ATTENDED),
          gte(tcSessions.scheduledAt, new Date(monthStart)),
          lte(tcSessions.scheduledAt, new Date(monthEnd)),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tcSessions)
      .where(
        and(
          eq(tcSessions.trainerId, employeeId),
          inArray(tcSessions.status, ["done", "completed", "closed"]),
          gte(tcSessions.scheduledAt, new Date(monthStart)),
          lte(tcSessions.scheduledAt, new Date(monthEnd)),
        ),
      ),
    db
      .select({ m: sql<number>`coalesce(sum(${tcSelfLearning.minutes}),0)::int` })
      .from(tcSelfLearning)
      .where(
        and(
          eq(tcSelfLearning.employeeId, employeeId),
          gte(tcSelfLearning.learnDate, monthStart),
          lte(tcSelfLearning.learnDate, monthEnd),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tcShareSchedule)
      .where(
        and(
          eq(tcShareSchedule.presenterId, employeeId),
          eq(tcShareSchedule.status, "done"),
          gte(tcShareSchedule.shareDate, monthStart),
          lte(tcShareSchedule.shareDate, monthEnd),
        ),
      ),
  ]);

  return {
    trainingsAttended: attended[0]?.n ?? 0,
    trainingsConducted: conducted[0]?.n ?? 0,
    selfLearningHours: Math.round(((selfLearn[0]?.m ?? 0) / 60) * 100) / 100,
    learningShares: shares[0]?.n ?? 0,
  };
}

/** The trainer is "Manan" when the session's trainer is the founder email holder. */
export async function isMananTrainer(trainerId: string | null): Promise<boolean> {
  if (!trainerId) return false;
  const [e] = await db.select({ email: employees.email }).from(employees).where(eq(employees.id, trainerId)).limit(1);
  return e ? isFounderEmail(e.email) : false;
}

export { LEARNING_METRICS, LEARNING_ROLE_GROUPS };
