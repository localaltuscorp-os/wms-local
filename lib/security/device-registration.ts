import "server-only";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices, deviceConsentEvents, type Employee } from "@/db/schema";
import type { DeviceKind } from "@/db/enums";
import { deviceRestrictionRequired } from "@/lib/security/capabilities";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  deviceAccessEnforced,
  describeRequestDevice,
  hasApprovedDeviceOfKind,
} from "@/lib/security/device-access";
import {
  DEVICE_CONSENT_TYPE,
  DEVICE_CONSENT_VERSION,
  describePlatform,
  optionalText,
  requiresDeviceName,
  validateDeviceName,
  type DevicePlatform,
} from "@/lib/security/device-registration-rules";

/**
 * FIRST-LOGIN DEVICE REGISTRATION (0222).
 *
 * ── WHAT THIS ADDS, AND WHAT IT DOES NOT TOUCH ─────────────────────────────
 * It adds one step in front of an UNREGISTERED device: a modal the employee
 * must complete. It does not change how a device is identified (still the
 * server-minted `device_id` in an httpOnly cookie), how access is decided
 * (still `resolveDeviceContext`), or the cap (still one approved laptop AND one
 * approved phone, enforced in the database since 0215).
 *
 * ── WHY A ROW ALREADY EXISTS BY THE TIME THE MODAL IS SEEN ─────────────────
 * `adoptDeviceOnLogin` runs during sign-in and `enroll()` inserts a row on
 * first sight — so an employee who has reached the application already has a
 * device row, typically `approved` via auto-adopt, with `registered_at` NULL.
 * Registration therefore UPDATES that row in the normal case. The insert branch
 * exists for the paths that reach here without one (an exempt actor whose slots
 * were full, auto-adopt off), not as the expected case.
 */

export type PendingRegistration = {
  kind: DeviceKind;
  platform: DevicePlatform;
  /** The row to complete, when one already exists. */
  deviceRowId: string | null;
  deviceId: string | null;
  needsDeviceName: boolean;
  consentVersion: string;
};

async function readDeviceCookieValue(): Promise<string | null> {
  try {
    const v = (await cookies()).get(DEVICE_COOKIE)?.value?.trim();
    return v && v.length <= 200 ? v : null;
  } catch {
    return null;
  }
}

async function currentUserAgent(): Promise<string> {
  try {
    return (await headers()).get("user-agent") ?? "";
  } catch {
    return "";
  }
}

/**
 * Does this employee, on THIS device, have to register before using the app?
 *
 * Returns null — meaning "no modal" — in every one of these cases:
 *
 *  · Device enforcement is off entirely. Blocking on a registration the gate
 *    will not consult afterwards would make the master switch a half-measure.
 *  · The actor is device-exempt. This is the anywhere-login exception: its whole
 *    point is signing in from a machine nobody has registered, so a blocking
 *    modal would defeat exactly what the exemption exists for.
 *  · This device is already registered to them.
 *  · They already hold an approved device of this kind on ANOTHER machine. The
 *    cap means a second one cannot be approved, so offering a form that is
 *    guaranteed to fail is worse than the existing "device blocked" screen,
 *    which at least explains itself and names the remedy.
 *  · The native app. It sends a keystore id by header and never renders this
 *    UI; its registration path (`registerMobileDevice`) is untouched.
 */
export async function pendingDeviceRegistration(employee: Employee): Promise<PendingRegistration | null> {
  if (!deviceAccessEnforced()) return null;
  if (!deviceRestrictionRequired(employee.email)) return null;

  const { kind } = await describeRequestDevice();
  const platform = describePlatform(await currentUserAgent());
  const cookieId = await readDeviceCookieValue();

  if (cookieId) {
    const row = await db.query.mobileDevices.findFirst({
      where: eq(mobileDevices.deviceId, cookieId),
    });
    if (row && row.employeeId === employee.id) {
      // Already been through the form — never ask twice.
      if (row.registeredAt) return null;
      // Revoked is not a registration problem; the gate refuses it and the
      // blocked screen explains why. Re-registering would not lift a revocation.
      if (row.status === "revoked") return null;
      return {
        kind: row.kind,
        platform,
        deviceRowId: row.id,
        deviceId: row.deviceId,
        needsDeviceName: requiresDeviceName(row.kind),
        consentVersion: DEVICE_CONSENT_VERSION,
      };
    }
  }

  // A different machine, and the slot for this kind is already filled by a
  // registered device. The gate handles it; a form cannot.
  if (await hasApprovedDeviceOfKind(employee.id, kind)) return null;

  return {
    kind,
    platform,
    deviceRowId: null,
    deviceId: cookieId,
    needsDeviceName: requiresDeviceName(kind),
    consentVersion: DEVICE_CONSENT_VERSION,
  };
}

