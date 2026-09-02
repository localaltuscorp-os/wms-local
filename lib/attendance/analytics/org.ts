import "server-only";
import { getMonthDashboard, type DashboardRow, type MonthSummary } from "@/lib/queries/attendance-status";
import { listTeamAttendanceForDate } from "@/lib/queries/attendance";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { computeWorkforceHealth, type WorkforceHealth } from "@/lib/attendance/analytics/health-score";
import { attendedDays, attendanceRatio, punctualityRatio } from "@/lib/attendance/analytics/ratios";

/**
 * ORG-WIDE attendance analytics — the shared data contract for the Workforce
 * Intelligence dashboard (HR / Finance / Admin surfaces). Server-only.
 *
 * Reuses the batched `getMonthDashboard` (one row per active employee, already
 * department-aware) as the single source of truth, folds it into executive KPIs,
 * an attendance-code distribution, per-department roll-ups, working-hours buckets,
 * punctuality leaderboards and a Workforce Health Score. "Today" KPIs come from
 * `listTeamAttendanceForDate` (only when the viewed month contains today).
 *
 * Consistency note: this uses the RAW MonthSummary tally (NOT the 54h-waiver /
 * 3-mark `summarize` path) so the numbers match the salary bridge + the existing
 * report table. The waiver-adjusted figures live on the per-employee ₹ views.
 */

/* ------------------------------------------------------------------ */
/* Contract types                                                      */
/* ------------------------------------------------------------------ */

export interface AttendanceKpis {
  totalEmployees: number;
  present: number;
  absent: number;
  halfDay: number;
  weeklyOff: number;
  holiday: number;
  holidayPresent: number;
  paidLeave: number;
  unpaidLeave: number;
  compOff: number;
  incomplete: number;
  /** Un-waived late marks + all-late + early-leave + waived. */
  lateMarks: number;
  lateRaw: number;
  earlyMarks: number;
  lateWaived: number;
  /** 0..100 effective attendance %. */
  attendanceRatePct: number;
  /** 0..100 on-time %. */
  punctualityRatePct: number;
  /** Average worked hours per attended day. */
  avgHoursPerDay: number;
  /** Total worked hours across the org for the month. */
  totalHours: number;
  /** Σ payable days across the org. */
  payableDays: number;
}

export interface TodayKpis {
  date: string;
  present: number;
  absent: number;
  clockedIn: number; // punched in
  working: number; // in without out yet
  rosterSize: number;
}

export interface DistributionSlice {
  key: string;
  label: string;
  value: number;
  tone: string;
}

export interface DepartmentRollup {
  department: string;
  headcount: number;
  attendanceRatePct: number;
  punctualityRatePct: number;
  avgHoursPerDay: number;
  late: number;
  absent: number;
  payableDays: number;
}

export interface HoursBucket {
  key: string;
  label: string;
  count: number;
}

export interface LeaderRow {
  employeeId: string;
  name: string;
  department: string | null;
  value: number;
  detail: string;
}

export interface OrgLeaderboards {
  mostPunctual: LeaderRow[];
  mostLate: LeaderRow[];
  mostAbsent: LeaderRow[];
  highestHours: LeaderRow[];
  bestAttendance: LeaderRow[];
}

export interface OrgAttendanceAnalytics {
  year: number;
  month: number;
  monthLabel: string;
  kpis: AttendanceKpis;
  today: TodayKpis | null;
  distribution: DistributionSlice[];
  departments: DepartmentRollup[];
  hoursBuckets: HoursBucket[];
  leaderboards: OrgLeaderboards;
  health: WorkforceHealth;
  /** Per-employee rows (for the drill table + cross-filtering). */
  rows: DashboardRow[];
  targetHoursPerDay: number;
}

