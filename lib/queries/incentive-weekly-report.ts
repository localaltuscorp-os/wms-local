import "server-only";
import { and, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  incentiveConfig,
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
  incentiveTargets,
} from "@/db/schema";
import { nameKey } from "@/lib/queries/incentives";
import { listMonthlyCtc } from "@/lib/queries/salary-ctc";
import { istYmd } from "@/lib/weekly-goals/week";
import {
  buildIncentiveAnalytics,
  ledgerLinesFrom,
  type AnalyticsScope,
} from "@/lib/incentive/analytics/model";
import {
  addMonths,
  currentMonthKey,
  resolvePeriod,
  type ResolvedPeriod,
} from "@/lib/incentive/analytics/periods";
import {
  assembleWeeklyReportCards,
  weeklyReportSelections,
  type WeeklyReportCard,
} from "@/lib/incentive/analytics/weekly-report";

/**
 * INCENTIVE WEEKLY REPORT CARD — the database half.
 *
 * Loads the incentive ledger, employees, CTC, targets and the excluded-names
 * config ONCE for the union of every window the report card needs, then calls
 * `buildIncentiveAnalytics` (the shared, pure calculation layer) once per
 * period. That is the same company-wide builder the dashboard uses, so the
 * earned figures, the YTD grade and the current/last-month competition ranks are
 * exactly the dashboard's numbers — nothing here re-implements grading or
 * ranking.
 *
 * The returned cards are keyed by employee id and cover the full ACTIVE
 * employee population (is_active, still employed, employee account, not an
 * excluded operational actor) — the same eligibility the dashboard applies.
 */

const DEFAULT_EXCLUDED = ["Manan Vasa", "Dattaram Kap", "Parvez Khan"];

const COMPANY_SCOPE: AnalyticsScope = {
  all: true,
  employeeIds: new Set(),
  viewerId: "",
  label: "Everyone",
};

export async function loadIncentiveWeeklyReport(
  now: Date,
): Promise<{ cards: WeeklyReportCard[] }> {
  const resolved = weeklyReportSelections(now)
    .map((sel) => ({ sel, period: resolvePeriod(sel.selection, now) }))
    .filter((x): x is { sel: (typeof x)["sel"]; period: ResolvedPeriod } => x.period !== null);

  const currentMonth = currentMonthKey(now);
  const nextMonth = addMonths(currentMonth, 1);

  // Union of every month any window (or its previous window, for rank movement)
  // needs, so the ledger is read in a single round-trip.
  const monthSet = new Set<string>();
  for (const { period } of resolved) {
    for (const m of [...(period.previous?.months ?? []), ...period.months]) monthSet.add(m);
  }
  const ledgerMonths = [...monthSet].sort();
  const ledgerFrom = `${ledgerMonths[0]}-01`;
  const ledgerTo = resolved.reduce(
    (max, { period }) => (period.endExclusive > max ? period.endExclusive : max),
    `${addMonths(currentMonth, 1)}-01`,
  );

  const targetMonthStarts = [...new Set([...monthSet, currentMonth, nextMonth])].map(
    (m) => `${m}-01`,
  );

  const [entries, projects, participants, people, ctcRows, targets, config] =
    await Promise.all([
      db
        .select()
        .from(incentiveEntries)
        .where(and(gte(incentiveEntries.periodMonth, ledgerFrom), lt(incentiveEntries.periodMonth, ledgerTo))),
      db
        .select()
        .from(incentiveProjects)
        .where(and(gte(incentiveProjects.periodMonth, ledgerFrom), lt(incentiveProjects.periodMonth, ledgerTo))),
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
      db
        .select()
        .from(incentiveTargets)
        .where(inArray(incentiveTargets.periodMonth, targetMonthStarts)),
      db.select({ excludedNames: incentiveConfig.excludedNames }).from(incentiveConfig).limit(1),
    ]);

  // Same eligibility as the dashboard: active, still employed, employee account,
  // and not an excluded operational actor.
  const configured = config[0]?.excludedNames;
  const excluded = new Set(
    (Array.isArray(configured)
      ? (configured as unknown[]).filter((n): n is string => typeof n === "string")
      : DEFAULT_EXCLUDED
    ).map(nameKey),
  );
  const isCurrent = (p: (typeof people)[number]) =>
    p.isActive && p.employmentStatus === "active" && p.accountType === "employee";
  const isEligible = (p: (typeof people)[number]) => isCurrent(p) && !excluded.has(nameKey(p.name));
  const ineligible = people.filter((p) => !isEligible(p));
  const inactiveNameKeys = new Set([...ineligible.map((p) => nameKey(p.name)), ...excluded]);
  const excludedEmployeeIds = new Set(ineligible.map((p) => p.id));
  const ctcById = new Map(ctcRows.map((c) => [c.employeeId, c.monthlyCtc]));

  const eligible = people.filter(isEligible).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code ?? null,
    monthlyCtc: ctcById.get(p.id) ?? null,
    joinedMonth: p.joinedAt ? istYmd(p.joinedAt).slice(0, 7) : null,
  }));

  const ledger = ledgerLinesFrom(entries, projects, participants);

  const perPeriod = resolved.map(({ sel, period }) => {
    const analytics = buildIncentiveAnalytics({
      period,
      currentMonth,
      employees: eligible,
      inactiveNameKeys,
      excludedEmployeeIds,
      ledger,
      requests: [],
      catalog: [],
      targets: targets.map((t) => ({
        empName: t.empName,
        employeeId: t.employeeId,
        periodMonth: String(t.periodMonth),
        amount: Number(t.targetAmount),
      })),
      scope: COMPANY_SCOPE,
      viewer: { id: "", name: "" },
    });
    return { key: sel.key, label: sel.label, employees: analytics.employees };
  });

  return { cards: assembleWeeklyReportCards(perPeriod) };
}
