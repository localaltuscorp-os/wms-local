"use client";
import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "./use-anim-count";

/**
 * Gauge — a 180° semicircle on-time-rate gauge. The arc sweeps left→right,
 * draws on via stroke-dashoffset, and glows in its rate colour. A big animated
 * percentage sits under the arc with on-time / late counts.
 *
 * Rate threshold (matches punctuality-card): green ≥80, amber ≥60, red below.
 * Pure / presentational.
 */
export type GaugeSegment = "onTime" | "late";

export type GaugeProps = {
  /** On-time percentage 0–100. */
  pct: number;
  /** Count delivered on time. */
  onTime: number;
  /** Count delivered late. */
  late: number;
  /** Outer width in px (height is ~58% of this). */
  size?: number;
  /** When given, the legend entries become buttons that drill into that half. */
  onSelect?: (segment: GaugeSegment) => void;
};

/**
 * One legend metric. Renders as a plain <span> when the gauge isn't
 * interactive, and as a real <button> when it is — so it only advertises a
 * click (cursor, hover, focus ring, keyboard reachability) where one exists.
 */
function LegendEntry({
  segment,
  label,
  count,
  pct,
  dot,
  text,
  glow = false,
  onSelect,
  onHover,
}: {
  segment: GaugeSegment;
  label: string;
  count: number;
  pct: number;
  dot: string;
  text: string;
  glow?: boolean;
  onSelect?: (s: GaugeSegment) => void;
  onHover: (s: GaugeSegment | null) => void;
}) {
  const inner = (
    <>
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: dot, ...(glow ? { boxShadow: `0 0 6px ${dot}` } : null) }}
      />
      {label}
      <span className="tabular-nums text-ink-strong">{count}</span>
    </>
  );

  if (!onSelect) {
    return (
      <span className="inline-flex items-center gap-1.5" style={{ color: text }}>
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(segment)}
      onMouseEnter={() => onHover(segment)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(segment)}
      onBlur={() => onHover(null)}
      aria-label={`${label}: ${count} tasks, ${pct}% — view the list`}
      className="inline-flex items-center gap-1.5 rounded-pill px-2 py-1 -mx-1 outline-none transition-colors hover:bg-surface-soft focus-visible:ring-2"
      style={{ color: text, cursor: "pointer" }}
    >
      {inner}
    </button>
  );
}

