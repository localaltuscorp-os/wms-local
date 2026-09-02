/**
 * PMS Layer 2 — the read layer (mig 0095 + v2 in 0096). server-only.
 *
 * Wires the PURE engines to live data. The cheap signals (attendance/goals/dcc/
 * tests/feedback) come from the rebuildable `employee_twin` projection; the v2
 * pillars that are monthly aggregates (incentive attainment, training hours,
 * self-learning, weekly Share, daily-checklist, the 360 review ratings) are read
 * at score time — BATCHED over the whole roster (≈10 indexed group-by queries,
 * independent of roster size) and each wrapped in withRetry so a stale pooled
 * connection self-heals. The engines stay pure; ALL policy lives in
 * pms_score_config. This is an admin/manager analytics surface, not the hot
 * dashboard load path.
 */
import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  pmsScoreConfig,
  employees,
  tcSessions,
  tcSessionAttendees,
  tcSelfLearning,
  tcShares,
  dailyChecklist,
  pmsMonthlyReview,
  weeklyGoals,
  dccEntries,
  dccKpiItems,
} from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { getEmployeeTwin } from "@/lib/projections/employee-twin";
import { getEmployeeScoreDaily } from "@/lib/projections/employee-score-daily";
import { parseScoreConfig, type PmsScoreConfig } from "@/lib/pms/engines/config";
import { computeScore, type ScoreInput, type ScoreResult } from "@/lib/pms/engines/score";
import { evaluatePromotion, type PromotionEvaluation } from "@/lib/pms/engines/promotion";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/** Read (and parse) the singleton score config. The id='default' row is seeded by
 *  mig 0096 (v2 model); if it's somehow absent we parse an empty shape. */
export async function getScoreConfig(): Promise<PmsScoreConfig> {
  const rows = await withRetry(
    () => db.select().from(pmsScoreConfig).where(eq(pmsScoreConfig.id, "default")).limit(1),
    { ...RETRY, label: "pms-config" },
  );
  const row = rows[0];
  return parseScoreConfig({
    weights: row?.weights ?? {},
    thresholds: row?.thresholds ?? {},
    formula: row?.formula ?? {},
  });
}

/** The current Twin snapshot for a set of employees. [] on empty input. */
export async function getTwins(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return withRetry(() => getEmployeeTwin(employeeIds), { ...RETRY, label: "pms-twins" });
}

/** The score-trend daily series for one employee over a window. */
export async function getScoreTrend(employeeId: string, range: { start: string; end: string }) {
  return withRetry(
    () => getEmployeeScoreDaily({ employeeIds: [employeeId], start: range.start, end: range.end }),
    { ...RETRY, label: "pms-trend" },
  );
}

// ── Period context (IST month) — pro-rates the monthly obligations. ──────────
interface PeriodCtx {
  period: string; // 'YYYY-MM'
  year: number;
  monthStart: string; // 'YYYY-MM-DD' (date-column bound, inclusive)
  monthEnd: string; // 'YYYY-MM-DD' (exclusive)
  monthStartInstant: Date; // timestamptz bound
  periodFraction: number; // 0..1 of the month elapsed
  weeksElapsed: number; // expected weekly Shares so far
}

