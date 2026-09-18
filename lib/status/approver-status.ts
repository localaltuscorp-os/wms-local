/**
 * INITIATOR STATUS — one vocabulary for WMS Tasks, Goals and
 * Projects (account holder, 2026-09-15).
 *
 * Every piece of work carries TWO statuses, shown side by side:
 *
 *   DOER STATUS                 Not Read · Not Started · Initiated · Follow Up ·
 *                               Need Info · Done — the person doing the work
 *                               says where it is (DOER_TASK_STATUSES).
 *
 *   INITIATOR STATUS            Pending · Approved · Not Approved · On Hold ·
 *                               Archived · Cancelled — the ruling ON the work,
 *                               by the person who asked for it or has authority
 *                               over the doer.
 *
 * "Pending" is the absence of a ruling (a null in storage), not a stored value.
 *
 * WHO MAY RULE: the initiator, the doer's manager (anyone above them), or an
 * admin — and never the doer on their own work. Approved / Not Approved judge
 * finished work, so they wait for the Doer Status to reach Done; On Hold,
 * Archived and Cancelled can be ruled at any point.
 *
 * SELF-RAISED WORK HAS NO APPROVER. When the initiator IS the doer — somebody
 * raised this for themselves — the column reads "Not Applicable" and only an
 * admin may overrule (account holder, 2026-09-16). Before this, Goals let the
 * raiser approve their own goal while Tasks did not; the two now agree.
 *
 * Pure and client-safe: each module's server action calls `canSetApproverStatus`
 * before writing, and each table calls it to decide what to offer, so a
 * dropdown can never offer what the server refuses.
 */

export const APPROVER_STATUSES = ["approved", "not_approved", "on_hold", "archived", "cancelled"] as const;
export type ApproverStatus = (typeof APPROVER_STATUSES)[number];

/** No ruling yet. Stored as null. */
export const APPROVER_PENDING = "pending" as const;
export type ApproverChoice = ApproverStatus | typeof APPROVER_PENDING;

/** What the dropdown lists, in order. */
export const APPROVER_CHOICES: readonly ApproverChoice[] = [APPROVER_PENDING, ...APPROVER_STATUSES];

/**
 * What the column can READ, beyond what it can be SET to.
 *
 * `transferred` is a legacy task verdict still sitting on old rows.
 * `not_applicable` is never stored at all — it is what self-raised work shows,
 * derived from the row, so no migration ever has to write it anywhere.
 */
export const APPROVER_NOT_APPLICABLE = "not_applicable" as const;
export type ApproverShown = ApproverChoice | "transferred" | typeof APPROVER_NOT_APPLICABLE;

export const APPROVER_LABEL: Record<ApproverShown, string> = {
  pending: "Pending",
  approved: "Approved",
  not_approved: "Not Approved",
  on_hold: "On Hold",
  archived: "Archived",
  cancelled: "Cancelled",
  transferred: "Transferred",
  not_applicable: "Not Applicable",
};

/** Chip colours — Approved purple and Not Approved rose, as the WMS status palette has them. */
export const APPROVER_TONE: Record<ApproverShown, string> = {
  pending: "#94A3B8",
  approved: "#7C3AED",
  not_approved: "#E11D48",
  on_hold: "#64748B",
  archived: "#0F766E",
  cancelled: "#78716C",
  transferred: "#92400E",
  not_applicable: "#94A3B8",
};

const CHOICES: ReadonlySet<string> = new Set(APPROVER_CHOICES);

export function isApproverChoice(v: unknown): v is ApproverChoice {
  return typeof v === "string" && CHOICES.has(v);
}

/** A stored value (null / verdict / legacy) → what the chip shows. */
export function approverShown(stored: string | null | undefined): ApproverShown {
  if (stored === "transferred") return "transferred";
  return isApproverChoice(stored) ? stored : APPROVER_PENDING;
}

/**
 * What the column reads once self-raised work is taken into account.
 *
 * Self-raised work has no approver, so an UNRULED row reads "Not Applicable"
 * rather than "Pending" — nobody is being waited on. A row an admin has already
 * ruled on still shows that ruling: Goals used to let the raiser approve their
 * own goal, so such rows exist, and hiding a stored verdict behind "Not
 * Applicable" would make an admin's override look like it did nothing.
 */
export function approverDisplay(
  stored: string | null | undefined,
  isSelfRaised: boolean,
): ApproverShown {
  const shown = approverShown(stored);
  return isSelfRaised && shown === APPROVER_PENDING ? APPROVER_NOT_APPLICABLE : shown;
}

