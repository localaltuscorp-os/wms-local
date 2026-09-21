"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DOER_TASK_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";
import { STATUS_TONES_FALLBACK, statusBadgeStyle } from "@/lib/format";
import { StatusBadge, StatusListbox } from "@/components/status/status-listbox";

interface Props {
  taskId: string;
  status: TaskStatus;
  updatedAt: Date;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  /** No longer changes the option list — everyone now picks from the same six
   *  DOER_TASK_STATUSES. Kept because every call site passes it and the server
   *  still branches on the actor's role when validating the transition. */
  isAdmin: boolean;
  /** When false, the cell renders a STATIC status badge (no dropdown) — the
   *  current user isn't allowed to change this task's status. */
  editable: boolean;
}

/**
 * Click-to-edit status chip for the tasks table. Server-side action
 * `setTaskStatus` validates the transition (canTransitionTo) and the
 * optimistic-lock, so the client just needs to ship the request and react to
 * ok / error.
 *
 * THE PILL AND THE MENU LIVE IN components/status/status-listbox.tsx. They were
 * hand-rolled here first — this was the only picker in the app with the dots —
 * and Goals and Project Plan had a native `<select>` instead. Manan, 2026-09-16,
 * against a screenshot of this menu: "i want same for goals and project module
 * ... same colour same". Rather than copy 150 lines of popover into the shared
 * control, the popover moved OUT and this renders it too, so the three modules
 * cannot drift again. What stays here is what is genuinely Tasks-only: the
 * optimistic-lock token, `setTaskStatus`, and the admin-renamed labels.
 */
export function InlineStatusCell({
  taskId,
  status,
  updatedAt,
  labels,
  tones,
  editable,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  // Track the optimistic value so the chip flips immediately while the
  // server confirms; rolls back on error.
  const [shown, setShown] = React.useState<TaskStatus>(status);
  React.useEffect(() => setShown(status), [status]);
  // Hold the optimistic-lock token CLIENT-SIDE so a rapid second flip uses the
  // fresh `updatedAt` the server just returned — without waiting for a full
  // refresh to re-prop it (Operation Butter P1). Re-syncs whenever the row's
  // server `updatedAt` changes (e.g. a realtime reconcile or someone else's
  // edit).
  const [lockAt, setLockAt] = React.useState(updatedAt.toISOString());
  React.useEffect(() => setLockAt(updatedAt.toISOString()), [updatedAt]);

  // ONE list for everybody — the six doer statuses. Admins used to get
  // ADMIN_TASK_STATUSES here, which mixed the worker's progress states in with
  // `on_hold` and the approval verdicts and made this chip do two unrelated
  // jobs. The manager's rulings now live in their own "Manager Status" control, so
  // this dropdown answers exactly one question: how far along is the work?
  //
  // A row already sitting on a status outside the list (a legacy `approved`,
  // say) still RENDERS it — `shown` is drawn from the row, not from `options` —
  // it just can't be re-selected here.
  //
  // `||` (not `??`) on the tone so an empty/blank token also falls back to the
  // canonical per-status colour: every status renders coloured.
  const options = React.useMemo(
    () =>
      DOER_TASK_STATUSES.map((s) => ({
        value: s,
        label: labels[s] ?? s,
        style: statusBadgeStyle(tones[s] || STATUS_TONES_FALLBACK[s]),
      })),
    [labels, tones],
  );

  const shownLabel = labels[shown] ?? shown;
  const shownStyle = statusBadgeStyle(tones[shown] || STATUS_TONES_FALLBACK[shown]);
  // A status the row holds that is no longer offered — shown so the pill
  // reports the row rather than the list.
  const orphan = DOER_TASK_STATUSES.includes(shown as (typeof DOER_TASK_STATUSES)[number])
    ? null
    : { value: shown, label: shownLabel, style: shownStyle };

  async function pick(next: string) {
    if (next === shown) return;
    const prev = shown;
    setShown(next as TaskStatus);
    setPending(true);
    try {
      const res = await setTaskStatus(taskId, next as TaskStatus, lockAt);
      if (!res.ok) {
        setShown(prev);
        const msg =
          res.error === "forbidden"
            ? "Not allowed to make that transition."
            : res.error === "stale"
              ? "This row was changed elsewhere — refreshing."
              : res.message ?? "Could not update status.";
        fireToast({ message: msg });
        // Stale = our token is behind the row; pull the truth right away.
        if (res.error === "stale") router.refresh();
      } else {
        // Advance the lock token so a follow-up flip needs no refresh first.
        setLockAt(res.updatedAt);
        fireToast({ message: `Doer status set to ${labels[next as TaskStatus] ?? next}.` });
        // The chip already flipped optimistically; reconcile server-derived
        // fields (late badge, stat cards) in ONE coalesced background refresh
        // instead of a full re-fetch on every click.
        scheduleReconcile(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  // Not editable by this user (not admin / not their task, or terminal status)
  // → render a STATIC coloured badge. No dropdown, no chevron, not clickable.
  if (!editable) {
    return (
      <StatusBadge
        label={shownLabel}
        style={shownStyle}
        ariaLabel={`Doer status: ${shownLabel}`}
      />
    );
  }

  return (
    <StatusListbox
      ariaLabel="Doer status"
      value={shown}
      placeholder={shownLabel}
      placeholderStyle={shownStyle}
      options={options}
      orphan={orphan}
      busy={pending}
      onPick={(next) => void pick(next)}
    />
  );
}