function periodCtx(): PeriodCtx {
  const ist = new Date(Date.now() + 5.5 * 3_600_000); // UTC components == IST wall clock
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth(); // 0-based
  const period = `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthStart = `${period}-01`;
  const next = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
  const monthEnd = `${next.y}-${String(next.m + 1).padStart(2, "0")}-01`;
  const monthStartInstant = new Date(Date.UTC(y, m, 1) - 5.5 * 3_600_000); // real UTC instant of IST month start
  const dayOfMonth = ist.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    period,
    year: y,
    monthStart,
    monthEnd,
    monthStartInstant,
    periodFraction: Math.min(1, dayOfMonth / daysInMonth),
    weeksElapsed: Math.max(1, Math.ceil(dayOfMonth / 7)),
  };
}

function nameKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

interface GatheredSignals {
  weeklyGoalPct: Map<string, number>; // weight-aware eff % this month (0..100)
  dccDue: Map<string, number>;
  dccDone: Map<string, number>;
  isManager: Map<string, boolean>;
  trainGivenHours: Map<string, number>;
  trainAttendedHours: Map<string, number>;
  selfLearnHours: Map<string, number>;
  sharesDone: Map<string, number>;
  checklistDue: Map<string, number>;
  checklistDone: Map<string, number>;
  attitudeRating: Map<string, number>; // manager review mean (1..5)
  teamworkRating: Map<string, number>; // peer + subordinate review mean (1..5)
  incentiveAttainment: Map<string, number>; // by nameKey → attainment %
  nameById: Map<string, string>;
}

/** Batch-gather every v2 signal for a roster in ~10 group-by queries. */
async function gatherSignals(employeeIds: string[], ctx: PeriodCtx): Promise<GatheredSignals> {
  const ids = employeeIds;
  const mins = (n: unknown) => Number(n ?? 0);

  const [
    weeklyRows,
    dccRows,
    managerRows,
    givenRows,
    attendedRows,
    selfRows,
    shareRows,
    checklistRows,
    mgrReviewRows,
    teamReviewRows,
    nameRows,
  ] = await Promise.all([
    // KPI · weekly goals — weight-aware effective % (COALESCE(accept,pct)) this month
    withRetry(
      () =>
        db
          .select({
            id: weeklyGoals.employeeId,
            effSum: sql<number>`coalesce(sum(coalesce(${weeklyGoals.acceptPct}, ${weeklyGoals.pctDone}) * ${weeklyGoals.weight}),0)`,
            wSum: sql<number>`coalesce(sum(${weeklyGoals.weight}),0)`,
          })
          .from(weeklyGoals)
          .where(and(inArray(weeklyGoals.employeeId, ids), gte(weeklyGoals.weekStart, ctx.monthStart), lt(weeklyGoals.weekStart, ctx.monthEnd), eq(weeklyGoals.archived, false)))
          .groupBy(weeklyGoals.employeeId),
      { ...RETRY, label: "pms-weekly" },
    ),
    // Compliance · DCC — done / due (excluding NA) this month, by KPI owner
    withRetry(
      () =>
        db
          .select({
            id: dccKpiItems.ownerEmployeeId,
            due: sql<number>`coalesce(sum(case when ${dccEntries.status} <> 'NA' then 1 else 0 end),0)`,
            done: sql<number>`coalesce(sum(case when ${dccEntries.status} = 'Done' then 1 else 0 end),0)`,
          })
          .from(dccEntries)
          .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
          .where(and(inArray(dccKpiItems.ownerEmployeeId, ids), gte(dccEntries.entryDate, ctx.monthStart), lt(dccEntries.entryDate, ctx.monthEnd)))
          .groupBy(dccKpiItems.ownerEmployeeId),
      { ...RETRY, label: "pms-dcc" },
    ),
    // anyone who is a manager_id of an active employee
    withRetry(
      () =>
        db
          .selectDistinct({ id: employees.managerId })
          .from(employees)
          .where(and(inArray(employees.managerId, ids), eq(employees.isActive, true))),
      { ...RETRY, label: "pms-managers" },
    ),
    // training GIVEN hours this month (done sessions where they were the trainer)
    withRetry(
      () =>
        db
          .select({ id: tcSessions.trainerId, m: sql<number>`coalesce(sum(${tcSessions.durationMin}),0)` })
          .from(tcSessions)
          .where(and(inArray(tcSessions.trainerId, ids), eq(tcSessions.status, "done"), gte(tcSessions.scheduledAt, ctx.monthStartInstant)))
          .groupBy(tcSessions.trainerId),
      { ...RETRY, label: "pms-train-given" },
    ),
    // training ATTENDED minutes this month
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
      { ...RETRY, label: "pms-train-attended" },
    ),
    // self-learning minutes this month
    withRetry(
      () =>
        db
          .select({ id: tcSelfLearning.employeeId, m: sql<number>`coalesce(sum(${tcSelfLearning.minutes}),0)` })
          .from(tcSelfLearning)
          .where(and(inArray(tcSelfLearning.employeeId, ids), gte(tcSelfLearning.learnDate, ctx.monthStart), lt(tcSelfLearning.learnDate, ctx.monthEnd)))
          .groupBy(tcSelfLearning.employeeId),
      { ...RETRY, label: "pms-self-learn" },
    ),
    // weekly Shares this month
    withRetry(
      () =>
        db
          .select({ id: tcShares.employeeId, c: sql<number>`count(*)` })
          .from(tcShares)
          .where(and(inArray(tcShares.employeeId, ids), gte(tcShares.weekStart, ctx.monthStart), lt(tcShares.weekStart, ctx.monthEnd)))
          .groupBy(tcShares.employeeId),
      { ...RETRY, label: "pms-shares" },
    ),
    // daily-checklist completion this month
    withRetry(
      () =>
        db
          .select({
            id: dailyChecklist.employeeId,
            due: sql<number>`count(*)`,
            done: sql<number>`coalesce(sum(case when ${dailyChecklist.done} then 1 else 0 end),0)`,
          })
          .from(dailyChecklist)
          .where(and(inArray(dailyChecklist.employeeId, ids), gte(dailyChecklist.planDate, ctx.monthStart), lt(dailyChecklist.planDate, ctx.monthEnd)))
          .groupBy(dailyChecklist.employeeId),
      { ...RETRY, label: "pms-checklist" },
    ),
    // manager review (Attitude pillar) — mean of attitude/behaviour/skill this period
    withRetry(
      () =>
        db
          .select({
            id: pmsMonthlyReview.subjectId,
            r: sql<number>`avg((coalesce(${pmsMonthlyReview.attitude},0)+coalesce(${pmsMonthlyReview.behaviour},0)+coalesce(${pmsMonthlyReview.skill},0))/3.0)`,
          })
          .from(pmsMonthlyReview)
          .where(and(inArray(pmsMonthlyReview.subjectId, ids), eq(pmsMonthlyReview.relation, "manager"), eq(pmsMonthlyReview.period, ctx.period)))
          .groupBy(pmsMonthlyReview.subjectId),
      { ...RETRY, label: "pms-mgr-review" },
    ),
    // peer + subordinate review (Team-Work pillar)
    withRetry(
      () =>
        db
          .select({
            id: pmsMonthlyReview.subjectId,
            r: sql<number>`avg((coalesce(${pmsMonthlyReview.attitude},0)+coalesce(${pmsMonthlyReview.behaviour},0)+coalesce(${pmsMonthlyReview.skill},0))/3.0)`,
          })
          .from(pmsMonthlyReview)
          .where(and(inArray(pmsMonthlyReview.subjectId, ids), inArray(pmsMonthlyReview.relation, ["peer", "subordinate"]), eq(pmsMonthlyReview.period, ctx.period)))
          .groupBy(pmsMonthlyReview.subjectId),
      { ...RETRY, label: "pms-team-review" },
    ),
    // names (for incentive name-key matching)
    withRetry(
      () => db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, ids)),
      { ...RETRY, label: "pms-names" },
    ),
  ]);

  // Incentive attainment is name-keyed and year-wide — best-effort (never break
  // the page); call once for the whole roster.
  const incentiveAttainment = new Map<string, number>();
  try {
    const { getIncentiveTargetVsActual } = await import("@/lib/queries/incentives");
    const tva = await withRetry(() => getIncentiveTargetVsActual(ctx.year), { ...RETRY, label: "pms-incentive" });
    for (const row of tva.rows) {
      const a = row.attainmentPct;
      if (a != null && Number.isFinite(a)) incentiveAttainment.set(nameKey(row.empName), a);
    }
  } catch {
    // incentive signal simply absent (KPI falls back to weekly-only)
  }

  return {
    weeklyGoalPct: new Map(weeklyRows.map((r) => [r.id, mins(r.wSum) > 0 ? mins(r.effSum) / mins(r.wSum) : 0])),
    dccDue: new Map(dccRows.filter((r) => r.id).map((r) => [r.id as string, mins(r.due)])),
    dccDone: new Map(dccRows.filter((r) => r.id).map((r) => [r.id as string, mins(r.done)])),
    isManager: new Map(managerRows.filter((r) => r.id).map((r) => [r.id as string, true])),
    trainGivenHours: new Map(givenRows.filter((r) => r.id).map((r) => [r.id as string, mins(r.m) / 60])),
    trainAttendedHours: new Map(attendedRows.map((r) => [r.id, mins(r.m) / 60])),
    selfLearnHours: new Map(selfRows.map((r) => [r.id, mins(r.m) / 60])),
    sharesDone: new Map(shareRows.map((r) => [r.id, mins(r.c)])),
    checklistDue: new Map(checklistRows.map((r) => [r.id, mins(r.due)])),
    checklistDone: new Map(checklistRows.map((r) => [r.id, mins(r.done)])),
    attitudeRating: new Map(mgrReviewRows.map((r) => [r.id, mins(r.r)])),
    teamworkRating: new Map(teamReviewRows.map((r) => [r.id, mins(r.r)])),
    incentiveAttainment,
    nameById: new Map(nameRows.map((r) => [r.id, r.name])),
  };
}

export interface ScoreForResult {
  score: ScoreResult;
  promotion: PromotionEvaluation;
  tenureDays: number;
}

export interface RosterScore {
  employeeId: string;
  score: ScoreResult;
  promotion: PromotionEvaluation;
  tenureDays: number;
}

/** Assemble the ScoreInput for one employee from the gathered (live) signals. */
function buildInput(id: string, tenureDays: number, g: GatheredSignals, ctx: PeriodCtx): ScoreInput {
  const inc = g.incentiveAttainment.get(nameKey(g.nameById.get(id)));
  return {
    weeklyGoalPct: g.weeklyGoalPct.has(id) ? (g.weeklyGoalPct.get(id) ?? null) : null,
    incentiveAttainmentPct: inc === undefined ? null : inc,
    isManager: g.isManager.get(id) ?? false,
    trainGivenHours: g.trainGivenHours.get(id) ?? 0,
    trainAttendedHours: g.trainAttendedHours.get(id) ?? 0,
    selfLearnHours: g.selfLearnHours.get(id) ?? 0,
    sharesDone: g.sharesDone.get(id) ?? 0,
    weeksInPeriod: ctx.weeksElapsed,
    periodFraction: ctx.periodFraction,
    dccDueCount: g.dccDue.get(id) ?? 0,
    dccDoneCount: g.dccDone.get(id) ?? 0,
    checklistDueCount: g.checklistDue.get(id) ?? 0,
    checklistDoneCount: g.checklistDone.get(id) ?? 0,
    attitudeRating: g.attitudeRating.has(id) ? (g.attitudeRating.get(id) ?? null) : null,
    teamworkRating: g.teamworkRating.has(id) ? (g.teamworkRating.get(id) ?? null) : null,
    tenureDays,
  };
}

/**
 * Batched scorer for a roster — the whole visible set in a fixed number of
 * group-by queries, then the PURE engine per person.
 */
export async function scoreForMany(employeeIds: string[]): Promise<RosterScore[]> {
  if (employeeIds.length === 0) return [];
  const ctx = periodCtx();
  const [cfg, tenureRows, signals] = await Promise.all([
    getScoreConfig(),
    withRetry(
      () => db.select({ id: employees.id, joinedAt: employees.joinedAt }).from(employees).where(inArray(employees.id, employeeIds)),
      { ...RETRY, label: "pms-roster-tenure" },
    ),
    gatherSignals(employeeIds, ctx),
  ]);

  const tenureById = new Map(
    tenureRows.map((r) => {
      const days = r.joinedAt ? Math.max(0, Math.floor((Date.now() - new Date(r.joinedAt).getTime()) / 86_400_000)) : 0;
      return [r.id, days] as const;
    }),
  );

  return employeeIds.map((id) => {
    const tenureDays = tenureById.get(id) ?? 0;
    const input = buildInput(id, tenureDays, signals, ctx);
    const score = computeScore(input, cfg);
    const promotion = evaluatePromotion(score.score, tenureDays, cfg);
    return { employeeId: id, score, promotion, tenureDays };
  });
}

/** Single-employee score (reuses the batched path for one id). */
export async function scoreFor(employeeId: string): Promise<ScoreForResult> {
  const [row] = await scoreForMany([employeeId]);
  if (row) return { score: row.score, promotion: row.promotion, tenureDays: row.tenureDays };
  // unreachable for a real id, but keep a safe shape
  const cfg = await getScoreConfig();
  const empty = computeScore(
    {
      weeklyGoalPct: null, incentiveAttainmentPct: null, isManager: false,
      trainGivenHours: 0, trainAttendedHours: 0, selfLearnHours: 0, sharesDone: 0,
      weeksInPeriod: 1, periodFraction: 1, dccDueCount: 0, dccDoneCount: 0,
      checklistDueCount: 0, checklistDoneCount: 0, attitudeRating: null, teamworkRating: null, tenureDays: 0,
    },
    cfg,
  );
  return { score: empty, promotion: evaluatePromotion(0, 0, cfg), tenureDays: 0 };
}
