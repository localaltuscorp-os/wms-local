import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import { listEmployeeRecords } from "@/app/(app)/hr/record/people";
import { listSkillLookups, type SkillLookupOptions } from "@/lib/hr/skills";
import { HrRecordScreen } from "@/components/hr/record/hr-record-screen";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * The per-person HR Record hub — a FULL-SCREEN focused surface (no rail). Pick a
 * candidate, then work their whole file from one room: compose their letters,
 * judge the bare-minimum skills requirement (persisted onto the SAME
 * management_assessment.skills field the MA reads — no new storage), and jump to
 * their document dossier. Reached from the "HR Record" card on the HR front door,
 * and the home for the Letters library.
 */
export default async function HrRecordPage() {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  // The person list is now the CURRENT EMPLOYEES (active roster), not candidate
  // intake records. Each id is an employees.id, resolved directly downstream.
  let candidates: CandidateRow[] = [];
  try {
    candidates = await Promise.race([
      listEmployeeRecords(),
      new Promise<CandidateRow[]>((resolve) => setTimeout(() => resolve([]), 3500)),
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

  return (
    <div className="min-h-full" style={{ background: "#faf9fb" }}>
      <HrTitleBar
      />

      <HrRecordScreen candidates={candidates} skillOptions={skillOptions} isAdmin={isAdmin} />
    </div>
  );
}
