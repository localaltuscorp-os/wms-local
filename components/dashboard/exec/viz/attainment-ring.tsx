"use client";
import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "./use-anim-count";

/**
 * AttainmentRing — circular progress ring with the attainment percentage in the
 * centre. Colour follows the Altus attainment-vs-target rule: green ≥100,
 * amber ≥60, red below. The ring draws on via stroke-dashoffset (SVG, GPU-cheap)
 * and the centre number counts up. At ≥100% it earns the `.wg-ring-glow` halo.
 *
 * Pure / presentational — props in, no fetching.
 */
export type AttainmentRingProps = {
  /** Achieved amount. */
  value: number;
  /** Target amount the value is measured against. */
  max: number;
  /** Outer diameter in px. */
  size?: number;
};

type Tone = { stroke: string; deep: string; tint: string };

function toneFor(pct: number): Tone {
  if (pct >= 100)
    return {
      stroke: "var(--color-green)",
      deep: "var(--color-green-deep)",
      tint: "color-mix(in srgb, var(--color-green) 14%, transparent)",
    };
  if (pct >= 60)
    return {
      stroke: "var(--color-amber)",
      deep: "var(--color-amber-deep)",
      tint: "color-mix(in srgb, var(--color-amber) 16%, transparent)",
    };
  return {
    stroke: "var(--color-altus-red)",
    deep: "var(--color-altus-red-deep)",
    tint: "color-mix(in srgb, var(--color-altus-red) 14%, transparent)",
  };
}

export function AttainmentRing({ value, max, size = 168 }: AttainmentRingProps) {
  const reduce = useReducedMotion() ?? false;
  const pct = max > 0 ? (value / max) * 100 : 0;
  const clamped = Math.max(0, Math.min(pct, 100));
  const tone = toneFor(pct);
  const cleared = pct >= 100;

  const stroke = Math.max(8, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;

  // Draw-on: start fully offset (hidden), settle to the target arc length.
  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, clamped]);

  const targetOffset = circumference * (1 - clamped / 100);
  const offset = drawn ? targetOffset : circumference;

  const display = useAnimCount(Math.round(pct), 1200);
  const gradId = React.useId();

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cleared ? "wg-ring-glow" : undefined}
        role="img"
        aria-label={`Attainment ${Math.round(pct)} percent of target`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone.stroke} />
            <stop offset="100%" stopColor={tone.deep} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="var(--color-hairline-strong)"
          strokeWidth={stroke}
        />

        {/* Progress arc — rotated to start at 12 o'clock, drawing clockwise. */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{
            transition: reduce
              ? "none"
              : "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
            filter: `drop-shadow(0 2px 6px ${tone.tint})`,
          }}
        />
      </svg>

      {/* Centre readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: Math.round(size * 0.26),
            letterSpacing: "-0.03em",
            color: tone.deep,
          }}
        >
          {display}
          <span style={{ fontSize: Math.round(size * 0.14) }}>%</span>
        </span>
        <span
          className="uppercase font-bold tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: Math.max(9, Math.round(size * 0.062)),
            color: "var(--color-ink-muted)",
            marginTop: Math.round(size * 0.02),
          }}
        >
          of target
        </span>
      </div>
    </div>
  );
}
