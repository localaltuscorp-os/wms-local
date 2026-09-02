"use client";

import { ClipboardCheck } from "lucide-react";
import { overallScore, type Ratings } from "@/lib/hr/candidate/evaluation-checklist";
import { EvaluationChecklistBody } from "@/components/hr/candidate/evaluation-checklist-body";

/** Read-only "Evaluation Checklist Record" — the full saved evaluation. */
export function EvaluationRecord({ name, position, ratings }: { name: string; position: string | null; ratings: Ratings }) {
  const overall = overallScore(ratings);

  return (
    <div>
      <div className="mb-6">
        <span
          className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
          style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}
        >
          <ClipboardCheck size={13} strokeWidth={2.6} /> Evaluation Checklist Record
        </span>
        <h1
          className="mt-2 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3.2vw,40px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
        >
          {name || "Unnamed candidate"}
        </h1>
        {position && <p className="mt-1 text-[14px] font-bold uppercase tracking-wide" style={{ color: "var(--color-altus-red-deep)" }}>{position}</p>}
      </div>

      {overall.rated === 0 && (
        <p className="mb-4 rounded-xl border border-solid border-hairline-strong bg-surface-card px-4 py-6 text-center text-[14px] text-ink-muted">
          No evaluation recorded yet for this candidate.
        </p>
      )}

      <EvaluationChecklistBody ratings={ratings} readOnly />
    </div>
  );
}
