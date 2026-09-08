"use client";

import { overallScore, type Ratings } from "@/lib/hr/candidate/evaluation-checklist";
import { EvaluationChecklistBody } from "@/components/hr/candidate/evaluation-checklist-body";

/**
 * Read-only "Evaluation Checklist Record" — the full saved evaluation. The
 * "Evaluation Checklist Record" eyebrow + candidate name/position heading
 * that used to open this component now live in the frozen HrTitleBar
 * (see page.tsx), which has the same `name`/`position` data already.
 */
export function EvaluationRecord({ ratings }: { ratings: Ratings }) {
  const overall = overallScore(ratings);

  return (
    <div>
      {overall.rated === 0 && (
        <p className="mb-4 rounded-xl border border-solid border-hairline-strong bg-surface-card px-4 py-6 text-center text-[14px] text-ink-muted">
          No evaluation recorded yet for this candidate.
        </p>
      )}

      <EvaluationChecklistBody ratings={ratings} readOnly />
    </div>
  );
}
