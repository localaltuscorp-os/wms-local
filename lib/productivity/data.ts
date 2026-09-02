import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  employees,
  designations,
  departments,
  tasks,
  goals,
  weeklyGoals,
  tcSessions,
  tcSessionAttendees,
  salaryProfiles,
  incentiveEntries,
} from "@/lib/db";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import {
  calculateIncentivePercentage,
  calculateIncentiveGrade,
  calculateMTDGoals,
  calculateTrainingPercentage,
  calculateOverdueTasks,
  overdueAgeInDays,
  score,
  istDay,
  monthStartOf,
  TRAINING_TARGET_HOURS,
  type Grade,
  type Scored,
  type WeeklyGoalTally,
} from "./calc";
import { directReportIds } from "./access";

/**
 * The Productivity Dashboard's AGGREGATION layer (§29).
 *
 * It owns no data. Every number here is read live from the systems that already
 * exist — employees, weekly_goals + goals, tasks, tc_sessions, salary_profiles,
 * incentive_entries — and handed to the pure functions in `./calc` for
 * percentages and grades. Nothing is duplicated into a dashboard-specific table,
 * so the dashboard can never disagree with the module it is reporting on.
 *
 * The Daily Checklist is deliberately NOT read here. It has its own module and
 * its own surfaces; carrying a compliance card on this page duplicated it and
 * pushed the four sections that ARE this dashboard's subject further apart.
 *
 * ONE loader serves every consumer (§30): My Dashboard, the Team Performance
 * drill-down, the Full Report, the PDF digests and the manager team digest all
 * call `loadProductivity`. That is what keeps a report and the screen it mirrors
 * from drifting apart.
 */

/** Which earned-incentive figure feeds the KPI (§8).
 *
 *  `incentive_entries` carries five money columns — amount (raised), approvedAmt,
 *  bookedAmt, accruedAmt and paidAmt (disbursed). "Earned" is read as APPROVED:
 *  the amount signed off as the employee's, which is stable once decided and
 *  doesn't lag behind a payroll run the way `paid` does. Isolated here as one
 *  constant so the business can move it without hunting through queries. */
const EARNED_INCENTIVE_COLUMN = incentiveEntries.approvedAmt;

/**
 * The ONE window every figure on the dashboard covers: the current CALENDAR
 * month, 1st → last day, resolved in IST.
 *
 * There is deliberately no period selector any more. The dashboard used to
 * carry four KPI cards (Monthly / MTD / Quarter / YTD), which forced the reader
 * to work out which column answered their question before they could read it.
 * One period, stated once in the header, is the whole scope — and it RESETS on
 * its own when the calendar turns over, because every query below is bounded by
 * these two dates rather than by anything stored.
 */
export interface ProductivityPeriod {
  /** `yyyy-mm-01` — inclusive. */
  monthStart: string;
  /** `yyyy-mm-dd` of the final day of the month — inclusive. */
  monthEnd: string;
  /** `yyyy-mm-dd` of the reference day, i.e. how far "to date" reaches. */
  today: string;
  /** Human label, e.g. "August 2026". */
  label: string;
}

/** The dashboard's calendar-month window, anchored on the reference day in IST. */
export function productivityPeriod(now: Date = new Date()): ProductivityPeriod {
  const today = istDay(now);
  const monthStart = monthStartOf(now);
  const [y, m] = monthStart.split("-").map(Number);
  const year = y ?? 1970;
  const month = m ?? 1;
  // Day 0 of the NEXT month = the last day of this one. Handles 28/29/30/31
  // without a leap-year rule of its own.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    monthStart,
    monthEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    today,
    label,
  };
}

/** The KPI section (§7) — incentive money, its share of salary, and the grade
 *  that share earns. Three values, three cards, one period. */
export interface ProductivityKpi {
  /** Earned (approved) incentive for the period. */
  incentiveAmount: number;
  /** Monthly base salary the incentive is measured against. 0 = no profile. */
  baseSalary: number;
  /** null when there is no salary profile — see calculateIncentivePercentage. */
  incentivePct: number | null;
  /** `null` alongside a null percentage: an employee with no salary on record is
   *  UNGRADED, not an F. Grading missing payroll data as a failure would put a
   *  red mark on their scorecard for something they did not do. */
  grade: Grade | null;
}

export interface ProductivitySnapshot {
  employee: {
    id: string;
    name: string;
    designation: string | null;
    department: string | null;
    /** The reporting line — this product has no separate "team" entity, so the
     *  manager IS the team (same finding as the Team Performance redesign). */
    managerName: string | null;
    isManager: boolean;
  };
  period: ProductivityPeriod;
  kpi: ProductivityKpi;
  /** `monthly` counts GOALS (8 of 10 done); `mtd` rolls up the weekly boards'
   *  completion for the same month. Two different questions, two sources. */
  goals: { monthly: Scored; mtd: Scored & { weeks: number } };
  tasks: { over15: number; days8to14: number; days1to7: number; needHelp: number };
  training: {
    givenHours: number;
    attendedHours: number;
    targetHours: number;
    givenPct: number | null;
    attendedPct: number | null;
  };
  /** Present ONLY when the subject manages someone. Null is what makes the
   *  Manager section vanish for an employee rather than render empty. */
  manager: { tasksDelegated: number; goalsDelegated: number } | null;
  generatedAt: Date;
}

