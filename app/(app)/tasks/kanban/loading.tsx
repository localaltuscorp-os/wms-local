import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

/**
 * Streamed skeleton for /tasks/kanban. This is the slowest route (the board
 * query scans all tasks against the remote DB), so painting the column shell
 * instantly — instead of a blank wait — is the biggest perceived-speed win on
 * the app. Mirrors the real chrome: header + filters + a row of columns.
 */
export default function KanbanLoading() {
  return (
    <>
      <PageBuffering label="Loading board…" />
      {/* Header placeholder (matches the 96px / 72px chrome) */}
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />

      <main className="w-full px-6 max-md:px-4 pt-6 pb-10">
        <div className="rounded-section border border-[color:var(--color-hairline,#e5e7eb)] bg-white p-5">
          {/* Title + filters */}
          <div className="mb-6 flex items-end justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="mb-5 flex items-center gap-2.5">
            <Skeleton className="h-12 w-44 rounded-pill" />
            <Skeleton className="h-12 w-44 rounded-pill" />
          </div>

          {/* Column shells */}
          <div className="flex items-stretch gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, c) => (
              <div
                key={c}
                className="flex-shrink-0 w-[320px] rounded-section border border-[color:var(--color-hairline,#e5e7eb)] bg-[color:var(--color-surface-soft,#f8fafc)] p-3.5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-6" />
                </div>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 - (c % 3) }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] w-full rounded-chip" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
