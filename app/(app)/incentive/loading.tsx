import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { IncentiveKpiSkeleton, IncentiveTableSkeleton } from "@/components/incentive/ui/states";

/**
 * The Incentive module's route-level skeleton.
 *
 * The page is `force-dynamic` and does a dozen database reads before it can
 * paint, and until now it had no `loading.tsx` at all — so a slow read showed
 * the previous route until the whole module arrived. This paints the SHAPE the
 * dashboard lands in (command bar, control row, KPI band, status chips, table)
 * so nothing jumps when the real thing replaces it.
 */
export default function Loading() {
  return (
    <PageShell width="wide">
      <Skeleton className="mb-4 h-[72px] rounded-[20px]" />
      <div className="space-y-3">
        <Skeleton className="h-[52px] rounded-2xl" />
        <IncentiveKpiSkeleton count={4} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[64px] rounded-2xl" />
        <IncentiveTableSkeleton rows={7} cols={6} />
      </div>
    </PageShell>
  );
}
