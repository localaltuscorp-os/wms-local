"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, Loader2, X } from "lucide-react";
import { KIND_LABEL } from "@/lib/project-plan/levels";
import { describeCarried, describeMove, type PlanMovePlan } from "@/lib/project-plan/move";

const ACCENT = "#E10600";

/**
 * "You really want to shift this?" — the confirm popup for a drag-and-drop
 * move, asked for by name (Manan, 2026-09-15: "when i drag then give me one
 * popup you really want to shift you milestone to another project").
 *
 * IT IS NOT A `window.confirm`, and the difference is the whole point. A move
 * has THREE consequences a person needs to see before they agree to it, and a
 * one-line browser prompt can show none of them well:
 *
 *   · where it lands — the project AND the row it will hang under, which may
 *     not be the row that was dropped on
 *   · what gets CREATED — dropping a Result on a Project has to invent an
 *     "Unclassified Milestone" for it to sit in, and inventing rows in
 *     someone's plan without saying so is how a plan stops being trusted
 *   · what COMES WITH IT — the results, actions and sub-actions underneath,
 *     and the live WMS tasks linked to them
 *
 * The figures are resolved on the SERVER by `planMoveImpact` before this opens,
 * so what it promises is what the write will do rather than what the browser
 * guessed from the tree it happens to be rendering.
 */
export function MoveConfirmDialog({
  plan,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  plan: PlanMovePlan;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Esc cancels, like every other dialog in the module. Not while the write is
  // in flight: the row is already moving and closing would only hide it.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const carried = describeCarried(plan.carries);

  return createPortal(
    <div
      className="fixed inset-0 z-[140] grid place-items-center bg-black/45 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm move"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl max-md:p-4"
        style={{ borderBottom: `3px solid ${ACCENT}` }}
      >
        <div className="mb-3 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-[17px] font-black leading-snug text-ink-strong">
            {describeMove(plan)}
          </h2>
          <button
            onClick={onCancel}
            disabled={busy}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-40"
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        {/* From → to, so the move is readable without parsing the sentence. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-hairline-strong bg-surface-soft px-3 py-2.5 text-[13px]">
          <span className="font-semibold text-ink-muted">{plan.fromProjectName}</span>
          <ArrowRight size={14} className="text-ink-subtle" aria-hidden />
          <span className="font-black text-ink-strong">{plan.toProjectName}</span>
          {plan.sameProject && (
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">
              same project
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink-strong">
          <li>
            It will sit under{" "}
            <b>
              {KIND_LABEL[plan.parentKind]} &ldquo;{plan.parentName}&rdquo;
            </b>
            .
          </li>

          {plan.creates.length > 0 && (
            <li className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              <AlertTriangle size={15} className="mt-[2px] shrink-0" aria-hidden />
              <span>
                There is nowhere to put it yet, so{" "}
                {plan.creates.length === 1 ? "a new row" : "new rows"} will be created:{" "}
                <b>
                  {plan.creates
                    .map((c) => `${KIND_LABEL[c.kind]} “${c.name}”`)
                    .join(", ")}
                </b>
                . You can rename {plan.creates.length === 1 ? "it" : "them"} afterwards.
              </span>
            </li>
          )}

          {carried && (
            <li>
              <b>{carried}</b> underneath it move as well.
            </li>
          )}

          {plan.taskCount > 0 && (
            <li className="text-ink-muted">
              {plan.taskCount} linked WMS {plan.taskCount === 1 ? "task moves" : "tasks move"} with
              the branch — nothing is re-created, re-dated or re-assigned.
            </li>
          )}
        </ul>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-hairline-strong px-3.5 py-2 text-[13.5px] font-bold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {busy ? "Moving…" : "Yes, move it"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
