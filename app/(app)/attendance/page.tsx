import {
  MapPin,
  ShieldCheck,
  LogIn,
  LogOut,
  MoveRight,
  Activity,
  Users,
  ClipboardList,
  BarChart3,
  MonitorPlay,
  Smartphone,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { PunchCard } from "@/components/attendance/punch-card";
import { AttendanceKpiStrip } from "@/components/attendance/attendance-kpi-strip";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { RemoteCheckInTrigger } from "@/components/attendance/remote-checkin-trigger";
import { TeamDatePicker } from "@/components/attendance/team-date-picker";
import { HolidaysDrawer } from "@/components/attendance/holidays-drawer";
import { LeaveRequestsCallout } from "@/components/attendance/leave/leave-requests-callout";
import {
  AttTeamRoster,
  type RosterPunch,
  type RosterRow,
} from "@/components/attendance/att-team-roster";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManagerWithReports } from "@/lib/manager-gates";
import { hasStartedDay } from "@/lib/queries/daily-checklist";
import { punchPlanGateOn, goalsCascadeEnabled } from "@/lib/goals/flag";
import { asWorkerType } from "@/lib/attendance/worker-type";
import { employeeEffectiveConfig } from "@/lib/queries/attendance-status";
import {
  listMyAttendance,
  listTeamAttendanceForDate,
  hasCheckedInOn,
  type DayPunches,
  type PunchDetail,
} from "@/lib/queries/attendance";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getSelfAttendanceSummary } from "@/lib/queries/attendance-summary";
import { getEmployeeMonthStatus } from "@/lib/queries/attendance-status";
import { getWeekReportState } from "@/lib/attendance/week-report";
import { WeekLossDialog } from "@/components/attendance/week-loss-dialog";
import { weekLossAckGateOn } from "@/lib/goals/flag";
import { listUpcomingHolidays } from "@/lib/queries/upcoming-holidays";
import {
  countPendingLeaveForReview,
  leaveReviewScopeFor,
  listEmployeeLeaveForRange,
} from "@/lib/queries/leave";
import { withRetry } from "@/lib/db/with-timeout";
import { formatTimeInTz, localDateString, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// The attendance page load must never crash — a stale pooled connection here
// stops the user reaching the check-in/out button. Retry each read on a fresh
// connection.
const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** "2026-06-10" → "10 JUN 2026" (canonical, no timezone drift). */
function labelForDate(date: string): string {
  return formatDate(date);
}

/** "2026-06-10" → { dow: "Wed", dm: "10 Jun" } for the timeline rail. */
function splitDateLabel(date: string): { dow: string; dm: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12));
  return {
    dow: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(dt),
    dm: new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(dt),
  };
}

/** Worked milliseconds for a day (needs both punches, out after in). */
function workedMs(d: DayPunches): number | null {
  if (!d.in || !d.out) return null;
  const ms = d.out.at.getTime() - d.in.at.getTime();
  return ms > 0 ? ms : null;
}

