import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { EvaluationV2Screen } from "@/components/hr/candidate/evaluation-v2/evaluation-v2-screen";
// NOTE: the custom Weight Metrics editor (WeightMatrixPanel) is temporarily
// disabled — bespoke per-designation weights need a Department → Role →
// Designation mapping that doesn't exist yet. Scoring falls back to
// DEFAULT_SECTION_WEIGHTS while the panel is unmounted. Keep the component file
// for when that hierarchy lands; just re-mount it below to bring it back.
// import { WeightMatrixPanel } from "@/components/hr/candidate/evaluation-v2/weight-matrix-panel";
import type { EvaluatorRole } from "@/lib/hr/candidate/evaluation-v2";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Candidate Evaluation v2 — the structured, weighted, two-instance instrument.
 * A FULL-SCREEN focused surface (no rail). Interviewer role by default; the
 * Management Assessment links in with `?role=management&candidate=<id>` to fill
 * its own management pass on the same instrument (locked to that candidate).
 */
export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; candidate?: string }>;
}) {
  const me = await requireHrStaff();
  const superAdmin = isSuperAdmin(me.email);
  const { role: roleParam, candidate } = await searchParams;
  const role: EvaluatorRole = roleParam === "management" ? "management" : "interviewer";

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
    <div className="flex min-h-full flex-col bg-[#faf9fb]">
      <HrTitleBar
      />

      {/* Weight Metrics editor temporarily disabled — see import note above.
          Scoring uses DEFAULT_SECTION_WEIGHTS until the Dept → Role → Designation
          hierarchy exists, so evaluations still score correctly with no panel. */}

      <EvaluationV2Screen
        candidates={candidates}
        role={role}
        isSuperAdmin={superAdmin}
        fixedCandidateId={candidate || undefined}
      />
    </div>
  );
}
