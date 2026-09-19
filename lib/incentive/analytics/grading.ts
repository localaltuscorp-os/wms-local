/**
 * INCENTIVE % OF CTC, GRADE AND RANK — the one place these rules live.
 *
 * Pure and client-safe. The dashboard's grade report, its ranking and anything
 * that later wants the same answer (the Employee Incentive Report Card, emails,
 * Accounts, reports) import from here; no component computes a percentage or
 * picks a grade on its own.
 *
 * ── GRADES ────────────────────────────────────────────────────────────────
 *   A  above 20% of CTC
 *   B  10.01% – 20%
 *   C  5.01% – 10%
 *   D  up to 5% (including 0%)
 *
 * Each band's LOWER bound is exclusive and its UPPER bound inclusive: 20.00% is
 * B and 20.01% is A; 10.00% is C; 5.00% is D. That is how the ranges read, and
 * the same (min, max] convention the PMS grade bands already use
 * (lib/pms/v3/grade-band.ts). The brief's own example ("20.00% → C") contradicts
 * its ranges; the ranges were confirmed as the rule.
 *
 * The percentage is rounded to 2 decimals BEFORE it is banded, so the grade can
 * never disagree with the figure on screen — 20.004% displays as 20.00% and is
 * graded B, not A.
 *
 * To change a threshold, edit INCENTIVE_GRADE_BANDS. Nothing else hardcodes one.
 */

export type IncentiveGrade = "A" | "B" | "C" | "D";

export interface IncentiveGradeBand {
  grade: IncentiveGrade;
  /** Exclusive lower bound, in %; null = no lower bound. */
  above: number | null;
  /** Inclusive upper bound, in %; null = no upper bound. */
  upTo: number | null;
  /** How the band reads on screen. */
  label: string;
}

export const INCENTIVE_GRADE_BANDS: readonly IncentiveGradeBand[] = [
  { grade: "A", above: 20, upTo: null, label: "Above 20% of CTC" },
  { grade: "B", above: 10, upTo: 20, label: "10.01% – 20% of CTC" },
  { grade: "C", above: 5, upTo: 10, label: "5.01% – 10% of CTC" },
  { grade: "D", above: null, upTo: 5, label: "Up to 5% of CTC" },
];

/** Round to 2 decimals, immune to the 1.005 → 1.00 float trap. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A finite number, or 0. Nothing non-finite leaves this module. */
export function finite(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Incentive % of CTC = earned ÷ CTC × 100, rounded to 2 decimals.
 * Null when CTC is missing, zero, negative or not a number — there is no
 * percentage to show, and a 0 would wrongly read as grade D.
 */
export function pctOfCtc(earned: number, ctc: number | null | undefined): number | null {
  if (typeof ctc !== "number" || !Number.isFinite(ctc) || ctc <= 0) return null;
  return round2((finite(earned) / ctc) * 100);
}

/** The grade for a percentage, or null when there is no percentage. */
export function gradeFor(pct: number | null | undefined): IncentiveGrade | null {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const p = round2(pct);
  for (const band of INCENTIVE_GRADE_BANDS) {
    if ((band.above === null || p > band.above) && (band.upTo === null || p <= band.upTo)) {
      return band.grade;
    }
  }
  return null;
}

/**
 * The CTC a period is measured against: monthly CTC × the months of the period
 * the person was employed for.
 *
 * Incentive earned over three months is compared with three months of CTC, not
 * with one month and not with a year — otherwise every multi-month period would
 * inflate the percentage. Months before the joining month are not counted, so
 * someone who joined in August is graded on August onwards in a YTD view, not on
 * a salary they were never paid. Joined after the whole period → null.
 */
export function periodCtc(
  monthlyCtc: number | null | undefined,
  months: readonly string[],
  joinedMonth: string | null | undefined,
): { ctc: number; months: number } | null {
  if (typeof monthlyCtc !== "number" || !Number.isFinite(monthlyCtc) || monthlyCtc <= 0) return null;
  const employed = joinedMonth ? months.filter((m) => m >= joinedMonth).length : months.length;
  if (employed === 0) return null;
  return { ctc: round2(monthlyCtc * employed), months: employed };
}

export interface RankCandidate {
  key: string;
  /** % of CTC; null = cannot be ranked (no CTC for the period). */
  score: number | null;
  /** Secondary display order among equal scores. Does not break the tie. */
  earned: number;
  name: string;
}

/**
 * STANDARD COMPETITION RANKING ("1, 2, 2, 4") on % of CTC — the same number the
 * grade is taken from, so a higher grade can never sit below a lower one.
 *
 * Equal percentages share a rank and the next rank skips accordingly. Earned
 * amount and name only order people WITHIN a tie for display; they never give
 * one tied person a better rank than another, because that would be an
 * arbitrary rule. People with no percentage get no rank.
 */
export function competitionRanks(candidates: readonly RankCandidate[]): Map<string, number> {
  const ranked = candidates
    .filter((c) => typeof c.score === "number" && Number.isFinite(c.score))
    .map((c) => ({ ...c, score: round2(c.score as number) }))
    .sort((a, b) => b.score - a.score || b.earned - a.earned || a.name.localeCompare(b.name));
  const out = new Map<string, number>();
  let rank = 0;
  let prevScore: number | null = null;
  ranked.forEach((c, i) => {
    if (prevScore === null || c.score !== prevScore) rank = i + 1;
    prevScore = c.score;
    out.set(c.key, rank);
  });
  return out;
}

export type RankMovement =
  | { kind: "up"; by: number }
  | { kind: "down"; by: number }
  | { kind: "same" }
  | { kind: "new" }
  | { kind: "na" };

/**
 * How a rank moved since the previous window.
 *   na   — there is no meaningful previous ranking (none exists for the period,
 *          or nobody earned anything in it, which would tie everyone at #1)
 *   new  — ranked now, but not ranked then (no CTC in that window)
 */
export function rankMovement(
  current: number | null,
  previous: number | null,
  previousMeaningful: boolean,
): RankMovement {
  if (!previousMeaningful || current === null) return { kind: "na" };
  if (previous === null) return { kind: "new" };
  if (previous === current) return { kind: "same" };
  return previous > current ? { kind: "up", by: previous - current } : { kind: "down", by: current - previous };
}
