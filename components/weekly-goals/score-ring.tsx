import * as React from "react";
import { Star } from "lucide-react";

interface Props {
  /** Progress value, 0..100. */
  value: number;
  /** Outer diameter in px (default 72). */
  size?: number;
  /** Optional accessible label (defaults to "{value}% weekly score"). */
  label?: string;
}

/**
 * Presentational circular progress ring for the Weekly Goals board: a hairline
 * track with a proportional arc and a star centred inside. The arc + star turn
 * Altus-red once the score is strong (>= 60), otherwise a quiet grey — matching
 * the editorial palette. Server-safe (no client hooks / handlers).
 */
export function ScoreRing({ value, size = 72, label }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const strong = v >= 60;
  const stroke = Math.max(5, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (v / 100) * circ;
  const arcColor = strong ? "var(--color-altus-red)" : "#9A938B";
  const starSize = Math.round(size * 0.32);

  return (
    <span
      role="img"
      aria-label={label ?? `${v}% weekly score`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="block"
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="rgba(23,20,17,0.10)"
          strokeWidth={stroke}
        />
        {/* Progress arc — starts at 12 o'clock, sweeps clockwise. */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 400ms ease" }}
        />
      </svg>
      <Star
        aria-hidden
        size={starSize}
        strokeWidth={2}
        className="absolute"
        style={{
          color: arcColor,
          fill: strong ? arcColor : "transparent",
        }}
      />
    </span>
  );
}
