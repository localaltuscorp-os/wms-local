"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  DEFAULT_PLAN_STATUS,
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  PLAN_WORKING_STATUSES,
  approverActorOf,
  canSetPlanStatus,
  isWorkingStatus,
  isSelfRaisedNode,
  type PlanActor,
  type PlanStatus,
} from "@/lib/project-plan/status";
import { approverDisplay, selectableApproverChoices } from "@/lib/status/approver-status";
import { ApproverChip } from "@/components/status/approver-chip";
import { isExecutable, type PlanKind } from "@/lib/project-plan/levels";
import { setPlanNodeStatus } from "@/app/(app)/project-plan/actions";

/**
 * Project Plan — the two status cells, the same pair WMS Tasks and Goals show
 * (account holder, 2026-09-15):
 *
 *   DOER STATUS                  PlanStatusCell  — the working flow, a progress
 *                                report: Not Read … Done.
 *   INITIATOR STATUS             PlanApproverCell — the ruling: Pending ·
 *                                Approved · Not Approved · On Hold · Cancelled.
 *
 * Where each value lands is `setPlanNodeStatus`'s job:
 *   Executable row   → the linked WMS task, through `setTaskStatus`
 *   Container row    → project_nodes.status
 *   A ruling         → project_nodes.approval_status (either kind of row)
 *
 * Neither cell is the permission. Each renders only what the shared rule allows
 * this viewer — the same function the server action calls before it writes.
 */

/** Every field these cells need about the row. Structural, so `PlanRow`
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
 * WHERE a row's working status actually lives: the linked task on an
 * executable row, the node itself on a container.
 */
export function workingStatusOf(node: PlanStatusNode): string | null {
  if (isExecutable(node.kind) && node.task) return node.task.status;
  return node.status;
}

/** The Doer Status a row shows. A task approved or rejected in WMS was Done. */
export function doerStatusOf(node: PlanStatusNode): PlanStatus {
  const raw = workingStatusOf(node);
  if (raw && isWorkingStatus(raw)) return raw;
  if (raw === "approved" || raw === "not_approved") return "done";
  return DEFAULT_PLAN_STATUS;
}

/**
 * Build the actor for ONE node from the viewer's identity and their downline —
 * the same predicates `actorFor()` assembles on the server, which never trusts
 * what was rendered here.
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
  return {
    id: me.id,
    isAdmin: me.isAdmin,
    isOwner,
    isDoer,
    isSupervisor,
    isSelfRaised: isSelfRaisedNode(node),
  };
}

/** DOER STATUS — the progress report. */
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

  const current = doerStatusOf(node);
  const tone = PLAN_STATUS_TONE[current];
  const working = PLAN_WORKING_STATUSES.filter((s) => canSetPlanStatus(actor, s).ok);

  function choose(next: string) {
    if (next === current) return;
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

  if (working.length === 0) {
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
        aria-label="Doer Status"
        title={
          linkedToTask
            ? "This row is a WMS task — changing its status here changes it in WMS and on the board."
            : "Doer Status"
        }
        className="max-w-[172px] cursor-pointer truncate rounded border border-transparent px-1.5 py-0.5 text-[11.5px] font-bold outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600]"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
      >
        {!working.includes(current as never) && (
          <option value={current}>{PLAN_STATUS_LABEL[current]}</option>
        )}
        {working.map((s) => (
          <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>
        ))}
      </select>
      {busy && <Loader2 size={12} className="animate-spin text-ink-subtle" aria-hidden />}
    </span>
  );
}

/** APPROVER / INITIATOR STATUS — the ruling on the row. */
export function PlanApproverCell({ node, actor }: { node: PlanStatusNode; actor: PlanActor }) {
  const router = useRouter();
  return (
    <ApproverChip
      shown={approverDisplay(node.approvalStatus, actor.isSelfRaised)}
      choices={selectableApproverChoices(approverActorOf(actor), doerStatusOf(node))}
      lockedTitle="Only the project owner, the doer's manager or an admin can change this."
      onPick={async (choice) => {
        try {
          const res = await setPlanNodeStatus({ id: node.id, status: choice });
          if (!res.ok) return res.error;
          router.refresh();
          return null;
        } catch {
          return "Couldn't save — your session may have expired. Sign in again and retry.";
        }
      }}
    />
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
