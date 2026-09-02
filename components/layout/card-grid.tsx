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
 */
export interface CardGridProps {
  children: ReactNode;
  /** Minimum comfortable card width in px before it wraps. Default 220. */
  min?: number;
  /** Gap between cards (any CSS length). Default "1.25rem". */
  gap?: string;
  className?: string;
  style?: CSSProperties;
}

export function CardGrid({
  children,
  min = 220,
  gap = "1.25rem",
  className = "",
  style,
}: CardGridProps) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
