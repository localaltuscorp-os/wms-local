"use client";
import dynamic from "next/dynamic";

// Operation Butter P3 — defer recharts off the outstanding dashboard's initial
// bundle (see components/charts/donut.tsx). `monthLabel` is NOT re-exported here
// on purpose: a static re-export would pull the recharts-bearing impl back into
// this module and undo the split. Nothing imports monthLabel from this path
// (verified); it lives in the impl for the panel's own use.
export const MonthSummaryPanel = dynamic(
  () => import("./month-summary-impl").then((m) => m.MonthSummaryPanel),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden className="animate-pulse rounded-section bg-surface-soft" style={{ height: 220 }} />
    ),
  },
);
