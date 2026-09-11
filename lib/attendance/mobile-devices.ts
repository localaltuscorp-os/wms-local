import "server-only";

import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices, employees } from "@/db/schema";
import type { DeviceKind } from "@/db/enums";

/**
 * Device-allowlist anti-proxy (Phase 1, 2026-08).
 *
 * A device must be REGISTERED and APPROVED to punch. Registration is an explicit
 * one-time act (the app's "Register this device" button → status 'pending'),
 * capped at {@link MAX_DEVICES_PER_EMPLOYEE} per person regardless of kind; an
 * admin approves it.
 * The device id is the app's non-extractable keystore id, so it can't be copied
 * to another phone — buddy-punching is impossible once the allowlist is enforced.
 *
 * Rollout was fail-safe: the migration grandfathered every pre-existing device to
 * 'approved', so no one was locked out; only NEW phones need approval.
 */

/**
 * TWO devices per employee, of ANY kind (migration 0214).
 *
 * The cap is a TOTAL, not per kind. 0206 counted per kind, which came to the
 * same two devices but forced the pair to be one laptop and one phone; someone
 * who works from two laptops, or two phones, had their second one refused. The
 * kind is still recorded and still shown — it just no longer decides anything.
 */
export const MAX_DEVICES_PER_EMPLOYEE = 2;

/** Why a device can't punch — the app maps this to the right screen/message. */
export type DeviceRejectReason =
  | "invalid"
  | "unregistered"
  // "pending" retired 2026-09-09 with admin approval - a registered device is
  // usable at once, so the punch never answers "waiting for approval" again.
  | "revoked"
  // Cap reached: this employee already holds MAX_DEVICES_PER_EMPLOYEE devices.
  // Distinct from "other" (a failure to check) and from the retired "pending"
  // (a device awaiting a human) - nobody is coming to approve it, so the app
  // must tell the employee to get a slot freed rather than to wait.
  | "device_limit"
  | "other_employee"
  // The registration itself failed — a DB error, not a verdict about the device.
  // Distinct from "invalid" so a caller can tell "we could not check" apart from
  // "we checked and the answer is no"; the two deserve different messages.
  | "other";

export type ResolveDeviceResult =
  | { ok: true; rowId: string }
  | { ok: false; reason: DeviceRejectReason; error: string };

function cleanDeviceId(raw: string): string | null {
  const id = raw.trim();
  if (!id || id.length > 200) return null;
  return id;
}

/**
 * PUNCH-TIME gate. Only a device registered to THIS employee may punch, and it
 * must not have been revoked. Anything else is refused with a typed reason — the
 * app shows "Register this device" (unregistered) or "Incorrect device"
 * (someone else's / revoked). No auto-enrollment here.
 *
 * ADMIN APPROVAL REMOVED 2026-09-09: a registered device is usable at once. The
 * per-employee cap and the revoked/other-employee checks are untouched — they
 * are anti-proxy rules, not part of the approval step.
 */
export async function resolveMobileDevice(
  employeeId: string,
  input: { deviceId: string },
): Promise<ResolveDeviceResult> {
  const deviceId = cleanDeviceId(input.deviceId);
  if (!deviceId) return { ok: false, reason: "invalid", error: "Invalid device id." };

  const existing = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });

  if (!existing) {
    return {
      ok: false,
      reason: "unregistered",
      error: "This device isn't registered. Tap “Register this device” to start punching from it.",
    };
  }
  if (existing.employeeId !== employeeId) {
    return { ok: false, reason: "other_employee", error: "Incorrect device - this phone is registered to another employee." };
  }
  if (existing.status === "revoked") {
    return { ok: false, reason: "revoked", error: "This device was removed. Register it again to punch from it." };
  }

  if (existing.status === "approved") {
    await db.update(mobileDevices).set({ lastUsedAt: new Date() }).where(eq(mobileDevices.id, existing.id));
    return { ok: true, rowId: existing.id };
  }

  // LEGACY 'pending' ROW: enrolled before approval was removed and never
  // approved. Heal it in place on first use rather than shipping a migration -
  // otherwise everyone left in the old queue stays locked out with no approver.
  //
  // This CAN legitimately fail. The 0214 trigger caps approved rows at two per
  // employee, and the old web path counted only APPROVED rows before writing a
  // pending one, so "2 approved + a pending third" is a real shape in existing
  // data. Promoting that third would breach the cap, so the DB refuses - and the
  // honest answer is the cap, not a raw SQL error surfaced at the punch.
  try {
    await db
      .update(mobileDevices)
      .set({ status: "approved", approvedAt: new Date(), lastUsedAt: new Date() })
      .where(eq(mobileDevices.id, existing.id));
  } catch {
    return {
      ok: false,
      reason: "device_limit",
      error:
        `You already have ${MAX_DEVICES_PER_EMPLOYEE} active devices, so this one can't be activated. ` +
        "Ask an attendance administrator to remove one, then punch from this device again.",
    };
  }
  return { ok: true, rowId: existing.id };
}

