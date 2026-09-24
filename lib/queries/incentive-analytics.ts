import "server-only";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  employees,
  incentiveConfig,
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
  incentiveRequests,
  incentiveTargets,
} from "@/db/schema";
import {
  listIncentiveCatalog,
  nameKey,
  type IncentiveTargetVsActual,
} from "@/lib/queries/incentives";
import { listMonthlyCtc } from "@/lib/queries/salary-ctc";
import { istYmd } from "@/lib/weekly-goals/week";
import {
  buildIncentiveAnalytics,
  ledgerLinesFrom,
  type AnalyticsScope,
  type AnalyticsView,
  type IncentiveAnalytics,
} from "@/lib/incentive/analytics/model";
import type { IncentiveGrade } from "@/lib/incentive/analytics/grading";
import {
  addMonths,
  currentMonthKey,
  resolvePeriod,
  type PeriodSelection,
} from "@/lib/incentive/analytics/periods";
import { applyAnalyticsView, incentiveAnalyticsScopeFor } from "@/lib/incentive/analytics/scope";
import { narrowToEmployee } from "@/lib/incentive/analytics/viewer";

/**
 * INCENTIVE DASHBOARD — the database half.
 *
 * Loads exactly what one period needs, in TWO small rounds of parallel queries
 * (no per-employee or per-request queries, however many people there are), then
 * hands it to the pure calculation layer (lib/incentive/analytics/model.ts):
 *
 *   · ledger entries / projects / participants — by `period_month`, over the
 *     period plus its previous window (for rank movement). Indexed columns.
 *   · decided requests — filtered IN SQL to the period by their Incentive Date
 *     (falling back to the IST filing date), so unrelated history never loads.
 *   · employees, the Incentive Master, the monthly CTC (through the salary
 *     module's canonical `listMonthlyCtc`, never re-derived), and the target
 *     rows for the period, this month and next.
 *
 * The viewer's scope is resolved here from the session identity passed in by
 * the server caller — it is never a parameter a browser controls.
 */

const DECIDED_STATUSES = ["approved", "rejected", "due", "not_due"] as const;
const DEFAULT_EXCLUDED = ["Manan Vasa", "Dattaram Kap", "Parvez Khan"];

