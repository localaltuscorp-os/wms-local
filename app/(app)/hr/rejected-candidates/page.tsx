import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { BasicDetailsScreen } from "@/components/hr/candidate/basic-details-screen";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Pre-Interview -> Rejected Candidates.
 *
 * THE SAME TABLE AS POST-INTERVIEW > CANDIDATE RECORDS, pinned to one pipeline
 * status (rejected). Deliberately not a new list component and not a new query:
 * `candidate_intake.status` is where the Management Assessment writes its
 * outcome, so reading it here means these pages can never disagree with the
 * decision that was actually recorded, and every column, filter and row action
 * HR already knows carries over.
 *
 * The filter is applied on the SERVER rather than by handing the client the
 * whole roster and hiding rows: a rejected candidate should not be sitting in
 * the payload of the selected page.
 */
export default async function RejectedCandidatesPage() {
  const me = await requireHrStaff();
  const canDelete = me.isAdmin || isSuperAdmin(me.email);

  // Resilient, exactly as the records page is: a slow list must degrade to an
  // empty state rather than fail the route.
  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }
  candidates = candidates.filter((c) => c.status === "rejected");

  return (
    <div className="min-h-full bg-white">
      <HrTitleBar />
      <PageShell width="wide">
        <BasicDetailsScreen candidates={candidates} canDelete={canDelete} lockedStatus="rejected" />
      </PageShell>
    </div>
  );
}
