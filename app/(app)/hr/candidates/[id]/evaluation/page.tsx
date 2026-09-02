import { notFound } from "next/navigation";

import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { getCandidateBasics, getCandidateEvaluation } from "@/app/(app)/hr/candidate-actions";
import { EvaluationRecord } from "@/components/hr/candidate/evaluation-record";

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
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>
      <PageShell width="narrow" py={false} className="pt-8 pb-20">
        <EvaluationRecord name={basics.fullName} position={basics.positionApplied} ratings={ratings} />
      </PageShell>
    </div>
  );
}
