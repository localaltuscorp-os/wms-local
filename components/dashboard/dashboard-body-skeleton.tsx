import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the data-heavy dashboard BODY — the sticky filter bar + the
 * KPI / chart / table rollups that stream in after the header shell paints.
 *
 * Used in two places so the loading visual is identical:
 *  • the <Suspense fallback> in app/(app)/page.tsx (header already painted, so
 *    this fills just the body while <DashboardBody> streams), and
 *  • app/(app)/loading.tsx (route-level fallback before the page renders at
 *    all — it adds the top header placeholder bar around this body).
 *
 * Shapes match the editorial-minimal layout (big number row → two chart blocks
 * → a wide table) so the visual jump on data arrival is minimal.
 */
export function DashboardBodySkeleton() {
  return (
    <main className="px-6 max-md:px-4 py-6 max-w-[1600px] mx-auto w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <Skeleton className="h-64 w-full rounded-xl" />
    </main>
  );
}
