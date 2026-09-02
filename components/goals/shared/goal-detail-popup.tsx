"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GoalAttachmentsPanel } from "@/components/goals/shared/goal-attachments-panel";
import { autoPctDone } from "@/lib/goals/auto-pct";
import type { GoalDTO } from "@/components/goals/cascade/util";
import { cn } from "@/lib/utils";

/**
 * GoalDetailPopup — the popup selecting a row opens. VIEW ONLY, by request:
 * no inputs, no dropdowns, no Save — every field just shows its current
 * value. Editing still happens through the table's own inline cells
 * (Area/Goal/Target/% Done/Type are directly editable there).
 */

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

const labelCls = "text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-subtle";

/** One read-only value box — caption label over the field's current value.
 *  Always renders (even empty), so a field never appears to "disappear" —
 *  it just shows a muted "—" placeholder. */
function FieldBox({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className={labelCls}>{label}</p>
      <p
        className="mt-1 min-h-9 whitespace-pre-wrap rounded-xl border bg-surface-soft px-3 py-2 text-[14px] font-semibold leading-snug text-ink-strong"
        style={{ borderColor: "var(--color-hairline-strong)" }}
      >
        {empty ? <span className="font-normal text-ink-subtle">—</span> : children}
      </p>
    </div>
  );
}

export interface GoalDetailPopupProps {
  goal: GoalDTO;
  onClose: () => void;
}

export function GoalDetailPopup({ goal, onClose }: GoalDetailPopupProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pct = autoPctDone(goal.targetQty, goal.actualQty) ?? goal.pctDone;
  const delegated = (goal.delegatedTo ?? [])
    .map((d) => `${d.name ?? ""}${d.pct != null ? ` (${d.pct}%)` : ""}`)
    .filter(Boolean)
    .join(", ");

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${goal.title || "Goal"} — details`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl p-7"
        style={{
          border: "1.5px solid var(--color-ink-strong)",
          borderBottomWidth: 4,
          borderBottomColor: "var(--color-altus-red)",
          background: "var(--color-surface-card)",
          boxShadow: "0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.28)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[19px] font-black leading-snug text-ink-strong">{goal.title || "Untitled goal"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn("shrink-0 rounded-md p-1 text-ink-subtle hover:bg-black/[0.05]", FOCUS_RING)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Inner card — same chrome as the outer one — holds every field. */}
        <div
          className="mt-4 rounded-2xl p-5"
          style={{
            border: "1.5px solid var(--color-ink-strong)",
            borderBottomWidth: 4,
            borderBottomColor: "var(--color-altus-red)",
          }}
        >
          <div className="space-y-3.5">
            <FieldBox label="Goal">{goal.title || "Untitled goal"}</FieldBox>

            <div className="grid grid-cols-2 gap-3">
              <FieldBox label="Area">{goal.area}</FieldBox>
              <FieldBox label="Measure">{goal.uom}</FieldBox>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <FieldBox label="Actual">{goal.actualQty ?? goal.actualAmount}</FieldBox>
              <FieldBox label="Target">{goal.targetQty ?? goal.targetAmount}</FieldBox>
              <FieldBox label="% Done">{`${pct}%`}</FieldBox>
              <FieldBox label="Team %">{goal.teamDependencyPct != null ? `${goal.teamDependencyPct}%` : null}</FieldBox>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldBox label="Type">{goal.goalType}</FieldBox>
              <FieldBox label="Delegated to">{delegated}</FieldBox>
            </div>

            <div>
              <p className={labelCls}>Notes</p>
              <p
                className="mt-1 min-h-9 whitespace-pre-wrap rounded-xl border bg-surface-soft px-3 py-2 text-[14px] font-semibold leading-snug text-ink-strong"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                {goal.notes?.trim() || <span className="font-normal text-ink-subtle">No notes</span>}
              </p>
              <GoalAttachmentsPanel goalId={goal.id} canWrite={false} className="mt-2.5" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2 text-[14px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
