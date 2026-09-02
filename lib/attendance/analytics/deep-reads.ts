import "server-only";
import { and, between, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, compOffCredits } from "@/db/schema";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getOvertimeDashboard, type OvertimeDashboard } from "@/lib/queries/overtime";

/**
 * Deep attendance analytics — the second data tier for the org-wide Workforce
 * Intelligence dashboard. Server-only. Each read is a small batched GROUP-BY
 * over the month's `attendance_logs` (plus one comp-off roll-up + the existing
 * overtime dashboard), so the whole bundle is load-neutral (a handful of
 * indexed aggregate queries, no per-employee fan-out).
 *
 * These complement `loadOrgAttendanceAnalytics` (which folds the graded month):
 *  (a) work-mode mix — where punches happen (office / WFH / client-site / …)
 *  (b) verification mix — biometric vs GPS-only vs unverified
 *  (c) location integrity — geofence adherence + average distance from office
 *  (d) overtime roll-up (reuses getOvertimeDashboard)
 *  (e) comp-off ledger roll-up (earned / redeemed / open)
 */

/* ------------------------------------------------------------------ */
/* Contract types                                                      */
/* ------------------------------------------------------------------ */

export interface WorkModeSlice {
  /** office | wfh | client_site | field | other */
  key: string;
  label: string;
  /** Number of punches (in + out) in this mode this month. */
  count: number;
  tone: string;
}

export interface RemoteWorkAnalytics {
  slices: WorkModeSlice[];
  totalPunches: number;
  /** Punches NOT in plain office mode (wfh + client_site + field + other). */
  remotePunches: number;
  /** 0..100 share of punches that were remote/off-site. */
  remoteSharePct: number;
}

export interface VerifyModeSlice {
  /** biometric | gps_only | none */
  key: string;
  label: string;
  count: number;
  tone: string;
}

export interface BiometricAnalytics {
  slices: VerifyModeSlice[];
  totalPunches: number;
  biometricPunches: number;
  gpsPunches: number;
  unverifiedPunches: number;
  /** 0..100 share verified by biometric. */
  biometricSharePct: number;
  /** 0..100 share verified by biometric OR gps. */
  verifiedSharePct: number;
}

export interface LocationAnalytics {
  /** Punches that carried a GPS distance-from-office reading. */
  locatedPunches: number;
  /** Average distance-from-office (m) across located punches. */
  avgDistanceM: number;
  /** Farthest recorded distance-from-office (m). */
  maxDistanceM: number;
  /** Punches recorded beyond the configured geofence radius. */
  outOfGeofence: number;
  /** Punches within the geofence radius. */
  withinGeofence: number;
  /** The org geofence radius used for the split (m). */
  geofenceRadiusM: number;
  /** 0..100 share of located punches inside the fence. */
  withinSharePct: number;
}

export interface CompOffOrgRollup {
  /** Credits EARNED (earned_date) within the month. */
  monthEarned: number;
  /** Credits REDEEMED (redeemed_date) within the month. */
  monthRedeemed: number;
  /** Currently-open (un-redeemed) credits across the org, all-time. */
  openTotal: number;
  /** Redeemed credits across the org, all-time. */
  redeemedTotal: number;
}

export interface OrgAttendanceDeepReads {
  remote: RemoteWorkAnalytics;
  biometric: BiometricAnalytics;
  location: LocationAnalytics;
  overtime: OvertimeDashboard;
  compOff: CompOffOrgRollup;
}

/* ------------------------------------------------------------------ */
/* Static maps                                                         */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const WORK_MODE_META: Record<string, { label: string; tone: string }> = {
  office: { label: "Office", tone: "#16a34a" },
  wfh: { label: "Work From Home", tone: "#2563eb" },
  client_site: { label: "Client Site", tone: "#7c3aed" },
  field: { label: "Field", tone: "#d97706" },
  other: { label: "Other", tone: "#64748b" },
};
const WORK_MODE_ORDER = ["office", "wfh", "client_site", "field", "other"];

const VERIFY_META: Record<string, { label: string; tone: string }> = {
  biometric: { label: "Biometric", tone: "#15803d" },
  gps_only: { label: "Location (GPS)", tone: "#2563eb" },
  none: { label: "Unverified", tone: "#dc2626" },
};
const VERIFY_ORDER = ["biometric", "gps_only", "none"];