function rateTone(pct: number) {
  if (pct >= 80)
    return { stroke: "var(--color-green)", deep: "var(--color-green-deep)" };
  if (pct >= 60)
    return { stroke: "var(--color-amber)", deep: "var(--color-amber-deep)" };
  return { stroke: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" };
}

export function Gauge({ pct, onTime, late, size = 280, onSelect }: GaugeProps) {
  const reduce = useReducedMotion() ?? false;
  const clamped = Math.max(0, Math.min(pct, 100));
  const tone = rateTone(clamped);
  const [hovered, setHovered] = React.useState<GaugeSegment | null>(null);

  const dated = onTime + late;
  const share = (n: number) => (dated > 0 ? Math.round((n / dated) * 100) : 0);

  const w = size;
  const stroke = Math.max(12, Math.round(size * 0.066));
  const pad = stroke / 2 + 2;
  const r = (w - stroke) / 2 - 2;
  const cx = w / 2;
  const cy = w / 2; // baseline of the semicircle
  const h = r + pad + Math.round(size * 0.02);

  // Semicircle path from left (180°) to right (0°).
  const left = { x: cx - r, y: cy };
  const right = { x: cx + r, y: cy };
  const arcPath = `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${right.x} ${right.y}`;
  const arcLen = Math.PI * r;

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

  const targetOffset = arcLen * (1 - clamped / 100);
  const offset = drawn ? targetOffset : arcLen;

  const display = useAnimCount(Math.round(clamped), 1200);
  const gradId = React.useId();

  // Hit-test overlays for the two halves of the arc. Both reuse the full arc
  // path and use dasharray to expose only their own slice, so the hover target
  // follows the real geometry with no second path to keep in sync.
  const onTimeLen = arcLen * (clamped / 100);
  const lateLen = arcLen - onTimeLen;

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: w }}>
      {/* Hover tooltip — centred above the arc rather than tracking the pointer,
          which keeps it clear of the arc itself at every angle. */}
      <div
        aria-hidden={!hovered}
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-10 transition-opacity duration-150"
        style={{ top: -6, opacity: hovered ? 1 : 0 }}
      >
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 font-bold text-white"
          style={{
            fontSize: 12,
            background: "var(--color-ink-strong)",
            boxShadow: "0 8px 20px -8px rgba(15,23,42,0.45)",
          }}
        >
          <span
            className="inline-block size-2 rounded-full"
            style={{
              background:
                hovered === "late" ? "var(--color-altus-red)" : "var(--color-green)",
            }}
          />
          {hovered === "late" ? "Late" : "On time"}
          <span className="tabular-nums">
            {hovered === "late" ? late : onTime}
          </span>
          <span className="opacity-70 tabular-nums">
            ({share(hovered === "late" ? late : onTime)}%)
          </span>
        </span>
      </div>

      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`On-time rate ${Math.round(clamped)} percent — ${onTime} on time, ${late} late`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={tone.deep} />
            <stop offset="100%" stopColor={tone.stroke} />
          </linearGradient>
        </defs>

        {/* Track */}
        <path
          d={arcPath}
          fill="none"
          stroke="var(--color-hairline-strong)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />

        {/* Value arc */}
        <path
          d={arcPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          style={{
            transition: reduce
              ? "none"
              : "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
            filter: `drop-shadow(0 0 8px color-mix(in srgb, ${tone.stroke} 55%, transparent))`,
          }}
        />

        {/* Invisible hover targets, drawn last so they sit on top. A little
            wider than the visible stroke so the arc is easy to hit. */}
        {dated > 0 && onTimeLen > 0.5 && (
          <path
            d={arcPath}
            fill="none"
            stroke="transparent"
            strokeWidth={stroke + 10}
            strokeDasharray={`${onTimeLen} ${arcLen}`}
            style={{ pointerEvents: "stroke", cursor: onSelect ? "pointer" : "default" }}
            onMouseEnter={() => setHovered("onTime")}
            onMouseLeave={() => setHovered(null)}
            onClick={onSelect ? () => onSelect("onTime") : undefined}
          />
        )}
        {dated > 0 && lateLen > 0.5 && (
          <path
            d={arcPath}
            fill="none"
            stroke="transparent"
            strokeWidth={stroke + 10}
            strokeDasharray={`${lateLen} ${arcLen}`}
            strokeDashoffset={-onTimeLen}
            style={{ pointerEvents: "stroke", cursor: onSelect ? "pointer" : "default" }}
            onMouseEnter={() => setHovered("late")}
            onMouseLeave={() => setHovered(null)}
            onClick={onSelect ? () => onSelect("late") : undefined}
          />
        )}
      </svg>

      {/* Readout sits visually inside the arc */}
      <div
        className="flex flex-col items-center"
        style={{ marginTop: -Math.round(size * 0.16) }}
      >
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: Math.round(size * 0.2),
            letterSpacing: "-0.03em",
            color: tone.deep,
          }}
        >
          {display}
          <span style={{ fontSize: Math.round(size * 0.1) }}>%</span>
        </span>
        <span
          className="uppercase font-bold tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: Math.max(9, Math.round(size * 0.044)),
            color: "var(--color-ink-muted)",
            marginTop: 2,
          }}
        >
          on time
        </span>

        <div
          className="mt-3 flex items-center gap-4 font-bold"
          style={{ fontSize: Math.max(11, Math.round(size * 0.05)) }}
        >
          <LegendEntry
            segment="onTime"
            label="On time"
            count={onTime}
            pct={share(onTime)}
            dot="var(--color-green)"
            text="var(--color-green-deep)"
            glow
            onSelect={onSelect}
            onHover={setHovered}
          />
          <LegendEntry
            segment="late"
            label="Late"
            count={late}
            pct={share(late)}
            dot="var(--color-altus-red)"
            text="var(--color-altus-red-deep)"
            onSelect={onSelect}
            onHover={setHovered}
          />
        </div>
      </div>
    </div>
  );
}