export type RegisterDeviceResult =
  | { ok: true; status: "approved"; isNew: boolean; deviceCount: number }
  | { ok: false; error: string };

/**
 * The one-time "Register this device" action the app button calls. Idempotent:
 *  - already registered to THIS employee → returns 'approved'.
 *  - registered to ANOTHER employee → rejected (a phone can't be shared).
 *  - new → enrolled as 'approved' and usable IMMEDIATELY if under the
 *    {@link MAX_DEVICES_PER_EMPLOYEE} cap, else rejected. Caller still alerts
 *    admins when isNew.
 *
 * ADMIN APPROVAL REMOVED 2026-09-09. The cap survives: it is the anti-proxy
 * rule (two devices per person), not the approval step, and it is now the ONLY
 * thing that can refuse a registration. The admin alert also survives - admins
 * lose the veto but keep the visibility, and can still revoke.
 */
export async function registerMobileDevice(
  employeeId: string,
  input: {
    deviceId: string;
    label?: string | null;
    platform?: string | null;
    /** Defaults to 'phone': this is the mobile app's enrolment path. Laptops
     *  come from the web punch (lib/attendance/web-device.ts). */
    kind?: DeviceKind;
  },
): Promise<RegisterDeviceResult> {
  const kind: DeviceKind = input.kind ?? "phone";
  const deviceId = cleanDeviceId(input.deviceId);
  if (!deviceId) return { ok: false, error: "Invalid device id." };

  const existing = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  if (existing) {
    if (existing.employeeId !== employeeId) {
      return { ok: false, error: "This phone is already registered to another employee." };
    }
    // Re-registering a previously revoked own device → straight back to usable.
    if (existing.status === "revoked") {
      await db.update(mobileDevices)
        .set({ status: "approved", approvedAt: new Date(), revokedAt: null, lastUsedAt: new Date(), label: input.label?.slice(0, 120) ?? existing.label })
        .where(eq(mobileDevices.id, existing.id));
      return { ok: true, status: "approved", isNew: true, deviceCount: await activeCount(employeeId) };
    }
    // A legacy 'pending' row is promoted here too, so re-tapping Register is a
    // working fix for anyone stranded mid-changeover. Same cap caveat as
    // resolveMobileDevice: report the cap rather than leaking a DB error.
    if (existing.status !== "approved") {
      try {
        await db.update(mobileDevices)
          .set({ status: "approved", approvedAt: new Date(), lastUsedAt: new Date() })
          .where(eq(mobileDevices.id, existing.id));
      } catch {
        return {
          ok: false,
          error:
            `You already have ${MAX_DEVICES_PER_EMPLOYEE} active devices. ` +
            "Ask an attendance administrator to remove one first.",
        };
      }
    }
    return {
      ok: true,
      status: "approved",
      isNew: false,
      deviceCount: await activeCount(employeeId),
    };
  }

  // Cap on active (approved + pending) devices for this employee, all kinds.
  if ((await activeCount(employeeId)) >= MAX_DEVICES_PER_EMPLOYEE) {
    return {
      ok: false,
      error: `You already have ${MAX_DEVICES_PER_EMPLOYEE} registered devices. Ask an attendance administrator to remove one first.`,
    };
  }

  try {
    await db.insert(mobileDevices).values({
      employeeId,
      deviceId,
      kind,
      label: input.label?.slice(0, 120) ?? null,
      platform: input.platform?.slice(0, 20) ?? null,
      status: "approved",
      approvedAt: new Date(),
      lastUsedAt: new Date(),
    });
    return { ok: true, status: "approved", isNew: true, deviceCount: await activeCount(employeeId) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("mobile_devices_device_id_uq")) return registerMobileDevice(employeeId, input);
    return { ok: false, error: `Could not register device: ${msg}` };
  }
}