/** 27_120_000 → "7h 32m" */
function fmtDur(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // ── PAGE LOCK — no Start My Day, no Attendance page (Sir) ──────────────
  // Attendance follows the daily loop rather than running beside it: until the
  // day is STARTED on WMS › Plan My Day (with ≥ MIN_ATTENDANCE_ITEMS planned,
  // enforced by startMyDay itself), this page does not open at all. Sending
  // them to the planner is both the block and the instruction — there is no
  // second screen to build, and nothing here changes visually for anyone who
  // has planned their day.
  //
  // NO ROLE EXEMPTIONS. Same rule for super-admins, admins and managers.
  //
  // …OR they are already clocked in today. `reopenPlan` sets started_at back to
  // NULL, and re-opening the plan to change tasks is expressly allowed (Sir), so
  // keying the page on that stamp alone would slam the door on someone
  // mid-shift and leave them no way to reach the clock-OUT button. A check-in
  // row is durable proof the day WAS started properly — it cannot exist unless
  // this same gate passed. Clocking out still requires "Finish Day"; this
  // governs only whether the page opens.
  //
  // FAIL-OPEN (`.catch(() => true)`): a database hiccup must never lock the
  // workforce out of attendance. That is precisely what happened on 2026-07-27
  // and it is why every gate in this app spent a month switched off.
  //
  // SCOPE: this page only. /attendance/leave, /insights, /devices, /dashboard
  // and /hr-record stay reachable — the punch actions are themselves gated, so
  // the rule cannot be evaded by walking around this redirect.
  //
  // `goalsCascadeEnabled()` is checked FIRST and is not optional: /my-day 404s
  // when the cascade is off, so locking attendance behind a page that cannot
  // render would leave no way to start the day and no way in — a dead end no
  // env var could unpick from the user's side.
  if (punchPlanGateOn() && goalsCascadeEnabled()) {
    const [started, clockedIn] = await Promise.all([
      hasStartedDay(me.id).catch(() => true),
      hasCheckedInOn(me.id, today).catch(() => true),
    ]);
    if (!started && !clockedIn) redirect("/my-day");
  }
  // The Team roster + attendance editing are SUPER-ADMIN only. Admins keep the
  // report buttons but no longer see the (editable) Team box.
  const isSA = isSuperAdmin(me.email);
  // Anyone with active direct reports gets a "My Team" button into the (already
  // self-scoped) team attendance dashboard at /attendance/insights/team. Fail-open:
  // a DB hiccup hides the button, never breaks this hot page. Admins who manage
  // see it beside their admin buttons; a non-admin manager sees only this one.
  const isManager = await isManagerWithReports(me.id).catch(() => false);
  // Project / remote staff clock in by starting a screen-share Work Session
  // (session grading) instead of a punch — surface it as their headline action.
  const isProjectRemote = asWorkerType(me.workerType) === "project_remote";
  // Part-timers are paid hourly against a WEEKLY target (27h by default), so
  // their hours are their pay — surface the week's progress while it can still
  // be acted on, instead of only as a smaller payslip at month end.
  // Both hourly shifts live by their hours, so both get the weekly-progress
  // panel — an afternoon-shift employee needs it exactly as much as a part-timer.

  // My last 14 calendar days.
  const since = localDateString(tz, new Date(Date.now() - 13 * 86_400_000));

  const rawDate = typeof sp.date === "string" ? sp.date : today;
  const teamDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  const [curYear, curMonth] = today.split("-").map(Number) as [number, number];

  const [myDays, team, settings, selfSummary, monthStatus, upcomingHolidays] = await Promise.all([
    withRetry(() => listMyAttendance(me.id, since), { ...RETRY, label: "att-mydays" }),
    isSA
      ? withRetry(() => listTeamAttendanceForDate(teamDate), { ...RETRY, label: "att-team" })
      : Promise.resolve(null),
    withRetry(() => getOrgSettings(), { ...RETRY, label: "att-settings" }),
    withRetry(() => getSelfAttendanceSummary(me.id), { ...RETRY, label: "att-self" }),
    withRetry(() => getEmployeeMonthStatus(me.id, curYear, curMonth, today), { ...RETRY, label: "att-month" }),
    // NEXT DAYS OFF — merged from the Admin Panel's holiday list AND the Monthly
    // Events Master, personalised to this employee, with no year horizon and no
    // Sundays. See lib/queries/upcoming-holidays.ts for why both calendars have
    // to be read.
    withRetry(
      () => listUpcomingHolidays({ today, religion: me.religion, limit: 5 }),
      { ...RETRY, label: "att-holidays" },
    ),
  ]);

  // ── PENDING LEAVE (spec §3) + the live board ─────────────────────────────
  // The Employees module's front door is where a manager finds out that someone
  // has asked for time off. Admins see every request, a manager sees their own
  // downline, and anyone who manages nobody reads zero and renders nothing.
  //
  // The two leave reads are inherently sequential (the count needs the scope),
  // but they owe nothing to the live-status snapshot — so the pair runs BESIDE
  // it rather than in front of it. This is the app's hottest page; a notice
  // strip must not add a round-trip to the critical path of reaching the clock.
  //
  // FAIL-SOFT: a bad read means "no notice", never a page that will not load —
  // the same rule every other gate on this page follows.
  const pendingLeave = await (async () => {
    const scope = await leaveReviewScopeFor(me).catch(() => ({
      all: false,
      ids: [] as string[],
      canReview: false,
    }));
    if (!scope.canReview) return { requests: 0, employees: 0 };
    return countPendingLeaveForReview(scope).catch(() => ({
      requests: 0,
      employees: 0,
    }));
  })();

  // ── THE MONDAY REPORT (Sir) ──────────────────────────────────────────
  // On the first punch of a NEW WEEK, last week's attendance-lost + money-lost
  // report takes over the screen and must be dismissed before the clock unlocks.
  // The real gate is server-side in this module's `punchAttendance`; this read
  // is only what puts the dialog on screen.
  //
  // FAIL-OPEN: a report that will not compute resolves to "nothing pending", so
  // a bad read shows no dialog rather than a page nobody can get past. It is
  // also skipped entirely when the kill-switch is off, so flipping
  // WEEK_LOSS_ACK_GATE_OFF removes both halves at once and never leaves a
  // dialog up that the punch no longer requires.
  const weekReport = weekLossAckGateOn()
    ? await getWeekReportState(me.id, today).catch(() => null)
    : null;

  // Month calendar cells (client-safe) — colour-coded per graded day.
  const monthCells = monthStatus.days.map((d) => ({
    date: d.logDate,
    day: Number(d.logDate.slice(8, 10)),
    weekday: d.weekday,
    code: d.code,
    late: d.late,
    leftEarly: d.leftEarly,
    isWeeklyOff: d.isWeeklyOff,
    inAt: d.inAt,
    outAt: d.outAt,
    workedMinutes: d.workedMinutes,
    future: d.logDate > today,
  }));

  const todayRow = myDays.find((d) => d.date === today);
  const firstName = me.name.split(" ")[0] ?? me.name;

  // Most recent punch across the loaded window → "Last punch" line in the hero.
  let lastPunchLabel: string | null = null;
  for (const d of myDays) {
    const latest =
      d.out && d.in
        ? (d.out.at > d.in.at ? { p: d.out, kind: "out" as const } : { p: d.in, kind: "in" as const })
        : d.out
          ? { p: d.out, kind: "out" as const }
          : d.in
            ? { p: d.in, kind: "in" as const }
            : null;
    if (latest) {
      const when = d.date === today ? "today" : labelForDate(d.date);
      lastPunchLabel = `${latest.kind === "in" ? "Check-in" : "Check-out"} · ${when} at ${formatTimeInTz(latest.p.at, tz)}`;
      break;
    }
  }

  // Location-only geofence: the punch control stays disabled until the browser
  // reports a GPS fix; when office coords are set the server rejects any fix
  // outside the radius. When no coords are configured the fence is off (punch
  // from anywhere) — the card still captures location but never blocks.
  const geofenceEnabled = settings.officeLat != null && settings.officeLng != null;

  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(curYear, curMonth - 1, 1)),
  );

  // APPROVED leave covering the roster's date, so a sanctioned day off is not
  // shown as a bare "Absent" (spec §6). One scoped read over the people already
  // on the board; fail-soft to "no leave known" rather than dropping the board.
  const teamLeave: Map<string, "paid" | "unpaid"> = new Map();
  if (team && team.length > 0) {
    const approved = await listEmployeeLeaveForRange(
      team.map((r) => r.employeeId),
      teamDate,
      teamDate,
    ).catch(() => []);
    for (const lv of approved) {
      // Paid wins if (unusually) both cover the day — same precedence the
      // grader applies in lib/queries/attendance-status.ts.
      if (lv.kind === "paid" || !teamLeave.has(lv.employeeId)) {
        teamLeave.set(lv.employeeId, lv.kind);
      }
    }
  }

  // Serialize the team rows for the client roster (search lives client-side).
  const rosterRows: RosterRow[] | null = team
    ? team.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        avatarUrl: r.avatarUrl,
        in: toRosterPunch(r.in, tz),
        out: toRosterPunch(r.out, tz),
        note: [r.in?.note, r.out?.note].filter(Boolean).join(" · "),
        leave: teamLeave.get(r.employeeId) ?? null,
      }))
    : null;

  // ── Column pieces — arranged differently for super-admins vs everyone else ──
  const punchCard = (
    <PunchCard
      todayLabel={labelForDate(today)}
      inLabel={todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null}
      outLabel={todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null}
      tz={tz}
      geofenceEnabled={geofenceEnabled}
      officeLat={settings.officeLat}
      officeLng={settings.officeLng}
      radiusM={settings.attendanceRadiusM}
      lastPunchLabel={lastPunchLabel}
    />
  );
  const wfhBox = <RemoteCheckInTrigger hasCheckedIn={!!todayRow?.in} hasCheckedOut={!!todayRow?.out} />;
  // ── MY EFFECTIVE CONFIGURATION (spec §10) ────────────────────────────────
  // Resolved from this employee's own row through the SAME resolver the grader
  // and the salary engine use, so what is displayed cannot drift from what is
  // graded. A part-timer sees 4.5h / 27h here; 54h is never shown to them.
  const myConfig = employeeEffectiveConfig(me, settings);

  const calendar = (
    <MonthCalendar
      cells={monthCells}
      monthLabel={monthLabel}
      compact
      canEdit={isSA}
      employeeId={me.id}
      weekTargetMinutes={myConfig.weeklyTargetMinutes}
    />
  );
  const holidays = <HolidaysDrawer holidays={upcomingHolidays} />;
  const teamBox = rosterRows ? (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)", animationDelay: "140ms" }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-grid size-9 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}>
            <Users size={18} strokeWidth={2.3} />
          </span>
          <div>
            <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Team
            </h2>
            <p className="text-[12.5px] font-medium text-ink-subtle">{labelForDate(teamDate)}</p>
          </div>
        </div>
        <TeamDatePicker date={teamDate} />
      </div>
      <AttTeamRoster rows={rosterRows} date={teamDate} tz={tz} canEdit={isSA} />
    </section>
  ) : null;

  return (
    <>
      {/* Rendered FIRST and fixed-positioned: it owns the screen until it is
          dismissed, and the clock below it will refuse a check-in until then. */}
      {weekReport?.pending && weekReport.loss ? (
        <WeekLossDialog loss={weekReport.loss} />
      ) : null}
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        {/* ── Page header ── */}
        <header className="mb-4 wg-rise flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(22px,2.6vw,32px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              Good to see you, {firstName}
            </h1>
          </div>
          {(me.isAdmin || isSA || isManager) && (
            <div className="flex shrink-0 items-center gap-2 flex-wrap">
              {(isManager || me.isAdmin) && (
                <a
                  href="/attendance/insights/team"
                  className="pastel-cta wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
                >
                  <Users size={15} strokeWidth={2.4} /> My Team
                </a>
              )}
              {(me.isAdmin || isSA) && (
                <a
                  href="/attendance/work-session/review"
                  className="pastel-cta wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
                >
                  <MonitorPlay size={15} strokeWidth={2.4} /> Work Sessions
                </a>
              )}
              {me.isAdmin && (
                <>
                  <a
                    href="/attendance/devices"
                    className="pastel-cta wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
                  >
                    <Smartphone size={15} strokeWidth={2.4} /> Devices
                  </a>
                  <a
                    href="/attendance/insights"
                    className="pastel-cta wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
                  >
                    <BarChart3 size={15} strokeWidth={2.4} /> Dashboard
                  </a>
                  <a
                    href="/attendance/dashboard"
                    className="brand-btn wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #E10600, #A80400)", boxShadow: "0 8px 20px -10px color-mix(in srgb, #A80400 70%, transparent)" }}
                  >
                    <ClipboardList size={15} strokeWidth={2.4} /> Att Report
                  </a>
                </>
              )}
            </div>
          )}
        </header>

        <LeaveRequestsCallout
          requests={pendingLeave.requests}
          employees={pendingLeave.employees}
        />

        {/* ── Project / remote staff: starting a screen-share Work Session IS
             their check-in (session grading), so make it the headline action. ── */}
        {isProjectRemote && (
          <a
            href="/attendance/work-session"
            className="wg-rise wg-btn group mb-5 flex items-center gap-4 rounded-[22px] px-6 py-5 text-white max-sm:flex-col max-sm:items-start max-sm:gap-3"
            style={{
              background: "linear-gradient(135deg, #E10600, #A80400)",
              boxShadow: "0 14px 34px -16px color-mix(in srgb, #A80400 75%, transparent)",
            }}
          >
            <span
              className="inline-grid size-12 shrink-0 place-items-center rounded-2xl"
              style={{ background: "rgba(255,255,255,0.16)" }}
            >
              <MonitorPlay size={24} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 20,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Start Work Session
              </div>
              <p className="mt-0.5 text-[13.5px] font-medium text-white/85">
                Share your screen so your work time is captured and reviewed — this is how you check in.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-white/15 px-4 py-2 text-[13.5px] font-bold max-sm:w-full max-sm:justify-center">
              Begin
              <MoveRight
                size={16}
                strokeWidth={2.4}
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </span>
          </a>
        )}

        {/* ── How am I doing — THE KPI bar. One bar, one period toggle, every
            number. The part-time week card used to sit above this saying the
            same thing in its own units against its own target; the bar's
            "Hours worked / required" is now derived from the employee's own
            weekly target, so it covers both archetypes without a second card. ── */}
        <div className="mb-5">
          <AttendanceKpiStrip data={selfSummary} />
        </div>

        {/* What this employee is actually measured against. Hidden for
            project/remote staff, who are graded on work sessions rather than a
            daily/weekly hour schedule. */}

        {/* ── Columns ── Super-admins get a Team-first layout (Team · Punch · Calendar);
             admins + employees get a compact, no-Team layout that fits one desktop screen. */}
        {isSA ? (
          // Team keeps its own column; the calendar takes the two the punch card
          // does not need, so a month of tiles is readable rather than cramped.
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-4">
            <div className="flex flex-col gap-5">{teamBox}</div>
            <div className="flex flex-col gap-5">{wfhBox}{punchCard}</div>
            <div className="flex flex-col gap-5 lg:col-span-2">{calendar}</div>
          </div>
        ) : (
          // Punch clock and calendar, side by side, with the calendar taking the
          // larger share — it is the thing being read, the clock is a button.
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <div className="flex flex-col gap-5">{wfhBox}{punchCard}</div>
            <div className="flex flex-col gap-5">{calendar}</div>
          </div>
        )}
        {holidays}
      </PageShell>
    </>
  );
}

