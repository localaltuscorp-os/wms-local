import "server-only";
import {
  getMonthDashboard,
  type DashboardRow,
  type MonthSummary,
} from "@/lib/queries/attendance-status";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { teamPerformance, type TeamMemberPerf } from "@/lib/queries/team-performance";
import { listPendingLeave, type LeaveRow } from "@/lib/queries/leave";
import {
  attendanceRatio,
  punctualityRatio,
} from "@/lib/attendance/analytics/org";
import {
  computeWorkforceHealth,
  type WorkforceHealth,
} from "@/lib/attendance/analytics/health-score";
import { getOrgSettings } from "@/lib/queries/org-settings";

/**
 * MANAGER team-attendance analytics — the data contract for a manager's
 * "My Team" attendance dashboard (`/attendance/insights/team`). Server-only.
 *
 * Scope is the signed-in manager's DIRECT + TRANSITIVE downline
 * (`getDownlineIds`), NOT the whole org — that separates this from
 * `loadOrgAttendanceAnalytics`, which every HR/Finance surface uses. It reuses
 * the SAME batched engines as the rest of the app so numbers reconcile:
 *   • `getMonthDashboard` → per-person MonthSummary (filtered to the downline),
 *   • `attendanceRatio` / `punctualityRatio` → the shared KPI folds,
 *   • `teamPerformance` → the cross-domain goals/tasks/DCC/attendance blend,
 *   • `listPendingLeave` → the pending-approval queue (sliced to the team),
 *   • `computeWorkforceHealth` → the composite team health score.
 *
 * No new DB reads beyond those engines + org-settings; everything else is a
 * pure in-memory fold over the downline slice.
 */

/* ------------------------------------------------------------------ */
/* Contract types                                                      */
/* ------------------------------------------------------------------ */

export interface TeamKpis {
  teamSize: number;
  /** 0..100 effective attendance % across the team aggregate. */
  attendanceRatePct: number;
  /** 0..100 on-time %. */
  punctualityRatePct: number;
  /** Average worked hours per attended day (team-wide). */
  avgHoursPerDay: number;
  /** Total worked hours across the team for the month. */
  totalHours: number;
  present: number;
  absent: number;
  halfDay: number;
  paidLeave: number;
  /** Un-waived late marks. */
  lateMarks: number;
  /** Σ payable days across the team. */
  payableDays: number;
  /** Team productivity blend (goal-score × attendance), null if no goals. */
  productivityPct: number | null;
  /** Mean weekly goal-score across members that have goals, null if none. */
  avgGoalScorePct: number | null;
}

export interface TeamToday {
  /** YYYY-MM-DD, or null when the viewed month is not the current month. */
  date: string | null;
  /** Members who have punched IN today. */
  clockedIn: number;
  /** Punched in, not yet out (currently working). */
  working: number;
  /** Roster minus those clocked in. */
  notYetIn: number;
  rosterSize: number;
}

export interface TeamMemberRow {
  employeeId: string;
  name: string;
  department: string | null;
  /** 0..100 effective attendance. */
  attendanceRatePct: number;
  /** 0..100 on-time. */
  punctualityRatePct: number;
  present: number;
  absent: number;
  halfDay: number;
  late: number;
  paidLeave: number;
  avgHoursPerDay: number;
  totalHours: number;
  payableDays: number;
  // Cross-domain (teamPerformance) signals — may be absent for some members.
  goalScorePct: number | null;
  pendingTasks: number;
  overdueTasks: number;
  /** Per-member productivity blend (goal-score × attendance), null if no goals. */
  productivityPct: number | null;
  /** Clocked in today (only meaningful in the current month). */
  inToday: boolean;
  /** Currently working (in, no out yet) today. */
  workingNow: boolean;
}

export interface DistributionSlice {
  key: string;
  label: string;
  value: number;
  tone: string;
}