/** Active device count - what the {@link MAX_DEVICES_PER_EMPLOYEE} cap measures.
 *  Still counts legacy 'pending' rows: they occupy a real slot until used, and
 *  dropping them here would let someone hold three devices across the change. */
async function activeCount(employeeId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mobileDevices)
    .where(and(eq(mobileDevices.employeeId, employeeId), inArray(mobileDevices.status, ["approved", "pending"])));
  return r?.n ?? 0;
}

export async function countMobileDevices(employeeId: string): Promise<number> {
  return activeCount(employeeId);
}

/** The registration status of ONE device for an employee. */
export type DeviceRegStatus = "approved" | "revoked" | "unregistered" | "other";

/**
 * Read-only status of a specific device id for an employee — NO side effects
 * (unlike {@link resolveMobileDevice}, which stamps lastUsedAt on the punch
 * path). Powers the app's one-time "Register this device" button: the button
 * hides once this phone is `approved`, and shows for `unregistered` /
 * `revoked`. `other` = the phone belongs to someone else.
 *
 * A legacy 'pending' row reports `approved`: it IS usable now, and telling the
 * app otherwise would show a Register button for a device already registered.
 */
export async function getDeviceStatusFor(
  employeeId: string,
  rawDeviceId: string,
): Promise<DeviceRegStatus> {
  const deviceId = cleanDeviceId(rawDeviceId);
  if (!deviceId) return "unregistered";
  const existing = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  if (!existing) return "unregistered";
  if (existing.employeeId !== employeeId) return "other";
  if (existing.status === "revoked") return "revoked";
  return "approved";
}

/* ── Admin surface (approve / revoke / list) — used by the web admin UI ───── */

export interface AdminDeviceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  /** 'laptop' | 'phone' — descriptive only; either kind may fill either slot. */
  kind: DeviceKind;
  label: string | null;
  platform: string | null;
  status: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  approvedAt: Date | null;
}

/** Every registered device with its owner — newest first, pending on top. */
export async function listAllDevices(): Promise<AdminDeviceRow[]> {
  const rows = await db
    .select({
      id: mobileDevices.id,
      employeeId: mobileDevices.employeeId,
      employeeName: employees.name,
      kind: mobileDevices.kind,
      label: mobileDevices.label,
      platform: mobileDevices.platform,
      status: mobileDevices.status,
      createdAt: mobileDevices.createdAt,
      lastUsedAt: mobileDevices.lastUsedAt,
      approvedAt: mobileDevices.approvedAt,
    })
    .from(mobileDevices)
    .leftJoin(employees, eq(employees.id, mobileDevices.employeeId))
    .orderBy(
      // pending first, then most recent
      sql`case when ${mobileDevices.status} = 'pending' then 0 when ${mobileDevices.status} = 'approved' then 1 else 2 end`,
      desc(mobileDevices.createdAt),
    );
  return rows.map((r) => ({ ...r, employeeName: r.employeeName ?? "-" }));
}

export async function setDeviceStatus(
  deviceRowId: string,
  status: "approved" | "revoked",
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.query.mobileDevices.findFirst({ where: eq(mobileDevices.id, deviceRowId) });
  if (!row) return { ok: false, error: "Device not found." };

  if (status === "approved") {
    // Enforce the cap at approval time too — registration counts pending rows,
    // so two pendings can both sit under the cap and only the second approval
    // crosses it. A TOTAL across kinds, matching the registration cap and 0214's
    // trigger. Counted per kind, this check would pass and the UPDATE would then
    // die on the trigger — a raised exception where a sentence belongs.
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mobileDevices)
      .where(
        and(
          eq(mobileDevices.employeeId, row.employeeId),
          eq(mobileDevices.status, "approved"),
        ),
      );
    if ((c?.n ?? 0) >= MAX_DEVICES_PER_EMPLOYEE && row.status !== "approved") {
      return {
        ok: false,
        error: `This employee already has ${MAX_DEVICES_PER_EMPLOYEE} approved devices. Revoke one first.`,
      };
    }
    await db.update(mobileDevices)
      .set({ status: "approved", approvedById: adminId, approvedAt: new Date(), revokedAt: null })
      .where(eq(mobileDevices.id, deviceRowId));
  } else {
    await db.update(mobileDevices)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(mobileDevices.id, deviceRowId));
  }
  return { ok: true };
}
