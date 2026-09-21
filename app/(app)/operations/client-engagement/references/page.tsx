import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { ReferencesBoard } from "@/components/client-engagement/references-board";

export const dynamic = "force-dynamic";

/** OPERATIONS → CLIENT ENGAGEMENT → REFERENCES — the referral quotas. */
export default async function ClientEngagementReferences() {
  const ctx = await loadCePage();
  return (
    <PageShell width="full">
      {ctx.ready ? (
        <ReferencesBoard
          references={ctx.snapshot.references}
          accounts={ctx.snapshot.accounts}
          members={ctx.snapshot.members}
          today={ctx.today}
          canManage={ctx.canManage}
          myMemberId={ctx.myMemberId}
        />
      ) : (
        <CeNotReady />
      )}
    </PageShell>
  );
}
