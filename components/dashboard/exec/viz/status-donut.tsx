"use client";
import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "./use-anim-count";

/**
 * StatusDonut — a donut over the four delivery states, with the running total
 * in the centre and a legend. Segments draw on sequentially via
 * stroke-dashoffset (cheap SVG motion). `slices` is an OBJECT keyed by state.
 *
 * Pure / presentational.
 */
export type DonutSlices = {
  onTime: number;
  late: number;
  aging: number;
  done: number;
};

export type StatusDonutProps = {
  slices: DonutSlices;
  size?: number;
};

type SegMeta = {
  key: keyof DonutSlices;
  label: string;
  color: string;
  deep: string;
};

const SEGMENTS: SegMeta[] = [
  {
    key: "onTime",
    label: "On time",
    color: "var(--color-green)",
    deep: "var(--color-green-deep)",
  },
  {
    key: "done",
    label: "Done",
    color: "var(--color-teal)",
    deep: "var(--color-teal-deep)",
  },
  {
    key: "aging",
    label: "Aging",
    color: "var(--color-amber)",
    deep: "var(--color-amber-deep)",
  },
  {
    key: "late",
    label: "Late",
    color: "var(--color-altus-red)",
    deep: "var(--color-altus-red-deep)",
  },
];

export function StatusDonut({ slices, size = 200 }: StatusDonutProps) {
  const reduce = useReducedMotion() ?? false;
  const total =
    slices.onTime + slices.late + slices.aging + slices.done;

  const stroke = Math.max(14, Math.round(size * 0.13));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;

  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, total]);

  const displayTotal = useAnimCount(total, 1200);

  // Build cumulative arcs. Each segment's length is its share of the
  // circumference; we reveal it by animating dashoffset from full → its slot.
  let cursor = 0;
  const arcs = SEGMENTS.map((seg, i) => {
    const value = slices[seg.key];
    const frac = total > 0 ? value / total : 0;
    const len = frac * circumference;
    const rotation = (cursor / circumference) * 360;
    cursor += len;
    return { seg, value, len, rotation, i };
  });

  return (
    <div className="flex items-center gap-7 max-md:flex-col max-md:gap-4">
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Status breakdown, ${total} total`}
          style={{ overflow: "visible" }}
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="var(--color-hairline)"
            strokeWidth={stroke}
          />
          {arcs.map(({ seg, len, rotation, i }) => {
            // Reveal: gap = circumference - len; offset hides it until drawn.
            const dashArray = `${len} ${circumference - len}`;
            const offset = drawn ? 0 : len;
            return (
              <circle
                key={seg.key}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={dashArray}
                strokeDashoffset={offset}
                transform={`rotate(${rotation - 90} ${cx} ${cx})`}
                style={{
                  transition: reduce
                    ? "none"
                    : `stroke-dashoffset 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s`,
                }}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: Math.round(size * 0.24),
              letterSpacing: "-0.03em",
              color: "var(--color-ink-strong)",
            }}
          >
            {displayTotal}
          </span>
          <span
            className="uppercase font-bold tracking-[0.14em]"
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              fontSize: Math.max(9, Math.round(size * 0.05)),
              color: "var(--color-ink-muted)",
            }}
          >
            total
          </span>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex flex-col gap-2.5">
        {arcs.map(({ seg, value }) => {
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <li key={seg.key} className="flex items-center gap-2.5">
              <span
                className="inline-block size-3 rounded-[4px]"
                style={{
                  background: seg.color,
                  boxShadow: `0 0 6px color-mix(in srgb, ${seg.color} 60%, transparent)`,
                }}
              />
              <span
                className="font-bold text-ink-strong"
                style={{ fontSize: 14, minWidth: 64 }}
              >
                {seg.label}
              </span>
              <span
                className="tabular-nums font-black"
                style={{ fontSize: 15, color: seg.deep }}
              >
                {value}
              </span>
              <span
                className="tabular-nums font-semibold"
                style={{ fontSize: 12.5, color: "var(--color-ink-muted)" }}
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
