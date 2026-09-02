import { db } from "@/lib/db";
import { attendanceLogs } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { distanceMeters, evaluateGeofence } from "@/lib/geo";
import { withTimeout, DbTimeoutError } from "@/lib/db/with-timeout";
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
  // Anti-proxy Phase 2 — device-health attestation captured at the punch.
  integrityVerdict?: string | null; // strong | device | basic | failed | unverified
  mockLocation?: boolean | null;
  anomalyFlags?: string[] | null;
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

  const values = {
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
    integrityVerdict: verification.integrityVerdict ?? null,
    mockLocation: verification.mockLocation ?? null,
    anomalyFlags: verification.anomalyFlags && verification.anomalyFlags.length > 0 ? verification.anomalyFlags : null,
  };
  const dupError =
    kind === "in" ? "You already checked in today." : "You already checked out today.";

  // The punch write is the single most daily-critical mutation in the app, so it
  // gets the same stale-connection self-heal the read paths have. Against the
  // Supabase txn pooler a warm instance can be handed a bounced connection: the
  // INSERT then neither resolves nor throws — it HANGS on the dead socket (a
  // plain try/catch can't save it). `withTimeout` turns that hang into a fast
  // rejection; we then retry on a FRESH insert promise (→ a different, healthy
  // pooled connection). Genuine errors surface immediately (no spin).
  const budgetsMs = [6000, 10000, 14000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < budgetsMs.length; attempt++) {
    try {
      await withTimeout(
        db.insert(attendanceLogs).values(values),
        budgetsMs[attempt]!,
        "punch-insert",
      );
      return { ok: true, date: today };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("attendance_logs_employee_day_kind_uq")) {
        // First attempt → a genuine second punch for this kind today. A LATER
        // attempt → our own earlier (timed-out/hung) insert actually committed,
        // so the punch DID succeed even though its response never came back.
        return attempt === 0 ? { ok: false, error: dupError } : { ok: true, date: today };
      }
      lastErr = err;
      // Only a stale-connection HANG is worth retrying; a real error (constraint,
      // bug) won't heal on a fresh connection, so surface it now.
      if (!(err instanceof DbTimeoutError)) break;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return { ok: false, error: `Couldn't record your punch — please try again. (${msg})` };
}
