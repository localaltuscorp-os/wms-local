"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Clock, Hourglass, PencilLine, Send, Undo2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { decideIncentiveRequest } from "@/app/(app)/incentive/actions";
import { INCENTIVE_STATUS_LABELS, INCENTIVE_TYPE_LABELS } from "@/db/enums";
import {
  DECISION_LABELS,
  DECISION_RESULT,
  NOTE_MAX,
  availableDecisions,
  checkDecision,
  decisionNoteLabel,
  decisionRequiresNote,
  isContentReviewRequest,
  type DecisionAction,
} from "@/lib/incentive/workflow";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import { NotesInput } from "./incentive-form-dialog";

const ICON: Record<DecisionAction, typeof Check> = {
  approve: Check,
  publish: Send,
  not_approve: Ban,
  reverse: Undo2,
  due: Clock,
  not_due: Hourglass,
  revise: PencilLine,
};

const TONE: Record<DecisionAction, { on: string; ring: string; text: string }> = {
  approve:     { on: "#15803D", ring: "rgba(21,128,61,0.35)", text: "#15803D" },
  publish:     { on: "#15803D", ring: "rgba(21,128,61,0.35)", text: "#15803D" },
  not_approve: { on: "#A80400", ring: "rgba(168,4,0,0.30)",   text: "#A80400" },
  reverse:     { on: "#7F1D1D", ring: "rgba(127,29,29,0.30)", text: "#7F1D1D" },
  due:         { on: "#1D4ED8", ring: "rgba(29,78,216,0.28)", text: "#1D4ED8" },
  not_due:     { on: "#334155", ring: "rgba(51,65,85,0.28)",  text: "#334155" },
  revise:      { on: "#92400E", ring: "rgba(146,64,14,0.30)", text: "#92400E" },
};

/**
 * MANAN'S DECISION PANEL for one request.
 *
 * The buttons are `availableDecisions(...)` — Approved / Not Approved / Due /
 * Not Due / Reversed for most incentives, Publish / Revise / Not Approved for
 * published content — filtered to what the request's current state allows. The
 * same function refuses the same decisions on the server, so there is no button
 * here that the server would reject for being out of order.
 *
 * Choosing a decision opens its note. Not Approved, Reversed and Revise cannot
 * be submitted with an empty note; the others take an optional one. The note
 * takes voice dictation (the same `NotesInput` the request form uses) and the
 * dictated text stays editable before anything is sent.
 *
 * Submitting asks for confirmation inline — naming the state the request will
 * move to — before the decision is recorded. Nothing is written until Confirm.
 */
