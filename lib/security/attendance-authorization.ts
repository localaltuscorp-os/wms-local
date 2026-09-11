import "server-only";

import type { Employee } from "@/db/schema";
import type { AttendanceAuthorizationContext } from "@/db/enums";
import { canManageOthersAttendance, ATTENDANCE_OTHERS_REFUSAL } from "@/lib/security/capabilities";
import { resolveDeviceContext } from "@/lib/security/device-access";
import {
  selfCorrectionWindow,
  selfWindowRefusal,
  isMonthLocked,
  monthLockRefusal,
  SELF_CORRECTION_WINDOW_MINUTES,
} from "@/lib/security/attendance-time-rules";

/**
 * THE ONE PLACE AN ATTENDANCE MUTATION IS AUTHORIZED.
 *
 * Every server action and route handler that writes to `attendance_logs` calls
 * {@link authorizeAttendanceMutation} and obeys the answer. The rules are NOT
 * restated anywhere else — not in a page, not in a component, not in a second
 * guard — because a rule with two implementations has two behaviours as soon as
 * one of them is edited.
 *
 * The decision order is the one the requirement lays out:
 *
 *   authenticate → identify device → device authorized? → capabilities →
 *   15-minute self-correction window → monthly lock → privileged override →
 *   allow or reject → (if privileged) write an immutable audit record
 *
 * The last step is the CALLER's, via `lib/security/attendance-audit.ts`: the
 * audit has to record what was actually written, so it happens after the write,
 * with the {@link AttendanceAuthorized} this module returns carried along to
 * describe why it was permitted.
 */

export interface AttendanceMutationRequest {
  /** The signed-in person attempting the change. */
  actor: Employee;
  /** WHOSE attendance is being changed. Equal to `actor.id` for self-correction. */
  targetEmployeeId: string;
  /** The day whose attendance is being changed, "YYYY-MM-DD". */
  logDate: string;
  /** What is being attempted. Shapes the refusal wording only — every action is
   *  authorized by the same rules. */
  action: "create" | "update" | "delete" | "clear";
  /**
   * `logged_at` of the punch as it stands RIGHT NOW, or null when no punch
   * exists yet. This is what the 15-minute window is measured from, and it must
   * be read from the database by the caller — never accepted from the client,
   * which would let a crafted request reopen a window that closed hours ago.
   */
  existingPunchAt?: Date | null;
  /** Pinned by the caller only in tests. Production always uses the server clock. */
  now?: Date;
}

/** What a successful authorization hands back. */
export interface AttendanceAuthorized {
  ok: true;
  context: AttendanceAuthorizationContext;
  /** The approved device row id, or null. Denormalised label/kind travel in
   *  `deviceLabel` / `context.deviceKind` so the audit survives the row. */
  deviceRowId: string | null;
  deviceLabel: string | null;
}

export type AttendanceDecision = AttendanceAuthorized | { ok: false; error: string };

/**
 * May this person make this attendance change, right now, from this device?
 *
 * Returns a plain result rather than throwing, because every caller is a server
 * action whose contract is `{ ok: false, error }` — the message goes straight to
 * the person who tried, and it says which rule refused them.
 */
