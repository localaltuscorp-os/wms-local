"use client";
import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";

/**
 * Sparkline — a smooth (Catmull-Rom → bezier) area sparkline with a subtle
 * brand-tinted gradient fill. The stroke draws on left→right via
 * stroke-dashoffset; the fill fades up. Trend colour: green when the series
 * ends up, red when it ends down, neutral when flat.
 *
 * Pure / presentational. `points` is a number[] (e.g. 14 daily values).
 */
export type SparklineProps = {
  points: number[];
  width?: number;
  height?: number;
  /** Override the trend colour (otherwise derived from first→last). */
  color?: string;
};

type Pt = { x: number; y: number };

/** Smooth path through points using Catmull-Rom converted to cubic beziers. */
function smoothPath(pts: Pt[]): string {
  const first = pts[0];
  if (!first) return "";
  if (pts.length === 1) return `M ${first.x} ${first.y}`;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i] as Pt;
    const p2 = pts[i + 1] as Pt;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function Sparkline({
  points,
  width = 160,
  height = 44,
  color,
}: SparklineProps) {
  const reduce = useReducedMotion() ?? false;
  const gradId = React.useId();

  const firstVal = points[0] ?? 0;
  const lastVal = points[points.length - 1] ?? 0;
  const trendColor =
    color ??
    (points.length >= 2
      ? lastVal > firstVal
        ? "var(--color-green)"
        : lastVal < firstVal
          ? "var(--color-altus-red)"
          : "var(--color-slate)"
      : "var(--color-slate)");

  const pad = 3;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const { linePath, areaPath, pathLen } = React.useMemo(() => {
    if (points.length === 0)
      return { linePath: "", areaPath: "", pathLen: 0 };
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
    const pts = points.map((v, i) => ({
      x: pad + i * stepX,
      // Invert Y (SVG origin top-left); keep a hair of headroom.
      y: pad + innerH - ((v - min) / span) * innerH,
    }));
    const line = smoothPath(pts);
    const last = pts[pts.length - 1] as Pt;
    const first = pts[0] as Pt;
    const area = `${line} L ${last.x} ${pad + innerH} L ${first.x} ${pad + innerH} Z`;
    // Rough path length for the dash draw-on (over-estimate is fine).
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i] as Pt;
      const b = pts[i - 1] as Pt;
      len += Math.hypot(a.x - b.x, a.y - b.y);
    }
    return { linePath: line, areaPath: area, pathLen: Math.ceil(len * 1.2) };
  }, [points, innerW, innerH, pad]);

  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, linePath]);

  if (points.length === 0) {
    return <svg width={width} height={height} aria-hidden />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trend sparkline"
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop
            offset="0%"
            stopColor={trendColor}
            stopOpacity={0.28}
          />
          <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill — fades up under the line. */}
      <path
        d={areaPath}
        fill={`url(#${gradId})`}
        style={{
          opacity: drawn ? 1 : 0,
          transition: reduce ? "none" : "opacity 0.6s ease 0.3s",
        }}
      />

      {/* Line — draws on. */}
      <path
        d={linePath}
        fill="none"
        stroke={trendColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLen}
        strokeDashoffset={drawn ? 0 : pathLen}
        style={{
          transition: reduce
            ? "none"
            : "stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
          filter: `drop-shadow(0 1px 3px color-mix(in srgb, ${trendColor} 40%, transparent))`,
        }}
      />
    </svg>
  );
}
