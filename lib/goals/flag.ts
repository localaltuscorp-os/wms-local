/**
 * Kill-switches for the Goals Cascade program.
 *
 * ⚠️ 2026-07-27 EMERGENCY: all daily-flow GATES were FORCE-DISABLED in code
 * (return false regardless of env) because active gates were blocking people
 * from clocking in/out (logging attendance). Most remain force-off below.
 *
 * TWO have since been restored, deliberately, as the attendance daily loop
 * (Sir): `punchPlanGateOn` (Start My Day + 5 items ⇒ may clock IN) and
 * `checkoutCloseoutGateOn` (Finish Day ⇒ may clock OUT). Both read a real env
 * kill-switch and have NO role exemptions, so those switches are the only way
 * to unblock attendance if it jams again — keep them settable in prod without
 * a deploy. The DCC punch-path gates stay force-disabled inline in
 * app/(app)/attendance/actions.ts and the mobile punch route.
 *
 * TWO polarities, by design (design §10, locked decision 1):
 *  - The **cascade module** itself ships ENABLED behind `GOALS_CASCADE_OFF`
 *    (set it to `'true'` to 404 the whole `/goals` surface) — mirrors the house
 *    convention (MONTHLY_EVENTS_OFF / DCC_GATE_OFF). NOT a login/attendance gate,
 *    left untouched.
 *  - Every **daily-flow GATE** ships DISABLED (default OFF) — now hard-off.
 *
 * Read straight off process.env — no I/O, safe to import anywhere.
 */

/** The cascade module (all of `/goals`). Default ENABLED. NOT a gate. */
export function goalsCascadeEnabled(): boolean {
  return process.env.GOALS_CASCADE_OFF !== "true";
}

/** Saturday commit gate (punch-out blocked until the week is committed). FORCE-OFF. */
export function satCommitGateOn(): boolean {
  return false;
}

/** Monday manager-approval gate (attendance mark blocked until approved). FORCE-OFF. */
export function monApproveGateOn(): boolean {
  return false;
}

/** Plan-Your-Day login gate → /goals/plan (role-based minimum). FORCE-OFF. */
export function planGateOn(): boolean {
  return false;
}

/** Compulsory punch-out → missed = Half-Day reconcile (autoout cron). FORCE-OFF. */
export function compulsoryPunchoutOn(): boolean {
  return false;
}

/** The legacy "manager must assign tasks daily" login rule. FORCE-OFF. */
export function managerTaskGateOn(): boolean {
  return false;
}

/** The DCC manager-review login gate ("Review your team"). FORCE-OFF. */
export function dccReviewGateOn(): boolean {
  return false;
}

/**
 * The two remaining COMPULSORY login walls (plan/DCC before you start).
 * FORCE-OFF so nothing blocks login/attendance.
 */
export function loginPlanGateOn(): boolean {
  return false;
}
export function loginDccGateOn(): boolean {
  return false;
}

/** WhatsApp goals-report delivery (media/text send). OFF. NOT a login/attendance gate. */
export function goalsWhatsappOn(): boolean {
  return process.env.GOALS_WHATSAPP_ON === "true";
}

/**
 * Checkout close-out gate (Sir): at clock-OUT you must first hit "Finish Day" on
 * WMS › Plan My Day to close out today's commitments.
 *
 * The clock-OUT half of the daily loop, mirroring punchPlanGateOn below: Start
 * My Day opens the day and lets you punch in, Finish Day closes it and lets you
 * punch out. ON by default, killable with CHECKOUT_CLOSEOUT_GATE_OFF=true.
 *
 * It was force-disabled (`return false`) on 2026-07-27 along with every other
 * daily gate; it is back on, with NO role exemptions. The env var is the only
 * recovery path — it must stay settable in production without a deploy.
 */
export function checkoutCloseoutGateOn(): boolean {
  return process.env.CHECKOUT_CLOSEOUT_GATE_OFF !== "true";
}

