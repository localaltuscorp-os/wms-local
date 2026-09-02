import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

/**
 * Streamed skeleton for /tasks. Mirrors the real page chrome — header
 * + filter bar + KPI strip + table — so the navigation feels instant.
 * Next renders this synchronously while the server component below
 * resolves its DB calls, which is the difference between staring at the
 * old page for 2s and seeing the new one paint in 50ms.
 */
export default function TasksLoading() {
  return (
    <>
      {/* Header placeholder (matches the 96px / 72px chrome) */}
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />

      {/* Filter bar shell */}
      <div className="px-6 max-md:px-4 py-3 flex items-center gap-2 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>

      <main className="px-6 max-md:px-4 py-6 max-w-[1600px] mx-auto w-full">
        {/* KPI strip — 4 cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>

        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>

        {/* Table rows */}
        <div className="rounded-xl border border-[color:var(--color-hairline,#e5e7eb)] overflow-hidden">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-12 w-full rounded-none border-t border-[color:var(--color-hairline,#e5e7eb)]"
            />
          ))}
        </div>
      </main>

      <PageBuffering label="Loading tasks…" />
    </>
  );
}
