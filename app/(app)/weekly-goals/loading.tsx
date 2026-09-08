import { Skeleton } from "@/components/ui/skeleton";

/** Streamed skeleton for /weekly-goals — header + controls + table. */
export default function WeeklyGoalsLoading() {
  return (
    <>
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />
      <main className="px-6 max-md:px-4 py-6 max-w-[1600px] mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-10 w-48 rounded-full" />
        </div>
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-10 w-64 rounded-full" />
          <Skeleton className="h-10 w-40 rounded-full" />
        </div>
        <div className="rounded-xl border border-[color:var(--color-hairline,#e5e7eb)] overflow-hidden">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-14 w-full rounded-none border-t border-[color:var(--color-hairline,#e5e7eb)]"
            />
          ))}
        </div>
      </main>
    </>
  );
}
