"use client";

import * as React from "react";
import { Star } from "lucide-react";

export function StarRating({
  value,
  onChange,
  size = 32,
  readOnly = false,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="inline-flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= shown;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-checked={value === n}
            role="radio"
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            onClick={() => onChange?.(n)}
            className="transition-transform"
            style={{ transform: active && !readOnly ? "scale(1.08)" : "scale(1)", cursor: readOnly ? "default" : "pointer", lineHeight: 0 }}
          >
            <Star
              size={size}
              strokeWidth={2}
              style={{
                fill: active ? "url(#starGrad)" : "transparent",
                color: active ? "var(--color-amber)" : "var(--color-hairline-strong)",
                filter: active ? "drop-shadow(0 2px 6px color-mix(in srgb, var(--color-amber) 45%, transparent))" : "none",
                transition: "color 140ms ease, filter 140ms ease",
              }}
            />
          </button>
        );
      })}
      <svg width="0" height="0" aria-hidden>
        <defs>
          <linearGradient id="starGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="var(--color-amber-deep)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