/** A choice → what to store (Pending clears the ruling). */
export function approverStored(choice: ApproverChoice): ApproverStatus | null {
  return choice === APPROVER_PENDING ? null : choice;
}

/**
 * The actor, relative to ONE piece of work. Each module resolves these from its
 * own records:
 *   Task    — initiator = tasks.initiator_id · doer = tasks.doer_id
 *   Goal    — initiator = goals.created_by_id · doer = the goal's owner
 *   Project — initiator = the row's owner     · doer = the linked task's doer
 * `isDoersManager` means the doer sits anywhere below the actor.
 *
 * `isSelfRaised` means the initiator and the doer are the SAME person, so there
 * is no approver to wait on. Every module sets it from its own two ids rather
 * than by fudging `isDoer`, which is what the two modules used to do
 * differently and is why they disagreed.
 */
export interface ApproverActor {
  isAdmin: boolean;
  isInitiator: boolean;
  isDoersManager: boolean;
  isDoer: boolean;
  /** The work was raised by the person doing it — nobody is approving it. */
  isSelfRaised: boolean;
}

export const APPROVER_REFUSAL_WHO =
  "Only the initiator, the doer's manager or an admin can set the Initiator Status.";
export const APPROVER_REFUSAL_DOER = "The doer can't set the Initiator Status of their own work.";
export const APPROVER_REFUSAL_NOT_DONE = "Approve or reject only after the Doer Status is Done.";
export const APPROVER_REFUSAL_SELF_RAISED =
  "This was raised by the person doing it, so the Initiator Status doesn't apply. Only an admin can overrule.";

export function canSetApproverStatus(
  actor: ApproverActor,
  next: string,
  doerStatus: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!isApproverChoice(next)) return { ok: false, reason: `"${next}" is not an Initiator Status.` };
  /* Self-raised work first, because on such a row the initiator IS the doer —
     the two checks below would otherwise argue with each other, and which one
     answered would depend on their order. Only an admin overrules. */
  if (actor.isSelfRaised) {
    if (!actor.isAdmin) return { ok: false, reason: APPROVER_REFUSAL_SELF_RAISED };
  } else {
    if (actor.isDoer) return { ok: false, reason: APPROVER_REFUSAL_DOER };
    if (!(actor.isAdmin || actor.isInitiator || actor.isDoersManager)) {
      return { ok: false, reason: APPROVER_REFUSAL_WHO };
    }
  }
  if ((next === "approved" || next === "not_approved") && doerStatus !== "done") {
    return { ok: false, reason: APPROVER_REFUSAL_NOT_DONE };
  }
  return { ok: true };
}

/** May this actor rule at all (for showing the chip as editable)? */
export function canRuleOn(actor: ApproverActor): boolean {
  if (actor.isSelfRaised) return actor.isAdmin;
  return !actor.isDoer && (actor.isAdmin || actor.isInitiator || actor.isDoersManager);
}

/* ── WMS tasks: reading the two columns without moving old data ─────────── */

const LEGACY_VERDICTS: ReadonlySet<string> = new Set(["approved", "not_approved", "cancelled", "transferred"]);

/**
 * A task's Initiator Status as shown. Before this column existed the
 * verdict was often written into `tasks.status` (approved / not_approved /
 * cancelled / transferred) and holds into `status = on_hold`; those rows are
 * left untouched (account holder, 2026-09-15 — "columns now, data later"), so
 * the chip reads them from wherever they are.
 */
export function taskApproverShown(
  approvalStatus: string | null | undefined,
  status: string | null | undefined,
  /** Initiator and doer are the same person — an unruled row reads N/A. */
  isSelfRaised = false,
): ApproverShown {
  if (approvalStatus) return approverShown(approvalStatus);
  if (status && (LEGACY_VERDICTS.has(status) || status === "on_hold")) return approverShown(status);
  return isSelfRaised ? APPROVER_NOT_APPLICABLE : APPROVER_PENDING;
}

/**
 * A task's Doer Status as shown. Approved / Not Approved in `tasks.status` are
 * rulings on DONE work, so the doer's side of such a row reads Done.
 */
export function taskDoerShown<S extends string>(status: S): S | "done" {
  return status === "approved" || status === "not_approved" ? "done" : status;
}

/** The choices this actor may pick right now, for the dropdown. */
export function selectableApproverChoices(actor: ApproverActor, doerStatus: string | null | undefined): ApproverChoice[] {
  return APPROVER_CHOICES.filter((c) => canSetApproverStatus(actor, c, doerStatus).ok);
}
