"use client";
import dynamic from "next/dynamic";

// Same lazy-load boundary as donut.tsx / h-bars.tsx — defer recharts off the
// initial bundle of whatever dashboard renders this.
export type { TrendLinePoint } from "./trend-line-impl";

export const TrendLine = dynamic(() => import("./trend-line-impl").then((m) => m.TrendLine), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="animate-pulse rounded-chip bg-surface-soft" style={{ height: 220 }} />
  ),
});