export async function authorizeAttendanceMutation(
  req: AttendanceMutationRequest,
): Promise<AttendanceDecision> {
  const now = req.now ?? new Date();
  const isSelf = req.targetEmployeeId === req.actor.id;
  const privileged = canManageOthersAttendance(req.actor.email);

  /* ── 1. DEVICE. The request must come from an authorized device. ────────── */
  //
  // requireUser() has already refused an unauthorized device before any server
  // action body runs, so in practice this re-check passes. It is here anyway
  // because this module must be safe to call from anywhere — including a future
  // route handler that forgets the upstream guard — and because the decision it
  // returns is what the audit trail records about the device.
  const device = await resolveDeviceContext(req.actor);
  if (!device.allowed) {
    return { ok: false, error: device.error };
  }

  /* ── 2. WHOSE ATTENDANCE. Another employee's needs the capability. ──────── */
  if (!isSelf && !privileged) {
    return { ok: false, error: ATTENDANCE_OTHERS_REFUSAL };
  }

  /* ── 3. THE LAPTOP RULE for managing someone else's attendance. ─────────── */
  //
  // A privileged manager may use their phone for their OWN attendance and the
  // rest of the WMS, but another employee's attendance may only be changed from
  // their registered laptop. Editing someone else's record is a considered act
  // performed at a desk, not something to be done one-handed on a phone; the
  // narrower surface is the point.
  //
  // A device-exempt actor has no registered device to read a kind from, so the
  // rule cannot be applied to them and is not: their exemption is recorded in
  // the audit context instead, which is the honest account of why it did not.
  if (!isSelf && !device.exempt && device.kind !== "laptop") {
    return {
      ok: false,
      error:
        "Another employee's attendance can only be changed from your registered laptop, " +
        "not from a phone. Use your laptop for this change.",
    };
  }

  /* ── 4. THE MONTHLY LOCK. ───────────────────────────────────────────────── */
  const monthLocked = isMonthLocked(req.logDate, now);
  if (monthLocked && !privileged) {
    return { ok: false, error: monthLockRefusal(req.logDate) };
  }

  /* ── 5. THE 15-MINUTE SELF-CORRECTION WINDOW. ───────────────────────────── */
  //
  // Applies to an unprivileged person changing their OWN punch. A privileged
  // manager is not bound by it — that is what the capability is for — and the
  // audit context records whether the window happened to be open regardless, so
  // a reader can see that a manager acted outside it.
  const window = req.existingPunchAt
    ? selfCorrectionWindow(req.existingPunchAt, now)
    : null;

  if (!privileged) {
    // Nothing on file to correct. `create` is the ordinary punch path and is
    // authorized by the punch rules, not by this window; anything else with no
    // existing punch is asking to modify a record that does not exist.
    if (!req.existingPunchAt) {
      if (req.action !== "create") {
        return { ok: false, error: "There is no punch on that day to change." };
      }
    } else if (!window!.open) {
      return { ok: false, error: selfWindowRefusal(req.existingPunchAt) };
    }
  }

  /* ── 6. ALLOWED. Build the record of WHY. ───────────────────────────────── */
  //
  // A change counts as PRIVILEGED — and so must be audited — when the capability
  // is what made it possible: it targets someone else, or it reached past the
  // monthly lock, or it reached past a closed 15-minute window. A manager
  // correcting their OWN punch inside their own 15 minutes used no privilege and
  // is recorded as ordinary self-correction, because calling it privileged would
  // fill the audit trail with entries that have nothing to explain.
  const usedPrivilege =
    privileged && (!isSelf || monthLocked || (!!req.existingPunchAt && !window!.open));

  const context: AttendanceAuthorizationContext = {
    basis: usedPrivilege ? "privileged" : "self",
    ...(usedPrivilege ? ({ capability: "attendance.manage_others" } as const) : {}),
    onBehalfOfOther: !isSelf,
    selfWindowOpen: window?.open ?? false,
    monthLocked,
    monthLockOverridden: monthLocked && privileged,
    deviceKind: device.kind,
    deviceExempt: device.exempt,
  };

  return {
    ok: true,
    context,
    deviceRowId: device.device?.id ?? null,
    deviceLabel: device.device?.label ?? null,
  };
}

/**
 * Does this authorization describe a PRIVILEGED change — one that must be
 * audited?
 *
 * Every change made on someone else's behalf, and every change that leant on
 * the capability to get past a lock or a closed window. An employee correcting
 * their own punch inside their own 15 minutes is ordinary use and is not
 * audited here; the punch row itself already records it.
 */
export function isPrivilegedChange(context: AttendanceAuthorizationContext): boolean {
  return context.basis === "privileged";
}

/** Re-exported so callers need one import for the whole rule set. */
export { SELF_CORRECTION_WINDOW_MINUTES };
