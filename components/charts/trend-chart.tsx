"use client";
import * as React from "react";

interface Props {
  /** 14 numeric points, oldest → newest */
  values: number[];
  /** Channel color used for the line + dot + area fill */
  color: string;
  /** Tile variant — drives chart proportions */
  variant: "hero" | "status";
}

/**
 * Small labeled trend chart with explicit X and Y axes — purpose-built
 * for the KPI tile white space. Unlike a bare sparkline, both axes are
 * labeled so the line means something at a glance: Y shows the value
 * range (min/max), X shows the time window (14d ago → today).
 */
export function TrendChart({ values, color, variant }: Props) {
  // Render proportions: status cards get a more compact chart so
  // they can sit in the gap between sublabel and delta without
  // forcing the card to grow. Hero gets a wider chart that fills
  // the horizontal gap between left text column and delta block.
  const dims =
    variant === "hero"
      ? { w: 640, h: 220, padL: 52, padR: 14, padT: 18, padB: 32 }
      : { w: 320, h: 90, padL: 34, padR: 8, padT: 10, padB: 20 };

  const chartW = dims.w - dims.padL - dims.padR;
  const chartH = dims.h - dims.padT - dims.padB;

  // Guard against degenerate input (no movement → flat-line at mid).
  const safe = values.length > 1 ? values : [0, 0];
  const rawMax = Math.max(...safe);
  const rawMin = Math.min(...safe);
  const max = rawMax === rawMin ? rawMax + 1 : rawMax;
  const min = rawMax === rawMin ? rawMin : rawMin;
  const range = max - min;

  const points = safe.map((v, i) => ({
    x: dims.padL + (i / (safe.length - 1)) * chartW,
    y: dims.padT + (1 - (v - min) / range) * chartH,
  }));

  const linePath = `M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`;
  const lastPoint = points[points.length - 1]!;
  const firstPoint = points[0]!;
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(1)} ${(dims.padT + chartH).toFixed(1)} L ${firstPoint.x.toFixed(1)} ${(dims.padT + chartH).toFixed(1)} Z`;

  // Tick values for Y (just min + max).
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

  const axisStroke = "rgba(15, 23, 42, 0.14)";
  const axisLabelStyle = {
    fontFamily: "var(--font-mono-display), ui-monospace, monospace",
    fontSize: variant === "hero" ? 15 : 11,
    fontWeight: 700,
    fill: "var(--color-ink-muted)",
    letterSpacing: "0.06em",
  };

  // Unique gradient id so multiple charts on the page don't collide.
  const gradId = React.useId();

  return (
    <svg
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      width="100%"
      height="auto"
      preserveAspectRatio="none"
      role="img"
      aria-label="14-day trend chart"
      style={{ display: "block", maxWidth: dims.w }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y axis line */}
      <line
        x1={dims.padL}
        y1={dims.padT}
        x2={dims.padL}
        y2={dims.padT + chartH}
        stroke={axisStroke}
        strokeWidth={1}
      />
      {/* X axis line */}
      <line
        x1={dims.padL}
        y1={dims.padT + chartH}
        x2={dims.padL + chartW}
        y2={dims.padT + chartH}
        stroke={axisStroke}
        strokeWidth={1}
      />

      {/* Y axis ticks — max at top, min at bottom */}
      <text
        x={dims.padL - 6}
        y={dims.padT + 4}
        textAnchor="end"
        style={axisLabelStyle}
      >
        {fmt(max)}
      </text>
      <text
        x={dims.padL - 6}
        y={dims.padT + chartH}
        textAnchor="end"
        dominantBaseline="middle"
        style={axisLabelStyle}
      >
        {fmt(min)}
      </text>

      {/* X axis ticks — 14d ago · 7d · today */}
      <text
        x={dims.padL}
        y={dims.h - 6}
        textAnchor="start"
        style={axisLabelStyle}
      >
        14d
      </text>
      <text
        x={dims.padL + chartW / 2}
        y={dims.h - 6}
        textAnchor="middle"
        style={axisLabelStyle}
      >
        7d
      </text>
      <text
        x={dims.padL + chartW}
        y={dims.h - 6}
        textAnchor="end"
        style={axisLabelStyle}
      >
        today
      </text>

      {/* Area fill under the line */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Trend line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={variant === "hero" ? 3.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End-of-line dot — highlights the current value */}
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={variant === "hero" ? 7 : 4}
        fill={color}
        stroke="#ffffff"
        strokeWidth={variant === "hero" ? 3 : 2}
      />
    </svg>
  );
}
