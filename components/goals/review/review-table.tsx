"use client";

/**
 * ReviewTable — the Review & Scores workbench as a clean, dense scoring TABLE
 * (one row per goal) instead of stacked cards. Columns: # · Goal · Category ·
 * Self % · Approved % · Approver Notes · Save. Managers / management (canReview)
 * can change a goal's Category inline (goal-kind rows) and set Approved % + notes;
 * owners (canWrite) set their Self %. Writes reuse the existing `submitReview`
 * (scores) + `setGoalCategory` (category) actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { ReviewItem } from "@/app/(app)/goals/review/review-data";
import { submitReview } from "@/app/(app)/goals/review/actions";
import { setGoalCategory } from "@/app/(app)/goals/cascade/actions";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { pctTone } from "@/components/goals/cascade/util";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";
const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const redTint = (p: number) => `color-mix(in srgb, var(--color-altus-red) ${p}%, transparent)`;

const TH =
  "px-3 py-3.5 text-left text-[11.5px] font-black uppercase tracking-[0.07em] text-ink-strong whitespace-nowrap";

/** Small tone-coloured % pill. */
function PctPill({ pct, label }: { pct: number; label?: string }) {
  const t = pctTone(pct);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-black tabular-nums"
      style={{ color: t.color, background: t.bg }}
    >
      {pct}%{label ? <span className="text-[9px] font-bold uppercase opacity-70">{label}</span> : null}
    </span>
  );
}

