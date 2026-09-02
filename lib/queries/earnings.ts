import "server-only";
import { and, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { incentiveTargets } from "@/db/schema";
import { getIncentivePaidByPerson, nameKey } from "@/lib/queries/incentives";

/**
 * WS-6 — Incentive Target-vs-PAID windows for ONE person, for the "total
 * earnings" combined document (WS-5/WS-6). PAID is read STRICTLY through the
 * canonical shared-key producer `getIncentivePaidByPerson(month)` — this module
 * ALIASES it, never re-implements paid math, so the number can never drift from
 * PMS or the dashboard. TARGET is summed from `incentive_targets`.
 *
 * Windows (per WS-6 "this month · last 3 months · YTD"):
 *   • thisMonth   — the requested month only
 *   • last3Months — the trailing 3-month window ending at (and incl.) the month
 *   • ytd         — financial-year-to-date: April of the month's FY … the month
 *
 * Person identity is matched by employeeId when known AND by normalised name
 * (the incentive ledgers are name-keyed), mirroring getIncentivePaidByPerson's
 * dual-key map.
 */

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** First-of-month date (YYYY-MM-DD) for a "YYYY-MM" key. */
function monthStartDate(month: string): string {
  return `${month}-01`;
}

/** First-of-NEXT-month date (exclusive upper bound) for a "YYYY-MM" key. */
function monthEndExclusive(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** The FY-start "YYYY-MM" (April) for a given month (Apr–Mar financial year). */
function fyStartMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-04`;
}

/** Add `delta` months to a "YYYY-MM" key (delta may be negative). */
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Inclusive month range [from … to] as "YYYY-MM" keys (from ≤ to). */
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // Guard against an inverted range (never emit more than 24 months).
  for (let i = 0; i < 24 && cur <= to; i += 1) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

export interface TargetVsPaid {
  target: number;
  paid: number;
  /** paid / target × 100, or null when no target set. */
  attainmentPct: number | null;
}

export interface IncentiveTargetVsPaidForPerson {
  month: string;
  thisMonth: TargetVsPaid;
  last3Months: TargetVsPaid;
  ytd: TargetVsPaid;
  /** Per-month YTD series (April → month), ascending. */
  perMonth: Array<{ month: string; target: number; paid: number }>;
}

function tp(target: number, paid: number): TargetVsPaid {
  return { target, paid, attainmentPct: target > 0 ? (paid / target) * 100 : null };
}

/**
 * Target-vs-Paid windows for a person for `month` ("YYYY-MM").
 *
 * Efficiency: PAID is fetched once per YTD month via getIncentivePaidByPerson
 * and memoised, so the trailing/YTD windows reuse the same per-month numbers.
 * TARGET is one range query. YTD is capped at 12 months (a financial year).
 */
export async function getIncentiveTargetVsPaidForPerson(
  person: { id: string | null; name: string },
  month: string,
): Promise<IncentiveTargetVsPaidForPerson> {
  const key = nameKey(person.name);
  const ytdStart = fyStartMonth(month);
  const months = monthRange(ytdStart, month); // April … month (≤12)

  // ── PAID per month (memoised) via the canonical shared-key producer ──
  const paidByMonth = new Map<string, number>();
  await Promise.all(
    months.map(async (m) => {
      const map = await getIncentivePaidByPerson(m);
      const paid =
        (person.id != null ? map.get(person.id) : undefined) ??
        (key ? map.get(key) : undefined) ??
        0;
      paidByMonth.set(m, paid);
    }),
  );

  // ── TARGET per month — one range query over the YTD window ──
  const targetRows = await db
    .select()
    .from(incentiveTargets)
    .where(
      and(
        gte(incentiveTargets.periodMonth, monthStartDate(ytdStart)),
        lt(incentiveTargets.periodMonth, monthEndExclusive(month)),
      ),
    );
  const targetByMonth = new Map<string, number>();
  for (const t of targetRows) {
    const matches =
      (person.id != null && t.employeeId === person.id) ||
      (key !== "" && nameKey(t.empName) === key);
    if (!matches) continue;
    const ym = String(t.periodMonth).slice(0, 7);
    targetByMonth.set(ym, (targetByMonth.get(ym) ?? 0) + num(t.targetAmount));
  }

  const perMonth = months.map((m) => ({
    month: m,
    target: targetByMonth.get(m) ?? 0,
    paid: paidByMonth.get(m) ?? 0,
  }));

  const sum = (ms: string[], pick: (m: string) => number) =>
    ms.reduce((s, m) => s + pick(m), 0);

  const last3 = monthRange(addMonths(month, -2), month); // 3-month trailing window

  return {
    month,
    thisMonth: tp(targetByMonth.get(month) ?? 0, paidByMonth.get(month) ?? 0),
    last3Months: tp(
      sum(last3, (m) => targetByMonth.get(m) ?? 0),
      sum(last3, (m) => paidByMonth.get(m) ?? 0),
    ),
    ytd: tp(
      sum(months, (m) => targetByMonth.get(m) ?? 0),
      sum(months, (m) => paidByMonth.get(m) ?? 0),
    ),
    perMonth,
  };
}