/**
 * Load one employee's complete productivity snapshot.
 *
 * Caller MUST have authorised `employeeId` through `canViewProductivityOf`
 * first — this function deliberately performs no permission check of its own, so
 * that the report senders (which act for no viewer) can reuse it. §23's rule is
 * enforced at the page/route boundary, and this is only reached through it.
 */
export async function loadProductivity(
  employeeId: string,
  now: Date = new Date(),
): Promise<ProductivitySnapshot | null> {
  const period = productivityPeriod(now);
  const monthStart = period.monthStart;
  const monthEnd = nextMonthStart(monthStart); // exclusive upper bound
  const mgr = alias(employees, "prod_mgr");

  const [identityRows, reports] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        designation: designations.name,
        departmentName: departments.name,
        departmentLegacy: employees.department,
        managerName: mgr.name,
      })
      .from(employees)
      .leftJoin(mgr, eq(employees.managerId, mgr.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(eq(employees.id, employeeId))
      .limit(1),
    directReportIds(employeeId),
  ]);

  const identity = identityRows[0];
  if (!identity) return null;
  const isManager = reports.length > 0;

  const [salaryRow, incentiveRows, weeklyRows, monthlyGoalRows, taskRows, trainRows] =
    await Promise.all([
      db
        .select({ annualCtc: salaryProfiles.annualCtc, monthlyPayAtTarget: salaryProfiles.monthlyPayAtTarget, monthlyFee: salaryProfiles.monthlyFee, payType: salaryProfiles.payType })
        .from(salaryProfiles)
        .where(eq(salaryProfiles.employeeId, employeeId))
        .limit(1),

      // Incentive earned for THIS month only. Bounded by the same month window
      // as everything else, so the KPI resets with the calendar rather than
      // accumulating across periods.
      db
        .select({ amount: EARNED_INCENTIVE_COLUMN })
        .from(incentiveEntries)
        .where(
          and(
            eq(incentiveEntries.employeeId, employeeId),
            gte(incentiveEntries.periodMonth, monthStart),
            lt(incentiveEntries.periodMonth, monthEnd),
          ),
        ),

      // Weekly goals whose Monday falls in the current month → the MTD roll-up.
      db
        .select({
          weekStart: weeklyGoals.weekStart,
          pctDone: weeklyGoals.pctDone,
          acceptPct: weeklyGoals.acceptPct,
        })
        .from(weeklyGoals)
        .where(
          and(
            eq(weeklyGoals.employeeId, employeeId),
            eq(weeklyGoals.archived, false),
            gte(weeklyGoals.weekStart, monthStart),
            lt(weeklyGoals.weekStart, monthEnd),
          ),
        )
        .orderBy(asc(weeklyGoals.weekStart)),

      // Monthly goals for the current month (goals table, period="month").
      db
        .select({ pctDone: goals.pctDone, acceptPct: goals.acceptPct })
        .from(goals)
        .where(
          and(
            eq(goals.employeeId, employeeId),
            eq(goals.period, "month"),
            eq(goals.periodKey, monthStart.slice(0, 7)),
            eq(goals.archived, false),
          ),
        ),

      // Open assigned tasks + their effective due date → the ageing buckets.
      db
        .select({ dueAt: sql<string | null>`${effectiveDueAtSql()}`, status: tasks.status })
        .from(tasks)
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.archived, false),
            sql`${tasks.status} not in ('done','approved','cancelled')`,
          ),
        ),

      // Training this month — attended (as participant) and given (as trainer).
      db
        .select({
          attendedMin: sql<number>`coalesce(sum(coalesce(${tcSessionAttendees.attendedMin}, ${tcSessions.durationMin})),0)`,
        })
        .from(tcSessionAttendees)
        .innerJoin(tcSessions, eq(tcSessionAttendees.sessionId, tcSessions.id))
        .where(
          and(
            eq(tcSessionAttendees.employeeId, employeeId),
            inArray(tcSessionAttendees.status, ["attended", "left_halfway"]),
            eq(tcSessions.status, "done"),
            gte(sql`${tcSessions.scheduledAt}::date`, monthStart),
          ),
        ),
    ]);

  /* ── KPI ─────────────────────────────────────────────────────────── */
  const baseSalary = monthlyBaseSalary(salaryRow[0]);
  const incentiveAmount = incentiveRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const incentivePct = calculateIncentivePercentage(incentiveAmount, baseSalary);
  const kpi: ProductivityKpi = {
    incentiveAmount,
    baseSalary,
    incentivePct,
    grade: incentivePct == null ? null : calculateIncentiveGrade(incentivePct),
  };

  /* ── Goals ───────────────────────────────────────────────────────── */
  // A goal's effective completion is acceptPct when a reviewer set one, else the
  // self-reported pctDone — the same precedence the Goals boards use, so the two
  // surfaces always agree.
  const weeklyTallies: WeeklyGoalTally[] = weeklyRows.map((r) => ({
    weekStart: String(r.weekStart),
    completed: Number(r.acceptPct ?? r.pctDone ?? 0),
    target: 100,
  }));
  const mtd = calculateMTDGoals(weeklyTallies, now);

  // "Monthly Goals" counts GOALS, not percentage-points: the card reads "8 / 10"
  // and its sibling reads 80%, so the two must come from the same pair. A goal
  // counts as done once its effective completion reaches 100%.
  const monthlyDone = monthlyGoalRows.filter(
    (g) => Number(g.acceptPct ?? g.pctDone ?? 0) >= 100,
  ).length;
  const monthly = score(monthlyDone, monthlyGoalRows.length);

  /* ── Tasks ───────────────────────────────────────────────────────── */
  const ages = taskRows.map((t) => overdueAgeInDays(t.dueAt, now));
  const buckets = calculateOverdueTasks(ages);
  const needHelp = taskRows.filter((t) => t.status === "need_info").length;

  /* ── Training ────────────────────────────────────────────────────── */
  const attendedHours = round1(Number(trainRows[0]?.attendedMin ?? 0) / 60);
  // "Training given" = sessions this person ran. Resolved from the session's
  // trainer, which is a separate read kept out of the batch above because it is
  // the only query that keys off tc_sessions directly.
  const givenHours = await trainingGivenHours(employeeId, monthStart);

  /* ── Manager section — managers only ─────────────────────────────── */
  const manager = isManager ? await delegationCounts(employeeId, reports, monthStart) : null;

  return {
    employee: {
      id: identity.id,
      name: identity.name,
      designation: identity.designation ?? null,
      department: identity.departmentName ?? identity.departmentLegacy ?? null,
      managerName: identity.managerName ?? null,
      isManager,
    },
    period,
    kpi,
    goals: { monthly, mtd: { ...score(mtd.completed, mtd.target), weeks: mtd.weeks } },
    tasks: { over15: buckets.over15, days8to14: buckets.days8to14, days1to7: buckets.days1to7, needHelp },
    training: {
      givenHours,
      attendedHours,
      targetHours: TRAINING_TARGET_HOURS,
      givenPct: calculateTrainingPercentage(givenHours),
      attendedPct: calculateTrainingPercentage(attendedHours),
    },
    manager,
    generatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Tasks and goals this manager handed to their direct reports (§18). */
async function delegationCounts(
  managerId: string,
  reportIds: string[],
  since: string,
): Promise<{ tasksDelegated: number; goalsDelegated: number }> {
  if (reportIds.length === 0) return { tasksDelegated: 0, goalsDelegated: 0 };

  const [t, g] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.initiatorId, managerId),
          inArray(tasks.doerId, reportIds),
          eq(tasks.archived, false),
          gte(sql`${tasks.createdAt}::date`, since),
        ),
      ),
    // A goal counts as delegated when this manager CREATED it on someone else's
    // board — the same "Assigned by …" relationship the weekly board shows.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.createdById, managerId),
          inArray(weeklyGoals.employeeId, reportIds),
          eq(weeklyGoals.archived, false),
          gte(weeklyGoals.weekStart, since),
        ),
      ),
  ]);

  return { tasksDelegated: Number(t[0]?.n ?? 0), goalsDelegated: Number(g[0]?.n ?? 0) };
}

