import { PageBuffering } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <>
      <PageBuffering label="Loading…" />
    <div className="mx-auto max-w-[1600px] px-12 max-md:px-4 py-16">
      <div className="h-10 w-64 bg-surface-track rounded-section animate-pulse mb-10" />
      <div className="grid grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-5 mb-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-52 bg-surface-track rounded-kpi animate-pulse"
          />
        ))}
      </div>
      <div className="h-[480px] bg-surface-track rounded-section animate-pulse mb-12" />
      <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-6 mb-12">
        <div className="h-80 bg-surface-track rounded-section animate-pulse" />
        <div className="h-80 bg-surface-track rounded-section animate-pulse" />
      </div>
      <div className="h-96 bg-surface-track rounded-section animate-pulse" />
    </div>
    </>
  );
}
