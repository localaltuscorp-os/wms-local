import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

export default function ProjectsLoading() {
  return (
    <>
      <PageBuffering label="Loading projects…" />
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />
      <main className="mx-auto max-w-[1480px] px-12 max-md:px-4 pt-10 pb-20 w-full">
        {/* Page header skeleton */}
        <div className="mb-10 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start">
          <div className="flex-1">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-11 w-72 mb-3" />
            <Skeleton className="h-4 w-[420px] max-w-full" />
          </div>
          <Skeleton className="h-9 w-32 rounded-pill" />
        </div>

        {/* Workspace skeleton: rail + detail */}
        <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-12 max-lg:grid-cols-1 max-lg:gap-6">
          {/* Rail */}
          <aside className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24 mb-2" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-[6px]" />
            ))}
          </aside>

          {/* Detail card */}
          <article
            className="rounded-section bg-surface-card border border-hairline px-10 py-9 max-md:px-6 max-md:py-7"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <div className="pb-6 mb-8 border-b border-hairline">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-9 w-64 mb-3" />
              <Skeleton className="h-4 w-44" />
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-6 rounded-md"
                  style={{
                    width: `${85 - i * 6}%`,
                    marginLeft: `${(i % 3) * 24}px`,
                  }}
                />
              ))}
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