/** Auto-spillover at month rollover. OFF. NOT a login/attendance gate. */
export function goalsSpilloverOn(): boolean {
  return process.env.GOALS_SPILLOVER_ON === "true";
}

/** Sunday 9am manager-rollup goals report. OFF. NOT a login/attendance gate. */
export function goalsSundayReportOn(): boolean {
  return process.env.GOALS_SUNDAY_REPORT_ON === "true";
}

/** The Goals cascade BOARD experience (5-page level ladder: Yearly→Daily).
 *  Flag retired (2026-07) — permanently LIVE, no longer gated by GOALS_CANVAS_ON. */
export function goalsCanvasOn(): boolean {
  return true;
}

/** Goal Capture (migration 0173) — natural-language → structured goals via a
 *  free OpenAI-compatible LLM (default OpenRouter). Ships ENABLED behind a
 *  kill-switch, AND requires OPENROUTER_API_KEY to be present (no key → feature
 *  hidden, never crashes). NOT a login/attendance gate. */
export function goalCaptureEnabled(): boolean {
  return process.env.GOAL_CAPTURE_OFF !== "true" && !!process.env.OPENROUTER_API_KEY;
}

/** Voice capture for Goal Capture — needs a Whisper key (OpenAI or free Groq).
 *  Gated separately so text capture works without any transcription provider. */
export function voiceCaptureEnabled(): boolean {
  return goalCaptureEnabled() && !!process.env.WHISPER_API_KEY;
}

/**
 * Clock-IN planning gate: an employee must have MIN_ATTENDANCE_ITEMS things on
 * today's plan before they can punch in.
 *
 * ON by default, killable with PUNCH_PLAN_GATE_OFF=true — the switch both punch
 * surfaces already named in their comments but never actually read, because the
 * gate had been force-disabled with a hardcoded `false` since 2026-07-27.
 *
 * ⚠ This is the ONLY way out. The gate has no role exemptions (Sir): a
 * super-admin who has not planned their day is blocked like anyone else, so
 * this env var is the recovery path if attendance ever needs unblocking again.
 * It must stay settable in production without a deploy.
 */
export function punchPlanGateOn(): boolean {
  return process.env.PUNCH_PLAN_GATE_OFF !== "true";
}

/**
 * WEEK-LOSS ACKNOWLEDGEMENT — the Monday "what last week cost you" gate (Sir).
 *
 * On the first punch of a new week the employee is shown last week's ATTENDANCE
 * LOST + MONEY LOST report and must dismiss it — like a skippable ad — before
 * they can clock IN. See lib/attendance/week-report.ts.
 *
 * It lives here rather than in lib/attendance because this file is where the
 * punch kill-switches are deliberately kept together: if attendance ever jams,
 * one place holds every switch that can unjam it.
 *
 * ON by default, killable with WEEK_LOSS_ACK_GATE_OFF=true. It gates the CHECK-IN
 * only — never the check-out, which would strand someone mid-shift with no way
 * to close their day — and every read behind it fails OPEN.
 */
export function weekLossAckGateOn(): boolean {
  return process.env.WEEK_LOSS_ACK_GATE_OFF !== "true";
}

/**
 * The same gate on the MOBILE punch route — OFF by default, and deliberately so.
 *
 * The web punch can show the dialog; the Android app cannot yet. Turning this on
 * before the app ships a screen for `needsWeekAck` would hand mobile users a
 * refusal they have no way to clear — a hard lockout, which is exactly the
 * failure this codebase already lived through on 2026-07-27.
 *
 * The mobile punch route already RETURNS the report and the `needsWeekAck` flag
 * regardless of this switch, so the app can be built and tested against real
 * data first. Flip WEEK_LOSS_ACK_MOBILE_GATE_ON=true only once that screen and
 * its acknowledge call are live.
 */
export function weekLossAckMobileGateOn(): boolean {
  return process.env.WEEK_LOSS_ACK_MOBILE_GATE_ON === "true";
}
