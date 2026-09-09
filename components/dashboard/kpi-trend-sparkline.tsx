"use client";

import * as React from "react";
import type { TrendPoint } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `2026-08-15` -> `15 Aug 2026`.
 *
 * Hand-formatted rather than `toLocaleDateString`: the series is keyed by UTC
 * day, and a locale formatter would render it in the READER's timezone — so a
 * task created at 02:00 IST would sit under the previous day's label on the
 * server and the correct one in the browser, which React reports as a
 * hydration mismatch on top of simply being wrong.
 */
export function formatTrendDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const W = 560;
const H = 132;
const PAD = 10;

type Series = "created" | "completed";

function path(points: TrendPoint[], key: Series, scale: (v: number) => number) {
  return points
    .map((p, i) => {
      const x = PAD + (i / (points.length - 1 || 1)) * (W - 2 * PAD);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${scale(p[key]).toFixed(1)}`;
    })
    .join(" ");
}

/**
 * The 14-day velocity trend: tasks CREATED against tasks COMPLETED, one point
 * per day, with a crosshair + tooltip on hover.
 *
 * ONE Y-AXIS, deliberately. Both series are task counts, so they share a scale
 * and the vertical gap between the lines reads as "intake outran throughput" —
 * which is the entire reason to draw them together. Giving completed a scale of
 * its own would make that gap mean nothing.
 *
 * IDENTITY IS NOT COLOUR-ALONE: created is the card's own hue, completed is a
 * DASHED neutral. One recipe that stays legible on all six cards (slate through
 * emerald) with no per-status tuning, and it survives colour-blindness and a
 * greyscale print — the same reasoning behind the strip's translucent badges.
 */
export function KpiTrendSparkline({
  points,
  neon,
  neonDeep,
  label,
}: {
  points: TrendPoint[];
  neon: string;
  neonDeep: string;
  /** Card name, for the figure's accessible description. */
  label: string;
}) {
  const id = React.useId();
  const [hover, setHover] = React.useState<number | null>(null);

  const series = points.length > 0 ? points : [];
  // ONE shared scale across both lines. Floor of 1 so an all-zero fortnight
  // draws flat along the baseline instead of dividing by zero.
  const max = Math.max(1, ...series.flatMap((p) => [p.created, p.completed]));
  const y = React.useCallback((v: number) => H - PAD - (v / max) * (H - 2 * PAD), [max]);

  if (series.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-ink-subtle"
        style={{ height: H, fontSize: 13 }}
      >
        No activity in the last 14 days.
      </div>
    );
  }

  const createdLine = path(series, "created", y);
  const completedLine = path(series, "completed", y);
  const area = `${createdLine} L${(W - PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;

  const active = hover != null ? series[hover] ?? null : null;
  // PERCENTAGES, NOT PIXELS: the SVG stretches to its container
  // (preserveAspectRatio="none"), so an HTML overlay can only track it in
  // relative units. Saves a ResizeObserver and stays correct mid-transition.
  const xPct = (i: number) =>
    ((PAD + (i / (series.length - 1 || 1)) * (W - 2 * PAD)) / W) * 100;

  return (
    <figure className="m-0">
      <div className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label={`${label}: tasks created and completed per day over the last 14 days`}
        >
          <defs>
            <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgb(${neon})`} stopOpacity={0.28} />
              <stop offset="100%" stopColor={`rgb(${neon})`} stopOpacity={0} />
            </linearGradient>
          </defs>

          <path d={area} fill={`url(#grad-${id})`} />

          {/* Crosshair, drawn before the marks so it never sits on top of one. */}
          {active && (
            <line
              x1={`${xPct(hover!)}%`}
              x2={`${xPct(hover!)}%`}
              y1={PAD}
              y2={H - PAD}
              stroke="var(--color-hairline-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* COMPLETED — dashed neutral, under the card's own colour. */}
          <path
            d={completedLine}
            fill="none"
            stroke="var(--color-ink-muted)"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* CREATED — solid, the card's hue. */}
          <path
            d={createdLine}
            fill="none"
            stroke={`rgb(${neonDeep})`}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {active && (
            <>
              {/* 2px surface ring on each marker so the two stay separable
                  where the lines cross. */}
              <circle
                cx={`${xPct(hover!)}%`}
                cy={y(active.completed)}
                r={4}
                fill="var(--color-surface-card)"
                stroke="var(--color-ink-muted)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={`${xPct(hover!)}%`}
                cy={y(active.created)}
                r={4.5}
                fill={`rgb(${neonDeep})`}
                stroke="var(--color-surface-card)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* HIT LAYER — one full-height column per day. The targets are far
            larger than the 9px markers, which is the point: across a fortnight
            the points sit ~40px apart horizontally and often 4px apart
            vertically, so hit-testing the dots themselves would be hopeless. */}
        <div className="absolute inset-0 flex" aria-hidden>
          {series.map((p, i) => (
            <div
              key={p.date}
              className="h-full flex-1"
              onMouseEnter={() => setHover(i)}
              onMouseMove={() => setHover(i)}
            />
          ))}
        </div>

        {/* TOOLTIP. Clamped at both ends by swapping the transform origin, so
            the first and last day's popover stays inside the panel rather than
            being cut off by the card's overflow-hidden. */}
        {active && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 rounded-xl px-3 py-2 shadow-lg"
            style={{
              left: `${xPct(hover!)}%`,
              top: 0,
              transform: `translate(${
                hover! < 3 ? "0%" : hover! > series.length - 4 ? "-100%" : "-50%"
              }, -8px)`,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              minWidth: 152,
            }}
          >
            <p className="m-0 font-bold text-ink-strong" style={{ fontSize: 12.5 }}>
              {formatTrendDay(active.date)}
            </p>
            <p
              className="m-0 mt-1.5 flex items-center gap-1.5 tabular-nums"
              style={{ fontSize: 12 }}
            >
              <span
                aria-hidden
                className="inline-block shrink-0 rounded-full"
                style={{ width: 9, height: 9, background: `rgb(${neonDeep})` }}
              />
              <span className="font-bold text-ink-strong">{active.created}</span>
              <span className="text-ink-soft">
                {active.created === 1 ? "Task" : "Tasks"} Created
              </span>
            </p>
            <p
              className="m-0 mt-1 flex items-center gap-1.5 tabular-nums"
              style={{ fontSize: 12 }}
            >
              <span
                aria-hidden
                className="inline-block shrink-0"
                style={{ width: 9, height: 0, borderTop: "2px dashed var(--color-ink-muted)" }}
              />
              <span className="font-bold text-ink-strong">{active.completed}</span>
              <span className="text-ink-soft">Completed</span>
            </p>
          </div>
        )}
      </div>

      {/* Axis ends + legend on one line. The legend is not optional with two
          series — it is what keeps identity off colour alone. */}
      <figcaption className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px] font-bold tracking-wide text-ink-subtle tabular-nums">
        <span>{formatTrendDay(series[0]!.date)}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: `rgb(${neonDeep})` }}
            />
            Created
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block"
              style={{ width: 12, height: 0, borderTop: "2px dashed var(--color-ink-muted)" }}
            />
            Completed
          </span>
        </span>
        <span>{formatTrendDay(series[series.length - 1]!.date)}</span>
      </figcaption>

      {/* The table the chart is an alternative to — same array, so it can never
          disagree with the lines. Reachable by screen readers and by anyone who
          cannot read the plot. */}
      <table className="sr-only">
        <caption>{label} — daily task volume, last 14 days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Created</th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.date}>
              <th scope="row">{formatTrendDay(p.date)}</th>
              <td>{p.created}</td>
              <td>{p.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
