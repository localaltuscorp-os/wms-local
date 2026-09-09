"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
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
import { resolveWebDevice } from "@/lib/attendance/web-device";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/after";
import { localDateString } from "@/lib/format";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { withRetry } from "@/lib/db/with-timeout";
import { insertPunchRow, resolvePunchGeofence } from "@/lib/attendance/record-punch";
import { evaluateOfficeIp } from "@/lib/attendance/office-ip";
import { isDccFilledFor } from "@/lib/dcc/gate";

import { isManagerWithReports, isMondayIST, managerMondayGoalState } from "@/lib/manager-gates";
import {
  satCommitGateOn,
  monApproveGateOn,
  weekLossAckGateOn,
} from "@/lib/goals/flag";
import { acknowledgeWeek, getWeekReportState } from "@/lib/attendance/week-report";
import { reportedWeekFor, weekLabel } from "@/lib/attendance/week-loss";
import { assertMonthEditable } from "@/lib/reports/attendance-freeze";
import { weekCommitSatisfied, managerApproveSatisfied } from "@/lib/goals/gates-predicates";
import { isSaturdayIST, isWeekdayIST } from "@/lib/goals/gate-day";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import {
  notifyOnInPunch,
  notifyOnDayFinalized,
  notifyAdminLateDeduction,
  clockInTz,
} from "@/lib/attendance/punch-notify";
import {
  AdminUpsertPunch,
  AdminEditDayTimes,
  AdminDeletePunch,
} from "@/lib/validators/attendance";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { withTimeout } from "@/lib/db/with-timeout";
import { assertRemoteWorkApproved } from "@/lib/attendance/remote-work";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * `punchAttendance`'s result.
 *
 * `redirectTo` was dropped 2026-09-09 with the close-out gate - it existed only
 * to send a refused check-out to /my-day. No refusal in this file names a
 * destination any more, so the field is gone rather than left as a hook a future
 * gate could quietly re-use.
 */
type PunchActionResult =
  | { ok: true; date: string }
  | { ok: false; error: string };

const PunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    note: z.string().trim().max(500).optional(),
    location: z
      .object({
        lat: z.number().finite(),
        lng: z.number().finite(),
        accuracyM: z.number().finite().nonnegative(),
      })
      .optional(),
  })
  .strict();

/** Input for `syncDayPunch` — the Start/Finish My Day automation layer. */
const SyncDayPunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    location: z
      .object({
        lat: z.number().finite(),
        lng: z.number().finite(),
        accuracyM: z.number().finite().nonnegative(),
      })
      .optional(),
  })
  .strict();

/**
 * Record today's check-in or check-out. "Today" is the calendar day in the
 * employee's own timezone. One punch per kind per day — a duplicate returns a
 * friendly error instead of silently rewriting the log.
 *
 * The ONLY gate is the office geofence (location). When the admin has set
 * office coordinates the punch must carry a GPS fix inside `attendanceRadiusM`;
 * otherwise location is recorded but never rejected. No Wi-Fi/IP allowlist, no
 * biometric on the web path — verifyMethod is "gps_only".
 */
