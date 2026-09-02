
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { BasicDetailsScreen } from "@/components/hr/candidate/basic-details-screen";

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
    <div className="min-h-dvh bg-white">
      {/* Focused top bar — logo centred, Back-to-popup on the left */}
      <header className="sticky sticky-below-topbar z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span
          className="justify-self-end text-ink-strong max-md:hidden"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}
        >
          Candidate Records
        </span>
      </header>

      <PageShell width="standard">
        <BasicDetailsScreen candidates={candidates} canDelete={canDelete} />
      </PageShell>
    </div>
  );
}
