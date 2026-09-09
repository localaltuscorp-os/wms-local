import "server-only";

import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices, employees } from "@/db/schema";
import { DEVICE_KINDS, DEVICE_KIND_LABELS, type DeviceKind } from "@/db/enums";

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
 * ONE APPROVED DEVICE PER KIND (migration 0215): one laptop AND one phone.
 *
 * The device-access rule this now serves is explicitly "one registered
 * desktop/laptop and one registered mobile phone", so the cap is per kind again,
 * as it was under 0206. 0214 had briefly made it two of ANY kind; that is
 * retired. The TOTAL is unchanged at two, so nobody gained or lost capacity —
 * only the shape did, and `kind` decides something again.
 *
 * ENFORCED IN THE DATABASE, not only here: a partial unique index plus a trigger
 * (0215). Two concurrent approvals cannot both read "none approved" and both
 * write. The checks in this file exist so the ordinary case produces a sentence
 * instead of a constraint violation.
 */
export const MAX_APPROVED_PER_KIND = 1;

/** Total approved devices an employee may hold — one laptop plus one phone.
 *  Derived, so it cannot drift from the per-kind rule above. */
export const MAX_DEVICES_PER_EMPLOYEE = MAX_APPROVED_PER_KIND * DEVICE_KINDS.length;

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
 *    cap (approved + pending, all kinds), else rejected. Caller alerts admins
 *    when isNew.
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

  // Cap on APPROVED devices OF THIS KIND. Counted on approved only, not on
  // approved+pending as it was before 0215: a pending row is a request, not a
  // grant, and refusing a second request because a first is still queued means a
  // person whose laptop was never approved cannot ask again from the machine
  // they actually use. The approval step re-checks, and the database enforces it.
  if (await hasApprovedOfKind(employeeId, kind)) {
    return {
      ok: false,
      error: `You already have an approved ${DEVICE_KIND_LABELS[kind].toLowerCase()}. Ask a device administrator to revoke it before registering another.`,
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

/** Does this employee already hold an approved device of this kind? The 0215
 *  cap, read side. The database is the enforcer; this makes the answer a
 *  sentence instead of a constraint violation. */
async function hasApprovedOfKind(employeeId: string, kind: DeviceKind): Promise<boolean> {
  const row = await db.query.mobileDevices.findFirst({
    where: and(
      eq(mobileDevices.employeeId, employeeId),
      eq(mobileDevices.kind, kind),
      eq(mobileDevices.status, "approved"),
    ),
  });
  return !!row;
}

/** Active (approved OR pending) device count — reported to the app so it can
 *  show "2 devices registered", and used by the new-registration alert. No
 *  longer what any cap is measured against; see `hasApprovedOfKind`. */
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
  /** 'laptop' | 'phone'. Since 0215 this DECIDES the slot again: one approved
   *  laptop and one approved phone per person. */
  kind: DeviceKind;
  label: string | null;
  platform: string | null;
  status: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastSeenAt: Date | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  revokedAt: Date | null;
  revokedByName: string | null;
  revokeReason: string | null;
}

/**
 * Every registered device with its owner — pending first, then most recent.
 *
 * INCLUDES REVOKED ROWS, on purpose: they are the device history the audit
 * requirement asks for, and a list that hid them would make a withdrawn device
 * indistinguishable from one that never existed. The screen filters them out of
 * the default view; the data is always here.
 */
export async function listAllDevices(): Promise<AdminDeviceRow[]> {
  // Three joins onto `employees` — the owner, the approver and the revoker are
  // all people. Aliased in raw SQL because Drizzle's select builder needs
  // distinct table references for a self-join.
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
      lastSeenAt: mobileDevices.lastSeenAt,
      approvedAt: mobileDevices.approvedAt,
      approvedByName: sql<string | null>`approver.name`,
      revokedAt: mobileDevices.revokedAt,
      revokedByName: sql<string | null>`revoker.name`,
      revokeReason: mobileDevices.revokeReason,
    })
    .from(mobileDevices)
    .leftJoin(employees, eq(employees.id, mobileDevices.employeeId))
    .leftJoin(sql`employees as approver`, sql`approver.id = ${mobileDevices.approvedById}`)
    .leftJoin(sql`employees as revoker`, sql`revoker.id = ${mobileDevices.revokedById}`)
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
  /** Why it was revoked. Ignored on approval. Optional, but the admin UI asks
   *  for one: a revocation with no reason is an unexplained loss of access. */
  revokeReason?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.query.mobileDevices.findFirst({ where: eq(mobileDevices.id, deviceRowId) });
  if (!row) return { ok: false, error: "Device not found." };

  if (status === "approved") {
    // Enforce the cap at approval time too — registration no longer counts
    // pending rows, so several pendings for one kind can coexist and the FIRST
    // approval is what consumes the slot. Counted PER KIND (0215) so the check
    // matches the trigger and the unique index; counted across kinds it would
    // pass here and die on the constraint — a raised exception where a sentence
    // belongs.
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
    if ((c?.n ?? 0) >= MAX_APPROVED_PER_KIND && row.status !== "approved") {
      return {
        ok: false,
        error: `This employee already has an approved ${DEVICE_KIND_LABELS[row.kind].toLowerCase()}. Revoke it first.`,
      };
    }
    await db.update(mobileDevices)
      .set({
        status: "approved",
        approvedById: adminId,
        approvedAt: new Date(),
        // Clear the revocation record on RE-approval: the row is live again, and
        // leaving a stale "revoked by X because Y" on an approved device reads
        // as though it is still withdrawn.
        revokedAt: null,
        revokedById: null,
        revokeReason: null,
      })
      .where(eq(mobileDevices.id, deviceRowId));
  } else {
    // A revoked device is NEVER deleted — the row stays as history, which is
    // what makes the device list an audit trail rather than a current-state
    // snapshot. Who revoked it and why are recorded alongside.
    await db.update(mobileDevices)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedById: adminId,
        revokeReason: revokeReason?.trim().slice(0, 500) || null,
      })
      .where(eq(mobileDevices.id, deviceRowId));
  }
  return { ok: true };
}

