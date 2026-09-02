import { Skeleton } from "@/components/ui/skeleton";
import { PageBuffering } from "@/components/ui/spinner";

export default function InboxLoading() {
  return (
    <>
      <PageBuffering label="Loading inbox…" />
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />
      <main className="px-6 max-md:px-4 py-6 max-w-[1000px] mx-auto w-full">
        <Skeleton className="h-8 w-40 mb-6" />
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </main>
    </>
  );
}
