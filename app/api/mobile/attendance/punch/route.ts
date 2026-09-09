import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { resolvePunchGeofence, insertPunchRow } from "@/lib/attendance/record-punch";
import { resolveMobileDevice } from "@/lib/attendance/mobile-devices";
import { attendanceIntegrityMode } from "@/lib/attendance/integrity-mode";
import { consumePunchNonce } from "@/lib/attendance/punch-nonce";
import { verifyPlayIntegrity } from "@/lib/attendance/play-integrity";
import { isDccFilledFor } from "@/lib/dcc/gate";
import {
  needsDailyPlan,
  dailyPlanShortfall,
  MIN_ATTENDANCE_ITEMS,
} from "@/lib/daily-checklist/gate";
import { needsGoalActuals } from "@/lib/weekly-goals/actuals";
import { isManagerWithReports, isMondayIST, managerMondayGoalState } from "@/lib/manager-gates";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  satCommitGateOn,
  monApproveGateOn,
  checkoutCloseoutGateOn,
  punchPlanGateOn,
  weekLossAckGateOn,
  weekLossAckMobileGateOn,
} from "@/lib/goals/flag";
import { getWeekReportState } from "@/lib/attendance/week-report";
import { isDayClosedOut } from "@/lib/queries/daily-checklist";
import { weekCommitSatisfied, managerApproveSatisfied } from "@/lib/goals/gates-predicates";
import { isSaturdayIST, isWeekdayIST } from "@/lib/goals/gate-day";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { localDateString } from "@/lib/format";
import {
  notifyOnInPunch,
  notifyOnDayFinalized,
  clockInTz,
} from "@/lib/attendance/punch-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Body = {
  kind?: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
  deviceId?: string;
  deviceLabel?: string;
  platform?: string;
  // Anti-proxy Phase 2 (sent by the updated app; absent from older builds).
  nonce?: string;
  integrityToken?: string;
  isMock?: boolean;
};

const ok = (data: object) => NextResponse.json(data, { headers: MOBILE_CORS });
const err = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers: MOBILE_CORS });

