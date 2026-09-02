import { CardGrid } from "@/components/layout/card-grid";

/**
 * Skeleton for the org Workforce-Intelligence dashboard — mirrors the real
 * layout (KPI grid → health/donut → hours/departments → sections) so the
 * Suspense fallback keeps the page from jumping. Pure/server-safe.
 */
export function OrgDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <CardGrid min={250} gap="0.875rem">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse h-[104px] rounded-2xl border border-hairline bg-surface-soft" />
        ))}
      </CardGrid>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="animate-pulse h-[280px] rounded-section border border-hairline bg-surface-soft" />
        <div className="animate-pulse h-[280px] rounded-section border border-hairline bg-surface-soft" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="animate-pulse h-[320px] rounded-section border border-hairline bg-surface-soft" />
        <div className="animate-pulse h-[320px] rounded-section border border-hairline bg-surface-soft" />
      </div>
      <div className="animate-pulse h-[260px] rounded-section border border-hairline bg-surface-soft" />
    </div>
  );
}
