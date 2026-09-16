"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";
import {
  APPROVER_LABEL,
  APPROVER_TONE,
  type ApproverChoice,
  type ApproverShown,
} from "@/lib/status/approver-status";

/**
 * The Initiator Status chip — one look for WMS Tasks, Goals and Projects
 * (lib/status/approver-status.ts). Presentational: the caller decides which
 * choices this viewer may pick and saves the pick.
 *
 * With no choices it is a read-only chip with a lock — the viewer is the doer,
 * has no say over this work, or the row is self-raised and reads "Not
 * Applicable" because nobody is approving it.
 */
export function ApproverChip({
  shown,
  choices,
  onPick,
  lockedTitle = "Only the initiator, the doer's manager or an admin can change this.",
}: {
  /** What the row currently reads. */
  shown: ApproverShown;
  /** What this viewer may pick now; empty = read-only. */
  choices: readonly ApproverChoice[];
  /** Save a pick. Resolve to an error message, or null when saved. */
  onPick: (choice: ApproverChoice) => Promise<string | null>;
  lockedTitle?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [optimistic, setOptimistic] = React.useState<ApproverShown | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const current = optimistic ?? shown;
  const tone = APPROVER_TONE[current];
  const style = { background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone };

  if (choices.length === 0) {
    return (
      <span
        className="inline-flex min-w-[118px] items-center justify-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-[12.5px] font-bold"
        style={style}
        title={lockedTitle}
        aria-label={`Initiator Status: ${APPROVER_LABEL[current]}`}
      >
        <Lock size={10} strokeWidth={2.6} aria-hidden />
        {APPROVER_LABEL[current]}
      </span>
    );
  }

  async function choose(next: string) {
    if (next === current) return;
    setError(null);
    setOptimistic(next as ApproverChoice);
    setBusy(true);
    const problem = await onPick(next as ApproverChoice).catch(() => "Couldn't save — please try again.");
    setBusy(false);
    if (problem) {
      setOptimistic(null);
      setError(problem);
    } else {
      setOptimistic(null);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1">
        <select
          value={current}
          disabled={busy}
          onChange={(e) => void choose(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Initiator Status"
          className="min-w-[118px] cursor-pointer rounded-pill border border-transparent px-2.5 py-1 text-[12.5px] font-bold outline-none transition-colors hover:border-hairline-strong focus-visible:ring-2 focus-visible:ring-altus-red/40"
          style={style}
        >
          {/* The row's own value always appears, even when this viewer may not re-pick it. */}
          {!choices.includes(current as ApproverChoice) && <option value={current}>{APPROVER_LABEL[current]}</option>}
          {choices.map((c) => (
            <option key={c} value={c}>
              {APPROVER_LABEL[c]}
            </option>
          ))}
        </select>
        {busy && <Loader2 size={12} className="animate-spin text-ink-subtle" aria-hidden />}
      </span>
      {error && <span className="max-w-[220px] text-[11px] font-semibold text-altus-red">{error}</span>}
    </span>
  );
}
