"use client";

import * as React from "react";

const RED = "#E10600";

/** Colour ramp shared by every score surface (0..10 scale). */
export function toneFor(value: number | null): { stroke: string; fg: string; soft: string } {
  if (value === null) return { stroke: "var(--color-hairline-strong)", fg: "var(--color-ink-subtle)", soft: "var(--color-surface-soft)" };
  if (value >= 7) return { stroke: "#16a34a", fg: "#15803d", soft: "color-mix(in srgb, #16a34a 12%, white)" };
  if (value >= 4) return { stroke: "#f59e0b", fg: "#b45309", soft: "color-mix(in srgb, #f59e0b 16%, white)" };
  return { stroke: RED, fg: "var(--color-altus-red-deep)", soft: "color-mix(in srgb, #E10600 12%, white)" };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * A pure-SVG progress ring with a value in the middle. `fill` (0..1) drives the
 * arc; `tone` colours it. Smooth CSS transition on the dash — no JS animation.
 */
export function Dial({
  fill,
  size = 116,
  stroke = 10,
  main,
  sub,
  tone,
  ariaLabel,
}: {
  fill: number;
  size?: number;
  stroke?: number;
  main: React.ReactNode;
  sub?: string;
  tone: { stroke: string; fg: string };
  ariaLabel?: string;
}) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0));
  const dash = c * clamped;
  const cx = size / 2;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1), stroke 0.3s ease" }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center leading-none">
        <span
          className="font-black tabular-nums"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: tone.fg, fontSize: size * 0.24 }}
        >
          {main}
        </span>
        {sub && (
          <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">{sub}</span>
        )}
      </div>
    </div>
  );
}

/** The big weighted-overall dial (value out of 10, with a /10 suffix + %). */
export function OverallDial({ value, pct, size = 124 }: { value: number | null; pct: number | null; size?: number }) {
  const tone = toneFor(value);
  return (
    <Dial
      size={size}
      stroke={11}
      fill={value === null ? 0 : value / 10}
      tone={tone}
      sub={pct === null ? "Overall" : `${pct}%`}
      ariaLabel={value === null ? "Overall score not yet rated" : `Overall weighted score ${fmt(value)} out of 10`}
      main={
        value === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <>
            {fmt(value)}
            <span className="text-[0.55em] font-bold text-ink-subtle">/10</span>
          </>
        )
      }
    />
  );
}