export async function punchAttendance(input: {
  kind: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
}): Promise<PunchActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = PunchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, note, location } = parsed.data;

  // Self-heal a stale pooled connection on the geofence read (see withRetry):
  // this sits on the daily-critical punch path, so a bounced connection must
  // not hang the submit. getOrgSettings is a cached read on the warm path.
  const settings = await withRetry(() => getOrgSettings(), {
    attempts: 3,
    timeoutMs: [6000, 10000, 14000],
    label: "punch-org-settings",
  });

  // ── DESIGNATED-DEVICE GATE (WEB punch) ───────────────────────────────
  // The phone half of the allowlist has been enforced since the anti-proxy
  // work; the web punch had NO device binding at all, so signing in on a
  // colleague's laptop and punching for them was simply possible. The browser
  // is now bound the same way — see lib/attendance/web-device.ts for how the
  // first laptop is grandfathered in and why that window closes per person.
  //
  // EITHER DEVICE SATISFIES THE RULE: this gate only speaks for the browser in
  // front of it. Someone whose laptop is away for repair punches from their
  // registered phone through the app, which carries its own gate — neither
  // device is a prerequisite for the other.
  const webDevice = await resolveWebDevice(me.id);
  if (!webDevice.ok) return { ok: false, error: webDevice.error };

  // ── Office geofence ──────────────────────────────────────────────────
  // When office coordinates are configured the punch must carry a GPS fix
  // inside the radius (with an accuracy guard — an imprecise fix asks for
  // precise location). When no coordinates are set the punch is accepted from
  // anywhere and location is still recorded. Shared verbatim with the mobile
  // punch via resolvePunchGeofence so the rule never diverges.
  const geo = resolvePunchGeofence(settings, location);
  if (!geo.ok) return { ok: false, error: geo.error };

  // ── Office-network gate (WEB punch only) — closes the browser bypass ──
  // The web punch has no device binding (browsers can't do the keystore id),
  // so it's the "clock in from home in a browser" hole. When the office IP
  // allowlist is set, the web punch must leave the office network — an IP a
  // GPS-spoofer can't fake. Safe-default: no allowlist ⇒ off (nobody locked
  // out). The device-bound mobile app punch is intentionally NOT gated here
  // (staff may be on mobile data at the office; it carries the stronger
  // device + mock + integrity anti-proxy instead).
  const officeIp = await evaluateOfficeIp(settings.officeIpAllowlist);
  if (officeIp.configured && !officeIp.allowed) {
    return {
      ok: false,
      error: "Web attendance must be on the office network. For field or remote work, punch from the Altus app.",
    };
  }

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // ── Saturday commit gate (NEW, default OFF) ──────────────────────────
  // On Saturday the week-close ritual is COMMIT — freeze next week's goals +
  // fill this week's progress — so punch-out is blocked until the week is
  // committed. FAIL-OPEN (a read error never traps punch-out); honors
  // SAT_COMMIT_GATE_ON (default off ⇒ this whole block is a no-op).
  if (kind === "out" && satCommitGateOn() && isSaturdayIST()) {
    const committed = await weekCommitSatisfied(me.id, currentWeekStart()).catch(() => true);
    if (!committed) {
      return { ok: false, error: "Commit next week's goals and fill this week's progress before you clock out — open Goals › Commit." };
    }
  }

  // ── Close-out gate — REMOVED 2026-09-09 ──────────────────────────────
  // Clock-OUT used to require today's commitments to be closed out first (mark
  // done / 0-100% on each of the MIN_ATTENDANCE_ITEMS things), bouncing the
  // employee to /my-day when they had not been. That prerequisite is gone: an
  // employee checks out immediately.
  //
  // The daily planner itself is UNTOUCHED — /my-day, "Finish My Day" and
  // isDayClosedOut() all still work. Only the punch's dependency on them is
  // removed. Do not reinstate a close-out check here; the requirement was
  // withdrawn, not switched off, so there is no flag to flip back.

  // ── DCC punch-out block ──────────────────────────────────────────────
  // You can't clock OUT for the day until today's DCC is filled. FAIL-OPEN:
  // a check error never traps a punch-out. Honors the DCC_GATE_OFF switch.
  // When the Saturday commit gate is live, DCC is enforced Mon–Fri only —
  // Saturday's ritual is the commit above (design §4). With the Sat gate off
  // (default) this is unchanged: DCC blocks punch-out every day.
  const dccBlockDay = satCommitGateOn() ? isWeekdayIST() : true;
  if (kind === "out" && dccBlockDay && false /* gate force-off 2026-07-27 (attendance unblock) */) {
    const dccDone = await isDccFilledFor(me.id, today).catch(() => true);
    if (!dccDone) {
      return { ok: false, error: "Fill today's DCC before you clock out — open the DCC page, then try again." };
    }
  }

  // ── Clock-IN planning gate — REMOVED 2026-09-09 ──────────────────────
  // Clocking IN used to require MIN_ATTENDANCE_ITEMS (5) things on today's plan
  // AND today's progress logged on every open weekly goal. Both prerequisites
  // are gone: an employee clocks in immediately, with no plan of any size.
  //
  // Planning is still available and still useful — /my-day, "Start My Day",
  // needsDailyPlan() and the weekly-goal actuals all remain. What was deleted is
  // the punch's dependency on them, here and in the mobile punch route, so the
  // rule cannot survive in one path after being dropped from the other.

  // ── WEEK-LOSS ACKNOWLEDGEMENT (Sir) ──────────────────────────────────
  // On the first punch of a NEW WEEK, the employee must have seen last week's
  // ATTENDANCE LOST + MONEY LOST report and dismissed it. The dialog that shows
  // it lives on the attendance page (components/attendance/week-loss-dialog.tsx)
  // and calls `acknowledgeWeekLoss` below; this is the server-side half that
  // makes it a real gate rather than a dialog you can navigate around.
  //
  // NOT "Monday only": keyed on the WEEK, so someone who was on leave on Monday
  // still gets the report on the first day they actually punch. Once dismissed,
  // it does not reappear until the next week.
  //
  // CHECK-IN ONLY. Gating the check-OUT would strand someone mid-shift with no
  // way to close their day, and the report is about starting the week anyway.
  //
  // FAIL-OPEN, twice over: `getWeekReportState` swallows its own errors, and the
  // `.catch()` here covers anything left. A report that cannot be computed must
  // never be a locked door — 2026-07-27 is why.
  if (kind === "in" && weekLossAckGateOn()) {
    const week = await getWeekReportState(me.id, today).catch(() => ({
      loss: null,
      pending: false,
      weekStart: "",
    }));
    if (week.pending && week.loss) {
      return {
        ok: false,
        error: `Read last week's attendance and money-lost report (${weekLabel(week.loss.weekStart, week.loss.weekEnd)}) before you clock in — it is on this page.`,
      };
    }
  }

  // ── Monday manager-approval gate (NEW, default OFF) ──────────────────
  // On Monday a manager can't clock IN until they've approved their downline's
  // LAST-week progress + THIS-week committed goals (Goals Module 3). FAIL-OPEN;
  // honors MON_APPROVE_GATE_ON (default off ⇒ no-op); super-admins + non-managers
  // exempt (managerApproveSatisfied is vacuously true for someone with no reports).
  if (kind === "in" && monApproveGateOn() && !isSuperAdmin(me.email) && isMondayIST()) {
    const isMgr = await isManagerWithReports(me.id).catch(() => false);
    if (isMgr) {
      const approved = await managerApproveSatisfied(me.id, currentWeekStart()).catch(() => true);
      if (!approved) {
        return {
          ok: false,
          error: "Approve your team's last-week progress and this-week goals before you clock in — open Goals › Approve.",
        };
      }
    }
  }

  // ── Manager Monday goal-set gate ─────────────────────────────────────
  // On Monday (IST) a manager can't clock IN until every active report has this
  // week's goals set with weights summing to 100 (satisfied if set over the
  // weekend). FAIL-OPEN, honors MANAGER_GATES_OFF, super-admins exempt.
  if (
    kind === "in" &&
    false /* mgr Monday gate force-off 2026-07-27 (attendance unblock) */ &&
    !isSuperAdmin(me.email) &&
    isMondayIST()
  ) {
    const monday = await managerMondayGoalState(me.id).catch(() => ({ satisfied: true, reports: [] }));
    if (!monday.satisfied) {
      const short = monday.reports.filter((r) => !r.ok).map((r) => r.name).join(", ");
      return {
        ok: false,
        error: `Set this week's goals (weights = 100) for ${short} before you clock in — open Weekly Goals.`,
      };
    }
  }

  // Insert via the shared core (today-only; one punch per kind per day).
  // verifyMethod "gps_only": location-verified, no biometric on the web path.
  const inserted = await insertPunchRow(
    { id: me.id, timezone: tz },
    { kind, note, location, distanceM: geo.distanceM },
    { verifyMethod: "gps_only", source: "self" },
  );
  if (!inserted.ok) return inserted;

  // ── Best-effort attendance notifications (Task A8) ───────────────────
  // The punch is committed above; a notify failure must never surface to the
  // user. On check-in we flag a late arrival; on check-out we recompute the
  // finalized day and fire waived/half-day as appropriate. DEFERRED to after
  // the response (Operation Butter, persist-then-return): the punch returns the
  // instant the row commits, so the load-sensitive clock-in path no longer
  // blocks on the notification fan-out. Best-effort already, so a dropped
  // after() is acceptable.
  if (kind === "in") {
    const inAt = clockInTz(new Date(), tz);
    afterResponse(() => notifyOnInPunch(me, today, inAt));
  } else {
    afterResponse(() => notifyOnDayFinalized(me, today));
  }

  revalidatePath("/attendance");
  return { ok: true, date: today };
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
/** Selects the FULL schedule slice — worker type and the official start/end
 *  included. Selecting only late-after/early-before is what let the notifier
 *  grade against org defaults instead of the employee's own configuration. */