/**
 * Hours of training this person DELIVERED this month — sessions where they are
 * the trainer (`tc_sessions.trainer_id`), counted only once the session is done.
 *
 * No try/catch: an earlier draft swallowed errors here and returned 0, which
 * would have quietly reported "0 hrs given" for a trainer whenever the query
 * failed — a wrong number presented as a real one. If this breaks, the page
 * should break loudly rather than lie about someone's training record.
 */
async function trainingGivenHours(employeeId: string, since: string): Promise<number> {
  const rows = await db
    .select({ mins: sql<number>`coalesce(sum(${tcSessions.durationMin}),0)` })
    .from(tcSessions)
    .where(
      and(
        eq(tcSessions.trainerId, employeeId),
        eq(tcSessions.status, "done"),
        gte(sql`${tcSessions.scheduledAt}::date`, since),
      ),
    );
  return round1(Number(rows[0]?.mins ?? 0) / 60);
}

/** Monthly base salary from the profile, honouring the non-CTC pay bases. */
function monthlyBaseSalary(
  row: { annualCtc: string | null; monthlyPayAtTarget: string | null; monthlyFee: string | null; payType: string } | undefined,
): number {
  if (!row) return 0;
  if (row.payType === "fixed_fee") return Number(row.monthlyFee ?? 0);
  if (row.payType === "hourly") return Number(row.monthlyPayAtTarget ?? 0);
  return Number(row.annualCtc ?? 0) / 12;
}

function nextMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const year = y ?? 1970;
  const month = m ?? 1;
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
