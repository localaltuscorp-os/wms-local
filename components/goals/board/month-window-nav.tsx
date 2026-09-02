"use client";

import { groupQuarterKeysByFy, monthsOfQuarterKey, quarterWindow } from "@/lib/goals/types";
import { fyLabel, periodKeyLabel, periodKeyShort } from "@/components/goals/cascade/util";

/**
 * The Monthly board's month navigator — the LIVE QUARTER PLUS THE NEXT ONE,
 * six months, each month sitting under the quarter that owns it and each
 * quarter under its financial year.
 *
 *     ┌ FY 2026–27 ──────────────────────────────┐
 *     │  Q2 · JUL–SEP        Q3 · OCT–DEC        │
 *     │  [Jul][Aug][Sep]     [Oct][Nov][Dec]     │
 *     └──────────────────────────────────────────┘
 *
 * WHY SIX, not twelve: the old row packed all 12 FY months into one strip of
 * identical chips, so the month you actually work in had to be found by reading
 * every label, half the row was months that had already closed, and the quarter
 * a month belongs to — the thing the cascade is built on — wasn't visible at
 * all. Two quarters is exactly the horizon a monthly plan spans: the one running
 * and the one being planned. Everything earlier moves behind "Show past".
 *
 * PAST IS PRESENT BUT QUIET. Months already closed inside the visible quarters
 * (Jul, when it is August) still render — they are part of their quarter and
 * dropping the middle of a group would be more confusing than showing it — but
 * they drop to a flat surface and muted ink so the eye lands on what's live.
 *
 * THE FY BOUNDARY IS NEVER WRITTEN DOWN. Quarter keys are stepped with
 * `shiftQuarterKey` (absolute-quarter arithmetic), each month list comes from
 * `monthKeysOfQuarter`, and the FY of any key comes from the key itself — so in
 * Jan–Mar the window renders `FY 2026–27 · Q4` beside `FY 2027–28 · Q1` with two
 * bracket boxes, purely as a consequence of the data. Nothing here knows that
 * April starts a year or that Q4 ends one.
 *
 * The FY grouping is drawn as a legend-in-the-border "bracket" (a hairline box
 * with the FY label notched into its top edge), matching QuarterWindowNav.
 */

export interface MonthWindowNavProps {
  /** First quarter of the window; one more quarter follows it. */
  anchorQuarterKey: string;
  /** Quarters to include BEFORE the window (the "Show past" reveal). Merged,
   *  de-duplicated and re-sorted, so groups stay chronological. */
  extraQuarterKeys?: string[];
  /** The selected month key ('2026-08'). */
  selectedKey: string;
  /** Today's month key — drives the "past" de-emphasis and the live-month ring.
   *  Passed in (not read from `new Date()` here) so the board owns the one clock
   *  read and server/client renders can't disagree. */
  currentMonthKey: string;
  /** Goal count for a month, or `null` when the month sits outside the FY the
   *  board actually loaded — the count is unknown then, and a confident "0"
   *  would be a lie. Only affects the screen-reader label. */
  countOf: (monthKey: string) => number | null;
  onPick: (monthKey: string) => void;
}

/** How many quarters the month window spans: the live one and the next. The
 *  "six months" of the brief is a CONSEQUENCE of this, not a second rule. */
export const MONTH_WINDOW_QUARTERS = 2;

/** The window as quarter keys — the anchor and the next one, FY rollover
 *  included. Shares `quarterWindow` with the Quarterly nav, which is what keeps
 *  the two rows stepping the calendar by the same arithmetic. */
export function monthWindowQuarters(anchorQuarterKey: string): string[] {
  return quarterWindow(anchorQuarterKey, MONTH_WINDOW_QUARTERS);
}

