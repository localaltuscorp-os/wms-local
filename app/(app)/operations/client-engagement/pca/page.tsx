import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { buildPca } from "@/lib/client-engagement/grids";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { PcaGrid } from "@/components/client-engagement/pca-grid";

export const dynamic = "force-dynamic";

/** OPERATIONS → CLIENT ENGAGEMENT → PCA GRID — Participants · Clients · Ambassadors per person. */
export default async function ClientEngagementPca({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const ctx = await loadCePage(week);
  if (!ctx.ready) {
    return (
      <PageShell width="full">
        <CeNotReady />
      </PageShell>
    );
  }
  const { columns, total } = buildPca(ctx.snapshot.members, ctx.snapshot.accounts, ctx.snapshot.engagements, ctx.monday);
  return (
    <PageShell width="full">
      <PcaGrid columns={columns} total={total} />
    </PageShell>
  );
}
