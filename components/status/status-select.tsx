"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import { statusBadgeStyle } from "@/lib/format";
import { StatusBadge, StatusListbox } from "@/components/status/status-listbox";
import {
  DOER_STATUSES,
  DOER_STATUS_BADGE,
  DOER_STATUS_LABEL,
  INITIATOR_STATUSES,
  INITIATOR_STATUS_BADGE,
  INITIATOR_STATUS_LABEL,
  NO_VERDICT_BADGE,
  canSetDoerStatus,
  canSetInitiatorStatus,
  effectiveDoerStatus,
  effectiveInitiatorStatus,
  isDoerStatus,
  isInitiatorStatus,
  type DoerStatus,
  type InitiatorStatus,
  type StatusActor,
} from "@/lib/status/axes";

/**
 * THE TWO STATUS CONTROLS — one look, one vocabulary, every module.
 *
 * Manan, 2026-09-15: "where you see the doer status please replace with this
 * and same for initiator", against a screenshot of the verdict dropdown —
 * No Verdict · Approved · Not Approved · On Hold · Archived.
 *
 * WHAT THIS REPLACES. Doer status was drawn four different ways across the app,
 * and two of them offered the wrong list: the Goals table's picker was built on
 * `ADMIN_TASK_STATUSES`, which is every non-deprecated value in the column —
 * so an admin editing a goal's PROGRESS was offered "Approved", "Not approved",
 * "Cancelled" and "Transferred" as if they were progress. Those are the
 * initiator's verdicts and they have a control of their own; offering them on
 * the doer axis is what the two-axis split (lib/status/axes.ts) exists to stop.
 * Here the doer list is DOER_STATUSES and nothing else, for everyone.
 *
 * WHY ONE FILE FOR BOTH AXES. They are read side by side in every table that
 * shows them, so they have to look like a matched pair — same height, same
 * border, same type. Two files drifted apart once already (a pill in one place,
 * a bare select in another); one shell they both render through cannot.
 *
 * THE COLOURED PILL, not a native `<select>` — changed 2026-09-16.
 *
 *   This rendered a browser `<select>` for a year, on the reasoning that these
 *   sit in horizontally-scrolling tables where a custom popover fights the
 *   scroll container's clipping. That reasoning was sound and the conclusion
 *   was still wrong, because Tasks had ALREADY solved the clipping — its
 *   picker (components/tasks/inline-status-cell.tsx) portals the menu out with
 *   Radix — and so the app shipped two different controls for one idea. Worse,
 *   the native box could only show the status as coloured TEXT, so the dots
 *   that distinguish the seven doer states existed on Tasks and nowhere else.
 *
 *   Manan, 2026-09-16, against a screenshot of the Tasks menu: "i want same for
 *   goals and project module ... same colour same". Both controls now render
 *   components/status/status-listbox.tsx, the same file Tasks renders, so there
 *   is one pill, one menu and one palette rather than a third copy to drift.
 *
 * NEITHER CONTROL IS THE PERMISSION. Each renders only what `canSet…Status`
 * allows — the same functions the server actions re-run before they write. A
 * hidden option is a courtesy; the action is the control.
 *
 * THE WRITE IS A PROP. Tasks, Goals, Weekly Goals, Daily Goals and Project rows
 * are five tables with five server actions; a switch on a module name inside a
 * presentational component would be the alternative. Callers pass `onCommit`.
 */

export type StatusCommit = (next: string) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Run a commit with the optimistic flip, the toast and the refresh.
 *
 * Shared because getting this wrong the same way twice is the point of having
 * one component: on failure the control must go BACK, not sit showing a value
 * the database refused.
 */
function useCommit<T extends string>(
  current: T | null,
  onCommit: StatusCommit,
  labelOf: (v: T) => string,
) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [optimistic, setOptimistic] = React.useState<T | null | undefined>(undefined);
  const shown = optimistic === undefined ? current : optimistic;

  const choose = React.useCallback(
    async (next: T) => {
      if (next === shown) return;
      const before = shown;
      setOptimistic(next);
      setBusy(true);
      const res = await onCommit(next);
      setBusy(false);
      if (!res.ok) {
        setOptimistic(before);
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({ type: "success", message: `Marked ${labelOf(next)}.` });
      router.refresh();
    },
    [shown, onCommit, labelOf, router],
  );

  return { shown, busy, choose };
}

