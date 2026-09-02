import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import { listEmployeeRecords } from "@/app/(app)/hr/record/people";
import { listSkillLookups, type SkillLookupOptions } from "@/lib/hr/skills";
import { HrRecordScreen } from "@/components/hr/record/hr-record-screen";

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
    <div className="min-h-dvh" style={{ background: "#faf9fb" }}>
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">HR Home</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      <HrRecordScreen candidates={candidates} skillOptions={skillOptions} isAdmin={isAdmin} />
    </div>
  );
}
