import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { buildCapacity, weeklyLoadByAccount, type Load } from "@/lib/client-engagement/grids";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { CapacityBar } from "@/components/client-engagement/capacity-bar";
import { AccountsBoard } from "@/components/client-engagement/accounts-board";
import { ReferencesBoard } from "@/components/client-engagement/references-board";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → CLIENT ENGAGEMENT → OVERVIEW.
 *
 * The capacity bar (who has room), then every account by category, split
 * Active | Inactive with a swimlane per person. `?tab=` opens a category.
 */
export default async function ClientEngagementOverview({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const ctx = await loadCePage();

  if (!ctx.ready) {
    return (
      <PageShell width="full">
        <CeNotReady />
      </PageShell>
    );
  }

  const { members, accounts, engagements, references } = ctx.snapshot;
  const capacity = buildCapacity(members, accounts, engagements, ctx.monday);
  const loads: Record<string, Load> = Object.fromEntries(weeklyLoadByAccount(engagements, ctx.monday));
  const callCounts: Record<string, number> = {};
  for (const e of engagements) callCounts[e.accountId] = (callCounts[e.accountId] ?? 0) + 1;
  const unassigned = accounts.filter((a) => !a.assignedTo).length;

  return (
    <PageShell width="full">
      <CapacityBar capacity={capacity} unassigned={unassigned} />
      <AccountsBoard
        accounts={accounts}
        members={members}
        capacity={capacity}
        loads={loads}
        callCounts={callCounts}
        canManage={ctx.canManage}
        myMemberId={ctx.myMemberId}
        initialTab={tab}
        referencesSlot={
          <ReferencesBoard
            references={references}
            accounts={accounts}
            members={members}
            today={ctx.today}
            canManage={ctx.canManage}
            myMemberId={ctx.myMemberId}
          />
        }
      />
    </PageShell>
  );
}