/** Title-case a raw enum value, for a legacy status with no label of its own. */
function prettify(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* ───────────────────────────── the doer axis ───────────────────────────── */

export interface DoerStatusSelectProps {
  /** The stored value, exactly as the row holds it. Anything off the axis (a
   *  legacy verdict sitting in a `status` column) is shown as an extra option
   *  rather than silently swapped for the default. */
  status: string | null;
  actor: StatusActor;
  onCommit: StatusCommit;
  /** Squeeze it down for a narrow card — see the listbox's `compact`. */
  compact?: boolean;
  /** Render a locked chip instead of nothing when the viewer may not report. */
  readOnlyFallback?: boolean;
  className?: string;
}

/** Not Read · Not Started · Initiated · Follow Up · Need Info · Done · Abandoned. */
export function DoerStatusSelect({
  status,
  actor,
  onCommit,
  compact,
  readOnlyFallback = true,
  className,
}: DoerStatusSelectProps) {
  const stored = effectiveDoerStatus(status);
  const { shown, busy, choose } = useCommit<DoerStatus>(
    stored,
    onCommit,
    (v) => DOER_STATUS_LABEL[v],
  );
  const canReport = canSetDoerStatus(actor, "initiated").ok;
  const current = shown ?? "not_started";

  // A value the column holds that is not on this axis — one of the legacy
  // verdicts migration 0225 could not reach. Kept visible so the pill never
  // misreports the row as "Not Started" just because the list moved on.
  const orphan =
    status && !isDoerStatus(status)
      ? { value: status, label: prettify(status), style: statusBadgeStyle(null) }
      : null;
  const shownValue = orphan && shown === stored ? orphan.value : current;
  const shownStyle = isDoerStatus(shownValue)
    ? DOER_STATUS_BADGE[shownValue]
    : (orphan?.style ?? DOER_STATUS_BADGE.not_started);

  const options = React.useMemo(
    () =>
      DOER_STATUSES.map((s) => ({
        value: s,
        label: DOER_STATUS_LABEL[s],
        style: DOER_STATUS_BADGE[s],
      })),
    [],
  );

  if (!canReport) {
    if (!readOnlyFallback) return null;
    return (
      <StatusBadge
        label={orphan ? orphan.label : DOER_STATUS_LABEL[current]}
        style={shownStyle}
        ariaLabel={`Doer status: ${orphan ? orphan.label : DOER_STATUS_LABEL[current]}`}
        title="Only the doer, their supervisor or the initiator can update progress"
        locked
        compact={compact}
        className={className}
      />
    );
  }

  return (
    <StatusListbox
      ariaLabel="Doer status"
      title="Where this work is, reported by the person holding it."
      value={shownValue}
      placeholder="Not Started"
      placeholderStyle={DOER_STATUS_BADGE.not_started}
      options={options}
      orphan={orphan}
      busy={busy}
      compact={compact}
      onPick={(v) => {
        if (isDoerStatus(v)) void choose(v);
      }}
      className={className}
    />
  );
}

/* ─────────────────────────── the initiator axis ─────────────────────────── */

export interface InitiatorStatusSelectProps {
  /** Stored verdict, exactly as the row holds it (null when unruled). */
  approvalStatus: string | null;
  /** This module's archive flag — `archived`, `archived_at != null`, or
   *  `is_archived`. See the table in lib/status/axes.ts. */
  archived: boolean;
  actor: StatusActor;
  onCommit: StatusCommit;
  /** Squeeze it down for a narrow card — see the listbox's `compact`. */
  compact?: boolean;
  /** Render a locked chip instead of nothing when the viewer may not rule. */
  readOnlyFallback?: boolean;
  /**
   * Drop "Archived" from the list — for the ONE surface where archiving is not
   * a dropdown-sized decision.
   *
   * The Project Plan's Archive CASCADES: it takes every row beneath the one you
   * picked and archives their linked WMS tasks with them. That board keeps the
   * gesture behind its own Archive control, which counts what it is about to
   * take and says so first. Offering the same thing here, with no warning and
   * one click from Approved, would be a different and much worse control that
   * happened to share a name.
   *
   * Everywhere else Archived is exactly what it looks like — file this one row
   * away — so this stays a narrow, named exception rather than a default.
   */
  hideArchived?: boolean;
  className?: string;
}

/** No Verdict · Approved · Not Approved · On Hold · Archived. */
export function InitiatorStatusSelect({
  approvalStatus,
  archived,
  actor,
  onCommit,
  compact,
  readOnlyFallback = true,
  hideArchived = false,
  className,
}: InitiatorStatusSelectProps) {
  const stored = effectiveInitiatorStatus(approvalStatus, archived);
  const { shown, busy, choose } = useCommit<InitiatorStatus>(
    stored,
    onCommit,
    (v) => INITIATOR_STATUS_LABEL[v],
  );
  const canRule = canSetInitiatorStatus(actor, "approved").ok;
  const shownStyle = shown ? INITIATOR_STATUS_BADGE[shown] : NO_VERDICT_BADGE;

  const options = React.useMemo(
    () =>
      INITIATOR_STATUSES.filter((s) => !(hideArchived && s === "archived")).map((s) => ({
        value: s,
        label: INITIATOR_STATUS_LABEL[s],
        style: INITIATOR_STATUS_BADGE[s],
      })),
    [hideArchived],
  );

  if (!canRule) {
    if (!readOnlyFallback) return null;
    const label = shown ? INITIATOR_STATUS_LABEL[shown] : "No Verdict";
    return (
      <StatusBadge
        label={label}
        style={shownStyle}
        ariaLabel={`Initiator status: ${label}`}
        title="Only the initiator or an administrator can rule on this"
        locked
        compact={compact}
        className={className}
      />
    );
  }

  return (
    <StatusListbox
      ariaLabel="Initiator status"
      title="The initiator's ruling — separate from the progress reported beside it."
      value={shown ?? ""}
      placeholder="No Verdict"
      placeholderStyle={NO_VERDICT_BADGE}
      options={options}
      // A row that IS archived on the board that hides Archived still has to
      // show what it is; it just cannot be re-picked from here.
      orphan={
        hideArchived && shown === "archived"
          ? {
              value: "archived",
              label: INITIATOR_STATUS_LABEL.archived,
              style: INITIATOR_STATUS_BADGE.archived,
            }
          : null
      }
      busy={busy}
      compact={compact}
      onPick={(v) => {
        if (isInitiatorStatus(v)) void choose(v);
      }}
      className={className}
    />
  );
}
