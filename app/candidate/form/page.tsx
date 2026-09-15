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
 * The candidate's own interview form, served to BOTH candidate routes:
 * `/candidate/form` (signed in) and `/c/form` (an access link, which re-exports
 * this component — see app/c/form/page.tsx). `requireCandidateOwner` resolves
 * THEIR row for either path, so the candidate can only ever load and edit that
 * one row, and reports which path it was as `viaLink`. Positions/departments are
 * read directly (the HR-gated helpers would redirect a candidate).
 */
export default async function CandidateFormPage() {
  const { rowId, submitted, viaLink } = await requireCandidateOwner();

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
    // A link candidate coming back to a form they already submitted wants the
    // review step: that is the one screen showing every answer at once, and
    // correcting an answer is the only reason to return.
    startAtReview: viaLink && submitted,
  };

  return (
    <CandidateFormLauncher
      positions={positions}
      departments={departments}
      initial={initial}
      // Only the link path stays open after submit — see candidate-self-actions.
      canEditAfterSubmit={viaLink}
      alreadySubmitted={viaLink && submitted}
    />
  );
}
