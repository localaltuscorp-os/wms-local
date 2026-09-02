import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

/**
 * Loading state for every admin page (Employees, Clients, Departments,
 * Subjects, Notifications, Activity, Settings). Admin routes previously had
 * no `loading.tsx`, so a slow admin query left the previous screen frozen —
 * this paints the chrome + a buffering circle instantly, like the rest of
 * the app.
 */
export default function AdminLoading() {
  return (
    <>
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />

      <main className="mx-auto max-w-[1400px] px-12 max-md:px-4 py-8 w-full">
        {/* Page header */}
        <div className="mb-8">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-9 w-64" />
        </div>

        {/* Toolbar */}
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-32" />
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-[color:var(--color-hairline,#e5e7eb)] overflow-hidden">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-14 w-full rounded-none border-t border-[color:var(--color-hairline,#e5e7eb)]"
            />
          ))}
        </div>
      </main>

      <PageBuffering label="Loading…" />
    </>
  );
}
