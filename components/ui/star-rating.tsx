"use client";

import * as React from "react";
import { Star } from "lucide-react";

/**
 * A keyboard-accessible 1–N star rating. Used across PMS (Attitude/Behaviour/
 * Skill 3–5) and Training (Content/Depth/Understanding/Applicability, Share
 * feedback) — all 1–5★. Arrow keys + 1..N number keys set the value; click sets;
 * `min` clamps the lowest selectable star (e.g. the review scale starts at 3).
 */
export function StarRating({
  value,
  onChange,
  max = 5,
  min = 1,
  size = 24,
  color = "#16a34a",
  readOnly = false,
  label,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  max?: number;
  min?: number;
  size?: number;
  color?: string;
  readOnly?: boolean;
  label?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  function set(v: number) {
    if (readOnly || !onChange) return;
    onChange(Math.max(min, Math.min(max, v)));
  }

  return (
    <div
      role={readOnly ? undefined : "radiogroup"}
      aria-label={label}
      className="inline-flex items-center gap-1"
      onKeyDown={(e) => {
        if (readOnly) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set((value ?? min - 1) + 1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set((value ?? min + 1) - 1); }
        else if (/^[1-9]$/.test(e.key)) { e.preventDefault(); set(Number(e.key)); }
      }}
      tabIndex={readOnly ? undefined : 0}
      style={{ outline: "none" }}
    >
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => {
        const active = star <= shown;
        const selectable = !readOnly && star >= min;
        return (
          <button
            key={star}
            type="button"
            aria-label={`${star} of ${max}`}
            aria-checked={value === star}
            role={readOnly ? undefined : "radio"}
            disabled={readOnly || star < min}
            tabIndex={-1}
            onClick={() => set(star)}
            onMouseEnter={() => selectable && setHover(star)}
            onMouseLeave={() => setHover(null)}
            className="rounded transition-transform enabled:hover:scale-110 disabled:opacity-40"
            style={{ lineHeight: 0, cursor: selectable ? "pointer" : "default" }}
          >
            <Star
              size={size}
              strokeWidth={2}
              style={{ color: active ? color : "var(--color-hairline-strong)", fill: active ? color : "transparent" }}
            />
          </button>
        );
      })}
      {value != null && <span className="ml-1 text-[13px] font-bold tabular-nums" style={{ color }}>{value}</span>}
    </div>
  );
}