export interface ManagerTeamAnalytics {
  managerId: string;
  year: number;
  month: number;
  monthLabel: string;
  /** Whether the manager's own row is folded into the team aggregate. */
  includesSelf: boolean;
  teamSize: number;
  /** True when the manager has no downline at all. */
  empty: boolean;
  kpis: TeamKpis;
  today: TeamToday;
  members: TeamMemberRow[];
  /** Members with un-waived late marks this month, most-late first. */
  lateEmployees: TeamMemberRow[];
  /** Members with absent days this month, most-absent first. */
  absentEmployees: TeamMemberRow[];
  /** Pending leave requests from team members (approval queue). */
  pendingLeave: LeaveRow[];
  /** Day-type mix across the team. */
  distribution: DistributionSlice[];
  health: WorkforceHealth;
  targetHoursPerDay: number;
}

export interface ManagerTeamOptions {
  /** Fold the manager's own attendance row into the team. Default false. */
  includeSelf?: boolean;
}

/* ------------------------------------------------------------------ */
/* Folds (kept in-sync with org.ts semantics)                          */
/* ------------------------------------------------------------------ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days a person actually worked (drives per-day rates). */
function attendedDays(s: MonthSummary): number {
  return s.present + s.halfDay + s.holidayPresent + s.holidayHalfDay;
}

/** Sum an array of MonthSummary into one aggregate. */
function sumSummaries(rows: DashboardRow[]): MonthSummary {
  const agg: MonthSummary = {
    payableDays: 0, present: 0, absent: 0, halfDay: 0, weeklyOff: 0, incomplete: 0,
    late: 0, lateRaw: 0, leftEarly: 0, lateWaived: 0, holiday: 0, holidayPresent: 0,
    holidayHalfDay: 0, paidLeave: 0, unpaidLeave: 0, compOff: 0, totalWorkedMinutes: 0,
  };
  for (const r of rows) {
    const s = r.summary;
    agg.payableDays += s.payableDays; agg.present += s.present; agg.absent += s.absent;
    agg.halfDay += s.halfDay; agg.weeklyOff += s.weeklyOff; agg.incomplete += s.incomplete;
    agg.late += s.late; agg.lateRaw += s.lateRaw; agg.leftEarly += s.leftEarly;
    agg.lateWaived += s.lateWaived; agg.holiday += s.holiday; agg.holidayPresent += s.holidayPresent;
    agg.holidayHalfDay += s.holidayHalfDay; agg.paidLeave += s.paidLeave;
    agg.unpaidLeave += s.unpaidLeave; agg.compOff += s.compOff;
    agg.totalWorkedMinutes += s.totalWorkedMinutes;
  }
  return agg;
}

const DIST_TONES: Record<string, { label: string; tone: string }> = {
  present: { label: "Present", tone: "#16a34a" },
  halfDay: { label: "Half Day", tone: "#d97706" },
  absent: { label: "Absent", tone: "#dc2626" },
  paidLeave: { label: "Paid Leave", tone: "#2563eb" },
  unpaidLeave: { label: "Unpaid Leave", tone: "#b91c1c" },
  compOff: { label: "Comp Off", tone: "#0d9488" },
  holidayPresent: { label: "Holiday Present", tone: "#7c3aed" },
  weeklyOff: { label: "Weekly Off", tone: "#64748b" },
  holiday: { label: "Holiday", tone: "#0ea5e9" },
  incomplete: { label: "Incomplete", tone: "#f59e0b" },
};

/** Blend goal-score with attendance into a 0..100 productivity figure. Returns
 *  null when the member/team has no weekly goals (no goal signal to blend). */
function productivityBlend(goalScorePct: number | null, attendancePct: number): number | null {
  if (goalScorePct == null) return null;
  return Math.round(0.6 * goalScorePct + 0.4 * attendancePct);
}

/* ------------------------------------------------------------------ */
/* The loader                                                          */
/* ------------------------------------------------------------------ */

/**
 * Team attendance analytics for a manager.
 *
 * @param managerId    the signed-in manager's employee id.
 * @param year         reporting year.
 * @param month        reporting month (1–12).
 * @param refTodayISO  "today" (YYYY-MM-DD) in the reporting tz — drives live-row
 *                     grading and whether the "today" panel is populated.
 * @param opts.includeSelf fold the manager's own row into the team (default false).
 */
