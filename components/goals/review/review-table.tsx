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
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-black tabular-nums"
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
  const [self, setSelf] = React.useState(item.pctDone);
  const [accept, setAccept] = React.useState<number>(item.acceptPct ?? item.pctDone);
  const [notes, setNotes] = React.useState(item.reviewNotes ?? "");

  React.useEffect(() => setSelf(item.pctDone), [item.pctDone]);
  React.useEffect(() => setAccept(item.acceptPct ?? item.pctDone), [item.acceptPct, item.pctDone]);
  React.useEffect(() => setNotes(item.reviewNotes ?? ""), [item.reviewNotes]);

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
    if (!canReview || !item.approvable) return;
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
            <span className="text-[13px] font-semibold text-ink-soft">{item.category || "—"}</span>
          )
        ) : (
          <span className="text-[12px] text-ink-subtle">—</span>
        )}
      </td>

      {/* Self % */}
      <td className="px-3 py-3.5">
        {canWrite ? (
          <input
            type="number"
            min={0}
            max={100}
            value={self}
            disabled={pending}
            onChange={(e) => setSelf(clampPct(Number(e.target.value) || 0))}
            onBlur={() => commitSelf(self)}
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
        ) : canReview ? (
          <input
            type="number"
            min={0}
            max={100}
            value={accept}
            disabled={pending}
            onChange={(e) => setAccept(clampPct(Number(e.target.value) || 0))}
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
        {item.approvable && canReview ? (
          <textarea
            value={notes}
            disabled={pending}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Feedback for the owner…"
            aria-label="Approver notes"
            className={cn(
              "w-full min-w-[180px] resize-y rounded-md border bg-white px-2 py-1.5 text-[12.5px] leading-snug text-ink-strong focus:border-altus-red",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
        ) : item.reviewNotes ? (
          <p className="max-w-[280px] text-[12.5px] text-ink-soft">{item.reviewNotes}</p>
        ) : (
          <span className="text-[12px] text-ink-subtle">—</span>
        )}
      </td>

      {/* Save */}
      <td className="px-3 py-3.5 text-right">
        {item.approvable && canReview ? (
          <button
            type="button"
            onClick={saveApproval}
            disabled={pending}
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
        /* Frozen header — stays put while the rows scroll. */
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
