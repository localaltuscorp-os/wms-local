import { notFound } from "next/navigation";

import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { getCandidateBasics, getCandidateEvaluation } from "@/app/(app)/hr/candidate-actions";
import { EvaluationRecord } from "@/components/hr/candidate/evaluation-record";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Candidate → Evaluation Checklist Record. A read-only, full-screen view of a
 * candidate's saved evaluation (overall + section scores + every criterion's
 * stars + Quick Summary). Opened from the Candidate Records list.
 */
export default async function EvaluationRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await requireHrStaff();
  const { id } = await params;
  const [basics, ratings] = await Promise.all([getCandidateBasics(id), getCandidateEvaluation(id)]);
  if (!basics) notFound();

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <HrTitleBar
        title={basics.fullName || "Unnamed candidate"}

      />
      <PageShell width="narrow" py={false} className="pt-8 pb-20">
        <EvaluationRecord ratings={ratings} />
      </PageShell>
    </div>
  );
}
