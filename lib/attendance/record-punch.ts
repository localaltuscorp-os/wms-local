import { db } from "@/lib/db";
import { attendanceLogs } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { distanceMeters, evaluateGeofence } from "@/lib/geo";
import type { getOrgSettings } from "@/lib/queries/org-settings";

type OrgSettings = Awaited<ReturnType<typeof getOrgSettings>>;
type PunchLocation = { lat: number; lng: number; accuracyM: number };

/**
 * Gate 1 — the office geofence, shared verbatim by the web Server Action and
 * the native punch API so the security rule never diverges. When the admin has
 * set office coordinates the punch MUST carry a GPS fix inside
 * `attendance_radius_m`; otherwise location is recorded but never rejected.
 * Returns the distance-to-office (or null when unfenced) on success.
 */
export function resolvePunchGeofence(
  settings: OrgSettings,
  location: PunchLocation | undefined,
): { ok: true; distanceM: number | null } | { ok: false; error: string } {
  const fenced = settings.officeLat != null && settings.officeLng != null;
  if (!fenced) {
    return { ok: true, distanceM: null };
  }
  if (!location) {
    return {
      ok: false,
      error: "Location is required to punch — please allow location access.",
    };
  }
  const distanceM = distanceMeters(
    location.lat,
    location.lng,
    settings.officeLat!,
    settings.officeLng!,
  );
  const verdict = evaluateGeofence(distanceM, location.accuracyM, settings.attendanceRadiusM);
  if (!verdict.ok) {
    return {
      ok: false,
      error:
        verdict.reason === "too_imprecise"
          ? `GPS too imprecise (±${Math.round(location.accuracyM)}m). Turn on Precise/High-accuracy location and try again.`
          : `You're ~${Math.round(verdict.effectiveDistanceM)}m from the office — punches register only within ${settings.attendanceRadiusM}m.`,
    };
  }
  return { ok: true, distanceM };
}

export interface PunchVerification {
  verifyMethod: "biometric" | "gps_only" | "none";
  credentialId?: string | null;
  mobileDeviceId?: string | null;
  source?: "self" | "admin";
}

/**
 * Insert a single attendance punch row for `today` (the caller's timezone-local
 * calendar day — self punches are today-only; backfills go through the audited
 * admin actions). One punch per kind per day; a duplicate maps to a friendly
 * error instead of silently rewriting. Geofence + biometric/device gates run in
 * the caller BEFORE this; this function only commits the row.
 */
export async function insertPunchRow(
  actor: { id: string; timezone: string },
  fields: {
    kind: "in" | "out";
    note?: string | null;
    location?: PunchLocation;
    distanceM: number | null;
  },
  verification: PunchVerification,
): Promise<{ ok: true; date: string } | { ok: false; error: string }> {
  const tz = actor.timezone || "Asia/Kolkata";
  const today = localDateString(tz);
  const { kind, note, location, distanceM } = fields;

  try {
    await db.insert(attendanceLogs).values({
      employeeId: actor.id,
      logDate: today,
      kind,
      note: note ? note : null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      accuracyM: location?.accuracyM ?? null,
      distanceM,
      verifyMethod: verification.verifyMethod,
      credentialId: verification.credentialId ?? null,
      mobileDeviceId: verification.mobileDeviceId ?? null,
      source: verification.source ?? "self",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("attendance_logs_employee_day_kind_uq")) {
      return {
        ok: false,
        error: kind === "in" ? "You already checked in today." : "You already checked out today.",
      };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
  return { ok: true, date: today };
}
