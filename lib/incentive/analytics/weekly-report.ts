import { istYmd } from "@/lib/weekly-goals/week";
import type { EmployeePerformance } from "./model";
import type { IncentiveGrade, RankMovement } from "./grading";
import { addMonths, currentMonthKey, type PeriodSelection } from "./periods";

/**
 * INCENTIVE WEEKLY REPORT CARD — the multi-period assembly.
 *
 * The Sunday cron emails every active employee a report card with one figure per
 * incentive period (current month, last month, last 3 months, last 6 months,
 * YTD), the YTD grade, the current month's target vs actual, and the current
 * rank + movement. This module is PURE: it only glues together numbers that
 * `lib/incentive/analytics/model.ts` already computed with the grading/ranking
 * rules in `grading.ts` — nothing here re-derives a grade or a rank.
 *
 * The database half lives in `lib/queries/incentive-weekly-report.ts`, which
 * loads the windows once and calls `buildIncentiveAnalytics` once per period.
 */

export const WEEKLY_REPORT_PERIOD_KEYS = [
  "current_month",
  "last_month",
  "last_3",
  "last_6",
  "ytd",
] as const;
export type WeeklyReportPeriodKey = (typeof WEEKLY_REPORT_PERIOD_KEYS)[number];

export const WEEKLY_REPORT_PERIOD_LABELS: Record<WeeklyReportPeriodKey, string> = {
  current_month: "Current Month",
  last_month: "Last Month",
  last_3: "Last 3 Months",
  last_6: "Last 6 Months",
  ytd: "YTD",
};

export interface WeeklyReportSelection {
  key: WeeklyReportPeriodKey;
  label: string;
  selection: PeriodSelection;
}

/**
 * The five windows a report card shows. `current_month` is "this month in IST";
 * the other four are resolved from the same IST clock so the whole card reads
 * one consistent "now" even though the cron's `now` arrives as a UTC instant.
 */
export function weeklyReportSelections(now: Date = new Date()): WeeklyReportSelection[] {
  const cur = currentMonthKey(now);
  const lastMonth = addMonths(cur, -1);
  return WEEKLY_REPORT_PERIOD_KEYS.map((key) => {
    const selection: PeriodSelection =
      key === "last_month"
        ? { kind: "month", month: lastMonth }
        : { kind: key as Exclude<WeeklyReportPeriodKey, "last_month"> };
    return { key, label: WEEKLY_REPORT_PERIOD_LABELS[key], selection };
  });
}

/**
 * The idempotency key for one week's report. Pinned to the cron's Sunday run
 * date in IST, so a single run (and any retry within the same week) claims the
 * same key and the delivery ledger can reject a duplicate.
 */
export function weeklyReportVersionKey(now: Date): string {
  return `week:${istYmd(now)}`;
}

export interface WeeklyReportPeriodRow {
  key: WeeklyReportPeriodKey;
  label: string;
  earned: number;
}

export interface WeeklyReportCard {
  employeeId: string;
  name: string;
  code: string | null;
  /** YTD grade — the one grade a card shows, consistent with `periodCtc`. */
  grade: IncentiveGrade | null;
  /** YTD % of CTC the grade was taken from. */
  pctOfCtc: number | null;
  /** Exactly the five `WEEKLY_REPORT_PERIOD_KEYS`, in canonical order. */
  periods: WeeklyReportPeriodRow[];
  /** Current-month target. */
  target: number | null;
  /** Current-month earned (the "Actual" in Target vs Actual). */
  actual: number;
  /** earned − target; negative is a deficit. Null without a target. */
  difference: number | null;
  /** Competition rank over the current-month window. */
  rank: number | null;
  /** Competition rank over the last-month window. */
  previousRank: number | null;
  movement: RankMovement;
}

/**
 * Merge one `EmployeePerformance` array per period into a per-employee card.
 *
 * Takes whatever `buildIncentiveAnalytics` returned for each window — already
 * graded and ranked by the shared layer — and picks out the fields the email
 * needs: the YTD grade, the five earned figures, and the current month's
 * target/actual/rank/movement. Every card gets all five period rows (₹0 where a
 * person earned nothing) so the email's table never has a ragged shape.
 */
export function assembleWeeklyReportCards(
  periods: readonly {
    key: WeeklyReportPeriodKey;
    label: string;
    employees: readonly EmployeePerformance[];
  }[],
): WeeklyReportCard[] {
  const meta = new Map(periods.map((p) => [p.key, p.label]));
  const byId = new Map<string, WeeklyReportCard>();
  const order: string[] = [];

  const ensure = (e: EmployeePerformance): WeeklyReportCard => {
    let card = byId.get(e.employeeId);
    if (!card) {
      card = {
        employeeId: e.employeeId,
        name: e.name,
        code: e.code,
        grade: null,
        pctOfCtc: null,
        periods: WEEKLY_REPORT_PERIOD_KEYS.map((key) => ({
          key,
          label: meta.get(key) ?? WEEKLY_REPORT_PERIOD_LABELS[key],
          earned: 0,
        })),
        target: null,
        actual: 0,
        difference: null,
        rank: null,
        previousRank: null,
        movement: { kind: "na" },
      };
      byId.set(e.employeeId, card);
      order.push(e.employeeId);
    }
    return card;
  };

  for (const period of periods) {
    for (const e of period.employees) {
      const card = ensure(e);
      const row = card.periods.find((r) => r.key === period.key);
      if (row) row.earned = e.earned;
      if (period.key === "ytd") {
        card.grade = e.grade;
        card.pctOfCtc = e.pctOfCtc;
      }
      if (period.key === "current_month") {
        card.target = e.target;
        card.actual = e.earned;
        card.difference = e.difference;
        card.rank = e.rank;
        card.previousRank = e.previousRank;
        card.movement = e.movement;
      }
    }
  }

  return order.map((id) => byId.get(id)!);
}

/** Human-readable rank movement for the email. */
export function rankMovementLabel(m: RankMovement): string {
  switch (m.kind) {
    case "up":
      return `Up ${m.by}`;
    case "down":
      return `Down ${m.by}`;
    case "same":
      return "No change";
    case "new":
      return "New";
    case "na":
      return "—";
  }
}