/* ------------------------------------------------------------------ */
/* Folds                                                               */
/* ------------------------------------------------------------------ */

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Pure ratio helpers live in ./ratios (client-safe) so client components (the
// drill table) can import them without pulling this server-only module in.
// Re-exported here for back-compat with existing server-side importers.
export { attendanceRatio, punctualityRatio };

/** Sum an array of MonthSummary into one aggregate. */
function sumSummaries(rows: DashboardRow[]): MonthSummary {
  const agg = {
    payableDays: 0, present: 0, absent: 0, halfDay: 0, weeklyOff: 0, incomplete: 0,
    late: 0, lateRaw: 0, leftEarly: 0, lateWaived: 0, holiday: 0, holidayPresent: 0,
    holidayHalfDay: 0, paidLeave: 0, unpaidLeave: 0, compOff: 0, totalWorkedMinutes: 0,
  } satisfies MonthSummary;
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

function bucketHours(avg: number): string {
  if (avg < 5) return "<5";
  if (avg < 7) return "5-7";
  if (avg < 9) return "7-9";
  if (avg < 11) return "9-11";
  return "11+";
}

const HOURS_BUCKETS: { key: string; label: string }[] = [
  { key: "<5", label: "< 5 h" },
  { key: "5-7", label: "5–7 h" },
  { key: "7-9", label: "7–9 h" },
  { key: "9-11", label: "9–11 h" },
  { key: "11+", label: "11+ h" },
];

const DIST_TONES: Record<string, { label: string; tone: string }> = {
  present: { label: "Present", tone: "#16a34a" },
  halfDay: { label: "Half Day", tone: "#d97706" },
  absent: { label: "Absent", tone: "#dc2626" },
  weeklyOff: { label: "Weekly Off", tone: "#64748b" },
  holiday: { label: "Holiday", tone: "#0ea5e9" },
  holidayPresent: { label: "Holiday Present", tone: "#7c3aed" },
  holidayHalfDay: { label: "Holiday Half-Day", tone: "#a78bfa" },
  paidLeave: { label: "Paid Leave", tone: "#2563eb" },
  unpaidLeave: { label: "Unpaid Leave", tone: "#b91c1c" },
  compOff: { label: "Comp Off", tone: "#0d9488" },
  incomplete: { label: "Incomplete", tone: "#f59e0b" },
};

/* ------------------------------------------------------------------ */
/* The loader                                                          */
/* ------------------------------------------------------------------ */

export async function loadOrgAttendanceAnalytics(
  year: number,
  month: number,
  refTodayISO: string,
  filters?: { weeklyOff?: number },
): Promise<OrgAttendanceAnalytics> {
  const [rows, org] = await Promise.all([
    getMonthDashboard(year, month, refTodayISO, filters),
    getOrgSettings(),
  ]);
  const targetHoursPerDay = Number(org.attFullDayHours ?? "9") || 9;

  const agg = sumSummaries(rows);
  const attHours = agg.totalWorkedMinutes / 60;
  const orgAttended = rows.reduce((n, r) => n + attendedDays(r.summary), 0);
  const attendanceRatePct = Math.round(attendanceRatio(agg) * 100);
  const punctualityRatePct = Math.round(punctualityRatio(agg) * 100);
  const avgHoursPerDay = orgAttended > 0 ? attHours / orgAttended : 0;

  const kpis: AttendanceKpis = {
    totalEmployees: rows.length,
    present: agg.present, absent: agg.absent, halfDay: agg.halfDay, weeklyOff: agg.weeklyOff,
    holiday: agg.holiday, holidayPresent: agg.holidayPresent, paidLeave: agg.paidLeave,
    unpaidLeave: agg.unpaidLeave, compOff: agg.compOff, incomplete: agg.incomplete,
    lateMarks: agg.late, lateRaw: agg.lateRaw, earlyMarks: agg.leftEarly, lateWaived: agg.lateWaived,
    attendanceRatePct, punctualityRatePct,
    avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
    totalHours: Math.round(attHours),
    payableDays: Math.round(agg.payableDays * 10) / 10,
  };

  // Distribution (day-type mix across the org).
  const distribution: DistributionSlice[] = (
    ["present", "halfDay", "absent", "paidLeave", "unpaidLeave", "compOff",
     "holidayPresent", "holidayHalfDay", "holiday", "weeklyOff", "incomplete"] as (keyof MonthSummary)[]
  )
    .map((k) => ({ key: k as string, label: DIST_TONES[k as string]?.label ?? String(k), value: agg[k] as number, tone: DIST_TONES[k as string]?.tone ?? "#94a3b8" }))
    .filter((s) => s.value > 0);

  // Department roll-ups.
  const byDept = new Map<string, DashboardRow[]>();
  for (const r of rows) {
    const d = r.department?.trim() || "Unassigned";
    (byDept.get(d) ?? byDept.set(d, []).get(d)!).push(r);
  }
  const departments: DepartmentRollup[] = [...byDept.entries()]
    .map(([department, drows]) => {
      const dagg = sumSummaries(drows);
      const dAtt = drows.reduce((n, r) => n + attendedDays(r.summary), 0);
      return {
        department,
        headcount: drows.length,
        attendanceRatePct: Math.round(attendanceRatio(dagg) * 100),
        punctualityRatePct: Math.round(punctualityRatio(dagg) * 100),
        avgHoursPerDay: dAtt > 0 ? Math.round((dagg.totalWorkedMinutes / 60 / dAtt) * 10) / 10 : 0,
        late: dagg.late,
        absent: dagg.absent,
        payableDays: Math.round(dagg.payableDays * 10) / 10,
      };
    })
    .sort((a, b) => b.headcount - a.headcount);

  // Working-hours buckets (per-employee average).
  const bucketCounts = new Map<string, number>(HOURS_BUCKETS.map((b) => [b.key, 0]));
  for (const r of rows) {
    const att = attendedDays(r.summary);
    if (att <= 0) continue;
    const avg = r.summary.totalWorkedMinutes / 60 / att;
    const k = bucketHours(avg);
    bucketCounts.set(k, (bucketCounts.get(k) ?? 0) + 1);
  }
  const hoursBuckets: HoursBucket[] = HOURS_BUCKETS.map((b) => ({ ...b, count: bucketCounts.get(b.key) ?? 0 }));

  // Leaderboards.
  const withAtt = rows.filter((r) => attendedDays(r.summary) > 0);
  const leader = (r: DashboardRow, value: number, detail: string): LeaderRow => ({
    employeeId: r.employeeId, name: r.name, department: r.department, value, detail,
  });
  const leaderboards: OrgLeaderboards = {
    mostPunctual: [...withAtt].sort((a, b) => punctualityRatio(b.summary) - punctualityRatio(a.summary)).slice(0, 8)
      .map((r) => leader(r, Math.round(punctualityRatio(r.summary) * 100), `${r.summary.late} late`)),
    mostLate: [...rows].filter((r) => r.summary.late > 0).sort((a, b) => b.summary.late - a.summary.late).slice(0, 8)
      .map((r) => leader(r, r.summary.late, `${r.summary.lateRaw} raw`)),
    mostAbsent: [...rows].filter((r) => r.summary.absent > 0).sort((a, b) => b.summary.absent - a.summary.absent).slice(0, 8)
      .map((r) => leader(r, r.summary.absent, `${r.summary.absent} days`)),
    highestHours: [...rows].sort((a, b) => b.summary.totalWorkedMinutes - a.summary.totalWorkedMinutes).slice(0, 8)
      .map((r) => leader(r, Math.round(r.summary.totalWorkedMinutes / 60), "hours")),
    bestAttendance: [...withAtt].sort((a, b) => attendanceRatio(b.summary) - attendanceRatio(a.summary)).slice(0, 8)
      .map((r) => leader(r, Math.round(attendanceRatio(r.summary) * 100), `${r.summary.present}P/${r.summary.absent}A`)),
  };

  // Workforce Health Score.
  const health = computeWorkforceHealth({
    attendanceRate: attendanceRatio(agg),
    punctualityRate: punctualityRatio(agg),
    avgHoursPerDay,
    targetHoursPerDay,
    incompleteRate: orgAttended > 0 ? agg.incomplete / (orgAttended + agg.incomplete) : 0,
    unpaidLeaveRate: agg.payableDays > 0 ? agg.unpaidLeave / (agg.payableDays + agg.unpaidLeave) : 0,
    earlyLeaveRate: orgAttended > 0 ? agg.leftEarly / orgAttended : 0,
  });

  // Today KPIs — only meaningful when the viewed month contains today.
  let today: TodayKpis | null = null;
  const todayISO = refTodayISO.slice(0, 10);
  if (todayISO.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
    const team = await listTeamAttendanceForDate(todayISO);
    const clockedIn = team.filter((t) => t.in != null).length;
    const working = team.filter((t) => t.in != null && t.out == null).length;
    today = {
      date: todayISO,
      present: clockedIn,
      absent: team.length - clockedIn,
      clockedIn,
      working,
      rosterSize: team.length,
    };
  }

  return {
    year, month, monthLabel: `${MONTHS[month - 1]} ${year}`,
    kpis, today, distribution, departments, hoursBuckets, leaderboards, health, rows, targetHoursPerDay,
  };
}
