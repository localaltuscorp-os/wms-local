"use client";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  /** Logical width of the SVG viewBox. With `responsive`, the rendered
   *  width fills the parent and the path is stretched to fit; this value
   *  only sets the coordinate system. */
  width?: number;
  height?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  /** When true, SVG renders at 100% width of its container and the path
   *  stretches to fit. Combine with a flex/grid parent that constrains
   *  the actual width. */
  responsive?: boolean;
  /** When true, applies a soft glow filter coloured by `color`. Used by
   *  the holographic KPI strip; harmless on light backgrounds (the glow
   *  just fades into the surface). */
  glow?: boolean;
  /** When true, the path draws itself left-to-right on mount via
   *  stroke-dashoffset animation. */
  drawIn?: boolean;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  strokeWidth = 2,
  color = "currentColor",
  className,
  responsive = false,
  glow = false,
  drawIn = false,
}: SparklineProps) {
  const filterId = useId();
  const path = useMemo(() => {
    if (values.length < 2) return "";
    const max = Math.max(...values, 1);
    const dx = width / (values.length - 1);
    return values
      .map((v, i) => {
        const x = (i * dx).toFixed(2);
        const y = (height - (v / max) * (height - 2) - 1).toFixed(2);
        return `${i === 0 ? "M" : "L"}${x} ${y}`;
      })
      .join(" ");
  }, [values, width, height]);

  const svgProps = responsive
    ? { width: "100%", preserveAspectRatio: "none" as const }
    : { width };

  return (
    <svg
      {...svgProps}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(className)}
      aria-hidden
    >
      {glow && (
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={glow ? `url(#${filterId})` : undefined}
        style={
          drawIn
            ? {
                strokeDasharray: 1000,
                strokeDashoffset: 1000,
                animation: "kpiSparkDraw 1.4s cubic-bezier(0.2, 0.7, 0.3, 1) 0.4s forwards",
              }
            : undefined
        }
      />
    </svg>
  );
}
