"use client";

import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "@/components/dashboard/exec/viz/use-anim-count";
import { CardGrid } from "@/components/layout/card-grid";

/**
 * Shared presentational primitives for the org Workforce-Intelligence dashboard.
 * Brand-tokened, reduced-motion aware, keyboard-accessible. Pure — props in.
 */

/* ------------------------------------------------------------------ */
/* Bands                                                               */
/* ------------------------------------------------------------------ */

/** 0..100 rate → brand tone. green ≥85 / teal ≥70 / amber ≥50 / red else. */
export function bandRate(v: number): { color: string; deep: string } {
  if (v >= 85) return { color: "var(--color-green)", deep: "var(--color-green-deep)" };
  if (v >= 70) return { color: "var(--color-teal)", deep: "var(--color-teal-deep)" };
  if (v >= 50) return { color: "var(--color-amber)", deep: "var(--color-amber-deep)" };
  return { color: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" };
}

/* ------------------------------------------------------------------ */
/* Clickable KPI grid — cross-filters the dashboard                    */
/* ------------------------------------------------------------------ */

export interface KpiTileData {
  key: string;
  label: string;
  value: number | null;
  suffix?: string;
  sublabel?: string;
  accent: string;
  accentDeep: string;
  decimals?: number;
  /** If set, clicking the tile toggles this cross-filter key. */
  filterKey?: string;
}

export function KpiGrid({
  tiles,
  activeFilter,
  onFilter,
}: {
  tiles: KpiTileData[];
  activeFilter: string | null;
  onFilter: (key: string | null) => void;
}) {
  return (
    <section aria-label="Workforce headline metrics">
      <CardGrid min={250} gap="0.875rem">
        {tiles.map((t, i) => (
          <KpiTile
            key={t.key}
            tile={t}
            index={i}
            active={t.filterKey != null && t.filterKey === activeFilter}
            filterable={t.filterKey != null}
            onClick={() => t.filterKey != null && onFilter(t.filterKey === activeFilter ? null : t.filterKey)}
          />
        ))}
      </CardGrid>
    </section>
  );
}

function KpiTile({
  tile,
  index,
  active,
  filterable,
  onClick,
}: {
  tile: KpiTileData;
  index: number;
  active: boolean;
  filterable: boolean;
  onClick: () => void;
}) {
  const animated = useAnimCount(tile.value ?? 0, 1100, tile.decimals ?? 0);
  const shown =
    tile.value == null
      ? "—"
      : tile.decimals
        ? animated.toFixed(tile.decimals)
        : Math.round(animated).toLocaleString();

  const commonStyle: React.CSSProperties = {
    boxShadow: active
      ? `0 0 0 2px ${tile.accentDeep}, 0 8px 22px -14px ${tile.accentDeep}`
      : "0 1px 2px rgba(15,23,42,0.05)",
    opacity: 0,
    animation: `fadeUp 500ms ease-out ${index * 55}ms forwards`,
  };

  const inner = (
    <>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${tile.accent}, ${tile.accentDeep})` }}
      />
      <div
        className="uppercase font-black tracking-[0.06em] leading-tight text-ink-soft"
        style={{ fontSize: 11.5, minHeight: 26 }}
      >
        {tile.label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-0.5">
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(26px, 2.6vw, 36px)",
            letterSpacing: "-0.03em",
            color: tile.value == null ? "var(--color-ink-muted)" : tile.accentDeep,
          }}
        >
          {shown}
        </span>
        {tile.value != null && tile.suffix && (
          <span className="font-black" style={{ fontSize: 16, color: tile.accentDeep }}>
            {tile.suffix}
          </span>
        )}
      </div>
      {tile.sublabel && (
        <div className="mt-1 text-[11.5px] font-semibold text-ink-muted">{tile.sublabel}</div>
      )}
      {filterable && (
        <div
          className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: active ? tile.accentDeep : "var(--color-ink-soft)", opacity: active ? 1 : 0.7 }}
        >
          {active ? "Filtering ·  clear" : "Click to filter"}
        </div>
      )}
    </>
  );

  const base =
    "group relative overflow-hidden rounded-2xl border bg-surface-card p-4 text-left transition-transform hover:-translate-y-0.5";
  const borderCls = active ? "border-transparent" : "border-hairline-strong";

  if (!filterable) {
    return (
      <div className={`${base} ${borderCls}`} style={commonStyle}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${borderCls} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1`}
      style={commonStyle}
    >
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Generic donut — segments in, click-to-filter out                    */
/* ------------------------------------------------------------------ */

export interface DonutSeg {
  key: string;
  label: string;
  value: number;
  tone: string;
}

export function InsightDonut({
  segs,
  centerLabel,
  size = 208,
  activeKey,
  onSlice,
}: {
  segs: DonutSeg[];
  centerLabel: string;
  size?: number;
  activeKey?: string | null;
  onSlice?: (key: string) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const total = segs.reduce((s, x) => s + x.value, 0);
  const stroke = Math.max(16, Math.round(size * 0.14));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;

  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setDrawn(true);
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, total]);

  const display = useAnimCount(total, 1100);

  if (total === 0) {
    return (
      <div className="flex min-h-[140px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
        <p className="text-[13.5px] font-medium text-ink-muted">No data for this month yet.</p>
      </div>
    );
  }

  let cursor = 0;
  const arcs = segs.map((seg, i) => {
    const frac = seg.value / total;
    const len = frac * circ;
    const rotation = (cursor / circ) * 360;
    cursor += len;
    const dim = activeKey != null && activeKey !== seg.key;
    return { seg, len, rotation, i, dim };
  });

  return (
    <div className="flex items-center gap-7 max-md:flex-col max-md:gap-4">
      <div
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${centerLabel}, ${total} total`}
          style={{ overflow: "visible" }}
        >
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
          {arcs.map(({ seg, len, rotation, i, dim }) => (
            <circle
              key={seg.key}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={seg.tone}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={drawn ? 0 : len}
              transform={`rotate(${rotation - 90} ${cx} ${cx})`}
              style={{
                opacity: dim ? 0.25 : 1,
                transition: reduce
                  ? "none"
                  : `stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s, opacity 0.25s ease`,
              }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="tabular-nums leading-none text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: Math.round(size * 0.24),
              letterSpacing: "-0.03em",
            }}
          >
            {display}
          </span>
          <span
            className="uppercase font-bold tracking-[0.14em]"
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              fontSize: Math.max(9, Math.round(size * 0.05)),
              color: "var(--color-ink-muted)",
            }}
          >
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {arcs.map(({ seg, dim }) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          const row = (
            <>
              <span
                className="inline-block size-3 shrink-0 rounded-[4px]"
                style={{ background: seg.tone, boxShadow: `0 0 6px color-mix(in srgb, ${seg.tone} 55%, transparent)` }}
              />
              <span className="min-w-0 flex-1 truncate font-bold text-ink-strong" style={{ fontSize: 13.5 }}>
                {seg.label}
              </span>
              <span className="tabular-nums font-black shrink-0" style={{ fontSize: 14, color: seg.tone }}>
                {seg.value.toLocaleString()}
              </span>
              <span
                className="tabular-nums font-semibold shrink-0 text-right"
                style={{ fontSize: 12, color: "var(--color-ink-muted)", minWidth: 34 }}
              >
                {pct}%
              </span>
            </>
          );
          if (!onSlice) {
            return (
              <li key={seg.key} className="flex items-center gap-2.5 py-0.5" style={{ opacity: dim ? 0.45 : 1 }}>
                {row}
              </li>
            );
          }
          return (
            <li key={seg.key}>
              <button
                type="button"
                onClick={() => onSlice(seg.key)}
                aria-pressed={activeKey === seg.key}
                className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
                style={{ opacity: dim ? 0.45 : 1 }}
              >
                {row}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar list (working-hours buckets, etc.)                   */
/* ------------------------------------------------------------------ */

export interface HBar {
  key: string;
  label: string;
  count: number;
  tone?: string;
}

export function HBars({ bars, unit = "" }: { bars: HBar[]; unit?: string }) {
  const reduce = useReducedMotion() ?? false;
  const [grown, setGrown] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setGrown(true);
    setGrown(false);
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, bars.length]);

  const max = Math.max(1, ...bars.map((b) => b.count));
  const total = bars.reduce((n, b) => n + b.count, 0);
  if (total === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
        <p className="text-[13.5px] font-medium text-ink-muted">No data for this month yet.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {bars.map((b, i) => {
        const tone = b.tone ?? "var(--color-altus-red)";
        const pct = (b.count / max) * 100;
        return (
          <li key={b.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate font-semibold text-ink-strong" style={{ fontSize: 13.5 }}>
                {b.label}
              </span>
              <span className="tabular-nums font-black shrink-0" style={{ fontSize: 14, color: tone }}>
                {b.count.toLocaleString()}
                {unit && <span className="ml-0.5 text-[11px] font-semibold text-ink-muted">{unit}</span>}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${tone}, color-mix(in srgb, ${tone} 60%, white))`,
                  transformOrigin: "left",
                  transform: grown ? "scaleX(1)" : "scaleX(0)",
                  transition: reduce ? "none" : `transform 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.05}s`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Small stat card (for deep-read sections)                            */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  suffix,
  sub,
  tone = "var(--color-ink-strong)",
}: {
  label: string;
  value: number | string;
  suffix?: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-3">
      <div className="uppercase font-bold tracking-[0.08em] text-ink-soft" style={{ fontSize: 10.5 }}>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 24,
            letterSpacing: "-0.02em",
            color: tone,
          }}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {suffix && <span className="font-black" style={{ fontSize: 13, color: tone }}>{suffix}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] font-semibold text-ink-muted">{sub}</div>}
    </div>
  );
}
