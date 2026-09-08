"use client";

import { syncDayPunch } from "@/app/(app)/attendance/actions";
import { fireToast } from "@/lib/toast";

/**
 * The client half of Start My Day → Check In / Finish My Day → Check Out.
 *
 * Shared by every surface that owns those two buttons (the planner board, the
 * My Day board, the day-review card) so the automation behaves identically
 * wherever the day is started from, and so a new surface cannot quietly ship a
 * fourth variation of it.
 *
 * ── WHY THE LOCATION IS FETCHED HERE ───────────────────────────────────────
 * A GPS fix only exists in the browser, and `punchAttendance` rejects a punch
 * that misses the office geofence when one is configured. So the fix has to be
 * read on the client and handed to the server, exactly as the Attendance page's
 * punch card does. It is BEST EFFORT: if the user declines, has no sensor, or
 * the fix times out, we punch without it and let the server decide — the server
 * accepts it when no fence is set and refuses it when one is, which is the same
 * answer the manual button would have given.
 *
 * ── NEVER BLOCKS THE DAY ───────────────────────────────────────────────────
 * Starting the day and clocking in are separate concerns, and the clock-in is
 * the one with gates on it (geofence, office network, the ritual gates). If it
 * refuses, the day still starts and the user is told why in a toast with a link
 * to the Attendance page. Swallowing the failure silently would be worse: they
 * would believe they were clocked in when they were not.
 */

export type PunchKind = "in" | "out";

interface Coords {
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * A GPS fix, or undefined. Never rejects and never waits long — this sits in
 * front of a button the user has already pressed, so a slow sensor must not
 * leave them staring at a spinner.
 */
export function bestEffortLocation(timeoutMs = 8000): Promise<Coords | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(undefined);
      return;
    }
    // Our own guard as well as the browser's: some platforms simply never
    // invoke either callback when permission is in an odd state.
    let settled = false;
    const done = (c: Coords | undefined) => {
      if (settled) return;
      settled = true;
      resolve(c);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timer);
        done(undefined);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** "2026-08-24T10:04:31Z" → "10:04 AM" in the viewer's own locale. */
function clockLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Fire the matching punch for a day that has just been started or finished.
 *
 * Resolves once the attempt is done. Returns whether the employee is now
 * punched for that kind, so a caller can reflect it in its own UI; it never
 * throws, so `void autoPunch(...)` after the day action is safe.
 */
export async function autoPunch(kind: PunchKind): Promise<boolean> {
  try {
    const location = await bestEffortLocation();
    const res = await syncDayPunch({ kind, location });

    if (!res.ok) {
      fireToast({
        message:
          `${kind === "in" ? "Checked in" : "Checked out"} did not go through - ${res.error}`,
        type: "error",
      });
      return false;
    }

    const at = clockLabel(res.at);

    // Already on file — a manual punch, or a second click. Say so plainly and
    // quietly; nothing went wrong and nothing was duplicated.
    if (res.already) {
      fireToast({
        message: at
          ? `Already checked ${kind} at ${at} - kept that record.`
          : `Already checked ${kind} today - kept that record.`,
      });
      return true;
    }

    fireToast({
      message:
        kind === "in"
          ? at
            ? `Checked in at ${at} - have a great day!`
            : "Checked in - have a great day!"
          : at
            ? `Checked out at ${at}. See you tomorrow!`
            : "Checked out. See you tomorrow!",
    });
    return true;
  } catch {
    fireToast({
      message: `Couldn't reach attendance to check ${kind}. Open Attendance to do it manually.`,
      type: "error",
    });
    return false;
  }
}
