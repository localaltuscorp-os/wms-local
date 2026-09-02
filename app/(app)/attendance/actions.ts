"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import {
  attendanceLogs,
  employees,
  employeeEvents,
  type Employee,
  type NotificationKind,
} from "@/db/schema";
import type { PunchReason } from "@/db/enums";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { resolvePunchGeofence, insertPunchRow } from "@/lib/attendance/record-punch";
import {
  notifyOnInPunch,
  notifyOnDayFinalized,
  notifyAdminLateDeduction,
  clockInTz,
  alertAdminsNewAttendanceDevice,
} from "@/lib/attendance/punch-notify";
import {
  AdminUpsertPunch,
  AdminEditDayTimes,
  AdminDeletePunch,
} from "@/lib/validators/attendance";
import {
  listCredentials,
  mintRegistrationOptions,
  verifyAndStoreRegistration,
  mintPunchOptions,
  verifyPunchAssertion,
} from "@/lib/webauthn/attendance";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    note: z.string().trim().max(500).optional(),
    deviceLabel: z.string().max(120).optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyM: z.number().min(0).max(100_000),
      })
      .optional(),
  })
  .strict();

/**
 * Record today's check-in or check-out. "Today" is the calendar day in the
 * employee's own timezone. One punch per kind per day — a duplicate returns
 * a friendly error instead of silently rewriting the log.
 *
 * Biometric + geofence (0054): when the admin has set an office location,
 * the punch must carry a GPS fix within `attendance_radius_m` of it; when
 * the employee has a registered passkey, the punch must carry a fresh
 * user-verified WebAuthn assertion (the device's fingerprint / Face ID).
 */
export async function punchAttendance(input: {
  kind: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
  assertion?: AuthenticationResponseJSON;
  registration?: RegistrationResponseJSON;
  deviceLabel?: string;
}): Promise<ActionResult<{ date: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // WebAuthn blobs ride alongside the validated fields, not through zod.
  const { assertion, registration, ...rest } = input;
  const parsed = PunchSchema.safeParse(rest);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, note, location, deviceLabel } = parsed.data;

  // ── Gate 1: geofence ────────────────────────────────────────────────
  // Runs for BOTH "in" and "out". Shared with the native punch API via
  // resolvePunchGeofence so the security rule never diverges between clients.
  const settings = await getOrgSettings();
  const geo = resolvePunchGeofence(settings, location);
  if (!geo.ok) return { ok: false, error: geo.error };
  const distanceM = geo.distanceM;

  // ── Gate 2: biometric ───────────────────────────────────────────────
  // One unified path: an `assertion` proves a returning device; a verified
  // `registration` (user-verified WebAuthn ceremony) both enrolls a NEW device
  // and proves presence for THIS punch — so a new phone enrolls + punches in a
  // single fingerprint/Face-ID prompt. Biometric stays mandatory unless the
  // admin exempted this employee (no sensor → GPS-only).
  let verifyMethod: "biometric" | "gps_only" = "gps_only";
  let credentialId: string | null = null;
  if (assertion) {
    const verdict = await verifyPunchAssertion(me.id, assertion);
    if (!verdict.ok) return verdict;
    verifyMethod = "biometric";
    credentialId = verdict.credentialId;
  } else if (registration) {
    const reg = await verifyAndStoreRegistration(
      me.id,
      registration,
      deviceLabel?.slice(0, 120) ?? null,
    );
    if (!reg.ok) return reg;
    verifyMethod = "biometric";
    // New device enrolled mid-punch → fire the same admin alert as standalone
    // setup (best-effort; never blocks the punch).
    if (reg.isNewDevice) {
      await alertAdminsNewAttendanceDevice(me, deviceLabel ?? null, reg.deviceCount);
    }
  } else {
    const creds = await listCredentials(me.id);
    if (creds.length > 0) {
      return {
        ok: false,
        error: "Biometric confirmation required — punch from your own registered device.",
      };
    }
    if (!me.attendanceBiometricExempt) {
      return {
        ok: false,
        error:
          "Use your fingerprint or Face ID to punch from your own phone. (No biometric sensor on your device? Ask an admin to enable the exemption.)",
      };
    }
    // exempt + nothing supplied → GPS-only allowed (verifyMethod stays "gps_only").
  }

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // Insert via the shared core (today-only; one punch per kind per day).
  const inserted = await insertPunchRow(
    { id: me.id, timezone: tz },
    { kind, note, location, distanceM },
    { verifyMethod, credentialId, source: "self" },
  );
  if (!inserted.ok) return inserted;

  // ── Best-effort attendance notifications (Task A8) ───────────────────
  // The punch is committed above; a notify failure must never surface to the
  // user. On check-in we flag a late arrival; on check-out we recompute the
  // finalized day and fire waived/half-day as appropriate.
  if (kind === "in") {
    const inAt = clockInTz(new Date(), tz);
    await notifyOnInPunch(me, today, inAt);
  } else {
    await notifyOnDayFinalized(me, today);
  }

  revalidatePath("/attendance");
  return { ok: true, date: today };
}

