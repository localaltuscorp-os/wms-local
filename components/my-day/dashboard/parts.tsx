"use client";

import * as React from "react";
import { pct, scoreLabel, type ScoreBucket } from "@/lib/daily-goals/score";

/**
 * Daily Goals -> Dashboard — the shared chrome.
 *
 * Deliberately PLAIN: cards, hairlines, numbers and one thin meter. The WMS
 * dashboard's neon glass tiles (components/dashboard/kpi-card.tsx) are left
 * exactly where they are — this surface is a management read-out, and the brief
 * was "no unnecessary charts or decorative visualisations", so the only graphic
 * element here is the score meter that restates the number it sits under.
 *
 * Everything below borrows the planner's own vocabulary (hairline borders,
 * `surface-card` ground, the 11.5-13.5px type ramp, `rounded-chip`) so the two
 * pages read as one module.
 */

export const GOALS_ACCENT = "#E10600";

/* ----------------------------------------------------------------------- */
/* Score bands                                                              */
/* ----------------------------------------------------------------------- */

/**
 * The one status palette, reusing the app's semantic tokens rather than
 * inventing dashboard-only colours.
 *
 * The bands are read-only judgement: >= 80 good, >= 60 watch, below that
 * attention. They colour the meter and the percentage, never the raw "8 / 10"
 * — the fraction is the fact, the colour is the opinion.
 */
export function band(value: number): { fg: string; bg: string; edge: string } {
  if (value >= 80)
    return { fg: "var(--color-green-deep)", bg: "var(--color-green-bg)", edge: "var(--color-green-edge)" };
  if (value >= 60)
    return { fg: "var(--color-amber-deep)", bg: "var(--color-amber-bg)", edge: "var(--color-amber-edge)" };
  return { fg: "var(--color-altus-red-deep)", bg: "var(--color-altus-red-wash)", edge: "var(--color-altus-red-edge)" };
}

/* ----------------------------------------------------------------------- */
/* Section shell                                                            */
/* ----------------------------------------------------------------------- */

export function Panel({
  title,
  hint,
  right,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-hairline bg-surface-card p-4 max-md:p-3 ${className}`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[11.5px] font-black uppercase tracking-[0.08em] text-ink-muted">
          {title}
        </h2>
        {hint ? <span className="text-[11px] font-medium text-ink-subtle">{hint}</span> : null}
        {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** The thin meter under a score. `aria-hidden` because the figure it restates
 *  is already read out beside it — a second announcement is noise. */
export function Meter({ value, tone }: { value: number; tone: string }) {
  return (
    <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-bar bg-surface-soft">
      <div
        className="h-full rounded-bar transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Score cards                                                              */
/* ----------------------------------------------------------------------- */

/**
 * One score tile — "8 / 10" over "80%".
 *
 * `emphasis` is the OVERALL tile: same recipe, bigger numerals, so the primary
 * metric wins the top of the page without needing a different card design.
 *
 * A tile with nothing planned shows an em-dash rather than "0 / 0 · 0%":
 * un-planned is not a score, and printing 0% there is the fastest way to have a
 * dashboard mistrusted.
 */
export function ScoreCard({
  label,
  bucket,
  emphasis = false,
}: {
  label: string;
  bucket: ScoreBucket;
  emphasis?: boolean;
}) {
  const empty = bucket.planned <= 0;
  const value = pct(bucket);
  const tone = band(value);

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border border-hairline bg-surface-card p-4 max-md:p-3"
      style={emphasis ? { borderColor: tone.edge, background: tone.bg } : undefined}
    >
      <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </span>
      {empty ? (
        <>
          <span className="text-ink-subtle tabular-nums" style={{ fontSize: emphasis ? 30 : 24, fontWeight: 800 }}>
            —
          </span>
          <span className="text-[11.5px] font-semibold text-ink-subtle">Nothing planned</span>
        </>
      ) : (
        <>
          <span
            className="leading-none text-ink-strong tabular-nums"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              fontSize: emphasis ? "clamp(28px, 3.4vw, 40px)" : "clamp(22px, 2.4vw, 28px)",
            }}
          >
            {scoreLabel(bucket)}
          </span>
          <span
            className="text-[13px] font-black tabular-nums"
            style={{ color: tone.fg }}
          >
            {value}%
          </span>
          <Meter value={value} tone={tone.edge} />
        </>
      )}
    </div>
  );
}

/** A percentage on its own — used by the Performance strip and the drill-down,
 *  where the fraction is already stated elsewhere on the row. */
export function PctPill({ bucket }: { bucket: ScoreBucket }) {
  if (bucket.planned <= 0) return <span className="text-[12.5px] font-semibold text-ink-subtle">—</span>;
  const value = pct(bucket);
  const tone = band(value);
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-black tabular-nums"
      style={{ color: tone.fg, background: tone.bg, border: `1px solid ${tone.edge}33` }}
    >
      {value}%
    </span>
  );
}

/** A labelled count — Completed / Pending / Transferred. */
export function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-card px-3 py-2.5">
      <div className="text-[10.5px] font-black uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </div>
      <div
        className="mt-0.5 text-[22px] font-black leading-none tabular-nums text-ink-strong"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {note ? <div className="mt-1 text-[10.5px] font-medium text-ink-subtle">{note}</div> : null}
    </div>
  );
}

/** The "nothing to show" line every list falls back to, so an empty panel still
 *  says WHY it is empty instead of collapsing to a blank box. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-hairline-strong px-3 py-4 text-center text-[12px] font-medium text-ink-subtle">
      {children}
    </p>
  );
}
