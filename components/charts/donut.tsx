"use client";
import dynamic from "next/dynamic";

// Operation Butter P3 — defer recharts (~350KB) off the initial bundle of the
// dashboards that use this chart. The impl is loaded only when the chart
// actually renders client-side; until then a sized placeholder holds the space.
// Parents import `@/components/charts/donut` exactly as before — this wrapper is
// a transparent lazy boundary.
export type { DonutSlice } from "./donut-impl";

export const Donut = dynamic(() => import("./donut-impl").then((m) => m.Donut), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="animate-pulse rounded-full bg-surface-soft"
      style={{ width: 180, height: 180 }}
    />
  ),
});