async function targetForNotify(employeeId: string): Promise<{
  id: string;
  timezone: string;
  workerType: string | null;
  attOfficialStart: string | null;
  attOfficialEnd: string | null;
  attLateAfter: string | null;
  attEarlyBefore: string | null;
  attFullDayMinutes: number | null;
  attHalfDayMinutes: number | null;
  weeklyTargetMinutes: number | null;
} | null> {
  const [row] = await db
    .select({
      id: employees.id,
      timezone: employees.timezone,
      workerType: employees.workerType,
      attOfficialStart: employees.attOfficialStart,
      attOfficialEnd: employees.attOfficialEnd,
      attLateAfter: employees.attLateAfter,
      attEarlyBefore: employees.attEarlyBefore,
      attFullDayMinutes: employees.attFullDayMinutes,
      attHalfDayMinutes: employees.attHalfDayMinutes,
      weeklyTargetMinutes: employees.weeklyTargetMinutes,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  return { ...row, timezone: row.timezone || "Asia/Kolkata" };
}

function revalidateAttendanceAdmin(): void {
  revalidatePath("/attendance/dashboard");
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
  // Rule 7 — a frozen month can't be edited (fail-open + flag-gated, default OFF).
  const editable = await assertMonthEditable(logDate);
  if (!editable.ok) return editable;

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
  // same waived/half-day email an organic check-out would. Best-effort,
  // DEFERRED off the response (persist-then-return) — the day-grade read +
  // notify fan-out run after the admin's action returns.
  afterResponse(async () => {
    const target = await targetForNotify(employeeId);
    if (target) {
      await notifyOnDayFinalized(target, logDate);
      await notifyAdminLateDeduction(target, logDate);
    }
  });
  revalidateAttendanceAdmin();
  return { ok: true };
}

const SuperAdminSetPunch = z.object({
  employeeId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date"),
  kind: z.enum(["in", "out"]),
  /** "HH:mm" to set/replace the punch, or null to CLEAR it. */
  timeHHmm: z.string().regex(/^\d{2}:\d{2}$/, "Bad time").nullable(),
});

/**
 * SUPER-ADMIN attendance edit — set/replace or CLEAR an in/out punch for any
 * employee on ANY day (past or today). Powers the self-calendar day popup (own
 * attendance) and the Team roster rows (others). Set reuses the audited admin
 * upsert; clear deletes that day+kind row. Frozen months are still refused
 * (assertMonthEditable) — no override, per Sir. Recorded with `recordedById`
 * for a full audit trail.
 */
export async function superAdminSetPunch(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can edit attendance." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SuperAdminSetPunch.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, logDate, kind, timeHHmm } = parsed.data;

  // SET → the audited admin upsert (respects the month freeze internally).
  if (timeHHmm) {
    const res = await upsertPunchCore(me.id, { employeeId, logDate, kind, timeHHmm, reason: "correction" });
    if (res.ok) revalidatePath("/attendance");
    return res;
  }

  // CLEAR → delete that day+kind punch (still respect the freeze).
  const editable = await assertMonthEditable(logDate);
  if (!editable.ok) return editable;
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
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  await auditPunch(me.id, employeeId, "attendance_punch_clear", { logDate, kind });
  revalidateAttendanceAdmin();
  revalidatePath("/attendance");
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

  const editable = await assertMonthEditable(logDate);
  if (!editable.ok) return editable;

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
  // Best-effort, DEFERRED off the response (persist-then-return).
  afterResponse(async () => {
    const target = await targetForNotify(employeeId);
    if (target) {
      await notifyOnDayFinalized(target, logDate);
      await notifyAdminLateDeduction(target, logDate);
    }
  });
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

  const editable = await assertMonthEditable(logDate);
  if (!editable.ok) return editable;

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

/**
 * WFH / on-site remote check-in. For staff working from home or in the field:
 * captures location + a required reason + a required photo + a work-mode tag,
 * and logs it as a normal punch (auto-counted present; admins review it on the
 * report via the work_mode badge + evidence photo). No geofence — that's the
 * point. One punch per kind per day, same as the office flow.
 */
const REMOTE_MODES = ["wfh", "client_site", "field", "other"] as const;
export async function punchRemote(form: FormData): Promise<ActionResult<{ date: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const kind = String(form.get("kind") ?? "");
  if (kind !== "in" && kind !== "out") return { ok: false, error: "Invalid check-in type." };

  const workMode = String(form.get("workMode") ?? "");
  if (!REMOTE_MODES.includes(workMode as (typeof REMOTE_MODES)[number])) {
    return { ok: false, error: "Pick where you're working from." };
  }

  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { ok: false, error: "A reason / note is required." };

  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  const acc = Number(form.get("accuracyM"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Location is required — tap Enable location." };
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, error: "A photo is required." };
  if (photo.size > 15 * 1024 * 1024) return { ok: false, error: "Photo exceeds 15 MB." };
  if (!photo.type.startsWith("image/")) return { ok: false, error: "Evidence must be a photo." };

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // ── WEEK-LOSS ACKNOWLEDGEMENT — the same gate as the office punch ──────
  // A remote check-in is still a check-IN, and it is a self-service one, so
  // leaving it open would make the rule optional for anyone who taps "working
  // from home" instead. Checked BEFORE the photo is uploaded, so a refusal
  // never leaves an orphaned file in the bucket.
  //
  // CHECK-IN ONLY and FAIL-OPEN, exactly as in `punchAttendance`.
  if (kind === "in" && weekLossAckGateOn()) {
    const week = await getWeekReportState(me.id, today).catch(() => ({
      loss: null,
      pending: false,
      weekStart: "",
    }));
    if (week.pending && week.loss) {
      return {
        ok: false,
        error: `Read last week's attendance and money-lost report (${weekLabel(week.loss.weekStart, week.loss.weekEnd)}) before you check in — open the Attendance page.`,
      };
    }
  }

  // Remote work needs an APPROVED request for this employee and date. Checked
  // here so the person gets a sentence they can act on; migration 0205's trigger
  // refuses the same insert regardless, for the writers that forget to ask.
  // Deliberately before the upload — an unapproved punch must not leave an
  // orphaned photo in storage.
  const gate = await assertRemoteWorkApproved(me.id, today, workMode);
  if (!gate.ok) return { ok: false, error: gate.error };

  const safe = photo.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "photo.jpg";
  const path = `attendance/remote/${me.id}/${today}-${kind}-${crypto.randomUUID()}/${safe}`;

  const admin = getSupabaseAdmin();
  const buf = Buffer.from(await photo.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: photo.type || "image/jpeg", upsert: false });
  if (upErr) return { ok: false, error: `Photo upload failed: ${upErr.message}` };

  const values = {
    employeeId: me.id,
    logDate: today,
    kind: kind as "in" | "out",
    note: reason.slice(0, 500),
    lat,
    lng,
    accuracyM: Number.isFinite(acc) ? acc : null,
    distanceM: null,
    verifyMethod: "gps_only" as const,
    source: "self" as const,
    reason: (workMode === "wfh" ? "wfh" : "client_visit") as PunchReason,
    workMode,
    // Which client site, taken from the APPROVED request rather than from the
    // client — the browser does not get to choose where it was.
    clientLocationId: gate.clientLocationId,
    evidencePath: path,
  };
  const dupError = kind === "in" ? "You already checked in today." : "You already checked out today.";
  try {
    await withTimeout(db.insert(attendanceLogs).values(values), 12000, "remote-punch-insert");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    if (msg.includes("attendance_logs_employee_day_kind_uq")) return { ok: false, error: dupError };
    return { ok: false, error: `Could not save: ${msg.slice(0, 200)}` };
  }
  revalidatePath("/attendance");
  return { ok: true, date: today };
}

/**
 * START MY DAY / FINISH MY DAY → the EXISTING check-in / check-out.
 *
 * An automation layer, not a second attendance system. It performs no punch of
 * its own: it either recognises the punch that is already on file, or delegates
 * to `punchAttendance` — the same action the Attendance page's buttons call, so
 * every gate (geofence, office IP, the Saturday commit rule, the goals rituals,
 * the plan minimum) still applies exactly as it does today. Nothing about the
 * manual Check In / Check Out flow changes; this only removes the need to go
 * and press it.
 *
 * ── IDEMPOTENT BY READING FIRST ────────────────────────────────────────────
 * `attendance_logs` has a UNIQUE (employee_id, log_date, kind), so a second
 * punch could never create a duplicate row — it would fail. That failure is the
 * wrong answer here: someone who checked in manually and then hits Start My Day
 * has done nothing wrong, and must not be shown an error. So this reads the
 * day's row first and reports `already: true`, which the caller renders as
 * reassurance rather than a problem.
 *
 * Returns the punch time either way, so the UI can say WHEN the day started
 * rather than just that it did.
 */
export async function syncDayPunch(input: {
  kind: "in" | "out";
  /** Best-effort GPS from the browser. Omitted when the user declined or the
   *  fix timed out — `punchAttendance` decides whether that is acceptable. */
  location?: { lat: number; lng: number; accuracyM: number };
}): Promise<ActionResult<{ date: string; already: boolean; at: string | null }>> {
  const me = await requireUser();

  const parsed = SyncDayPunchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, location } = parsed.data;

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // Already on file — manual punch, an earlier click, or a double submit.
  // Deliberately a READ, not a caught constraint violation: the difference
  // between "already done" and "failed" has to be visible to the caller.
  const existing = await db
    .select({ loggedAt: attendanceLogs.loggedAt })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, me.id),
        eq(attendanceLogs.logDate, today),
        eq(attendanceLogs.kind, kind),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return {
      ok: true,
      date: today,
      already: true,
      at: existing[0].loggedAt?.toISOString() ?? null,
    };
  }

  // Not punched yet → the real thing. Every rule lives in there, and this call
  // is indistinguishable from the button on the Attendance page.
  const res = await punchAttendance({ kind, location });
  if (!res.ok) return res;

  return { ok: true, date: res.date, already: false, at: new Date().toISOString() };
}

