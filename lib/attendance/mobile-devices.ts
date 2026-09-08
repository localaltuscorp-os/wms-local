import "server-only";

import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices, employees } from "@/db/schema";
import type { DeviceKind } from "@/db/enums";

/**
 * Device-allowlist anti-proxy (Phase 1, 2026-08).
 *
 * A phone must be REGISTERED and APPROVED to punch. Registration is an explicit
 * one-time act (the app's "Register this device" button → status 'pending'),
 * capped at {@link MAX_DEVICES_PER_EMPLOYEE} per person; an admin approves it.
 * The device id is the app's non-extractable keystore id, so it can't be copied
 * to another phone — buddy-punching is impossible once the allowlist is enforced.
 *
 * Rollout was fail-safe: the migration grandfathered every pre-existing device to
 * 'approved', so no one was locked out; only NEW phones need approval.
 */

/**
 * ONE approved device of each KIND — one laptop and one phone — so two per
 * person in total (migration 0206).
 *
 * The cap is counted PER KIND, not as a total. Counting the total let someone
 * register two phones and then find their laptop refused because "you already
 * have 2 devices", which is not the rule and reads as a bug to whoever hits it.
 */
export const MAX_DEVICES_PER_KIND = 1;

/** Kept for callers that mean "how many devices may one person hold". */
export const MAX_DEVICES_PER_EMPLOYEE = 2;

/** Why a device can't punch — the app maps this to the right screen/message. */
export type DeviceRejectReason =
  | "invalid"
  | "unregistered"
  | "pending"
  | "revoked"
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
 * PUNCH-TIME gate. STRICT: only a device that is registered to THIS employee AND
 * approved may punch. Anything else is refused with a typed reason — the app
 * shows "Register this device" (unregistered), "Waiting for approval" (pending),
 * or "Incorrect device" (someone else's / revoked). No auto-enrollment here.
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
      error: "This device isn't registered. Tap “Register this device”, then ask HR to approve it.",
    };
  }
  if (existing.employeeId !== employeeId) {
    return { ok: false, reason: "other_employee", error: "Incorrect device - this phone is registered to another employee." };
  }
  if (existing.status === "revoked") {
    return { ok: false, reason: "revoked", error: "This device was removed. Register it again and ask HR to approve it." };
  }
  if (existing.status !== "approved") {
    return { ok: false, reason: "pending", error: "This device is waiting for HR approval before you can punch from it." };
  }

  await db.update(mobileDevices).set({ lastUsedAt: new Date() }).where(eq(mobileDevices.id, existing.id));
  return { ok: true, rowId: existing.id };
}

export type RegisterDeviceResult =
  | { ok: true; status: "approved" | "pending"; isNew: boolean; deviceCount: number }
  | { ok: false; error: string };

/**
 * The one-time "Register this device" action the app button calls. Idempotent:
 *  - already registered to THIS employee → returns its current status.
 *  - registered to ANOTHER employee → rejected (a phone can't be shared).
 *  - new → enrolled as 'pending' if under the {@link MAX_DEVICES_PER_EMPLOYEE}
 *    cap (approved + pending), else rejected. Caller alerts admins when isNew.
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
    // Re-registering a previously revoked own device → back to pending.
    if (existing.status === "revoked") {
      await db.update(mobileDevices)
        .set({ status: "pending", revokedAt: null, lastUsedAt: new Date(), label: input.label?.slice(0, 120) ?? existing.label })
        .where(eq(mobileDevices.id, existing.id));
      return { ok: true, status: "pending", isNew: true, deviceCount: await activeCount(employeeId) };
    }
    return {
      ok: true,
      status: existing.status === "approved" ? "approved" : "pending",
      isNew: false,
      deviceCount: await activeCount(employeeId),
    };
  }

  // Cap on active (approved + pending) devices of THIS KIND for this employee.
  if ((await activeCountOfKind(employeeId, kind)) >= MAX_DEVICES_PER_KIND) {
    return {
      ok: false,
      error: `You already have a registered ${kind}. Ask an attendance administrator to remove the old one first.`,
    };
  }

  try {
    await db.insert(mobileDevices).values({
      employeeId,
      deviceId,
      kind,
      label: input.label?.slice(0, 120) ?? null,
      platform: input.platform?.slice(0, 20) ?? null,
      status: "pending",
      lastUsedAt: new Date(),
    });
    return { ok: true, status: "pending", isNew: true, deviceCount: await activeCount(employeeId) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("mobile_devices_device_id_uq")) return registerMobileDevice(employeeId, input);
    return { ok: false, error: `Could not register device: ${msg}` };
  }
}

/** Active (approved OR pending) devices of one KIND — what the cap measures. */
async function activeCountOfKind(employeeId: string, kind: DeviceKind): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mobileDevices)
    .where(
      and(
        eq(mobileDevices.employeeId, employeeId),
        eq(mobileDevices.kind, kind),
        inArray(mobileDevices.status, ["approved", "pending"]),
      ),
    );
  return r?.n ?? 0;
}

/** Active (approved OR pending) device count — what the cap is measured against. */
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
export type DeviceRegStatus = "approved" | "pending" | "revoked" | "unregistered" | "other";

/**
 * Read-only status of a specific device id for an employee — NO side effects
 * (unlike {@link resolveMobileDevice}, which stamps lastUsedAt on the punch
 * path). Powers the app's one-time "Register this device" button: the button
 * hides once this phone is `approved` or `pending` (already submitted), and
 * shows for `unregistered` / `revoked`. `other` = the phone belongs to someone
 * else.
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
  if (existing.status === "approved") return "approved";
  return "pending";
}

/* ── Admin surface (approve / revoke / list) — used by the web admin UI ───── */

export interface AdminDeviceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  /** 'laptop' | 'phone' — which of the person's two designated devices this is. */
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
    // Enforce the cap at approval time too (in case two pendings sit under the cap).
    // Per KIND, matching the registration cap and the 0206 unique index. Left
    // as a total, this check would pass and the INSERT would then die on the
    // index — a constraint-name error where a sentence belongs.
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mobileDevices)
      .where(
        and(
          eq(mobileDevices.employeeId, row.employeeId),
          eq(mobileDevices.kind, row.kind),
          eq(mobileDevices.status, "approved"),
        ),
      );
    if ((c?.n ?? 0) >= MAX_DEVICES_PER_KIND && row.status !== "approved") {
      return {
        ok: false,
        error: `This employee already has an approved ${row.kind}. Revoke it first.`,
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
