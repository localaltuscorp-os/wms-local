"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  PLAN_WORKING_STATUSES,
  PLAN_RESTRICTED_STATUSES,
  canSetPlanStatus,
  effectivePlanStatus,
  isRestrictedStatus,
  type PlanActor,
  type PlanStatus,
} from "@/lib/project-plan/status";
import { isExecutable, type PlanKind } from "@/lib/project-plan/levels";
import { setPlanNodeStatus } from "@/app/(app)/project-plan/actions";

/**
 * Project Plan — the status cell.
 *
 * ONE control for every level, because the brief describes one status
 * vocabulary for the whole module. What differs is only where the value lands,
 * and that is `setPlanNodeStatus`'s job, not this component's:
 *
 *   Executable row   → the linked WMS task, through `setTaskStatus`
 *   Container row    → project_nodes.status
 *   Restricted value → project_nodes.approval_status (either kind of row)
 *
 * WHAT THIS COMPONENT IS NOT. It is not the permission. It renders only the
 * options `canSetPlanStatus` allows this actor — the same function the server
 * action calls before it writes — so the dropdown and the API can never
 * disagree. But hiding an option is a courtesy, not a control: a doer who POSTs
 * "approved" straight at the action is refused there, and would be refused even
 * if this file did not exist.
 *
 * The restricted verdicts are grouped under their own <optgroup> and marked, so
 * it is visible that Approved / On Hold / Cancelled are a different KIND of
 * decision from a progress report — not just five more items on a list.
 */

/** Every field this cell needs about the row. Structural, so `PlanRow`
 *  satisfies it without a conversion at the call site. */
export interface PlanStatusNode {
  id: string;
  kind: PlanKind;
  ownerId: string | null;
  status: string | null;
  approvalStatus: string | null;
  task: { doerId: string; status: string } | null;
}

/**
 * WHERE a row's working status actually lives.
 *
 * An executable row IS a WMS task, and the task's `status` is the record — the
 * node's own `status` column stays null on those rows precisely so there is no
 * second copy to disagree with it. A container has no task, so it carries its
 * own. Reading the wrong one is how a cell ends up showing "Not Started" beside
 * a chip that says Done, so this is the single place that decides.
 */
export function workingStatusOf(node: PlanStatusNode): string | null {
  if (isExecutable(node.kind) && node.task) return node.task.status;
  return node.status;
}

/**
 * Build the actor for ONE node from the viewer's identity and their downline.
 *
 * The same four predicates `actorFor()` assembles on the server, from the same
 * inputs — the viewer's id and admin flag, plus the set of employees who report
 * to them. Kept in the browser so the picker can decide what to offer without a
 * round-trip per row; the server rebuilds it from the database on every write
 * and never trusts what was rendered here.
 */
export function planActorFor(
  node: PlanStatusNode,
  me: { id: string; isAdmin: boolean },
  downline: ReadonlySet<string>,
): PlanActor {
  const isOwner = node.ownerId === me.id;
  const isDoer = node.task?.doerId === me.id;
  const isSupervisor =
    (!!node.ownerId && downline.has(node.ownerId)) ||
    (!!node.task?.doerId && downline.has(node.task.doerId));
  return { id: me.id, isAdmin: me.isAdmin, isOwner, isDoer, isSupervisor };
}

export function PlanStatusCell({
  node,
  actor,
  /** True when the row's working status lives on a linked task — the cell then
   *  says so in its tooltip, because the change will show up in WMS too. */
  linkedToTask,
}: {
  node: PlanStatusNode;
  actor: PlanActor;
  linkedToTask: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const current = effectivePlanStatus(workingStatusOf(node), node.approvalStatus, false);
  const tone = PLAN_STATUS_TONE[current];

  // Split rather than filtered flat: the two flows are different decisions and
  // the <optgroup> labels are what say so.
  const working = PLAN_WORKING_STATUSES.filter((s) => canSetPlanStatus(actor, s).ok);
  const restricted = PLAN_RESTRICTED_STATUSES.filter(
    // 'archived' is deliberately absent: archiving cascades through children and
    // linked tasks, and the row's own Delete control is the one path to it.
    (s) => s !== "archived" && canSetPlanStatus(actor, s).ok,
  );
  const readOnly = working.length === 0 && restricted.length === 0;

  function choose(next: string) {
    if (next === current) return;
    // Checked here purely to fail fast with the server's own wording; the
    // server re-runs this exact call before it writes.
    const verdict = canSetPlanStatus(actor, next);
    if (!verdict.ok) {
      fireToast({ message: verdict.reason, type: "error" });
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const res = await setPlanNodeStatus({ id: node.id, status: next });
        setBusy(false);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        router.refresh();
      } catch {
        setBusy(false);
        fireToast({
          message: "Couldn't save that status — your session may have expired. Sign in again and retry.",
          type: "error",
        });
        router.refresh();
      }
    })();
  }

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-bold"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
        title="Only the doer, their supervisor or the project owner can change this."
      >
        <Lock size={10} strokeWidth={2.6} aria-hidden />
        {PLAN_STATUS_LABEL[current]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={current}
        disabled={busy}
        onChange={(e) => choose(e.target.value)}
        aria-label="Status"
        title={
          linkedToTask
            ? "This row is a WMS task — changing its status here changes it in WMS and on the board."
            : isRestrictedStatus(current)
              ? "An owner/admin verdict, layered over the progress report underneath."
              : "Status"
        }
        className="max-w-[172px] cursor-pointer truncate rounded border border-transparent px-1.5 py-0.5 text-[11.5px] font-bold outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600]"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
      >
        {/* The row's own value always appears, even when this actor may not
            re-select it — otherwise the select would render blank on a status
            someone with more authority set. */}
        {!working.includes(current as never) && !restricted.includes(current as never) && (
          <option value={current}>{PLAN_STATUS_LABEL[current]}</option>
        )}
        {working.length > 0 && (
          <optgroup label="Progress">
            {working.map((s) => (
              <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>
            ))}
          </optgroup>
        )}
        {restricted.length > 0 && (
          <optgroup label="Owner / admin only">
            {restricted.map((s) => (
              <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>
            ))}
          </optgroup>
        )}
      </select>
      {busy && <Loader2 size={12} className="animate-spin text-ink-subtle" aria-hidden />}
    </span>
  );
}

/** The read-only chip, for surfaces that show a status without editing it. */
export function PlanStatusChip({ status }: { status: PlanStatus }) {
  const tone = PLAN_STATUS_TONE[status];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold"
      style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
    >
      {PLAN_STATUS_LABEL[status]}
    </span>
  );
}
