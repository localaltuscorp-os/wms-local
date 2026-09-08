import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

/**
 * Dashboard skeleton — sits behind `/` while the server component
 * resolves all of the home-page rollups + charts. The shapes match the
 * editorial-minimal hero layout (big number row, then chart blocks)
 * so the visual jump on data arrival is minimal. Also the fallback
 * skeleton for app routes without their own loading.tsx (profile,
 * documents, agenda, import, new, focus, projects/[id]).
 */
export default function DashboardLoading() {
  return (
    <>
      <PageBuffering label="Loading…" />
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />

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
    </>
  );
}
