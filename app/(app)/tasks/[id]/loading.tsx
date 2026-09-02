import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

/**
 * Skeleton for the task detail route. Two-column layout on wide screens —
 * a vertical stack of metadata fields on the left and the comments /
 * activity feed on the right.
 */
export default function TaskDetailLoading() {
  return (
    <>
      <PageBuffering label="Loading task…" />
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />
      <main className="px-6 max-md:px-4 py-6 max-w-[1400px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <section>
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-5 w-1/2 mb-8" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </section>
        <aside className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </aside>
      </main>
    </>
  );
}
