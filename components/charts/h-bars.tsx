"use client";
import dynamic from "next/dynamic";

// Operation Butter P3 — defer recharts off the initial bundle (see donut.tsx).
export type { HBarRow } from "./h-bars-impl";

export const HBars = dynamic(() => import("./h-bars-impl").then((m) => m.HBars), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="animate-pulse rounded-chip bg-surface-soft" style={{ height: 320 }} />
  ),
});
