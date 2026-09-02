import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";

/** Skeleton while the per-employee attendance analytics load. Mirrors the real
 *  layout (hero → KPI tiles → two-column grid) so the shift is minimal. */
export default function Loading() {
  const block = "animate-pulse rounded-[22px] bg-surface-soft";
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <div className="flex flex-col gap-6">
          <div className={`${block} h-[132px]`} style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }} />
          <CardGrid min={280} gap="0.75rem">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`${block} h-[96px]`} />
            ))}
          </CardGrid>
          <div className="grid grid-cols-3 gap-6 max-xl:grid-cols-1">
            <div className="col-span-2 flex flex-col gap-6 max-xl:col-span-1">
              <div className={`${block} h-[220px]`} />
              <div className={`${block} h-[340px]`} />
            </div>
            <div className="flex flex-col gap-6">
              <div className={`${block} h-[260px]`} />
              <div className={`${block} h-[220px]`} />
              <div className={`${block} h-[180px]`} />
            </div>
          </div>
        </div>
      </PageShell>
    </>
  );
}