function ReviewRow({
  item,
  canWrite,
  canReview,
  typeOptions,
  customTypes,
  index,
}: {
  item: ReviewItem;
  canWrite: boolean;
  canReview: boolean;
  typeOptions: string[];
  customTypes: string[];
  index: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  /* PERCENT FIELDS HOLD TEXT, NOT A NUMBER — and that is the fix for typing
     "100" into a field showing 0 and getting "0100".

     The old shape was `value={self}` (a number) with
     `onChange={(e) => setSelf(Number(e.target.value) || 0)}`. Two things went
     wrong together:

       · `|| 0` meant an empty field snapped straight back to 0, so the leading
         zero could never be deleted — every entry was typed in FRONT of it.
       · React skips writing back to an `<input type="number">` when the new
         value is only LOOSELY unequal to what the DOM holds. Typing 1-0-0 in
         front of the 0 gives "0100", `"0100" == 100` is true, so React saw
         nothing to correct and left the text on screen — while state said 100.
         The field disagreed with the value it would save.

     Holding the raw string keeps the field honest: it can be emptied, it shows
     exactly what was typed, and it is normalised to a clamped number on blur —
     which is also when it commits. */
  const [selfText, setSelfText] = React.useState(String(item.pctDone));
  const [acceptText, setAcceptText] = React.useState(String(item.acceptPct ?? item.pctDone));
  const [notes, setNotes] = React.useState(item.reviewNotes ?? "");

  // The numbers the rest of the row reasons about. An empty field reads as 0
  // for validation and saving, without forcing a "0" back into the box.
  const self = clampPct(Number(selfText) || 0);
  const accept = clampPct(Number(acceptText) || 0);

  React.useEffect(() => setSelfText(String(item.pctDone)), [item.pctDone]);
  React.useEffect(
    () => setAcceptText(String(item.acceptPct ?? item.pctDone)),
    [item.acceptPct, item.pctDone],
  );
  React.useEffect(() => setNotes(item.reviewNotes ?? ""), [item.reviewNotes]);

  /**
   * Digits only, at most 3, "" allowed so the field can be cleared — and any
   * LEADING ZERO dropped as soon as a real digit follows it.
   *
   * That last part is the actual "0100" fix. Selecting on focus handles the
   * common case, but someone who clicks to the right of the standing 0 and
   * types 1-0-0 still produces "0100"; stripping turns that into 100 keystroke
   * by keystroke. A lone "0" is left alone — it is a legitimate value.
   */
  const onPctText = (set: (v: string) => void) => (raw: string) => {
    set(raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3));
  };
  /** On blur the text becomes the clamped number it will actually save as. */
  const normalise = (set: (v: string) => void, n: number) => set(String(n));

  const run = (input: Parameters<typeof submitReview>[0], okMsg: string) =>
    start(async () => {
      const res = await submitReview(input);
      if (res.ok) {
        router.refresh();
        fireToast({ message: okMsg, type: "success" });
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });

  const commitSelf = (v: number) => {
    const n = clampPct(v);
    if (!canWrite || n === item.pctDone) return;
    run({ kind: item.kind, id: item.id, self: n }, `${item.title} → ${n}% done`);
  };
  const saveApproval = () => {
    if (!canApprove) return;
    if (clampPct(accept) < 100 && !notes.trim()) {
      fireToast({
        message: "Add an approver note explaining why this is under 100%.",
        type: "error",
      });
      return;
    }
    run(
      { kind: item.kind, id: item.id, acceptPct: clampPct(accept), reviewNotes: notes.trim() || null },
      `Approved ${clampPct(accept)}% · "${item.title}"`,
    );
  };
  const changeCategory = (v: string) => {
    if (item.kind !== "goal") return;
    start(async () => {
      const res = await setGoalCategory({ id: item.id, category: v });
      if (res.ok) {
        router.refresh();
        fireToast({ message: "Category updated", type: "success" });
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  };

  const reviewed = item.acceptPct != null;

  /**
   * WHO MAY SET APPROVED % ON *THIS* ROW.
   *
   * `canReview` is one flag for the whole board and is false while you are
   * looking at your own, so on its own it left a self-raised goal with a Self %
   * its owner could fill and an Approved % nobody could — permanently
   * unreviewed. The initiator is added as a second key: they asked for the
   * work, so they rule on it. When they and the owner are the same person that
   * hands the owner their own approval; when someone else raised it the owner
   * is not the initiator and stays locked out, which is the point.
   *
   * The server re-decides this in loadApprovableGoalRow — this only decides
   * what to render.
   */
  const canApprove = item.approvable && (canReview || item.initiatedByMe);

  // Anything short of 100 owes the owner a reason. Mirrored server-side; here
  // it disables Save and says so, rather than letting a doomed write travel.
  const needsNote = clampPct(accept) < 100 && !notes.trim();

  return (
    <tr
      style={{ borderBottom: "1px solid var(--color-hairline)" }}
      className="align-middle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_2.5%,transparent)]"
    >
      {/* # code */}
      <td className="px-3 py-3.5">
        <span className="whitespace-nowrap text-[12.5px] font-bold text-ink-soft tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
          {item.code ?? index + 1}
        </span>
      </td>

      {/* Goal */}
      <td className="px-3 py-3.5">
        <p className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-strong" title={item.title}>
          {item.title}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-subtle">{item.periodLabel}</p>
      </td>

      {/* Category — reviewers change it (goal-kind only) */}
      <td className="px-3 py-3.5">
        {item.kind === "goal" ? (
          canReview ? (
            <GoalLookupSelect
              kind="type"
              noun="Type"
              compact
              placeholder="Type"
              value={item.category ?? ""}
              options={typeOptions}
              custom={customTypes}
              isAdmin={false}
              onChange={changeCategory}
            />
          ) : (
            <span className="text-[13px] font-semibold text-ink-soft">{item.category || "-"}</span>
          )
        ) : (
          <span className="text-[12px] text-ink-subtle">-</span>
        )}
      </td>

      {/* Self % */}
      <td className="px-3 py-3.5">
        {canWrite ? (
          <input
            // `inputMode="numeric"` rather than `type="number"`: the number
            // input is what let the DOM and React disagree about "0100", and
            // its spinners were already being hidden by the class list below.
            // This keeps the phone keypad without the reconciliation quirk.
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={selfText}
            disabled={pending}
            onChange={(e) => onPctText(setSelfText)(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => {
              normalise(setSelfText, self);
              commitSelf(self);
            }}
            aria-label="Self percent done"
            className={cn(
              "h-9 w-[64px] rounded-md border bg-white px-2 text-right text-[13.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
          />
        ) : (
          <PctPill pct={item.pctDone} label="self" />
        )}
      </td>

      {/* Approved % */}
      <td className="px-3 py-3.5">
        {!item.approvable ? (
          <span className="text-[12px] font-semibold text-ink-subtle">self-completed</span>
        ) : canApprove ? (
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={acceptText}
            disabled={pending}
            onChange={(e) => onPctText(setAcceptText)(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => normalise(setAcceptText, accept)}
            aria-label="Approved percent"
            className={cn(
              "h-9 w-[64px] rounded-md border bg-white px-2 text-right text-[13.5px] font-black tabular-nums text-ink-strong focus:border-altus-red",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              FOCUS_RING,
            )}
            style={{ borderColor: reviewed ? redTint(45) : "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
          />
        ) : item.acceptPct != null ? (
          <PctPill pct={item.acceptPct} label="appr" />
        ) : (
          <span className="text-[12px] font-semibold text-ink-subtle">pending</span>
        )}
      </td>

      {/* Approver notes */}
      <td className="px-3 py-3.5">
        {canApprove ? (
          <textarea
            value={notes}
            disabled={pending}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={needsNote ? "Required — why under 100%?" : "Feedback for the owner…"}
            aria-label="Approver notes"
            aria-required={needsNote}
            className={cn(
              "w-full min-w-[180px] resize-y rounded-md border bg-white px-2 py-1.5 text-[12.5px] leading-snug text-ink-strong focus:border-altus-red",
              FOCUS_RING,
            )}
            style={{
              // Red while the score is under 100 and nothing is written: the
              // rule is enforced on save either way, and a field that shows it
              // is about to block you beats a toast that tells you afterwards.
              borderColor: needsNote ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
            }}
          />
        ) : item.reviewNotes ? (
          <p className="max-w-[280px] text-[12.5px] text-ink-soft">{item.reviewNotes}</p>
        ) : (
          <span className="text-[12px] text-ink-subtle">-</span>
        )}
      </td>

      {/* Save */}
      <td className="px-3 py-3.5 text-right">
        {canApprove ? (
          <button
            type="button"
            onClick={saveApproval}
            disabled={pending || needsNote}
            title={needsNote ? "Add an approver note explaining why this is under 100%." : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-60",
              FOCUS_RING,
            )}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
            Save
          </button>
        ) : (
          <span className="text-[11px] font-semibold text-ink-subtle">
            {pending ? "…" : ""}
          </span>
        )}
      </td>
    </tr>
  );
}

export function ReviewTable({
  items,
  canWrite,
  canReview,
  typeOptions,
  customTypes,
}: {
  items: ReviewItem[];
  canWrite: boolean;
  canReview: boolean;
  typeOptions: string[];
  customTypes: string[];
}) {
  return (
    <div
      className="wg-rise max-h-[72vh] overflow-auto rounded-2xl border"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: "var(--color-surface-card)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.28)",
      }}
    >
      <style>{`
        /* Frozen header - stays put while the rows scroll. */
        .rvw-table thead th {
          position: sticky; top: 0; z-index: 6;
          background-image: linear-gradient(120deg,
            color-mix(in srgb, var(--color-altus-red) 16%, var(--color-surface-card)),
            color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card)));
          box-shadow: 0 2px 0 color-mix(in srgb, var(--color-altus-red) 34%, var(--color-hairline-strong));
        }
      `}</style>
      <table className="rvw-table w-full border-collapse text-[13.5px]">
        <thead>
          <tr
            style={{
              background: `linear-gradient(120deg, ${redTint(16)}, ${redTint(8)})`,
              borderBottom: "2px solid color-mix(in srgb, var(--color-altus-red) 34%, var(--color-hairline-strong))",
            }}
          >
            <th className={cn(TH, "w-16")}>#</th>
            <th className={cn(TH, "min-w-[220px]")}>Goal</th>
            <th className={cn(TH, "min-w-[120px]")}>Category</th>
            <th className={TH}>Self %</th>
            <th className={TH}>Approved %</th>
            <th className={cn(TH, "min-w-[200px]")}>Approver Notes</th>
            <th className={cn(TH, "text-right")} aria-label="Save" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <ReviewRow
              key={item.id}
              item={item}
              index={i}
              canWrite={canWrite}
              canReview={canReview}
              typeOptions={typeOptions}
              customTypes={customTypes}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
