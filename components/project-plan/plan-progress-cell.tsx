"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  describeProgress,
  childCompletion,
  nodeFraction,
  toPercent,
  formatCompleted,
  type Completion,
  type ProgressNode,
} from "@/lib/project-plan/progress";
import { isExecutable, CHILD_KIND, KIND_LABEL, type PlanKind } from "@/lib/project-plan/levels";
import { setPlanNodeProgress } from "@/app/(app)/project-plan/actions";

/**
 * Project Plan — the progress cell.
 *
 * Every number here is COMPUTED from the subtree the row is handed, by the pure
 * functions in lib/project-plan/progress.ts. Nothing is stored, nothing is
 * hard-coded, and a row with no work under it reports 0% rather than a
 * flattering guess.
 *
 * WHAT EACH LEVEL SHOWS
 *
 *   Project     the headline: "40%" over "3.5/10", where the fraction is the
 *               brief's partial milestone completion — each milestone
 *               contributing its OWN fraction, so a half-finished one adds 0.5
 *               and the total lands on a decimal.
 *   Milestone   its own percent, editable by the owner or an admin. That input
 *               is what MAKES the 3.5 above: somebody looks at the milestone
 *               and says "this is 50% there".
 *   Result      derived from the actions beneath it. Read-only — there is
 *               nothing to judge, the actions either are done or are not.
 *   Executable  no cell at all. An action's progress IS its status, and a
 *               second number beside the chip could only disagree with it.
 *
 * The editable percent is an OVERRIDE, and clearing it is a first-class action:
 * blank the box and progress goes back to being derived from the work
 * underneath, which is the honest default.
 */