export function IncentiveDecisionPanel({ row }: { row: IncentiveRequestRow }) {
  const actions = availableDecisions(row.type, row.details, row.status);
  const content = isContentReviewRequest(row.type, row.details);

  const [action, setAction] = useState<DecisionAction | null>(null);
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (actions.length === 0) return null;

  const check = action
    ? checkDecision({ type: row.type, details: row.details, status: row.status, action, note })
    : null;
  const noteError = attempted && check && !check.ok ? check.error : null;
  const noteId = `inc-decision-${row.id}`;
  const typeLabel = INCENTIVE_TYPE_LABELS[row.type] ?? row.type;

  function choose(next: DecisionAction) {
    setAction(next);
    setAttempted(false);
    setConfirming(false);
    setServerError(null);
  }

  function requestSubmit() {
    setAttempted(true);
    setServerError(null);
    if (!check || !check.ok) {
      requestAnimationFrame(() => document.getElementById(noteId)?.focus());
      return;
    }
    setConfirming(true);
  }

  function confirm() {
    if (!action || !check || !check.ok) return;
    const chosen = action;
    startTransition(async () => {
      const res = await decideIncentiveRequest({ id: row.id, action: chosen, note: note.trim() || undefined });
      if (!res.ok) {
        setConfirming(false);
        setServerError(res.error);
        return;
      }
      fireToast({
        message: `Recorded: ${DECISION_LABELS[chosen]} — ${row.employeeName}'s ${typeLabel} is now ${
          INCENTIVE_STATUS_LABELS[DECISION_RESULT[chosen]]
        }.`,
        type: DECISION_RESULT[chosen] === "approved" ? "success" : "info",
      });
      setAction(null);
      setNote("");
      setAttempted(false);
      setConfirming(false);
    });
  }

  return (
    <section
      aria-label="Decision"
      className="col-span-full rounded-xl border p-4"
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
      data-decision-panel={content ? "content" : "normal"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-strong">Decision</h4>
        <span className="text-[12.5px] text-ink-subtle">
          {content
            ? "Content review — publish it, send it back for revision, or don't approve it."
            : `Currently ${INCENTIVE_STATUS_LABELS[row.status] ?? row.status}`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose a decision">
        {actions.map((a) => {
          const Icon = ICON[a];
          const tone = TONE[a];
          const on = action === a;
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => choose(a)}
              data-decision-action={a}
              className="wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold transition-colors disabled:opacity-50"
              style={
                on
                  ? { background: tone.on, color: "#fff", boxShadow: `0 6px 16px -8px ${tone.ring}` }
                  : { background: "#fff", color: tone.text, boxShadow: `inset 0 0 0 1px ${tone.ring}` }
              }
            >
              <Icon size={14} strokeWidth={2.5} aria-hidden />
              {DECISION_LABELS[a]}
            </button>
          );
        })}
      </div>

      {action && (
        <div className="mt-4">
          <label htmlFor={noteId} className="mb-1.5 block text-[14px] font-bold text-ink-strong">
            {decisionNoteLabel(action)}
            {decisionRequiresNote(action) ? (
              <span className="ml-0.5 text-altus-red">*</span>
            ) : (
              <span className="ml-1.5 text-[12px] font-medium text-ink-subtle">optional</span>
            )}
          </label>
          <NotesInput
            id={noteId}
            label={decisionNoteLabel(action)}
            value={note}
            invalid={!!noteError}
            max={NOTE_MAX}
            rows={3}
            placeholder={
              action === "revise"
                ? "What needs to change before this can be published?"
                : decisionRequiresNote(action)
                  ? "Why is this being marked " + DECISION_LABELS[action] + "?"
                  : "Anything the employee or Accounts should know (optional)"
            }
            onChange={(v) => {
              setNote(v);
              setConfirming(false);
            }}
            onBlur={() => undefined}
          />
          {noteError && (
            <p role="alert" className="mt-1 text-[12.5px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
              {noteError}
            </p>
          )}

          {!confirming ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={requestSubmit}
                disabled={pending}
                className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                Submit Decision
              </button>
            </div>
          ) : (
            <div
              role="alertdialog"
              aria-label="Confirm decision"
              className="mt-3 rounded-xl border bg-white p-3.5"
              style={{ borderColor: TONE[action].ring }}
            >
              <p className="text-[14px] font-bold text-ink-strong">
                Record &ldquo;{DECISION_LABELS[action]}&rdquo;?
              </p>
              <p className="mt-1 text-[13.5px] text-ink-muted">
                {row.employeeName}&rsquo;s {typeLabel} will move from{" "}
                <b>{INCENTIVE_STATUS_LABELS[row.status] ?? row.status}</b> to{" "}
                <b>{INCENTIVE_STATUS_LABELS[DECISION_RESULT[action]]}</b>.
                {action === "reverse" &&
                  " A negative payable adjustment is final — it cannot be decided again."}
                {(action === "not_approve" || action === "revise") &&
                  " They will see your note and can justify and resubmit."}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="rounded-pill px-4 py-2 text-[13.5px] font-semibold text-ink-muted hover:bg-surface-soft disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending}
                  data-confirm-decision
                  className={cn("rounded-pill px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50")}
                  style={{ background: TONE[action].on }}
                >
                  {pending ? "Recording…" : `Confirm ${DECISION_LABELS[action]}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {serverError && (
        <p role="alert" className="mt-3 text-[13px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
          {serverError}
        </p>
      )}
    </section>
  );
}
