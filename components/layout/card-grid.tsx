import type { CSSProperties, ReactNode } from "react";

/**
 * CardGrid — a width-adaptive grid for uniform cards (KPI tiles, stat boxes,
 * summary cards).
 *
 * Uses `repeat(auto-fit, minmax(min(<min>px, 100%), 1fr))`, which reflows the
 * card count to whatever fits the *available* width — 6-across → 4 → 3 → 2 → 1
 * as the effective CSS width drops under zoom / Windows scaling / a snapped
 * window — with NO breakpoints, NO container queries, and NO JS. The inner
 * `min(<min>px, 100%)` guard stops a card ever forcing horizontal overflow when
 * the container is narrower than one card (very small snaps).
 *
 * Use this ONLY for rows of interchangeable, roughly equal-weight cards. For a
 * page's top-level regions (distinct columns like punch-card · team · calendar)
 * keep an explicit responsive grid — those are not interchangeable tiles.
 *
 * `maxCols` caps how many cards a row may ever hold, which is what you want when
 * the card COUNT is fixed and an uncapped grid would leave a ragged last row —
 * six tiles across a wide container become 5+1 rather than a clean 3+3. Capping
 * is done inside the track's own minimum (a card can never be narrower than one
 * Nth of the row) instead of with breakpoints, so it still responds to a sidebar
 * collapsing — that changes the CONTAINER width, which no media query can see.
 */
export interface CardGridProps {
  children: ReactNode;
  /** Minimum comfortable card width in px before it wraps. Default 220. */
  min?: number;
  /** Gap between cards (any CSS length). Default "1.25rem". */
  gap?: string;
  /** Hard cap on cards per row. Omit for an uncapped auto-fit grid. */
  maxCols?: number;
  className?: string;
  style?: CSSProperties;
}

export function CardGrid({
  children,
  min = 220,
  gap = "1.25rem",
  maxCols,
  className = "",
  style,
}: CardGridProps) {
  // Uncapped: a card is at least `min` wide, so as many fit as will fit.
  // Capped: it is also at least one Nth of the row, so N is the most that can
  // ever fit. `max()` keeps `min` as the floor, which is what still lets a
  // capped grid drop to fewer columns once one Nth would be uncomfortably
  // narrow. The outer `min(100%, …)` stops a single card overflowing a
  // container narrower than one card.
  const track = maxCols
    ? `min(100%, max(${min}px, calc((100% - ${maxCols - 1} * ${gap}) / ${maxCols})))`
    : `min(${min}px, 100%)`;

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${track}, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
