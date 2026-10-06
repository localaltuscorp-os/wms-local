import { notFound, redirect } from "next/navigation";

import { requireHrIntake } from "@/lib/hr/intake-access";
import { getCandidateBasics } from "@/app/(app)/hr/candidate-actions";

export const dynamic = "force-dynamic";

/**
 * Candidate → Evaluation Checklist Record. A read-only, full-screen view of a
 * candidate's saved evaluation (overall + section scores + every criterion's
 * stars + Quick Summary). Opened from the Candidate Records list.
 */
export default async function EvaluationRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await requireHrIntake();
  const { id } = await params;
  const basics = await getCandidateBasics(id);
  if (!basics) notFound();
  redirect(`/hr/evaluation?candidate=${encodeURIComponent(id)}`);
}