export async function loadManagerTeamAnalytics(
  managerId: string,
  year: number,
  month: number,
  refTodayISO: string,
  opts: ManagerTeamOptions = {},
): Promise<ManagerTeamAnalytics> {
  const includeSelf = opts.includeSelf ?? false;
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  const downline = await getDownlineIds(managerId);
  const teamIds = includeSelf ? [managerId, ...downline] : [...downline];
  const teamIdSet = new Set(teamIds);

  const targetHoursDefault = 9;

  // Fully-empty team → return a well-formed empty payload (route shows the
  // "no direct reports" state). No queries needed.
  if (downline.length === 0) {
    const health = computeWorkforceHealth({
      attendanceRate: 0, punctualityRate: 1, avgHoursPerDay: 0,
      targetHoursPerDay: targetHoursDefault, incompleteRate: 0, unpaidLeaveRate: 0, earlyLeaveRate: 0,
    });
    return {
      managerId, year, month, monthLabel, includesSelf: includeSelf,
      teamSize: 0, empty: true,
      kpis: {
        teamSize: 0, attendanceRatePct: 0, punctualityRatePct: 0, avgHoursPerDay: 0,
        totalHours: 0, present: 0, absent: 0, halfDay: 0, paidLeave: 0, lateMarks: 0,
        payableDays: 0, productivityPct: null, avgGoalScorePct: null,
      },
      today: { date: null, clockedIn: 0, working: 0, notYetIn: 0, rosterSize: 0 },
      members: [], lateEmployees: [], absentEmployees: [], pendingLeave: [],
      distribution: [], health, targetHoursPerDay: targetHoursDefault,
    };
  }

  // One org-wide month dashboard (batched) + org settings + team cross-domain
  // perf + pending-leave queue, in parallel. We filter the dashboard to the
  // downline slice in memory (getMonthDashboard has no id filter).
  const [allRows, org, perf, allPending] = await Promise.all([
    getMonthDashboard(year, month, refTodayISO),
    getOrgSettings(),
    teamPerformance(teamIds),
    listPendingLeave(),
  ]);

  const targetHoursPerDay = Number(org.attFullDayHours ?? "9") || targetHoursDefault;
  const rows = allRows.filter((r) => teamIdSet.has(r.employeeId));

  // ── Aggregate KPIs ──────────────────────────────────────────────────────
  const agg = sumSummaries(rows);
  const attHours = agg.totalWorkedMinutes / 60;
  const teamAttended = rows.reduce((n, r) => n + attendedDays(r.summary), 0);
  const attendanceRatePct = Math.round(attendanceRatio(agg) * 100);
  const punctualityRatePct = Math.round(punctualityRatio(agg) * 100);
  const avgHoursPerDay = teamAttended > 0 ? attHours / teamAttended : 0;

  // Mean weekly goal-score across members that have goals.
  const goalScores: number[] = [];
  for (const id of teamIds) {
    const p = perf.get(id);
    if (p?.goalScorePct != null) goalScores.push(p.goalScorePct);
  }
  const avgGoalScorePct =
    goalScores.length > 0
      ? Math.round(goalScores.reduce((a, b) => a + b, 0) / goalScores.length)
      : null;
  const teamProductivityPct = productivityBlend(avgGoalScorePct, attendanceRatePct);

  const kpis: TeamKpis = {
    teamSize: rows.length,
    attendanceRatePct,
    punctualityRatePct,
    avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
    totalHours: Math.round(attHours),
    present: agg.present,
    absent: agg.absent,
    halfDay: agg.halfDay,
    paidLeave: agg.paidLeave,
    lateMarks: agg.late,
    payableDays: Math.round(agg.payableDays * 10) / 10,
    productivityPct: teamProductivityPct,
    avgGoalScorePct,
  };

  // ── Per-member rows ─────────────────────────────────────────────────────
  const todayISO = refTodayISO.slice(0, 10);
  const monthIsCurrent = todayISO.startsWith(`${year}-${String(month).padStart(2, "0")}`);

  const members: TeamMemberRow[] = rows.map((r) => {
    const s = r.summary;
    const att = attendedDays(s);
    const memberAttPct = Math.round(attendanceRatio(s) * 100);
    const p = perf.get(r.employeeId);
    const inToday = monthIsCurrent && p?.lastInAt != null;
    return {
      employeeId: r.employeeId,
      name: r.name,
      department: r.department,
      attendanceRatePct: memberAttPct,
      punctualityRatePct: Math.round(punctualityRatio(s) * 100),
      present: s.present,
      absent: s.absent,
      halfDay: s.halfDay,
      late: s.late,
      paidLeave: s.paidLeave,
      avgHoursPerDay: att > 0 ? Math.round((s.totalWorkedMinutes / 60 / att) * 10) / 10 : 0,
      totalHours: Math.round(s.totalWorkedMinutes / 60),
      payableDays: Math.round(s.payableDays * 10) / 10,
      goalScorePct: p?.goalScorePct ?? null,
      pendingTasks: p?.pendingTasks ?? 0,
      overdueTasks: p?.overdueTasks ?? 0,
      productivityPct: productivityBlend(p?.goalScorePct ?? null, memberAttPct),
      inToday: Boolean(inToday),
      workingNow: Boolean(inToday && p?.lastOutAt == null),
    };
  });
  // Default order: lowest attendance first (surfaces who needs attention),
  // then alphabetical for ties.
  members.sort(
    (a, b) => a.attendanceRatePct - b.attendanceRatePct || a.name.localeCompare(b.name),
  );

  const lateEmployees = members
    .filter((m) => m.late > 0)
    .sort((a, b) => b.late - a.late || a.name.localeCompare(b.name));
  const absentEmployees = members
    .filter((m) => m.absent > 0)
    .sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name));

  // ── Today panel ─────────────────────────────────────────────────────────
  let today: TeamToday = {
    date: null, clockedIn: 0, working: 0, notYetIn: rows.length, rosterSize: rows.length,
  };
  if (monthIsCurrent) {
    const clockedIn = members.filter((m) => m.inToday).length;
    const working = members.filter((m) => m.workingNow).length;
    today = {
      date: todayISO,
      clockedIn,
      working,
      notYetIn: rows.length - clockedIn,
      rosterSize: rows.length,
    };
  }

  // ── Pending leave (team slice) ──────────────────────────────────────────
  const pendingLeave = allPending.filter((lv) => teamIdSet.has(lv.employeeId));

  // ── Distribution ────────────────────────────────────────────────────────
  const distribution: DistributionSlice[] = (
    ["present", "halfDay", "absent", "paidLeave", "unpaidLeave", "compOff",
     "holidayPresent", "weeklyOff", "holiday", "incomplete"] as (keyof MonthSummary)[]
  )
    .map((k) => ({
      key: k as string,
      label: DIST_TONES[k as string]?.label ?? String(k),
      value: agg[k] as number,
      tone: DIST_TONES[k as string]?.tone ?? "#94a3b8",
    }))
    .filter((slice) => slice.value > 0);

  // ── Team health score ───────────────────────────────────────────────────
  const health = computeWorkforceHealth({
    attendanceRate: attendanceRatio(agg),
    punctualityRate: punctualityRatio(agg),
    avgHoursPerDay,
    targetHoursPerDay,
    incompleteRate: teamAttended > 0 ? agg.incomplete / (teamAttended + agg.incomplete) : 0,
    unpaidLeaveRate: agg.payableDays > 0 ? agg.unpaidLeave / (agg.payableDays + agg.unpaidLeave) : 0,
    earlyLeaveRate: teamAttended > 0 ? agg.leftEarly / teamAttended : 0,
  });

  return {
    managerId, year, month, monthLabel, includesSelf: includeSelf,
    teamSize: rows.length, empty: rows.length === 0,
    kpis, today, members, lateEmployees, absentEmployees, pendingLeave,
    distribution, health, targetHoursPerDay,
  };
}

/** Convenience alias for `TeamMemberPerf` re-export so UI can type helper props. */
export type { TeamMemberPerf };
