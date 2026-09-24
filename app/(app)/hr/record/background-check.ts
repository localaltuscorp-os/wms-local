"use server";

import { requireHrStaff } from "@/lib/hr/access";
import { backgroundCheckStateOf, setBackgroundCheck, type BackgroundCheckStatus } from "@/lib/hr/background-check";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export interface BackgroundCheckResult {
  /** null when neither decided yet, "yes"/"no" once it is. */
  status: BackgroundCheckStatus;
  at: string | null;
  /** false on a database that hasn't run migration 0248 yet — the card hides itself. */
  available: boolean;
}

/** This person's Background Check status, for the HR Record hub. */
export async function getBackgroundCheckStatus(
  employeeId: string,
): Promise<{ ok: true; result: BackgroundCheckResult } | { ok: false; error: string }> {
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(employeeId)) return { ok: false, error: "Invalid person." };

  const state = await backgroundCheckStateOf(employeeId);
  if (state === null) {
    return { ok: true, result: { status: null, at: null, available: false } };
  }
  return { ok: true, result: { status: state.status, at: state.at ? state.at.toISOString() : null, available: true } };
}

/**
 * Record the confirmed decision. "yes" is a ONE-WAY DOOR — once a person's
 * status is "yes" on file, this refuses to change it again (from either the
 * client or a stale request), so a completed check can't be quietly reversed
 * through the same control that recorded it. "no" stays freely re-settable.
 */
export async function setBackgroundCheckStatus(
  employeeId: string,
  status: "yes" | "no",
): Promise<{ ok: true; result: BackgroundCheckResult } | { ok: false; error: string }> {
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(employeeId)) return { ok: false, error: "Invalid person." };

  const current = await backgroundCheckStateOf(employeeId);
  if (current === null) return { ok: false, error: "Background Check isn't available on this database yet." };
  if (current.status === "yes") {
    return { ok: false, error: "Background Check is already marked done and can't be changed." };
  }

  const wrote = await setBackgroundCheck(employeeId, status);
  if (!wrote) return { ok: false, error: "Couldn't save — try again." };

  const next = await backgroundCheckStateOf(employeeId);
  if (next === null) return { ok: false, error: "Couldn't save — try again." };
  return { ok: true, result: { status: next.status, at: next.at ? next.at.toISOString() : null, available: true } };
}
