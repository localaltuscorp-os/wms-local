"use client";

import { CheckCircle2, XCircle, Hourglass } from "lucide-react";
import type { RevisionSummary } from "@/lib/queries/task-time";
import { formatMinutesLabel } from "@/lib/tasks/time/types";

/** Every submission→verdict cycle, kept forever. Nothing is ever replaced. */
export function RevisionHistory({ revisions }: { revisions: RevisionSummary[] }) {
  const submitted = revisions.filter((r) => r.doneAt || r.verdict);
  if (submitted.length === 0) {
    return <p className="text-[13.5px] text-ink-muted">No submissions yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {submitted.map((r) => {
        const approved = r.verdict === "approved";
        const rejected = r.verdict === "not_approved";
        return (
          <div key={r.revision} className="rounded-xl border border-hairline bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-black text-ink-strong">Version {r.revision}</span>
                <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-bold text-ink-muted tabular-nums">
                  {formatMinutesLabel(r.totalSeconds)}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                  approved
                    ? "bg-emerald-50 text-emerald-700"
                    : rejected
                      ? "bg-[color-mix(in_srgb,var(--color-altus-red)_10%,white)] text-altus-red-deep"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {approved ? <CheckCircle2 size={13} /> : rejected ? <XCircle size={13} /> : <Hourglass size={13} />}
                {approved ? "Approved" : rejected ? "Sent back" : "Awaiting review"}
              </span>
            </div>
            {r.comment && (
              <p className="mt-2 rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[12.5px] text-ink-strong">
                <span className="font-bold">Manager: </span>
                {r.comment}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
