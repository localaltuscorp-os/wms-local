"use client";

import * as React from "react";
import { Star } from "lucide-react";

const RED = "#E10600";
const N = 10;

/**
 * A 10-star rating with HALF-star granularity (0..10 in 0.5 steps). Click the
 * left half of a star for ½, the right half for a full point; clicking the same
 * spot steps it back down. Read-only mode just renders the fill. Pure SVG/CSS.
 */
export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 30,
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover != null && !readOnly ? hover : value;

  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="flex items-center" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: N }, (_, i) => {
          const fill = Math.max(0, Math.min(1, shown - i)); // 0 · 0.5 · 1
          return (
            <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
              <Star size={size} className="block" style={{ color: "var(--color-hairline-strong)" }} fill="none" strokeWidth={1.9} />
              <span className="pointer-events-none absolute left-0 top-0 h-full overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="block" style={{ color: RED, filter: "drop-shadow(0 2px 5px rgba(225,6,0,0.32))" }} fill={RED} strokeWidth={1.9} />
              </span>
              {!readOnly && (
                <>
                  <span
                    className="absolute left-0 top-0 z-10 h-full w-1/2 cursor-pointer"
                    onMouseEnter={() => setHover(i + 0.5)}
                    onClick={() => onChange?.(value === i + 0.5 ? i : i + 0.5)}
                    aria-hidden
                  />
                  <span
                    className="absolute right-0 top-0 z-10 h-full w-1/2 cursor-pointer"
                    onMouseEnter={() => setHover(i + 1)}
                    onClick={() => onChange?.(value === i + 1 ? i + 0.5 : i + 1)}
                    aria-hidden
                  />
                </>
              )}
            </span>
          );
        })}
      </div>
      <span
        className="text-[17px] font-black tabular-nums"
        style={{ color: value > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)", minWidth: 62 }}
      >
        {value > 0 ? `${Number.isInteger(value) ? value : value.toFixed(1)} / 10` : "— / 10"}
      </span>
    </div>
  );
}