/**
 * "I have read last week's report" — the Cancel button on the Monday dialog.
 *
 * SELF-ONLY and PERIOD-PINNED: it always writes for the caller, and always for
 * the week `reportedWeekFor(today)` resolves to on the SERVER. Nothing about
 * whose row this is, or which week it clears, comes off the wire — so a crafted
 * request cannot acknowledge someone else's report, and cannot pre-clear a week
 * that has not happened yet to skip a future dialog.
 *
 * The FIGURES do come from the client, because they are a record of what was on
 * the screen rather than an input to any decision (see the migration note). They
 * are clamped to sane bounds so a tampered payload cannot write nonsense into
 * the audit trail, and they gate nothing at all.
 *
 * Idempotent: the unique (employee, week) index absorbs a double-click.
 */
export async function acknowledgeWeekLoss(input: {
  daysLost: number;
  moneyLost: number;
}): Promise<ActionResult<{ weekStart: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const tz = me.timezone || "Asia/Kolkata";
  const { weekStart } = reportedWeekFor(localDateString(tz));

  // Record-keeping only — clamped, never trusted, never used in a decision.
  const clamp = (n: unknown, hi: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), hi) : 0;
  };

  try {
    await acknowledgeWeek(me.id, weekStart, {
      daysLost: clamp(input?.daysLost, 31),
      moneyLost: clamp(input?.moneyLost, 100_000_000),
    });
    // The punch card and the dialog both live on this page, and the gate above
    // reads the row we just wrote — so the page has to re-render for the clock
    // to unlock.
    revalidatePath("/attendance");
    return { ok: true, weekStart };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }}