export async function loadIncentiveAnalytics(
  viewer: { id: string; name: string; email: string; isAdmin: boolean },
  selection: PeriodSelection,
  opts: {
    now?: Date;
    scope?: AnalyticsScope;
    /**
     * The dashboard's Team / User switch. Defaults to `team`, which is the
     * scope this viewer was already entitled to — so omitting it leaves every
     * existing caller's behaviour exactly as it was.
     */
    view?: AnalyticsView;
    /**
     * The employee being VIEWED, from the dashboard's `?emp=` parameter.
     *
     * Narrows the scope the server resolved to that one person, and only if
     * they are already inside it — see `narrowToEmployee` in
     * lib/incentive/analytics/viewer.ts, which returns null for anybody else so
     * an unpermitted id degrades to the viewer's own dashboard. Omitted or equal
     * to the viewer means no narrowing, which is every existing caller.
     */
    emp?: string | null;
  } = {},
): Promise<IncentiveAnalytics | null> {
  const now = opts.now ?? new Date();
  const period = resolvePeriod(selection, now);
  if (!period) return null;

  const currentMonth = currentMonthKey(now);
  const nextMonth = addMonths(currentMonth, 1);
  const ledgerMonths = [...(period.previous?.months ?? []), ...period.months].sort();
  const ledgerFrom = `${ledgerMonths[0]}-01`;
  const ledgerTo = period.endExclusive;
  // `period.quarterStart` is included for a quarterly period: a quarterly target
  // anchors on the quarter's first month, which is already one of `period.months`
  // for the quarter it belongs to — but naming it explicitly keeps the fetch
  // correct if that anchor ever moves (migration 0250).
  const targetMonthStarts = [
    ...new Set([
      ...period.months,
      currentMonth,
      nextMonth,
      ...(period.quarterStart ? [period.quarterStart.slice(0, 7)] : []),
    ]),
  ].map((m) => `${m}-01`);

  // The incentive date of a request, as SQL: the form's Incentive Date, else the
  // day it was filed in IST. ISO strings compare correctly as text.
  const incentiveDate = sql<string>`coalesce(
    nullif(${incentiveRequests.details}->>'incentive_date', ''),
    to_char(${incentiveRequests.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')
  )`;
  const decider = alias(employees, "decider");

  // TWO ROUNDS OF AT MOST FIVE, not one burst of ten. The app's pool is 10
  // connections (lib/db/index.ts) shared by every query on the page; a burst
  // wider than that only queues, and queue time counts against each caller's
  // retry budget — which is how a healthy database still "times out".
  const [resolvedScope, entries, projects, participants, requests] =
    await Promise.all([
      opts.scope ? Promise.resolve(opts.scope) : incentiveAnalyticsScopeFor(viewer),
      db
        .select()
        .from(incentiveEntries)
        .where(and(gte(incentiveEntries.periodMonth, ledgerFrom), lt(incentiveEntries.periodMonth, ledgerTo))),
      db
        .select()
        .from(incentiveProjects)
        .where(and(gte(incentiveProjects.periodMonth, ledgerFrom), lt(incentiveProjects.periodMonth, ledgerTo))),
      // A participant without its own month inherits its parent's; the fold only
      // uses participants whose parent was loaded above.
      db
        .select()
        .from(incentiveParticipants)
        .where(
          or(
            and(gte(incentiveParticipants.periodMonth, ledgerFrom), lt(incentiveParticipants.periodMonth, ledgerTo)),
            isNull(incentiveParticipants.periodMonth),
          ),
        ),
      db
        .select({
          id: incentiveRequests.id,
          employeeId: incentiveRequests.employeeId,
          type: incentiveRequests.type,
          status: incentiveRequests.status,
          details: incentiveRequests.details,
          split: incentiveRequests.split,
          createdYmd: sql<string>`to_char(${incentiveRequests.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
          decidedByName: decider.name,
          decidedAt: incentiveRequests.decidedAt,
          decisionNote: incentiveRequests.decisionNote,
        })
        .from(incentiveRequests)
        .leftJoin(decider, eq(incentiveRequests.decidedById, decider.id))
        .where(
          and(
            inArray(incentiveRequests.status, [...DECIDED_STATUSES]),
            sql`${incentiveDate} >= ${period.start}`,
            sql`${incentiveDate} < ${period.endExclusive}`,
          ),
        ),
    ]);

  // THE Team / User SWITCH, applied once, here. Everything downstream — the
  // status cards, the grade report, the ranking, "your performance" — reads the
  // scope, so narrowing it at the source is what makes the switcher affect the
  // whole dashboard without a single call site knowing it exists.
  const scope = applyAnalyticsView(resolvedScope, opts.view ?? "team");

  const [catalog, people, ctcRows, targets, config] =
    await Promise.all([
      listIncentiveCatalog(),
      db
        .select({
          id: employees.id,
          name: employees.name,
          code: employees.employeeCode,
          joinedAt: employees.joinedAt,
          isActive: employees.isActive,
          employmentStatus: employees.employmentStatus,
          accountType: employees.accountType,
        })
        .from(employees),
      listMonthlyCtc(currentMonth),
      db.select().from(incentiveTargets).where(inArray(incentiveTargets.periodMonth, targetMonthStarts)),
      db.select({ excludedNames: incentiveConfig.excludedNames }).from(incentiveConfig).limit(1),
    ]);

  // Operational actors the ledger has always kept out of every aggregate —
  // configured in incentive_config, with the long-standing default.
  const configured = config[0]?.excludedNames;
  const excluded = new Set(
    (Array.isArray(configured) ? (configured as unknown[]).filter((n): n is string => typeof n === "string") : DEFAULT_EXCLUDED).map(nameKey),
  );

  // Current = can sign in, still works here, and is an employee account.
  // `employment_status` is checked as well as `is_active` because a former
  // employee must stay former even if their login is re-enabled by mistake.
  const isCurrent = (p: (typeof people)[number]) =>
    p.isActive && p.employmentStatus === "active" && p.accountType === "employee";
  const isEligible = (p: (typeof people)[number]) => isCurrent(p) && !excluded.has(nameKey(p.name));
  // Everyone who must not be counted — left, inactive, not an employee account,
  // or an excluded operational actor — by id and by name, so a ledger line
  // linked or named to them is dropped rather than treated as an alias.
  const ineligible = people.filter((p) => !isEligible(p));
  const inactiveNameKeys = new Set([...ineligible.map((p) => nameKey(p.name)), ...excluded]);
  const excludedEmployeeIds = new Set(ineligible.map((p) => p.id));
  const ctcById = new Map(ctcRows.map((c) => [c.employeeId, c.monthlyCtc]));

  const eligible = people
    .filter(isEligible)
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code ?? null,
      monthlyCtc: ctcById.get(p.id) ?? null,
      joinedMonth: p.joinedAt ? istYmd(p.joinedAt).slice(0, 7) : null,
    }));

  // ── VIEWING ONE EMPLOYEE (the `?emp=` parameter) ─────────────────────────
  //
  // The narrowing is applied to the scope the SERVER already resolved, and only
  // succeeds for somebody that scope already covers — so this cannot widen
  // anything, and an id outside it falls back to the viewer's own dashboard
  // rather than erroring the page. The name comes from the very roster the
  // figures are computed from, so the label can never disagree with the rows.
  const viewed = opts.emp ? (eligible.find((p) => p.id === opts.emp) ?? null) : null;
  const viewScope = viewed ? (narrowToEmployee(scope, viewed.id, viewed.name) ?? scope) : scope;

  // WHO THE PICKER MAY OFFER — read off the scope the VIEWER's entitlement
  // resolved to, before either narrowing. `resolvedScope` and not `scope`,
  // because the Team/User switch must not empty the picker: a company-wide
  // viewer on the "user" view is still allowed to look at everybody, and
  // offering them one row would contradict the switch they just pressed.
  //
  // `eligible` is the same roster the figures are computed from, so the picker
  // can never offer somebody whose dashboard does not exist.
  const viewablePeople = eligible
    .filter((p) => resolvedScope.all || resolvedScope.employeeIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  const built = buildIncentiveAnalytics({
    period,
    currentMonth,
    employees: eligible,
    inactiveNameKeys,
    excludedEmployeeIds,
    ledger: ledgerLinesFrom(entries, projects, participants),
    requests: requests.map((r) => ({
      ...r,
      decidedByName: r.decidedByName ?? null,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    })),
    catalog: catalog.map((c) => ({ name: c.name, amount: Number(c.amount), active: c.active })),
    targets: targets.map((t) => ({
      empName: t.empName,
      employeeId: t.employeeId,
      periodMonth: String(t.periodMonth),
      periodType: t.periodType,
      amount: Number(t.targetAmount),
    })),
    scope: viewScope,
    viewer: { id: viewer.id, name: viewer.name },
    // The dashboard is ABOUT the person being viewed, so `me` — the row the KPI
    // band's Grade and % of CTC cards print — must be theirs and not the
    // reader's. Falls back to the reader, which is every other caller.
    subjectId: viewed?.id ?? viewer.id,
  });

  // THE TARGET WARNING IS ABOUT *YOUR* MISSING TARGET, so it is suppressed while
  // you are looking at somebody else's dashboard — "fill in your target" over
  // another person's figures is advice the reader cannot act on there. The
  // engine computes it from the signed-in viewer, which is deliberately NOT
  // swapped for the viewed employee: `isSelf` and the CTC restriction must keep
  // describing the person actually reading the page, or a manager opening a
  // report's dashboard would be shown that report's pay.
  return {
    ...built,
    viewablePeople,
    ...(viewed && viewed.id !== viewer.id ? { targetWarning: null } : {}),
  };
}

/** One row of the Trends leaderboard. */
export interface IncentiveLeaderRow {
  employeeId: string;
  name: string;
  /** Competition rank (1, 2, 2, 4) on the percentage — the ordering figure. */
  rank: number;
  /** Incentive as a percentage of CTC. This is what the ranking uses. */
  pctOfCtc: number;
  /** The amount the percentage came from — shown second, never sorted on. */
  earned: number;
  grade: IncentiveGrade | null;
  target: number | null;
}

/**
 * THE LEADERBOARD, TAKEN FROM THE ONE RANKING THE APP ALREADY HAS.
 *
 * A second leaderboard used to live in `getIncentiveDashboard`, which sorted
 * people by RAW YTD AMOUNT. That is not the rule this app ranks by: the
 * Incentive Dashboard ranks on the PERCENTAGE of CTC (`competitionRanks`, the
 * same figure the grade comes from), so the two lists could — and did — put the
 * same person in different places on the same screen. A big earner with a big
 * CTC can sit under a smaller earner with a smaller one, and only the
 * percentage says which of them is actually performing.
 *
 * So the Trends leaderboard is no longer derived at all. It is a SLICE of the
 * analytics model's own `employees`, which arrive already ranked, already
 * filtered to the viewer's scope, and already carrying grade, target and
 * movement. Nothing is re-sorted here and nothing is recomputed — reordering by
 * percentage a second time is exactly what produced the disagreement.
 */
export function incentiveLeaders(
  analytics: IncentiveAnalytics,
  limit = 10,
): IncentiveLeaderRow[] {
  return analytics.employees
    .filter((e) => e.rank !== null && e.pctOfCtc !== null)
    .slice(0, limit)
    .map((e) => ({
      employeeId: e.employeeId,
      name: e.name,
      rank: e.rank as number,
      pctOfCtc: e.pctOfCtc as number,
      earned: e.earned,
      grade: e.grade,
      target: e.target,
    }));
}

/**
 * The existing Targets tab's company-wide Target-vs-Actual, narrowed to the
 * names a scoped viewer may see — so a non-admin's browser never receives
 * anyone else's target or earnings. Totals are recomputed from what remains.
 */
export function restrictTargetVsActual(
  tva: IncentiveTargetVsActual,
  visibleNames: Iterable<string>,
): IncentiveTargetVsActual {
  const keys = new Set([...visibleNames].map(nameKey));
  const rows = tva.rows.filter((r) => keys.has(nameKey(r.empName)));
  const target = rows.reduce((s, r) => s + r.target, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  return {
    year: tva.year,
    rows,
    totals: { target, actual, attainmentPct: target > 0 ? (actual / target) * 100 : null },
  };
}
