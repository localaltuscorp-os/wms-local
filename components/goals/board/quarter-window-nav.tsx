"use client";

import { groupQuarterKeysByFy, quarterWindow } from "@/lib/goals/types";
import { fyLabel, periodKeyLabel } from "@/components/goals/cascade/util";

/**
 * The Quarterly board's quarter navigator — a ROLLING FOUR-QUARTER WINDOW
 * grouped under the financial year that owns each quarter.
 *
 *     ┌ FY 2026–27 ─────────────────────────────┐  ┌ FY 2027–28 ──┐
 *     │ [Q2 · Jul–Sep] [Q3 · Oct–Dec] [Q4 · …]  │  │ [Q1 · Apr–Jun]│
 *     └─────────────────────────────────────────┘  └───────────────┘
 *
 * WHY A WINDOW, not the FY's four quarters: the old row showed Q1–Q4 of the
 * viewed FY, so in August the board led with a quarter that ended in June and
 * the NEXT year's Q1 — the one most planning actually targets — was two clicks
 * away behind the FY stepper. A window anchored on the live quarter always
 * shows "now and the next three", which is what a quarterly plan spans.
 *
 * The FY boundary is the whole difficulty, and NONE of it lives here: both the
 * window (`quarterWindow`) and the bracketing (`groupQuarterKeysByFy`) are pure
 * domain math in `lib/goals/types`, built on `shiftQuarterKey`'s absolute
 * quarter arithmetic and covered by `tests/unit/goals-quarter-window`. This
 * file knows only "render these groups". Nothing anywhere knows that Q4 ends a
 * year or that Q1 is April — redefine the FY in one place and this follows.
 *
 * The grouping is drawn as a legend-in-the-border "bracket" (a hairline box
 * with the FY label notched into its top edge) rather than a giant `{` — at
 * this size a real brace glyph renders as a stretched, off-baseline squiggle.
 */

export interface QuarterWindowNavProps {
  /** First quarter of the window; the next three follow it. */
  anchorKey: string;
  /** Extra keys to include beyond the window (the "Show past" reveal). Merged,
   *  de-duplicated and re-sorted, so groups stay chronological. */
  extraKeys?: string[];
  selectedKey: string;
  /** The quarter happening RIGHT NOW. It starts out selected, but the moment
   *  the user picks another one the row would otherwise lose every trace of
   *  where "now" is — a whole window anchored on the live quarter, with the
   *  live quarter invisible. Marked with a dot instead of a second highlight. */
  currentKey: string;
  /** Goal count per quarter, or `null` when the quarter sits outside the FY the
   *  board actually loaded — the count is unknown then, and a confident "0"
   *  would be a lie. Only affects the screen-reader label. */
  countOf: (periodKey: string) => number | null;
  onPick: (periodKey: string) => void;
}

/** Sort quarter keys chronologically. The keys are fixed-width and FY-major
 *  ('2026-Q3'), so a plain string compare IS chronological order. */
function byChronology(a: string, b: string): number {
  return a.localeCompare(b);
}

export function QuarterWindowNav({
  anchorKey,
  extraKeys = [],
  selectedKey,
  currentKey,
  countOf,
  onPick,
}: QuarterWindowNavProps) {
  const keys = Array.from(new Set([...quarterWindow(anchorKey), ...extraKeys])).sort(byChronology);
  const groups = groupQuarterKeysByFy(keys);

  return (
    // `group`, not `tablist`: an FY box sits between the container and its
    // buttons, and a tablist may only contain tabs. The pills keep the board's
    // existing `aria-pressed` convention instead of tab semantics.
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2" role="group" aria-label="Pick a quarter">
      {groups.map((group) => (
        <div
          key={group.fy}
          role="group"
          aria-label={fyLabel(group.fy)}
          // `pt-3` clears the notched legend; the box is only a hairline so the
          // pills stay the loudest thing in the row.
          className="relative rounded-lg border border-hairline px-1.5 pb-1 pt-2"
          style={{ background: "color-mix(in srgb, var(--color-surface-soft) 55%, transparent)" }}
        >
          <span
            aria-hidden
            // Sits ON the top border and paints the band's own card background
            // behind itself, which is what cuts the hairline into a bracket.
            className="absolute -top-[5px] left-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
            style={{ background: "var(--color-surface-card)" }}
          >
            {fyLabel(group.fy)}
          </span>

          <div className="flex flex-wrap items-center gap-1">
            {group.keys.map((key) => (
              <QuarterPill
                key={key}
                label={periodKeyLabel(key)}
                fyName={fyLabel(group.fy)}
                count={countOf(key)}
                active={key === selectedKey}
                current={key === currentKey}
                onPick={() => onPick(key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuarterPill({
  label,
  fyName,
  count,
  active,
  current,
  onPick,
}: {
  label: string;
  fyName: string;
  count: number | null;
  active: boolean;
  /** This is the quarter happening now — gets a dot, not a second highlight. */
  current: boolean;
  onPick: () => void;
}) {
  // "Now" is stated in the accessible name too: the dot is decoration, and a
  // screen-reader user otherwise has no way to tell the live quarter from the
  // three ahead of it.
  const name = [
    label,
    current ? "current quarter" : null,
    fyName,
    count === null ? null : `${count} goal${count === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      // The FY is a visual group but not an accessible ancestor of the label, so
      // name each tab with its year — "Q1 · Apr–Jun" alone is ambiguous once the
      // window straddles two FYs.
      aria-label={name}
      className={`wg-btn inline-flex items-center justify-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap transition-all cursor-pointer ${FOCUS_RING}`}
      style={
        active
          ? {
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              borderColor: "var(--color-altus-red)",
              color: "#fff",
              boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)",
            }
          : {
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline-strong)",
              color: "var(--color-ink-soft)",
            }
      }
    >
      {current && (
        <span
          aria-hidden
          className="size-[5px] shrink-0 rounded-full"
          // On the selected (red) pill the dot has to read against white, so it
          // borrows the foreground; elsewhere it is the brand red on card.
          style={{ background: active ? "rgba(255,255,255,0.85)" : "var(--color-altus-red)" }}
        />
      )}
      {label}
    </button>
  );
}

/** Mirrors the board's shared focus ring (kept local so this file stands alone). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";
