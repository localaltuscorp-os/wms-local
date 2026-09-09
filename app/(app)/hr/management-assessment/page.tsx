
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { getEvaluationWeights } from "@/app/(app)/hr/eval-weights-actions";
import { equalWeights, type EvaluationWeights } from "@/lib/hr/candidate/evaluation-weights";
import { listSkillLookups, type SkillLookupOptions } from "@/lib/hr/skills";
import { ManagementAssessmentScreen } from "@/components/hr/candidate/management-assessment-screen";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Pre-Interview → Management Assessment. A FULL-SCREEN focused surface (no rail,
 * no app header). Pick the candidate, then capture the management round: rich
 * dictated notes, in-browser voice recordings, and file/image/video attachments —
 * all persisted onto that candidate's record.
 */
export default async function ManagementAssessmentPage() {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }

  const emptySkills: SkillLookupOptions = {
    technical: [],
    nonTechnical: [],
    custom: { technical: [], nonTechnical: [] },
  };
  let skillOptions: SkillLookupOptions = emptySkills;
  try {
    skillOptions = await Promise.race([
      listSkillLookups(),
      new Promise<SkillLookupOptions>((resolve) => setTimeout(() => resolve(emptySkills), 3500)),
    ]);
  } catch {
    skillOptions = emptySkills;
  }

  let weights: EvaluationWeights = equalWeights();
  try {
    weights = await Promise.race([
      getEvaluationWeights(),
      new Promise<EvaluationWeights>((resolve) => setTimeout(() => resolve(equalWeights()), 3500)),
    ]);
  } catch {
    weights = equalWeights();
  }

  return (
    <div className="min-h-full" style={{ background: "#faf9fb" }}>
      <HrTitleBar
      />

      <ManagementAssessmentScreen candidates={candidates} skillOptions={skillOptions} isAdmin={isAdmin} weights={weights} />
    </div>
  );
}
