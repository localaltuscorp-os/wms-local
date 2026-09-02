import type { KpiWithDelta } from "@/lib/types";
import { MAX_PCT_MAGNITUDE } from "@/lib/transforms/kpi-trend";

export interface TrendBadge {
  arrow: "▲" | "▼" | "→";
  /** What the badge prints — a percentage, or a raw count when there is no
   *  percentage to print. */
  text: string;
  direction: "up" | "down" | "flat";
  /** Long form for the `title` attribute: the two raw window counts, so the
   *  percentage can always be checked against the numbers behind it. */
  title: string;
}

/**
 * The "▲ 32.3% vs last week" badge, from the LAST 7 DAYS against the 7 before.
 *
 * WHAT IT REPLACED. The cards used to print `kpi.current - kpi.previous`, where
 * `current` was the bucket's count across the WHOLE active date filter (31 days
 * by default) and `previous` was a 7-day count. Subtracting one from the other
 * compares two different windows, which is how a perfectly steady fortnight
 * produced a "▲ 323 vs last week". Both numbers here are 7-day volumes off the
 * same series the sparkline draws.
 *
 * NO PERCENTAGE FROM A THIN BASELINE. Under MIN_PCT_BASELINE prior-week tasks
 * (lib/transforms/kpi-trend.ts) a ratio is arithmetic without meaning: 1 → 12
 * is a true +1100%, and printing it made a normal week look like a system
 * fault. The badge states the plain difference instead. Defined once, here,
 * because the card and its detail panel must never disagree.
 */
export function formatTrendPct(kpi: KpiWithDelta): TrendBadge {
  // Coerced, not trusted. The dashboard payload is memoised in Next's Data
  // Cache, which can serve an entry shaped by the PREVIOUS deploy for the
  // length of its TTL — and `window` / `changePct` are new fields. The cache
  // key carries a version for exactly this reason (see loadDashboardData); this
  // is the belt to that brace, so a stale entry renders "→ 0" rather than
  // "▲ undefined%".
  const current = kpi.window ?? 0;
  const previous = kpi.previous ?? 0;
  const changePct = kpi.changePct ?? null;
  const delta = current - previous;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "→";
  const title = `${current} in the last 7 days vs ${previous} in the 7 before`;

  if (changePct == null) {
    // The baseline was too thin to divide by (see MIN_PCT_BASELINE), so state
    // the plain difference: "▲ +11 vs last week".
    //
    // THE DIFFERENCE, NOT `current`. This branch used to print the current
    // window's own count, which is only the same number while the previous
    // window is exactly 0 — at previous = 3, current = 14 it claimed a rise of
    // 14 where the actual change was 11.
    //
    // The word "tasks" is deliberately not appended. These cards are 165px at
    // their narrowest and the line already carries arrow + number + "vs last
    // week"; the unit is unambiguous on a card whose heading is a task count.
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    return { arrow, text: `${sign}${Math.abs(delta)}`, direction, title };
  }

  const magnitude = Math.abs(changePct);

  // PAST A TRIPLING, PRINT THE COUNT. See MAX_PCT_MAGNITUDE: the baseline floor
  // screens 1 → 12, but not 20 → 73 (+265%) or 6 → 64 (+967%) — both of which
  // are correct arithmetic and neither of which tells the reader anything they
  // can use. The absolute difference does.
  if (magnitude > MAX_PCT_MAGNITUDE) {
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    return { arrow, text: `${sign}${Math.abs(delta)}`, direction, title };
  }

  // Whole numbers past 10% — "▲ 47%" reads faster than "▲ 47.4%", and the
  // decimal only earns its place while the movement is small.
  const shown = magnitude >= 10 ? Math.round(magnitude) : magnitude;
  return { arrow, text: `${shown}%`, direction, title };
}
