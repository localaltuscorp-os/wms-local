import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { loadCommitData } from "@/components/goals/commit/data";
import { CommitWorkspace } from "@/components/goals/commit/commit-workspace";

export const dynamic = "force-dynamic";

/**
 * Saturday commit surface (Module 2). Two rituals in one page:
 *  (a) fill THIS week's progress on every current weekly goal, and
 *  (b) commit + freeze NEXT week's goals (adopt/edit the prepopulated set, add
 *      extra), stamping `committed_at`.
 * Managers see + act on their whole downline too. The surface is usable any day
 * (for prep/testing); the punch-out GATE that depends on it is Saturday-only and
 * owned by the GATES slice.
 */
export default async function GoalsCommitPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  const { me } = await requireGoalsAccess();

  // The canvas (and its ?ritual= contextual state) is retired — this page IS
  // the Saturday commit surface again in both flag states. Every nav pill,
  // inbox goals_commit_reminder and punch-gate deep-link keeps working.
  const data = await loadCommitData({ id: me.id, isAdmin: me.isAdmin });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <CommitWorkspace data={data} />
      </PageShell>
    </>
  );
}