/** "HH:mm" (24h) in the given tz — prefills the super-admin punch editor. */
function hhmmInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function toRosterPunch(p: PunchDetail | null, tz: string): RosterPunch | null {
  if (!p) return null;
  return {
    label: formatTimeInTz(p.at, tz),
    hhmm: hhmmInTz(p.at, tz),
    verify: p.verifyMethod,
    distanceM: p.distanceM,
  };
}

/* ─────────────────────────── Recent activity ─────────────────────────── */

/** Small in/out time chip with verification badge, used on the timeline. */
function PunchChip({
  kind,
  punch,
  tz,
}: {
  kind: "in" | "out";
  punch: PunchDetail | null;
  tz: string;
}) {
  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";
  if (!punch) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold text-ink-subtle"
        style={{ background: "var(--color-surface-soft)" }}
      >
        <Icon size={12} strokeWidth={2.4} /> —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, ${accent} 9%, transparent)`, color: accent }}
    >
      <Icon size={12} strokeWidth={2.6} />
      {formatTimeInTz(punch.at, tz)}
      <VerifyBadge verify={punch.verifyMethod} distanceM={punch.distanceM} />
    </span>
  );
}

function VerifyBadge({
  verify,
  distanceM,
  size = 12,
}: {
  verify: "biometric" | "gps_only" | "none";
  distanceM: number | null;
  size?: number;
}) {
  const dist = distanceM != null ? ` · ${Math.round(distanceM)}m from office` : "";
  if (verify === "biometric") {
    return (
      <span title={`Biometric-verified${dist}`} aria-label={`Biometric-verified${dist}`} className="inline-flex">
        <ShieldCheck size={size} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} />
      </span>
    );
  }
  if (verify === "gps_only") {
    return (
      <span title={`Location-verified${dist}`} aria-label={`Location-verified${dist}`} className="inline-flex">
        <MapPin size={size} strokeWidth={2.6} style={{ color: "var(--color-blue-deep)" }} />
      </span>
    );
  }
  return null;
}

function MyTimeline({ days, tz, today }: { days: DayPunches[]; tz: string; today: string }) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "120ms",
      }}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="inline-grid size-9 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}
        >
          <Activity size={18} strokeWidth={2.3} />
        </span>
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 21,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Recent Activity
          </h2>
          <p className="text-[13px] font-medium text-ink-subtle">Last 14 days</p>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-ink-subtle">
          No punches yet — your log starts with today&apos;s first check-in.
        </p>
      ) : (
        <ol className="space-y-1">
          {days.map((d, i) => (
            <TimelineRow key={d.date} day={d} tz={tz} today={today} index={i} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineRow({
  day: d,
  tz,
  today,
  index,
}: {
  day: DayPunches;
  tz: string;
  today: string;
  index: number;
}) {
  const ms = workedMs(d);
  const { dow, dm } = splitDateLabel(d.date);
  const note = [d.in?.note, d.out?.note].filter(Boolean).join(" · ");
  const isToday = d.date === today;

  const status = d.in && d.out
    ? { label: "Full day", accent: "#16a34a", live: false }
    : d.in
      ? isToday
        ? { label: "On the clock", accent: "#16a34a", live: true }
        : { label: "No check-out", accent: "var(--color-altus-red)", live: false }
      : { label: "No check-in", accent: "var(--color-altus-red)", live: false };

  const stripe = d.in ? "#16a34a" : "var(--color-altus-red)";

  return (
    <li
      className="wg-rise relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-2.5 pl-5 pr-3.5 transition-colors hover:bg-surface-soft"
      style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
    >
      {/* status stripe */}
      <span
        aria-hidden
        className="absolute left-1 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: `linear-gradient(180deg, ${stripe}, color-mix(in srgb, ${stripe} 45%, transparent))` }}
      />

      {/* date rail */}
      <div className="w-[70px] shrink-0 leading-tight">
        <div className="text-[13.5px] font-black text-ink-strong">{isToday ? "Today" : dow}</div>
        <div className="text-[12px] font-semibold tabular-nums text-ink-subtle">{dm}</div>
      </div>

      {/* in → out */}
      <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
        <PunchChip kind="in" punch={d.in} tz={tz} />
        <MoveRight aria-hidden size={14} strokeWidth={2.2} className="shrink-0 text-ink-subtle max-sm:hidden" />
        <PunchChip kind="out" punch={d.out} tz={tz} />
        {note && (
          <span className="min-w-0 truncate text-[12.5px] text-ink-subtle max-w-[26ch]" title={note}>
            {note}
          </span>
        )}
      </div>

      {/* worked hours + status */}
      <div className="ml-auto flex shrink-0 items-center gap-2.5 max-sm:w-full max-sm:justify-between">
        <span
          className="tabular-nums text-[14px] font-black text-ink-strong"
          title={ms != null ? "Hours worked (check-out − check-in)" : undefined}
        >
          {ms != null ? fmtDur(ms) : "—"}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
          style={{
            background: `color-mix(in srgb, ${status.accent} 9%, transparent)`,
            color: status.accent,
          }}
        >
          {status.live && (
            <span aria-hidden className="relative inline-flex size-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden"
                style={{ background: status.accent }}
              />
              <span className="relative inline-flex size-1.5 rounded-full" style={{ background: status.accent }} />
            </span>
          )}
          {status.label}
        </span>
      </div>
    </li>
  );
}
