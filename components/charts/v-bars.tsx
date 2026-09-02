"use client";
import dynamic from "next/dynamic";

// Same lazy-load boundary as h-bars.tsx / donut.tsx — defer recharts off the
// initial bundle. Vertical (standing) bars, vs. h-bars' horizontal layout.
export type { HBarRow } from "./v-bars-impl";

export const VBars = dynamic(() => import("./v-bars-impl").then((m) => m.VBars), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="animate-pulse rounded-chip bg-surface-soft" style={{ height: 320 }} />
  ),
});