export function PlanProgressCell({
  node,
  /** Owner or admin — the same authority `setPlanNodeProgress` enforces. */
  canRecord,
  /**
   * Draw "0.5 out of 5 milestones" after the bar.
   *
   * OFF wherever the surface already has a Children (or rollup) column of its
   * own — the register and Project Views both do, and printing it twice made a
   * one-line cell overflow its column and collide with the very column that
   * was already saying it. The hierarchy board has no such column, so there it
   * stays on.
   */
  showChildCount = true,
}: {
  node: ProgressNode & { id: string; progressPercent: number | null };
  canRecord: boolean;
  showChildCount?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  /**
   * THE COUNT UNDERNEATH, one level down and named after that level.
   *
   * The rule the brief asks for, in one place: what a row counts is whatever it
   * directly contains, so the label moves with you as you go down the plan.
   *
   *   Project   →  "0 out of 3 milestones"
   *   Milestone →  "0 out of 3 results"
   *   Result    →  "0 out of 3 actions"
   *   Action    →  "0 out of 3 sub-actions"
   *
   * Read off `CHILD_KIND` rather than written out four times, so the day a level
   * is added it is already counted and already labelled. The number is
   * `childCompletion`, the SAME function the registers' rollup column uses — a
   * half-finished child adds 0.5, which is why it can read "1.5 out of 3".
   *
   * Only the sub-sub-action has no line: nothing sits under it to count.
   */
  const childKind = CHILD_KIND[node.kind as PlanKind];
  const below = childKind ? childCompletion(node, childKind) : null;

  // An action / sub-action is measured by its status chip, so it gets no
  // percent of its own — but it still says what is under it, because "0 out of
  // 3 sub-actions" is exactly the question its row raises.
  if (isExecutable(node.kind)) {
    return below && childKind ? (
      <ChildCount below={below} childKind={childKind} />
    ) : (
      <span className="text-[12px] font-medium text-ink-subtle">—</span>
    );
  }

  const isProject = node.kind === "project";
  const percent = isProject
    ? describeProgress(node).percent
    : toPercent(nodeFraction(node));
  const overridden = node.progressPercent != null;

  function save(raw: string) {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Math.round(Number(trimmed));
    if (next != null && (!Number.isFinite(next) || next < 0 || next > 100)) {
      fireToast({ message: "Completion has to be a whole percent from 0 to 100.", type: "error" });
      return;
    }
    if (next === node.progressPercent) return;
    setBusy(true);
    void (async () => {
      try {
        const res = await setPlanNodeProgress({ id: node.id, percent: next });
        setBusy(false);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        router.refresh();
      } catch {
        setBusy(false);
        fireToast({
          message: "Couldn't save that percentage — your session may have expired. Sign in again and retry.",
          type: "error",
        });
        router.refresh();
      }
    })();
  }

  // ONE LINE: percent, bar and child count side by side rather than stacked.
  // Stacked, this was the tallest cell in the register and it set the height of
  // every row in the table — including the ones with no progress to show.
  return (
    <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {canRecord && !isProject ? (
          // Milestones and Results take a typed override. `key` carries the
          // saved value so a refresh replaces what is in the box rather than
          // leaving a stale edit sitting over a new number.
          <input
            key={`${node.id}:p:${node.progressPercent ?? ""}`}
            defaultValue={node.progressPercent ?? ""}
            inputMode="numeric"
            placeholder={String(percent)}
            disabled={busy}
            onBlur={(e) => save(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            aria-label="Completion percent"
            title={
              overridden
                ? "Recorded by hand. Clear the box to go back to deriving it from the work underneath."
                : "Derived from the actions underneath. Type a percent to record a partial completion."
            }
            className="w-[46px] rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white"
          />
        ) : (
          <span className="text-[12.5px] font-bold tabular-nums text-ink-strong">{percent}</span>
        )}
        <span className="text-[12px] font-bold text-ink-muted">%</span>
        {overridden && (
          <span
            className="rounded px-1 text-[9.5px] font-bold uppercase tracking-wide"
            style={{ background: "color-mix(in srgb, #7C3AED 14%, transparent)", color: "#7C3AED" }}
            title="Recorded by hand, not derived"
          >
            set
          </span>
        )}
        {busy && <Loader2 size={11} className="animate-spin text-ink-subtle" aria-hidden />}

      {/* The bar. Width is the percent, so it can never disagree with the
          number beside it. Fixed width now that it sits IN the line rather than
          under it — a full-width bar in a one-line cell would push everything
          after it off the column. */}
      <span className="h-[5px] w-[44px] shrink-0 overflow-hidden rounded-full bg-[color:var(--color-surface-soft,#eef2f7)]">
        <span
          className="block h-full rounded-full transition-[width]"
          style={{
            width: `${percent}%`,
            background: percent >= 100 ? "#16A34A" : percent > 0 ? "#E10600" : "transparent",
          }}
        />
      </span>

      {/* What is underneath, named after the level underneath — see the note
          on `childKind` above. Used to be projects only, and unlabelled: a bare
          "3.5/10" on a project row and nothing at all on a milestone. */}
      {showChildCount && below && childKind && (
        <ChildCount below={below} childKind={childKind} />
      )}
    </div>
  );
}

/**
 * "0 out of 3 milestones" — the row's direct children of the next level down.
 *
 * The label is derived from the kind, so it says milestones under a project and
 * sub-actions under an action without this component knowing which is which.
 * The count can be a decimal (a half-done child adds 0.5), which is why it says
 * "1.5 out of 3" rather than pretending to be a tally of whole things.
 */
function ChildCount({ below, childKind }: { below: Completion; childKind: PlanKind }) {
  const noun = KIND_LABEL[childKind].toLowerCase();
  const plural = `${noun}${below.total === 1 ? "" : "s"}`;

  if (below.total === 0) {
    return (
      <span className="text-[11px] font-semibold text-ink-subtle" title={`No ${noun}s yet`}>
        no {noun}s
      </span>
    );
  }

  return (
    <span
      className="text-[11px] font-bold text-ink-muted"
      title={`${formatCompleted(below.completed)} of ${below.total} ${plural} complete, each counted by how complete it is`}
    >
      <span className="tabular-nums">{formatCompleted(below.completed)}</span> out of{" "}
      <span className="tabular-nums">{below.total}</span> {plural}
    </span>
  );
}