/** Step 1 of registering this device's fingerprint/Face ID for punching. */
export async function startBiometricSetup(): Promise<
  ActionResult<{ options: PublicKeyCredentialCreationOptionsJSON }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const options = await mintRegistrationOptions({
    id: me.id,
    name: me.name,
    email: me.email,
  });
  return { ok: true, options };
}

/** Step 2 — store the verified credential. */
export async function finishBiometricSetup(
  response: RegistrationResponseJSON,
  deviceLabel?: string,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const result = await verifyAndStoreRegistration(
    me.id,
    response,
    deviceLabel?.slice(0, 120) ?? null,
  );
  if (!result.ok) return result;
  revalidatePath("/attendance");
  // Tell admins a new attendance device was enrolled — the second line of
  // defence against proxy punching (someone enrolling on a colleague's phone).
  if (result.isNewDevice) {
    await alertAdminsNewAttendanceDevice(me, deviceLabel ?? null, result.deviceCount);
  }
  return { ok: true };
}


/** Fresh challenge for a biometric punch. Null options = nothing registered. */
export async function startBiometricPunch(): Promise<
  ActionResult<{ options: PublicKeyCredentialRequestOptionsJSON | null }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const options = await mintPunchOptions(me.id);
  return { ok: true, options };
}

// ════════════════════════════════════════════════════════════════════════════
// Admin punch management (Attendance Phase A, Task A4)
//
// Admins can backfill, correct, or remove an employee's in/out punches — the
// escape hatch the self-only `punchAttendance` deliberately lacks. Every write
// carries `source:"admin"`, a `reason`, the acting admin (`recordedById`), and
// an immutable `employee_events` audit row, so a corrected log stays honest.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a timestamptz for `${ymd} ${hhmm}` interpreted as wall-clock time in
 * `tz` (e.g. an admin types 10:30 for an employee in Asia/Kolkata → the UTC
 * instant that reads 10:30 there). Mirrors how `punchAttendance`/`logDate`
 * pin everything to the employee's own timezone rather than the server's UTC.
 */
function zonedWallClockToUtc(ymd: string, hhmm: string, tz: string): Date {
  const dParts = ymd.split("-").map((n) => parseInt(n, 10));
  const tParts = hhmm.split(":").map((n) => parseInt(n, 10));
  const y = dParts[0] ?? 1970;
  const mo = dParts[1] ?? 1;
  const d = dParts[2] ?? 1;
  const h = tParts[0] ?? 0;
  const mi = tParts[1] ?? 0;
  // Treat the wall-clock fields as if they were UTC, then correct by the zone's
  // offset at that instant. One iteration is exact except across the rare DST
  // boundary; India (the only configured tz) has no DST, so this is exact.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offsetMs = tzOffsetMs(new Date(asUtc), tz);
  return new Date(asUtc - offsetMs);
}

/** Offset (ms) of `tz` from UTC at instant `at` (positive east of UTC). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** Load the target employee's timezone (defaulting to IST), or null if gone. */
async function targetTz(employeeId: string): Promise<string | null> {
  const [row] = await db
    .select({ timezone: employees.timezone })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  return row.timezone || "Asia/Kolkata";
}

/** Load the notify-relevant slice of the target employee (for Task A8 admin
 *  triggers). Returns null if the employee is gone. */
