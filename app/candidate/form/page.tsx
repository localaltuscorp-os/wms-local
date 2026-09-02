import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, interviewPositions } from "@/db/schema";
import { listDepartments } from "@/lib/queries/departments";
import { RECRUITER_ONLY_KEYS } from "@/lib/hr/candidate/intake-schema";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { CandidateFormLauncher } from "@/components/hr/candidate/candidate-form-launcher";
import type { IntakeInitial } from "@/components/hr/candidate/intake-wizard";

export const dynamic = "force-dynamic";

/**
 * The candidate's own interview form. `requireCandidateOwner` resolves THEIR row
 * (via the server-side account link) — the candidate can only ever load and edit
 * that one row. Positions/departments are read directly (the HR-gated helpers
 * would redirect a candidate).
 */
export default async function CandidateFormPage() {
  const { rowId } = await requireCandidateOwner();

  const [posRows, depts, rowArr] = await Promise.all([
    db
      .select({ label: interviewPositions.label })
      .from(interviewPositions)
      .where(eq(interviewPositions.isActive, true))
      .orderBy(asc(interviewPositions.sortOrder), asc(interviewPositions.label)),
    listDepartments().catch(() => []),
    db
      .select({
        data: candidateIntake.data,
        instances: candidateIntake.instances,
        photoPath: candidateIntake.photoPath,
        signaturePath: candidateIntake.signaturePath,
      })
      .from(candidateIntake)
      .where(and(eq(candidateIntake.id, rowId)))
      .limit(1),
  ]);

  const positions = posRows.map((r) => r.label);
  const departments = depts.filter((d) => d.isActive).map((d) => d.name);
  const row = rowArr[0];
  // Never send recruiter-only answers to the candidate's browser (they're
  // hidden in the UI, but shouldn't ride down in the page payload either).
  const values = { ...((row?.data ?? {}) as Record<string, string>) };
  for (const k of RECRUITER_ONLY_KEYS) delete values[k];
  const initial: IntakeInitial = {
    draftId: rowId,
    values,
    instances: (row?.instances ?? {}) as Record<string, string[]>,
    startAtReview: false,
  };

  return <CandidateFormLauncher positions={positions} departments={departments} initial={initial} />;
}