export type RegisterDeviceInput = {
  deviceName?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  consent: boolean;
};

export type RegisterDeviceResult =
  | { ok: true; deviceRowId: string }
  | { ok: false; field: "deviceName" | "consent" | "form"; error: string };

/**
 * Complete registration for the device this request came from.
 *
 * Ordering is deliberate: consent is checked FIRST. A record that says someone
 * consented is only worth keeping if nothing else could have been written
 * without it, and validating the name first would mean a rejected name and an
 * unticked box produce the same "fix the device name" message.
 */
export async function completeDeviceRegistration(
  employee: Employee,
  input: RegisterDeviceInput,
): Promise<RegisterDeviceResult> {
  if (!input.consent) {
    return { ok: false, field: "consent", error: "Tick the consent box to register this device." };
  }

  const pending = await pendingDeviceRegistration(employee);
  if (!pending) {
    // Nothing to do — a second tab, a double submit, or a slot that filled in
    // between render and submit. Not an error worth a red box.
    return { ok: true, deviceRowId: "" };
  }

  let deviceName: string | null = null;
  if (pending.needsDeviceName) {
    const check = validateDeviceName(input.deviceName);
    if (!check.ok) return { ok: false, field: "deviceName", error: check.error };
    deviceName = check.value;

    // Explicit pre-check so the ordinary collision produces a sentence rather
    // than a constraint violation. The UNIQUE index remains the guarantee —
    // this is the message. (Two registrations racing on one name still hit
    // the index, which is caught below.)
    const clash = await db
      .select({ employeeId: mobileDevices.employeeId })
      .from(mobileDevices)
      .where(
        and(
          eq(mobileDevices.kind, "laptop"),
          sql`lower(${mobileDevices.deviceName}) = lower(${deviceName})`,
          pending.deviceRowId ? ne(mobileDevices.id, pending.deviceRowId) : undefined,
        ),
      )
      .limit(1);

    const clashRow = clash[0];
    if (clashRow) {
      const mine = clashRow.employeeId === employee.id;
      return {
        ok: false,
        field: "deviceName",
        error: mine
          ? "This laptop is already registered to you."
          : "This device name is already registered to another employee. If you both see the same "
          + "name, rename your PC in Settings › System › About › Rename this PC, then register again.",
      };
    }
  }

  const manufacturer = optionalText(input.manufacturer);
  const model = optionalText(input.model);
  const now = new Date();

  try {
    let rowId = pending.deviceRowId;

    if (rowId) {
      await db
        .update(mobileDevices)
        .set({
          deviceName,
          manufacturer,
          model,
          registeredAt: now,
          lastSeenAt: now,
        })
        .where(eq(mobileDevices.id, rowId));
    } else {
      // No row yet. Take the slot only if it is free — the cap is the database's
      // to enforce, so a full slot lands `pending` rather than being refused here.
      const deviceId = pending.deviceId ?? `web_${randomUUID()}`;
      const slotFree = !(await hasApprovedDeviceOfKind(employee.id, pending.kind));
      const [inserted] = await db
        .insert(mobileDevices)
        .values({
          employeeId: employee.id,
          deviceId,
          kind: pending.kind,
          label: `${pending.platform.hardware} (${pending.platform.browser})`,
          platform: "web",
          status: slotFree ? "approved" : "pending",
          approvedAt: slotFree ? now : null,
          deviceName,
          manufacturer,
          model,
          registeredAt: now,
          lastSeenAt: now,
        })
        .returning({ id: mobileDevices.id });
      if (!inserted) {
        // The insert returned no row. Nothing was written, so writing a consent
        // record now would attest to a registration that does not exist.
        return { ok: false, field: "form", error: "Could not register this device. Try again, or contact HR." };
      }
      rowId = inserted.id;

      try {
        (await cookies()).set(DEVICE_COOKIE, deviceId, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
        });
      } catch {
        /* a read-only request scope — the login path sets it anyway */
      }
    }

    // The audit row is written AFTER the device row and in the same request, so
    // a consent record can never name a device that failed to save.
    await db.insert(deviceConsentEvents).values({
      employeeId: employee.id,
      deviceRowId: rowId,
      deviceId: pending.deviceId,
      consentVersion: DEVICE_CONSENT_VERSION,
      consentType: DEVICE_CONSENT_TYPE,
      actorEmployeeId: employee.id,
      consentedAt: now,
    });

    return { ok: true, deviceRowId: rowId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("mobile_devices_device_name_uq")) {
      return {
        ok: false,
        field: "deviceName",
        error:
          "This device name is already registered to another employee. If you both see the same "
          + "name, rename your PC in Settings › System › About › Rename this PC, then register again.",
      };
    }
    return { ok: false, field: "form", error: "Could not register this device. Try again, or contact HR." };
  }
}