export function MonthWindowNav({
  anchorQuarterKey,
  extraQuarterKeys = [],
  selectedKey,
  currentMonthKey,
  countOf,
  onPick,
}: MonthWindowNavProps) {
  // Keys are fixed-width and FY-major ('2026-Q3'), so a plain sort IS
  // chronological — the revealed past quarter lands ahead of the window.
  const quarterKeys = Array.from(
    new Set([...extraQuarterKeys, ...monthWindowQuarters(anchorQuarterKey)]),
  ).sort();
  const groups = groupQuarterKeysByFy(quarterKeys);

  return (
    // `group`, not `tablist`: the FY box and the quarter caption sit between the
    // container and its buttons, and a tablist may only contain tabs. The pills
    // keep the board's existing `aria-pressed` convention.
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2" role="group" aria-label="Pick a month">
      {groups.map((group) => (
        <div
          key={group.fy}
          role="group"
          aria-label={fyLabel(group.fy)}
          // `pt-3.5` clears the notched legend; the box is only a hairline so the
          // pills stay the loudest thing in the row.
          className="relative rounded-lg border border-hairline px-1.5 pb-1 pt-2.5"
          style={{ background: "color-mix(in srgb, var(--color-surface-soft) 55%, transparent)" }}
        >
          <span
            aria-hidden
            // Sits ON the top border and paints the band's own card background
            // behind itself, which is what cuts the hairline into a bracket.
            className="absolute -top-[5px] left-2 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
            style={{ background: "var(--color-surface-card)" }}
          >
            {fyLabel(group.fy)}
          </span>

          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            {group.keys.map((quarterKeyStr) => {
              const months = monthsOfQuarterKey(quarterKeyStr);
              // A quarter is spent only once EVERY month in it has closed — one
              // past month inside a live quarter must not dim the whole caption.
              const spent = months.every((m) => m < currentMonthKey);
              return (
                <div
                  key={quarterKeyStr}
                  role="group"
                  aria-label={`${periodKeyLabel(quarterKeyStr)}, ${fyLabel(group.fy)}`}
                >
                  <div
                    aria-hidden
                    className={`mb-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${
                      spent ? "text-ink-subtle opacity-60" : "text-ink-muted"
                    }`}
                  >
                    {periodKeyLabel(quarterKeyStr)}
                  </div>
                  <div className="flex items-center gap-1">
                    {months.map((monthKeyStr) => (
                      <MonthPill
                        key={monthKeyStr}
                        monthKey={monthKeyStr}
                        quarterName={periodKeyLabel(quarterKeyStr)}
                        // Every month of a quarter belongs to that quarter's FY
                        // — including Q4's Jan–Mar, which fall in the NEXT
                        // calendar year — so the bracket's FY names them all.
                        fyName={fyLabel(group.fy)}
                        count={countOf(monthKeyStr)}
                        active={monthKeyStr === selectedKey}
                        past={monthKeyStr < currentMonthKey}
                        live={monthKeyStr === currentMonthKey}
                        onPick={() => onPick(monthKeyStr)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthPill({
  monthKey: monthKeyStr,
  quarterName,
  fyName,
  count,
  active,
  past,
  live,
  onPick,
}: {
  monthKey: string;
  quarterName: string;
  fyName: string;
  count: number | null;
  active: boolean;
  past: boolean;
  live: boolean;
  onPick: () => void;
}) {
  // Selection outranks recency: a past month you have deliberately opened is
  // still the loud red pill, so the board and its nav never disagree.
  const tone = active
    ? {
        background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
        borderColor: "var(--color-altus-red)",
        color: "#fff",
        boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)",
      }
    : past
      ? {
          // Flat + muted: readable and clickable, but clearly second-rank.
          background: "transparent",
          borderColor: "var(--color-hairline)",
          color: "var(--color-ink-subtle)",
        }
      : {
          background: "var(--color-surface-card)",
          borderColor: "var(--color-hairline-strong)",
          color: "var(--color-ink-soft)",
          // The live month keeps a whisper of red when it ISN'T selected (a deep
          // link or a deliberate hop) so "today" stays findable in the row.
          ...(live
            ? { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 45%, transparent)" }
            : null),
        };

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      // The quarter and FY are visual groups but not accessible ancestors of the
      // label, so name each pill in full — "Jul" alone is ambiguous the moment
      // the window straddles two quarters or two financial years.
      aria-label={
        `${periodKeyLabel(monthKeyStr)}, ${quarterName}, ${fyName}` +
        (count === null ? "" : ` — ${count} goal${count === 1 ? "" : "s"}`)
      }
      aria-current={live ? "date" : undefined}
      className={`wg-btn inline-flex min-w-[34px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap transition-all cursor-pointer ${FOCUS_RING}`}
      style={tone}
    >
      {periodKeyShort(monthKeyStr)}
    </button>
  );
}

/** Mirrors the board's shared focus ring (kept local so this file stands alone). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";
