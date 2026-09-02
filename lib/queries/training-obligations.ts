/**
 * Training Obligations — the read layer for the per-person give/attend/self-learn/
 * share-vs-target view that makes the Skill-Upgrade pillar legible. server-only.
 *
 * This is the manager/admin analytics surface, NOT the hot dashboard load path.
 * It batches every signal over the whole roster in a fixed number of indexed
 * group-by queries (independent of roster size), mirroring the exact query shapes
 * `lib/queries/pms.ts#gatherSignals` uses for tcSessions / tcSessionAttendees /
 * tcSelfLearning / tcShares, each wrapped in withRetry so a stale pooled
 * connection self-heals. The targets come from the single PMS score config
 * (`getScoreConfig().thresholds`) — no policy is hardcoded here.
 *
 * The IST month context is computed locally the same way pms.ts#periodCtx() does,
 * so this file is self-contained and never drifts from the scorer's month bounds.
 */
import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  employees,
  tcSessions,
  tcSessionAttendees,
  tcSelfLearning,
  tcShares,
} from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { getScoreConfig } from "@/lib/queries/pms";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/** The IST-month window the obligations are pro-rated against. Mirrors the shape
 *  the scorer's periodCtx() exposes so callers can build it once and reuse it. */
export interface ObligationPeriod {
  period: string; // 'YYYY-MM'
  monthStart: string; // 'YYYY-MM-DD' (date-column bound, inclusive)
  monthEnd: string; // 'YYYY-MM-DD' (exclusive)
  monthStartInstant: Date; // timestamptz bound for tcSessions.scheduledAt
  periodFraction: number; // 0..1 of the month elapsed
  weeksElapsed: number; // expected weekly Shares so far this month
}

/** Build the current IST-month context — identical math to pms.ts#periodCtx(). */
export function currentObligationPeriod(): ObligationPeriod {
  const ist = new Date(Date.now() + 5.5 * 3_600_000); // UTC components == IST wall clock
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth(); // 0-based
  const period = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthStart = `${period}-01`;
  const next = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
  const monthEnd = `${next.y}-${String(next.m + 1).padStart(2, "0")}-01`;
  const monthStartInstant = new Date(Date.UTC(y, m, 1) - 5.5 * 3_600_000);
  const dayOfMonth = ist.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    period,
    monthStart,
    monthEnd,
    monthStartInstant,
    periodFraction: Math.min(1, dayOfMonth / daysInMonth),
    weeksElapsed: Math.max(1, Math.ceil(dayOfMonth / 7)),
  };
}

/** Per-month training obligation targets, straight from the PMS score config. */
export interface ObligationTargets {
  giveHours: number; // managers must GIVE this many hours/month
  attendHours: number; // everyone must ATTEND this many hours/month
  selfLearnHours: number; // everyone must self-learn this many hours/month
  shareMinPerWeek: number; // minutes of the compulsory weekly Share
}

/** Everything one person's Skill-Upgrade obligations need to render. */
export interface ObligationRow {
  employeeId: string;
  isManager: boolean;
  givenHours: number; // training delivered (managers only count toward GIVE)
  attendedHours: number;
  selfLearnHours: number;
  sharesDone: number; // distinct weekly Shares logged this month
}

