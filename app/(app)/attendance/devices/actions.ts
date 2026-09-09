"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAttendanceAdmin, requireDeviceManager } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { orgSettings, employeeEvents } from "@/db/schema";
import { DEVICE_KINDS, type DeviceKind } from "@/db/enums";
import { setDeviceStatus, adminRegisterDevice } from "@/lib/attendance/mobile-devices";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_OR_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

/**
 * ── WHO MAY CHANGE DEVICE AUTHORIZATION ────────────────────────────────────
 * `requireDeviceManager` — the `device.manage` capability — NOT
 * `requireAttendanceAdmin`, which these actions used before.
 *
 * That is a deliberate NARROWING. The attendance-admin allow-list also governs
 * the office-IP allowlist and general attendance settings, and has grown a
 * fourth member for reasons unrelated to devices. Device authorization is the
 * hinge the entire access-control guarantee turns on — whoever can register a
 * device against a person can then act as that person — so it is granted to
 * exactly the three people named for it, from the capability registry.
 *
 * `setOfficeIpAllowlist` at the bottom of this file stays on the attendance-
 * admin list: it is an attendance setting, not a device authorization, and
 * moving it would strip access for a reason nobody asked for.
 */

/** Approve a pending device so its owner can use the WMS (and punch) from it. */
export async function approveDevice(deviceRowId: string): Promise<Result> {
  const me = await requireDeviceManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(deviceRowId)) return { ok: false, error: "Invalid device." };

  const res = await setDeviceStatus(deviceRowId, "approved", me.id);
  if (res.ok) {
    await auditDeviceChange(me.id, deviceRowId, "device_approved", null);
    revalidatePath("/attendance/devices");
  }
  return res;
}

/**
 * Revoke a device (lost / replaced / suspicious) — it can no longer reach the
 * WMS from that machine.
 *
 * The row is NOT deleted. A revoked device stays in history with who withdrew
 * it and why, which is what makes the device list an audit trail.
 */
export async function revokeDevice(deviceRowId: string, reason?: string): Promise<Result> {
  const me = await requireDeviceManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(deviceRowId)) return { ok: false, error: "Invalid device." };

  const res = await setDeviceStatus(deviceRowId, "revoked", me.id, reason ?? null);
  if (res.ok) {
    await auditDeviceChange(me.id, deviceRowId, "device_revoked", reason ?? null);
    revalidatePath("/attendance/devices");
  }
  return res;
}

/**
 * Register a device against an employee on their behalf, already approved.
 *
 * The `deviceId` is typed in by the administrator — for a phone it is the id the
 * app shows on its device screen; for a laptop it is normally left to the
 * self-service adoption at sign-in, and this path exists for the case where an
 * administrator is setting someone up in advance.
 */
export async function registerDeviceForEmployee(input: {
  employeeId: string;
  deviceId: string;
  kind: string;
  label?: string;
}): Promise<Result> {
  const me = await requireDeviceManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  if (!UUID.test(input.employeeId ?? "")) return { ok: false, error: "Pick an employee." };
  if (!DEVICE_KINDS.includes(input.kind as DeviceKind)) {
    return { ok: false, error: "Pick a device type." };
  }
  const deviceId = (input.deviceId ?? "").trim();
  if (deviceId.length < 8 || deviceId.length > 200) {
    return { ok: false, error: "Enter the device id shown on the employee's device (8–200 characters)." };
  }

  const res = await adminRegisterDevice({
    employeeId: input.employeeId,
    deviceId,
    kind: input.kind as DeviceKind,
    label: input.label ?? null,
    adminId: me.id,
  });
  if (res.ok) {
    await auditDeviceChange(me.id, null, "device_registered_by_admin", input.label ?? null, {
      employeeId: input.employeeId,
      kind: input.kind,
    });
    revalidatePath("/attendance/devices");
  }
  return res;
}

/**
 * Append an `employee_events` row for a device authorization change.
 *
 * Reuses the EXISTING append-only admin trail rather than adding a second one:
 * `employee_events` already revokes UPDATE/DELETE and already feeds the Admin
 * Activity screen, and device approvals belong in the same story as the other
 * admin actions taken against a person. The attendance-specific audit table is
 * for attendance changes; a device approval is not one.
 *
 * Best-effort — a failed audit write must never roll back the change itself.
 */
async function auditDeviceChange(
  actorId: string,
  deviceRowId: string | null,
  eventType: string,
  note: string | null,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    // The event is filed against the device's OWNER, not the administrator, so
    // it appears on the right person's history.
    let employeeId = (extra?.employeeId as string | undefined) ?? null;
    if (!employeeId && deviceRowId) {
      const row = await db.query.mobileDevices.findFirst({
        where: (d, { eq: e }) => e(d.id, deviceRowId),
      });
      employeeId = row?.employeeId ?? null;
    }
    if (!employeeId) return;

    await db.insert(employeeEvents).values({
      employeeId,
      actorId,
      eventType,
      toValue: { deviceRowId, ...extra },
      note,
    });
  } catch (err) {
    console.error("[devices] audit write failed", err);
  }
}

/**
 * Set the office-network allowlist (public IPs / CIDRs) that WEB attendance must
 * come from — closes the browser "punch from home" bypass. Empty = gate OFF
 * (nobody locked out).
 *
 * Still the ATTENDANCE ADMIN list, not the device-manager capability: this is an
 * attendance setting that happens to live on the same screen, and narrowing it
 * alongside the device actions would remove access nobody asked to remove.
 */
export async function setOfficeIpAllowlist(ips: string[]): Promise<Result> {
  const me = await requireAttendanceAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = Array.from(new Set((ips ?? []).map((s) => s.trim()).filter(Boolean))).slice(0, 20);
  const bad = clean.find((s) => !IPV4_OR_CIDR.test(s));
  if (bad) return { ok: false, error: `"${bad}" isn't a valid IPv4 address or CIDR.` };

  try {
    await db
      .update(orgSettings)
      .set({ officeIpAllowlist: clean.length ? clean : null, updatedAt: new Date(), updatedById: me.id })
      .where(eq(orgSettings.id, 1));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/attendance/devices");
  return { ok: true };
}
