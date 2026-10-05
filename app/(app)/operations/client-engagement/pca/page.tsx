import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { buildCapacity, buildPca, weeklyLoadByAccount, type Load } from "@/lib/client-engagement/grids";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { PcaGrid } from "@/components/client-engagement/pca-grid";
import { listActiveProducts } from "@/lib/queries/products";
import { ceProductOptions } from "@/lib/client-engagement/constants";

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
  const { members, accounts, engagements } = ctx.snapshot;
  const { columns, total } = buildPca(members, accounts, engagements, ctx.monday);
  const capacity = buildCapacity(members, accounts, engagements, ctx.monday);
  const loads: Record<string, Load> = Object.fromEntries(weeklyLoadByAccount(engagements, ctx.monday));
  const callCounts: Record<string, number> = {};
  for (const e of engagements) callCounts[e.accountId] = (callCounts[e.accountId] ?? 0) + 1;
  const productOptions = ceProductOptions(await listActiveProducts());

  return (
    <PageShell width="full">
      <PcaGrid
        columns={columns}
        total={total}
        accounts={accounts}
        members={members}
        loads={loads}
        capacity={capacity}
        callCounts={callCounts}
        productOptions={productOptions}
        canManage={ctx.canManage}
        myMemberId={ctx.myMemberId}
      />
    </PageShell>
  );
}
