import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { orgSettings, type OrgSettings } from "@/db/schema";
import { withTimeoutOr } from "@/lib/db/with-timeout";

/**
 * The single-row `org_settings` table has `id = 1` as the only valid row.
 * The seed migration inserts it; we never insert from app code.  If the
 * row is somehow missing (fresh DB without migrations), we fall back to
 * the schema defaults so the caller never has to null-check.
 */
const DEFAULTS: OrgSettings = {
  id: 1,
  companyName: "Altus Corp",
  logoUrl: null,
  adminPinHash: null,
  digestHourIst: 9,
  idleTimeoutMinutes: 15,
  workingDays: [1, 2, 3, 4, 5],
  timezone: "Asia/Kolkata",
  allowSelfRegister: false,
  notificationMatrix: {
    task_assigned:  ["email", "slack", "whatsapp", "push"],
    task_initiated: ["email", "slack", "whatsapp", "push"],
    status_changed: ["email", "slack", "whatsapp", "push"],
    approved:       ["email", "slack", "whatsapp", "push"],
    declined:       ["email", "slack", "whatsapp", "push"],
    reassigned:     ["email", "slack", "whatsapp", "push"],
    transferred:    ["email", "slack", "whatsapp", "push"],
    cancelled:      ["email", "slack", "whatsapp", "push"],
    commented:      ["email", "slack", "whatsapp", "push"],
    overdue_digest: ["email"],
  },
  boardColumnOrder: null,
  officeLat: null,
  officeLng: null,
  attendanceRadiusM: 100,
  officeIpAllowlist: null,
  attLateAfter: "10:50",
  attEarlyBefore: "19:30",
  attFullDayHours: "9",
  attHalfDayHours: "5",
  hrAssignmentOwnerId: null,
  evaluationWeights: null,
  updatedAt: new Date(0),
  updatedById: null,
};

// Cross-user single-row read hit on EVERY authed page. There is no per-user or
// filter dimension, so we can cache it process-wide with a short TTL and serve
// almost every request from the data cache instead of the DB — directly cutting
// cold fan-out round-trips on the dashboard load path. unstable_cache serialises
// the result; OrgSettings has Date fields (`updatedAt`), but they are not read
// by any caller on the hot path (only label/threshold/timezone scalars are), so
// the Date→string round-trip is harmless here.
const fetchOrgSettings = unstable_cache(
  async (): Promise<OrgSettings[]> =>
    db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1),
  ["org-settings:v1"],
  { revalidate: 60 },
);

export async function getOrgSettings(): Promise<OrgSettings> {
  // Read in the app layout on every authed page, so a hang here would freeze the
  // whole app. Bound the (cached) read and fall back to DEFAULTS on timeout/error
  // — a cache MISS still goes to the DB, so a stale pooled connection on that miss
  // must never block rendering.
  const rows = await withTimeoutOr(
    fetchOrgSettings(),
    5000,
    [] as OrgSettings[],
    "org-settings",
  );
  return rows[0] ?? DEFAULTS;
}
