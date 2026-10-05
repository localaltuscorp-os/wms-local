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
import { Check, Loader2, Mic, Square } from "lucide-react";
import type { ReviewItem } from "@/app/(app)/goals/review/review-data";
import { submitReview } from "@/app/(app)/goals/review/actions";
import { setGoalCategory } from "@/app/(app)/goals/cascade/actions";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { pctTone } from "@/components/goals/cascade/util";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDictation } from "@/components/ui/use-dictation";
import { InteractiveTableHeaderCell } from "@/components/ui/interactive-table-header-cell";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";
const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const redTint = (p: number) => `color-mix(in srgb, var(--color-altus-red) ${p}%, transparent)`;

const TH =
  "px-3 py-3.5 text-left text-[11.5px] font-black uppercase tracking-[0.07em] text-ink-strong whitespace-nowrap";

type ReviewColumnId = "code" | "title" | "category" | "self" | "approved" | "notes";
const REVIEW_COLUMNS: { id: ReviewColumnId; label: string; className: string }[] = [
  { id: "code", label: "Code", className: "w-16" },
  { id: "title", label: "Goal", className: "min-w-[220px]" },
  { id: "category", label: "Category", className: "min-w-[120px]" },
  { id: "self", label: "Self %", className: "" },
  { id: "approved", label: "Approved %", className: "" },
  { id: "notes", label: "Approver Notes", className: "min-w-[200px]" },
];

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

/** Dictation appends final speech to the same editable approver-note draft. */
function ApproverNotesInput({
  value,
  disabled,
  placeholder,
  required,
  onChange,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  required: boolean;
  onChange: (value: string) => void;
}) {
  const dictation = useDictation({ value, onChange });
  const displayValue = dictation.recording && dictation.interim
    ? `${value}${value && !/\s$/.test(value) ? " " : ""}${dictation.interim}`
    : value;

  return (
    <div className="relative min-w-[180px]">
      <textarea
        value={displayValue}
        disabled={disabled}
        readOnly={dictation.recording}
        rows={2}
        maxLength={4000}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Approver notes"
        aria-required={required}
        className={cn(
          "w-full resize-y rounded-md border bg-white px-2 py-1.5 pb-9 text-[12.5px] leading-snug text-ink-strong focus:border-altus-red",
          FOCUS_RING,
        )}
        style={{ borderColor: required ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
      />
      {dictation.supported && (
        <button
          type="button"
          onClick={dictation.toggle}
          disabled={disabled && !dictation.recording}
          aria-pressed={dictation.recording}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-1 text-[10.5px] font-bold text-altus-red shadow-sm ring-1 ring-[var(--color-hairline-strong)] transition hover:bg-red-50 disabled:opacity-60"
        >
          {dictation.recording ? (
            <><Square size={10} fill="currentColor" className="animate-pulse" /> Stop dictation</>
          ) : (
            <><Mic size={12} strokeWidth={2.5} /> Dictate with Voice</>
          )}
        </button>
      )}
    </div>
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
      {/* Goal code, with its row position as the fallback. */}
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
          <ApproverNotesInput
            value={notes}
            disabled={pending}
            placeholder={needsNote ? "Required — why under 100%?" : "Feedback for the owner…"}
            required={needsNote}
            onChange={setNotes}
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
  const [sort, setSort] = React.useState<{ key: "code" | "title" | "category" | "self" | "approved" | "notes"; dir: "asc" | "desc" }>({ key: "title", dir: "asc" });
  const [columnOrder, setColumnOrder] = React.useState<ReviewColumnId[]>(() => REVIEW_COLUMNS.map((column) => column.id));
  const [dragColumn, setDragColumn] = React.useState<ReviewColumnId | null>(null);
  const [dropColumn, setDropColumn] = React.useState<ReviewColumnId | null>(null);
  const sortedItems = React.useMemo(() => [...items].sort((a, b) => {
    const value = (item: ReviewItem) =>
      sort.key === "code" ? item.code ?? "" :
      sort.key === "title" ? item.title :
      sort.key === "category" ? item.category ?? "" :
      sort.key === "self" ? item.pctDone :
      sort.key === "approved" ? item.acceptPct ?? -1 : item.reviewNotes ?? "";
    const result = typeof value(a) === "string" ? String(value(a)).localeCompare(String(value(b))) : Number(value(a)) - Number(value(b));
    return sort.dir === "asc" ? result : -result;
  }), [items, sort]);
  const orderedColumns = columnOrder.map((id) => REVIEW_COLUMNS.find((column) => column.id === id)!);
  const moveColumn = (source: ReviewColumnId, target: ReviewColumnId) => {
    if (source === target) return;
    setColumnOrder((current) => {
      const next = current.filter((id) => id !== source);
      next.splice(next.indexOf(target), 0, source);
      return next;
    });
  };
  const sortButton = (key: "code" | "title" | "category" | "self" | "approved" | "notes", label: string) => (
    <button type="button" onClick={() => setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" })} className="inline-flex items-center gap-1 hover:text-altus-red">
      {label}<span aria-hidden>{sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
  // Kept only until the next review-table cleanup; headers below use the shared adapter.
  void sortButton;
  return (
    <div
      className="table-scroll wg-rise max-h-[72vh] overflow-auto rounded-section border border-hairline bg-surface-card"
      style={{
        borderColor: "var(--color-hairline)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 16px 40px -24px rgba(15,23,42,0.20)",
      }}
    >
      <style>{`
        /* Frozen header - stays put while the rows scroll. */
        .rvw-table thead th {
          position: sticky;
          top: 0;
          z-index: 6;
          background-image: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(244,246,249,0.90));
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
          box-shadow: inset 0 -1px 0 var(--color-hairline-strong);
          font-size: 11px;
          padding-top: 6px;
          padding-bottom: 6px;
        }
      `}</style>
      <table className="rvw-table w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-hairline-strong">
            {orderedColumns.map((column) => (
              <InteractiveTableHeaderCell
                key={column.id}
                columnId={column.id}
                label={column.label}
                sortable
                sortDirection={sort.key === column.id ? sort.dir : false}
                onToggleSort={() => setSort((current) => current.key === column.id ? { key: column.id, dir: current.dir === "asc" ? "desc" : "asc" } : { key: column.id, dir: "asc" })}
                draggable
                dragging={dragColumn === column.id}
                dropTarget={dropColumn === column.id && dragColumn !== column.id}
                onColumnDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.id); setDragColumn(column.id); }}
                onColumnDragEnd={() => { setDragColumn(null); setDropColumn(null); }}
                onColumnDragOver={(event) => { event.preventDefault(); setDropColumn(column.id); }}
                onColumnDragLeave={() => setDropColumn((current) => current === column.id ? null : current)}
                onColumnDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain") as ReviewColumnId; if (REVIEW_COLUMNS.some((item) => item.id === source)) moveColumn(source, column.id); setDragColumn(null); setDropColumn(null); }}
                className={cn(TH, column.className)}
              />
            ))}
            <th className={cn(TH, "text-right")} aria-label="Save" />
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, i) => (
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
