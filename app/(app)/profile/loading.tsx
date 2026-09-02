import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

/**
 * Streamed skeleton for /profile. The page blocks on ~12 aggregate
 * queries (perf stats, achievements, sessions…) which can take seconds
 * against the remote DB — without this, clicking "Profile & preferences"
 * gave zero feedback and read as a dead link.
 */
export default function ProfileLoading() {
  return (
    <>
      {/* Header placeholder (matches the 96px / 72px chrome) */}
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />

      <main className="px-10 max-md:px-4 py-9 max-w-[1440px] mx-auto w-full">
        {/* Hero: avatar + name + stat chips */}
        <div className="flex items-center gap-5 mb-8">
          <Skeleton className="h-20 w-20 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-7 w-56 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="hidden md:flex items-center gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-28 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Tab rail */}
        <div className="flex items-center gap-2 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-full" />
          ))}
        </div>

        {/* Two-column card grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-48 w-full rounded-2xl lg:col-span-2" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      </main>

      <PageBuffering label="Loading your profile…" />
    </>
  );
}