/**
 * POST /api/mobile/attendance/punch — native check-in / check-out.
 * Anti-proxy: the app gates this with the device's own fingerprint/Face ID
 * (expo-local-authentication) and sends a keystore-bound `deviceId`; the server
 * binds the punch to that registered phone (one phone ↔ one employee) and runs
 * the SAME geofence + day-finalize + notification rules as the web punch.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return err(429, limited.error);

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.kind !== "in" && body.kind !== "out")) {
    return err(400, "kind must be 'in' or 'out'.");
  }
  if (typeof body.deviceId !== "string" || !body.deviceId.trim()) {
    return err(400, "A device id is required.");
  }
  const location = body.location;
  if (
    location &&
    (typeof location.lat !== "number" ||
      typeof location.lng !== "number" ||
      typeof location.accuracyM !== "number")
  ) {
    return err(400, "Invalid location.");
  }

  // ── Gate 1: geofence (shared with web) ──
  const settings = await getOrgSettings();
  const geo = resolvePunchGeofence(settings, location);
  if (!geo.ok) return err(400, geo.error);

  // ── Gate 2: device allowlist (the mobile anti-proxy) ──
  // STRICT: the phone must be registered to THIS employee AND approved. A new /
  // pending / someone-else's / revoked device is refused with a typed `reason`
  // so the app can route to "Register this device" or "Waiting for approval".
  const device = await resolveMobileDevice(me.id, { deviceId: body.deviceId });
  if (!device.ok) {
    return NextResponse.json(
      { ok: false, error: device.error, reason: device.reason },
      { status: 403, headers: MOBILE_CORS },
    );
  }

  // ── Gate 3: device-health attestation + spoof signals (anti-proxy Phase 2) ──
  // Mode-gated: off = skip; report = record verdict + flags but never block;
  // enforce = refuse a punch that is mocked or fails device+app integrity.
  // NEVER blocks on "unverified" (old app build / integrity not provisioned) so
  // a rollout gap can't lock anyone out.
  const mode = attendanceIntegrityMode();
  let integrityVerdict: string | null = null;
  let mockLocation: boolean | null = null;
  const anomalyFlags: string[] = [];

  if (mode !== "off") {
    if (typeof body.isMock === "boolean") {
      mockLocation = body.isMock;
      if (body.isMock) anomalyFlags.push("mock_location");
    }
    // Burn the one-time nonce (anti-replay) when the app supplies attestation.
    let nonceStale = false;
    if (body.nonce || body.integrityToken) {
      const nres = await consumePunchNonce(me.id, body.nonce);
      if (!nres.ok) {
        nonceStale = true;
        anomalyFlags.push(`nonce_${nres.reason}`);
      }
    }
    // Verify the hardware attestation (dormant → "unverified", never blocks).
    const integ = await verifyPlayIntegrity(body.integrityToken, body.nonce ?? "");
    integrityVerdict = integ.verdict;
    if (integ.configured && !integ.ok) anomalyFlags.push(`integrity_${integ.detail ?? integ.verdict}`);

    if (mode === "enforce") {
      if (mockLocation === true) {
        return err(403, "Your location looks mocked. Turn off any fake-GPS app and punch again from the office.");
      }
      if (integ.configured && !integ.ok) {
        return err(403, "This device failed the security check — punch from your genuine registered phone.");
      }
      if (nonceStale) {
        return err(403, "That punch expired — please try again.");
      }
    }
  }

  const tz = me.timezone || "Asia/Kolkata";

  // ── Saturday commit gate (NEW, default OFF; mirrors the web punch) ──
  // On Saturday, punch-out is blocked until next week is committed + this week's
  // progress filled. FAIL-OPEN; honors SAT_COMMIT_GATE_ON (default off ⇒ no-op).
  if (body.kind === "out" && satCommitGateOn() && isSaturdayIST()) {
    const committed = await weekCommitSatisfied(me.id, currentWeekStart()).catch(() => true);
    if (!committed) {
      return NextResponse.json(
        { ok: false, error: "Commit next week's goals and fill this week's progress before you clock out.", needsCommit: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  // ── Close-out gate (NEW, default OFF; mirrors the web punch) — checkout ORDER:
  // close out today's commitments, THEN DCC, THEN the punch. Sits above DCC.
  if (body.kind === "out" && checkoutCloseoutGateOn()) {
    const today = localDateString(tz);
    const closed = await isDayClosedOut(me.id, today).catch(() => true);
    if (!closed) {
      return NextResponse.json(
        { ok: false, error: "Mark your today's commitment before you clock out — open Plan my day, then Finish day.", needsCloseout: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  // ── DCC punch-out block (fail-open; honors DCC_GATE_OFF) ──
  // With the Sat commit gate live, DCC is enforced Mon–Fri only (Sat's ritual is
  // the commit above). Default (Sat gate off) ⇒ unchanged: DCC blocks every day.
  const dccBlockDay = satCommitGateOn() ? isWeekdayIST() : true;
  if (body.kind === "out" && dccBlockDay && false /* gate force-off 2026-07-27 (attendance unblock) */) {
    const today = localDateString(tz);
    const dccDone = await isDccFilledFor(me.id, today).catch(() => true);
    if (!dccDone) {
      return NextResponse.json(
        { ok: false, error: "Fill today's DCC before you clock out.", needsDcc: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  // ── Clock-IN planning gate (fail-open; PUNCH_PLAN_GATE_OFF) ──
  // Mirrors the web punch: Start My Day clicked + MIN_ATTENDANCE_ITEMS planned.
  // NO ROLE EXEMPTIONS — managers, admins and super-admins are gated too, same
  // as the web. Returns needsPlan so the app can route the user to the plan.
  if (body.kind === "in" && punchPlanGateOn()) {
    {
      const planned = !(await needsDailyPlan(me.id).catch(() => false));
      const actuals = !(await needsGoalActuals(me.id).catch(() => false));
      if (!planned || !actuals) {
        // Same shortfall wording as the web punch — the app shows this string
        // verbatim, so a vaguer message here would make the two surfaces
        // disagree about what is being asked.
        let error = "Plan your day first, then clock in.";
        if (!planned) {
          const { have, need, started } = await dailyPlanShortfall(me.id).catch(() => ({
            have: 0,
            need: MIN_ATTENDANCE_ITEMS,
            started: false,
          }));
          if (have < need) {
            const short = Math.max(1, need - have);
            error = `You have ${have} of ${need} things planned for today. Add ${short} more on Daily Goals, then clock in.`;
          } else if (!started) {
            error = `Hit “Start My Day” on Daily Goals to begin your day, then clock in.`;
          }
        }
        return NextResponse.json(
          { ok: false, error, needsPlan: true },
          { status: 409, headers: MOBILE_CORS },
        );
      }
    }
  }

  // ── WEEK-LOSS ACKNOWLEDGEMENT (mirrors the web punch) ──────────────────
  // Last week's attendance-lost + money-lost report must be read before the
  // first clock-IN of a new week. See lib/attendance/week-report.ts.
  //
  // TWO SWITCHES, ON PURPOSE. This route always REPORTS the requirement — the
  // `needsWeekAck` flag and the full `weekLoss` payload come back so the Android
  // app can build and test its dialog against real data — but it only REFUSES
  // the punch when WEEK_LOSS_ACK_MOBILE_GATE_ON is set (default off).
  //
  // Blocking before the app has a screen for this would hand mobile users a
  // refusal they cannot clear from their phone: a hard lockout, and this
  // codebase has already lived through one (2026-07-27). Flip the mobile switch
  // on the day that screen ships.
  //
  // FAIL-OPEN: any read error resolves to "nothing pending".
  if (body.kind === "in" && weekLossAckGateOn()) {
    const today = localDateString(tz);
    const week = await getWeekReportState(me.id, today).catch(() => null);
    if (week?.pending && week.loss) {
      if (weekLossAckMobileGateOn()) {
        return NextResponse.json(
          {
            ok: false,
            error: "Read last week's attendance and money-lost report before you clock in.",
            needsWeekAck: true,
            weekLoss: week.loss,
          },
          { status: 409, headers: MOBILE_CORS },
        );
      }
    }
  }

  // ── Monday manager-approval gate (NEW, default OFF; mirrors the web punch) ──
  // On Monday a manager can't clock IN until they've approved their downline's
  // last-week progress + this-week goals. FAIL-OPEN; honors MON_APPROVE_GATE_ON
  // (default off ⇒ no-op); super-admins + non-managers exempt.
  if (body.kind === "in" && monApproveGateOn() && !isSuperAdmin(me.email) && isMondayIST()) {
    const isMgr = await isManagerWithReports(me.id).catch(() => false);
    if (isMgr) {
      const approved = await managerApproveSatisfied(me.id, currentWeekStart()).catch(() => true);
      if (!approved) {
        return NextResponse.json(
          { ok: false, error: "Approve your team's last-week progress and this-week goals before you clock in.", needsApprove: true },
          { status: 409, headers: MOBILE_CORS },
        );
      }
    }
  }

  // ── Manager Monday goal-set gate (fail-open; MANAGER_GATES_OFF; SA exempt) ──
  if (
    body.kind === "in" &&
    false /* mgr Monday gate force-off 2026-07-27 (attendance unblock) */ &&
    !isSuperAdmin(me.email) &&
    isMondayIST()
  ) {
    const monday = await managerMondayGoalState(me.id).catch(() => ({ satisfied: true, reports: [] }));
    if (!monday.satisfied) {
      const shortNames = monday.reports.filter((r) => !r.ok).map((r) => r.name).join(", ");
      return NextResponse.json(
        { ok: false, error: `Set this week's goals (weights = 100) for ${shortNames} before you clock in.`, needsGoals: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  const inserted = await insertPunchRow(
    { id: me.id, timezone: tz },
    { kind: body.kind, note: body.note, location, distanceM: geo.distanceM },
    {
      verifyMethod: "biometric",
      mobileDeviceId: device.rowId,
      source: "self",
      integrityVerdict,
      mockLocation,
      anomalyFlags,
    },
  );
  if (!inserted.ok) return err(409, inserted.error);

  // Same best-effort notifications as the web punch.
  if (body.kind === "in") {
    await notifyOnInPunch(me, inserted.date, clockInTz(new Date(), tz));
  } else {
    await notifyOnDayFinalized(me, inserted.date);
  }

  return ok({ ok: true, date: inserted.date });
}