async function targetForNotify(employeeId: string): Promise<{
  id: string;
  timezone: string;
  attLateAfter: string | null;
  attEarlyBefore: string | null;
} | null> {
  const [row] = await db
    .select({
      id: employees.id,
      timezone: employees.timezone,
      attLateAfter: employees.attLateAfter,
      attEarlyBefore: employees.attEarlyBefore,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  return { ...row, timezone: row.timezone || "Asia/Kolkata" };
}

function revalidateAttendanceAdmin(): void {
  revalidatePath("/attendance/dashboard");
  revalidatePath("/attendance/manage");
}

/**
 * Create or overwrite a single in/out punch for an employee+day. Upsert on the
 * (employee, day, kind) unique index: a second admin punch of the same kind
 * updates the time/reason rather than failing.
 */
export async function adminUpsertPunch(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminUpsertPunch.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  return upsertPunchCore(me.id, parsed.data);
}

/**
 * Shared upsert body for admin-recorded punches: writes the in/out punch as
 * `source:"admin"` (`verifyMethod:"none"`, no biometric/geofence), audits it,
 * fires the day-finalized / late-deduction emails when the day is now
 * complete, and revalidates. Called by `adminUpsertPunch` (any admin, via the
 * dashboard day-detail dialog) and `superAdminQuickPunch` (super-admins,
 * inline on the team list).
 */
async function upsertPunchCore(
  meId: string,
  {
    employeeId,
    logDate,
    kind,
    timeHHmm,
    reason,
  }: {
    employeeId: string;
    logDate: string;
    kind: "in" | "out";
    timeHHmm: string;
    reason: PunchReason;
  },
): Promise<ActionResult> {
  const tz = await targetTz(employeeId);
  if (!tz) return { ok: false, error: "Employee not found." };
  const loggedAt = zonedWallClockToUtc(logDate, timeHHmm, tz);

  try {
    await db
      .insert(attendanceLogs)
      .values({
        employeeId,
        logDate,
        kind,
        loggedAt,
        source: "admin",
        reason,
        recordedById: meId,
        verifyMethod: "none",
      })
      .onConflictDoUpdate({
        target: [
          attendanceLogs.employeeId,
          attendanceLogs.logDate,
          attendanceLogs.kind,
        ],
        set: {
          loggedAt,
          source: "admin",
          reason,
          recordedById: meId,
          verifyMethod: "none",
        },
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(meId, employeeId, "attendance_punch_upsert", {
    logDate,
    kind,
    timeHHmm,
    reason,
  });
  // If this upsert finalized the day (both in + out now present), fire the
  // same waived/half-day email an organic check-out would. Best-effort.
  const target = await targetForNotify(employeeId);
  if (target) {
    await notifyOnDayFinalized(target, logDate);
    await notifyAdminLateDeduction(target, logDate);
  }
  revalidateAttendanceAdmin();
  return { ok: true };
}

/**
 * Inline team-list quick punch — super-admins (Hetesh / Manan) only, TODAY
 * only. Stamps an employee's in/out for the current day at a super-admin-typed
 * time. The reason is fixed to "correction" so the UI stays decoupled from the
 * reason enum; everything else (audit, emails, source:"admin") flows through
 * `upsertPunchCore`. Guarded on BOTH super-admin and today so a crafted call
 * for another admin or a past date is refused.
 */
export async function superAdminQuickPunch(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can mark attendance here." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Inject the fixed reason before parsing the strict schema (the client only
  // sends employeeId / logDate / kind / timeHHmm).
  const withReason =
    typeof input === "object" && input !== null
      ? { ...(input as Record<string, unknown>), reason: "correction" }
      : input;
  const parsed = AdminUpsertPunch.safeParse(withReason);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const tz = me.timezone || "Asia/Kolkata";
  if (parsed.data.logDate !== localDateString(tz)) {
    return { ok: false, error: "Quick punch is for today only." };
  }
  return upsertPunchCore(me.id, parsed.data);
}

/**
 * Edit the existing in/out punch times for an employee+day. Only the supplied
 * side(s) are touched; a missing punch row is left as-is (use `adminUpsertPunch`
 * to create one). The reason on the existing rows is preserved.
 */
export async function adminEditDayTimes(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminEditDayTimes.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, logDate, inHHmm, outHHmm } = parsed.data;

  const tz = await targetTz(employeeId);
  if (!tz) return { ok: false, error: "Employee not found." };

  try {
    if (inHHmm) {
      await db
        .update(attendanceLogs)
        .set({ loggedAt: zonedWallClockToUtc(logDate, inHHmm, tz) })
        .where(
          and(
            eq(attendanceLogs.employeeId, employeeId),
            eq(attendanceLogs.logDate, logDate),
            eq(attendanceLogs.kind, "in"),
          ),
        );
    }
    if (outHHmm) {
      await db
        .update(attendanceLogs)
        .set({ loggedAt: zonedWallClockToUtc(logDate, outHHmm, tz) })
        .where(
          and(
            eq(attendanceLogs.employeeId, employeeId),
            eq(attendanceLogs.logDate, logDate),
            eq(attendanceLogs.kind, "out"),
          ),
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(me.id, employeeId, "attendance_punch_edit", {
    logDate,
    inHHmm: inHHmm ?? null,
    outHHmm: outHHmm ?? null,
  });
  // Re-grade the (now edited) day and fire waived/half-day if it applies.
  const target = await targetForNotify(employeeId);
  if (target) {
    await notifyOnDayFinalized(target, logDate);
    await notifyAdminLateDeduction(target, logDate);
  }
  revalidateAttendanceAdmin();
  return { ok: true };
}

/** Delete a single in/out punch for an employee+day. */
export async function adminDeletePunch(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminDeletePunch.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, logDate, kind } = parsed.data;

  try {
    await db
      .delete(attendanceLogs)
      .where(
        and(
          eq(attendanceLogs.employeeId, employeeId),
          eq(attendanceLogs.logDate, logDate),
          eq(attendanceLogs.kind, kind),
        ),
      );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(me.id, employeeId, "attendance_punch_delete", {
    logDate,
    kind,
  });
  revalidateAttendanceAdmin();
  return { ok: true };
}


/** Append an immutable `employee_events` audit row for an admin punch change.
 *  Best-effort: a failed audit write must never roll back the data change. */
async function auditPunch(
  actorId: string,
  employeeId: string,
  eventType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(employeeEvents).values({
      employeeId,
      actorId,
      eventType,
      toValue: detail,
      note: `Admin ${eventType} ${JSON.stringify(detail)}`,
    });
  } catch (err) {
    console.error("[attendance] admin punch audit write failed", err);
  }
}
