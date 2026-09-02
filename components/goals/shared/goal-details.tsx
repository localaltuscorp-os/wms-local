"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  effectiveGoalPct,
  periodKeyLabel,
  categoryStyle,
  MONTHS,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import type { GoalPeriod } from "@/lib/goals/types";

/**
 * GoalDetails — the ONE full-detail view for a goal, at every level.
 *
 * Yearly, Quarterly, Monthly and Weekly all open THIS, so the detail UI cannot
 * drift between them; the only thing that changes is the level word in the
 * eyebrow ("Yearly Goal" / "Quarterly Goal" / …).
 *
 * Reads the GoalDTO the board already has in memory — no fetch, no new fields,
 * no second copy of the data. Every row below is an existing column on the DTO
 * and is simply omitted when empty, so a sparse goal shows a short card rather
 * than a wall of dashes.
 *
 * Rendered through a PORTAL to document.body: the boards put rows inside
 * `overflow-auto` table wrappers, which would otherwise clip a modal.
 */

export const GOAL_LEVEL_LABEL: Record<GoalPeriod, string> = {
  year: "Yearly Goal",
  quarter: "Quarterly Goal",
  month: "Monthly Goal",
  week: "Weekly Goal",
  day: "Daily Goal",
};

/** Human status from the same percentage the boards colour their rings by. */
function statusOf(pct: number): { label: string; tone: string } {
  if (pct >= 100) return { label: "Done", tone: "var(--color-green)" };
  if (pct >= 50) return { label: "On track", tone: "var(--color-amber)" };
  if (pct > 0) return { label: "Behind", tone: "var(--color-orange)" };
  return { label: "Not started", tone: "var(--color-ink-subtle)" };
}

/** "09-Aug-2026" — kept consistent with fmtTargetDate across the goals feature. */
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const da = String(d.getDate()).padStart(2, "0");
  return `${da}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** One label/value line. Renders nothing when the value is empty, which is what
 *  keeps a thinly-filled goal from showing as a column of em-dashes. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-2 max-sm:grid-cols-1 max-sm:gap-0.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</dt>
      <dd className="text-[13.5px] font-medium text-ink-strong">{children}</dd>
    </div>
  );
}

export interface GoalDetailsProps {
  goal: GoalDTO;
  /** Resolved display name for `goal.employeeId`, when the caller knows it. */
  ownerName?: string | null;
  onClose: () => void;
}

export function GoalDetails({ goal, ownerName, onClose }: GoalDetailsProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const pct = effectiveGoalPct(goal);
  const status = statusOf(pct);
  // `spillover` is the second arg — a carried-forward goal reads as "Spillover"
  // here exactly as it does on the board, rather than as its original category.
  const cat = categoryStyle(goal.category, Boolean(goal.clonedFromId));
  const team = goal.teamInvolved?.filter((m) => m?.name) ?? [];
  const delegated = (goal.delegatedTo ?? [])
    .map((d) => `${d.name ?? ""}${d.pct != null ? ` (${d.pct}%)` : ""}`)
    .filter(Boolean)
    .join(", ");

  const target = goal.targetQty ?? goal.targetAmount;
  const actual = goal.actualQty ?? goal.actualAmount;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.42)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${GOAL_LEVEL_LABEL[goal.period]} — ${goal.title}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86vh] w-full max-w-[620px] overflow-auto rounded-2xl border border-hairline bg-surface-card shadow-2xl"
      >
        <header className="sticky top-0 flex items-start gap-3 border-b border-hairline bg-surface-card px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-altus-red">
                {GOAL_LEVEL_LABEL[goal.period]}
              </span>
              <span className="text-[11px] font-semibold text-ink-subtle">
                · {periodKeyLabel(goal.periodKey)}
              </span>
            </div>
            <h2 className="mt-1 text-[19px] font-extrabold leading-snug tracking-tight text-ink-strong">
              {goal.title || "Untitled goal"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
          >
            <X size={17} strokeWidth={2.4} />
          </button>
        </header>

        <div className="px-5 py-3">
          {/* Progress reads first — it is the question people open this to answer. */}
          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-soft px-3.5 py-3">
            <span className="text-[26px] font-extrabold tabular-nums leading-none text-ink-strong">
              {Math.round(pct)}%
            </span>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: status.tone }}
                />
              </div>
              <span className="mt-1 inline-block text-[11.5px] font-bold" style={{ color: status.tone }}>
                {status.label}
              </span>
            </div>
          </div>

          <dl className="mt-1 divide-y divide-hairline">
            <Row label="Notes">
              {goal.notes?.trim() ? (
                <span className="whitespace-pre-wrap">{goal.notes}</span>
              ) : (
                <span className="text-ink-subtle">No notes added</span>
              )}
            </Row>
            <Row label="Area">{goal.area || null}</Row>
            <Row label="Owner">{ownerName || null}</Row>
            <Row label="Type">
              {goal.goalType || (goal.category ? <span style={{ color: cat.color }}>{cat.label}</span> : null)}
            </Row>
            <Row label="Measure">{goal.uom || null}</Row>
            <Row label="Target">{target ?? null}</Row>
            <Row label="Actual">{actual ?? null}</Row>
            <Row label="Team %">{goal.teamDependencyPct != null ? `${goal.teamDependencyPct}%` : null}</Row>
            <Row label="Team">
              {team.length
                ? team.map((m) => `${m.name}${m.weight != null ? ` (${m.weight}%)` : ""}`).join(", ")
                : null}
            </Row>
            <Row label="Delegated">{delegated || null}</Row>
            <Row label="Accepted %">{goal.acceptPct != null ? `${goal.acceptPct}%` : null}</Row>
            <Row label="Review notes">{goal.reviewNotes || null}</Row>
            <Row label="Assigned by">{goal.createdByName || null}</Row>
            <Row label="Assigned on">{fmtDate(goal.createdAt)}</Row>
            <Row label="Source">{goal.source || null}</Row>
            <Row label="Carried forward">{goal.clonedFromId ? "Yes — spilled over from an earlier period" : null}</Row>
            <Row label="Evidence">
              {goal.evidenceUrl ? (
                <a
                  href={goal.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-altus-red underline underline-offset-2"
                >
                  Open attachment
                </a>
              ) : null}
            </Row>
          </dl>
        </div>
      </div>
    </div>,
    document.body,
  );
}
