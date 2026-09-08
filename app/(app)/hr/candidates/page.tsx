
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { BasicDetailsScreen } from "@/components/hr/candidate/basic-details-screen";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Post-Interview → Candidate Records. A FULL-SCREEN focused list surface — no
 * left rail, no app header (chrome-shell hides the rail here). Altus logo, a
 * "Back to Post-Interview" button, and the searchable list of every candidate
 * whose interview form (/hr/intake) was filled. "New" jumps to the form.
 */
export default async function CandidatesPage() {
  const me = await requireHrStaff();
  // Delete is HR-admin / super-admin only (mirrors deleteCandidateIntake's
  // requireWorkspaceAdmin gate); the button only shows for them.
  const canDelete = me.isAdmin || isSuperAdmin(me.email);

  // Resilient: a slow/failed/hanging list load must never block the form.
  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }

  return (
    <div className="min-h-full bg-white">
      <HrTitleBar
      />

      {/* `wide` rather than `standard`: the toolbar is a single fluid strip
          now, so the page should hand it the room a collapsed sidebar frees up
          instead of capping it at 1280. */}
      <PageShell width="wide">
        <BasicDetailsScreen candidates={candidates} canDelete={canDelete} />
      </PageShell>
    </div>
  );
}