/** First and last calendar day (YYYY-MM-DD) of a year/month (month is 1-12). */
function monthBounds(year: number, month: number): { first: string; last: string } {
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

/* ------------------------------------------------------------------ */
/* The loader                                                          */
/* ------------------------------------------------------------------ */

/**
 * Load the deep-analytics bundle for a month. `refTodayISO` is only used to
 * label / scope the overtime roll-up; the attendance aggregates are pinned to
 * the requested month's `log_date` window.
 */
export async function loadOrgAttendanceDeepReads(
  year: number,
  month: number,
  _refTodayISO: string,
): Promise<OrgAttendanceDeepReads> {
  const { first, last } = monthBounds(year, month);
  const org = await getOrgSettings();
  const radiusM = Number(org.attendanceRadiusM ?? 100) || 100;
  const monthLabel = `${MONTHS_SHORT[month - 1]} ${year}`;

  const monthWindow = between(attendanceLogs.logDate, first, last);

  const [modeRows, verifyRows, locAgg, geoFar, compEarned, compRedeemed, compOpen, compRedeemedAll, overtime] =
    await Promise.all([
      // (a) work-mode mix. NULL work_mode = plain office geofenced punch.
      db
        .select({
          mode: sql<string>`COALESCE(${attendanceLogs.workMode}, 'office')`,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(attendanceLogs)
        .where(monthWindow)
        .groupBy(sql`COALESCE(${attendanceLogs.workMode}, 'office')`),

      // (b) verification mix.
      db
        .select({
          verify: attendanceLogs.verifyMethod,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(attendanceLogs)
        .where(monthWindow)
        .groupBy(attendanceLogs.verifyMethod),

      // (c) location aggregates over punches that carry a distance reading.
      db
        .select({
          located: sql<number>`COUNT(*)::int`,
          avgDist: sql<number>`COALESCE(AVG(${attendanceLogs.distanceM}), 0)`,
          maxDist: sql<number>`COALESCE(MAX(${attendanceLogs.distanceM}), 0)`,
        })
        .from(attendanceLogs)
        .where(and(monthWindow, isNotNull(attendanceLogs.distanceM))),

      // (c-ii) out-of-geofence count (distance beyond the configured radius).
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(attendanceLogs)
        .where(
          and(
            monthWindow,
            isNotNull(attendanceLogs.distanceM),
            sql`${attendanceLogs.distanceM} > ${radiusM}`,
          ),
        ),

      // (e-i) comp-off earned this month.
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(compOffCredits)
        .where(between(compOffCredits.earnedDate, first, last)),

      // (e-ii) comp-off redeemed this month.
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(compOffCredits)
        .where(
          and(
            isNotNull(compOffCredits.redeemedDate),
            gte(compOffCredits.redeemedDate, first),
            lte(compOffCredits.redeemedDate, last),
          ),
        ),

      // (e-iii) all-time OPEN credits (outstanding comp-off liability).
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(compOffCredits)
        .where(eq(compOffCredits.status, "open")),

      // (e-iv) all-time REDEEMED credits.
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(compOffCredits)
        .where(eq(compOffCredits.status, "redeemed")),

      // (d) overtime roll-up — org-wide (isAdmin → scope.all).
      getOvertimeDashboard({
        employeeId: "00000000-0000-0000-0000-000000000000",
        isAdmin: true,
        monthStartISO: first,
        monthLabel,
      }),
    ]);

  /* ── (a) remote-work ─────────────────────────────────────────── */
  const modeCounts = new Map<string, number>();
  for (const r of modeRows) {
    const key = WORK_MODE_META[r.mode] ? r.mode : "other";
    modeCounts.set(key, (modeCounts.get(key) ?? 0) + Number(r.n));
  }
  const modeSlices: WorkModeSlice[] = WORK_MODE_ORDER.map((key) => ({
    key,
    label: WORK_MODE_META[key]!.label,
    count: modeCounts.get(key) ?? 0,
    tone: WORK_MODE_META[key]!.tone,
  })).filter((s) => s.count > 0);
  const totalModePunches = modeSlices.reduce((n, s) => n + s.count, 0);
  const remotePunches = modeSlices
    .filter((s) => s.key !== "office")
    .reduce((n, s) => n + s.count, 0);
  const remote: RemoteWorkAnalytics = {
    slices: modeSlices,
    totalPunches: totalModePunches,
    remotePunches,
    remoteSharePct: totalModePunches > 0 ? Math.round((remotePunches / totalModePunches) * 100) : 0,
  };

  /* ── (b) biometric ───────────────────────────────────────────── */
  const verifyCounts = new Map<string, number>();
  for (const r of verifyRows) {
    const key = VERIFY_META[r.verify] ? r.verify : "none";
    verifyCounts.set(key, (verifyCounts.get(key) ?? 0) + Number(r.n));
  }
  const verifySlices: VerifyModeSlice[] = VERIFY_ORDER.map((key) => ({
    key,
    label: VERIFY_META[key]!.label,
    count: verifyCounts.get(key) ?? 0,
    tone: VERIFY_META[key]!.tone,
  })).filter((s) => s.count > 0);
  const biometricPunches = verifyCounts.get("biometric") ?? 0;
  const gpsPunches = verifyCounts.get("gps_only") ?? 0;
  const unverifiedPunches = verifyCounts.get("none") ?? 0;
  const totalVerifyPunches = biometricPunches + gpsPunches + unverifiedPunches;
  const biometric: BiometricAnalytics = {
    slices: verifySlices,
    totalPunches: totalVerifyPunches,
    biometricPunches,
    gpsPunches,
    unverifiedPunches,
    biometricSharePct: totalVerifyPunches > 0 ? Math.round((biometricPunches / totalVerifyPunches) * 100) : 0,
    verifiedSharePct:
      totalVerifyPunches > 0
        ? Math.round(((biometricPunches + gpsPunches) / totalVerifyPunches) * 100)
        : 0,
  };

  /* ── (c) location ────────────────────────────────────────────── */
  const located = Number(locAgg[0]?.located ?? 0);
  const outOfGeofence = Number(geoFar[0]?.n ?? 0);
  const withinGeofence = Math.max(0, located - outOfGeofence);
  const location: LocationAnalytics = {
    locatedPunches: located,
    avgDistanceM: Math.round(Number(locAgg[0]?.avgDist ?? 0)),
    maxDistanceM: Math.round(Number(locAgg[0]?.maxDist ?? 0)),
    outOfGeofence,
    withinGeofence,
    geofenceRadiusM: radiusM,
    withinSharePct: located > 0 ? Math.round((withinGeofence / located) * 100) : 0,
  };

  /* ── (e) comp-off ────────────────────────────────────────────── */
  const compOff: CompOffOrgRollup = {
    monthEarned: Number(compEarned[0]?.n ?? 0),
    monthRedeemed: Number(compRedeemed[0]?.n ?? 0),
    openTotal: Number(compOpen[0]?.n ?? 0),
    redeemedTotal: Number(compRedeemedAll[0]?.n ?? 0),
  };

  return { remote, biometric, location, overtime, compOff };
}
