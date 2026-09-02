"use client";
import dynamic from "next/dynamic";

// Operation Butter P3 — defer recharts off the incentive dashboard's initial
// bundle (see components/charts/donut.tsx).
export const IncentiveMonthlyChart = dynamic(
  () => import("./incentive-monthly-chart-impl").then((m) => m.IncentiveMonthlyChart),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden className="animate-pulse rounded-chip bg-surface-soft" style={{ height: 280 }} />
    ),
  },
);