export interface RosterObligations {
  period: ObligationPeriod;
  targets: ObligationTargets;
  weeksElapsed: number; // expected number of Shares so far this month
  rows: ObligationRow[];
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

/**
 * Batch every Skill-Upgrade obligation signal for a roster. Five group-by queries
 * (manager flag, training given, training attended, self-learning, weekly Shares),
 * plus one config read — independent of roster size. [] rows on empty input.
 */
export async function obligationsForRoster(
  employeeIds: string[],
  ctx: ObligationPeriod,
): Promise<RosterObligations> {
  if (employeeIds.length === 0) {
    const cfg = await getScoreConfig();
    return {
      period: ctx,
      targets: targetsFromConfig(cfg.thresholds),
      weeksElapsed: ctx.weeksElapsed,
      rows: [],
    };
  }

  const ids = employeeIds;

  const [cfg, managerRows, givenRows, attendedRows, selfRows, shareRows] = await Promise.all([
    getScoreConfig(),
    // anyone who is a manager_id of an active employee (they carry the GIVE target)
    withRetry(
      () =>
        db
          .selectDistinct({ id: employees.managerId })
          .from(employees)
          .where(and(inArray(employees.managerId, ids), eq(employees.isActive, true))),
      { ...RETRY, label: "obl-managers" },
    ),
    // training GIVEN minutes this month (done sessions where they were the trainer)
    withRetry(
      () =>
        db
          .select({ id: tcSessions.trainerId, m: sql<number>`coalesce(sum(${tcSessions.durationMin}),0)` })
          .from(tcSessions)
          .where(
            and(
              inArray(tcSessions.trainerId, ids),
              eq(tcSessions.status, "done"),
              gte(tcSessions.scheduledAt, ctx.monthStartInstant),
            ),
          )
          .groupBy(tcSessions.trainerId),
      { ...RETRY, label: "obl-given" },
    ),
    // training ATTENDED minutes this month (attended or left-halfway, of done sessions)
    withRetry(
      () =>
        db
          .select({
            id: tcSessionAttendees.employeeId,
            m: sql<number>`coalesce(sum(coalesce(${tcSessionAttendees.attendedMin}, ${tcSessions.durationMin})),0)`,
          })
          .from(tcSessionAttendees)
          .innerJoin(tcSessions, eq(tcSessionAttendees.sessionId, tcSessions.id))
          .where(
            and(
              inArray(tcSessionAttendees.employeeId, ids),
              inArray(tcSessionAttendees.status, ["attended", "left_halfway"]),
              eq(tcSessions.status, "done"),
              gte(tcSessions.scheduledAt, ctx.monthStartInstant),
            ),
          )
          .groupBy(tcSessionAttendees.employeeId),
      { ...RETRY, label: "obl-attended" },
    ),
    // self-learning minutes this month
    withRetry(
      () =>
        db
          .select({ id: tcSelfLearning.employeeId, m: sql<number>`coalesce(sum(${tcSelfLearning.minutes}),0)` })
          .from(tcSelfLearning)
          .where(
            and(
              inArray(tcSelfLearning.employeeId, ids),
              gte(tcSelfLearning.learnDate, ctx.monthStart),
              lt(tcSelfLearning.learnDate, ctx.monthEnd),
            ),
          )
          .groupBy(tcSelfLearning.employeeId),
      { ...RETRY, label: "obl-self-learn" },
    ),
    // weekly Shares logged this month
    withRetry(
      () =>
        db
          .select({ id: tcShares.employeeId, c: sql<number>`count(*)` })
          .from(tcShares)
          .where(
            and(
              inArray(tcShares.employeeId, ids),
              gte(tcShares.weekStart, ctx.monthStart),
              lt(tcShares.weekStart, ctx.monthEnd),
            ),
          )
          .groupBy(tcShares.employeeId),
      { ...RETRY, label: "obl-shares" },
    ),
  ]);

  const isManager = new Map(managerRows.filter((r) => r.id).map((r) => [r.id as string, true]));
  const givenHours = new Map(givenRows.filter((r) => r.id).map((r) => [r.id as string, num(r.m) / 60]));
  const attendedHours = new Map(attendedRows.map((r) => [r.id, num(r.m) / 60]));
  const selfLearnHours = new Map(selfRows.map((r) => [r.id, num(r.m) / 60]));
  const sharesDone = new Map(shareRows.map((r) => [r.id, num(r.c)]));

  const rows: ObligationRow[] = ids.map((id) => ({
    employeeId: id,
    isManager: isManager.get(id) ?? false,
    givenHours: givenHours.get(id) ?? 0,
    attendedHours: attendedHours.get(id) ?? 0,
    selfLearnHours: selfLearnHours.get(id) ?? 0,
    sharesDone: sharesDone.get(id) ?? 0,
  }));

  return {
    period: ctx,
    targets: targetsFromConfig(cfg.thresholds),
    weeksElapsed: ctx.weeksElapsed,
    rows,
  };
}

function targetsFromConfig(t: {
  trainGiveHoursPerMonth: number;
  trainAttendHoursPerMonth: number;
  selfLearnHoursPerMonth: number;
  shareMinPerWeek: number;
}): ObligationTargets {
  return {
    giveHours: t.trainGiveHoursPerMonth,
    attendHours: t.trainAttendHoursPerMonth,
    selfLearnHours: t.selfLearnHoursPerMonth,
    shareMinPerWeek: t.shareMinPerWeek,
  };
}