/**
 * Register a device against an employee ON THEIR BEHALF — the administrator's
 * enrollment path, as opposed to the self-service one above.
 *
 * Lands APPROVED immediately: an administrator registering a device has, by
 * doing so, approved it, and a two-step "register then approve" would be one
 * screen asking the same person the same question twice.
 *
 * `registeredById` records that this did not come from the employee, which is
 * the distinction the device history needs to keep.
 */
export async function adminRegisterDevice(input: {
  employeeId: string;
  deviceId: string;
  kind: DeviceKind;
  label?: string | null;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const deviceId = cleanDeviceId(input.deviceId);
  if (!deviceId) return { ok: false, error: "Invalid device id." };

  const existing = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  if (existing && existing.employeeId !== input.employeeId) {
    return { ok: false, error: "That device id is already registered to another employee." };
  }
  if (await hasApprovedOfKind(input.employeeId, input.kind)) {
    return {
      ok: false,
      error: `This employee already has an approved ${DEVICE_KIND_LABELS[input.kind].toLowerCase()}. Revoke it first.`,
    };
  }

  try {
    if (existing) {
      await db
        .update(mobileDevices)
        .set({
          status: "approved",
          kind: input.kind,
          label: input.label?.slice(0, 120) ?? existing.label,
          approvedById: input.adminId,
          approvedAt: new Date(),
          registeredById: input.adminId,
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
        })
        .where(eq(mobileDevices.id, existing.id));
    } else {
      await db.insert(mobileDevices).values({
        employeeId: input.employeeId,
        deviceId,
        kind: input.kind,
        label: input.label?.slice(0, 120) ?? null,
        platform: "admin",
        status: "approved",
        approvedById: input.adminId,
        approvedAt: new Date(),
        registeredById: input.adminId,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The database's own cap, reached despite the read above (a concurrent
    // approval). Report the rule, not the constraint name.
    if (msg.includes("mobile_devices_employee_kind_approved_uq") || msg.includes("approved_cap")) {
      return {
        ok: false,
        error: `This employee already has an approved ${DEVICE_KIND_LABELS[input.kind].toLowerCase()}. Revoke it first.`,
      };
    }
    return { ok: false, error: `Could not register device: ${msg}` };
  }
  return { ok: true };
}
