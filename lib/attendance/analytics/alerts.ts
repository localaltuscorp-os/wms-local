/**
 * SMART ALERTS — pure, rule-based anomaly detection over the org-wide attendance
 * analytics. NO DB, NO server-only, NO AI: a deterministic pass that turns the
 * already-folded numbers (`OrgAttendanceAnalytics`) into a ranked list of crisp,
 * factual alerts for the Workforce Intelligence dashboard.
 *
 * Every alert is grounded ONLY in the figures the loader produced — the `detail`
 * string never editorialises beyond what the metric states. Thresholds live here
 * in ONE place so they're auditable + tunable, and they mirror the health-score
 * bands (≥85 excellent · ≥70 good · ≥50 attention · else critical) so the two
 * surfaces agree.
 *
 * `computeSmartAlerts` is safe to call from a client component (the org page can
 * render alerts without a round-trip) OR from the server action alongside the AI
 * read-out.
 */

import type { OrgAttendanceAnalytics } from "@/lib/attendance/analytics/org";

export type AlertSeverity = "critical" | "warning" | "info";

export interface SmartAlert {
  /** Stable key (dedupe + React key). */
  id: string;
  severity: AlertSeverity;
  /** ≤ ~48-char headline. */
  title: string;
  /** One factual sentence grounded in the numbers. */
  detail: string;
  /** Optional headline figure for the card (e.g. "72%", "14 days"). */
  metric?: string;
  /** Optional in-app deep-link the card's action chip points at. */
  actionRoute?: string;
}

/* ------------------------------------------------------------------ */
/* Thresholds — tune in ONE place                                      */
/* ------------------------------------------------------------------ */

const T = {
  attendance: { critical: 70, warning: 85, excellent: 95 },
  punctuality: { critical: 70, warning: 85 },
  /** Absent share of graded days. */
  absentRate: { warning: 0.08, critical: 0.15 },
  /** Incomplete share of attended+incomplete days. */
  incompleteRate: { warning: 0.1, critical: 0.2 },
  /** Unpaid-leave (LWP) share of the graded base. */
  unpaidLeaveRate: { warning: 0.05, critical: 0.1 },
  /** Avg hours as a fraction of the org target. */
  hoursRatio: { warning: 0.85, critical: 0.65 },
  /** Only flag departments with at least this many people. */
  minDeptHeadcount: 3,
  /** Department attendance / punctuality flags. */
  deptAttendance: 80,
  deptPunctuality: 80,
} as const;

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const pct = (n: number) => `${Math.round(n)}%`;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/* ------------------------------------------------------------------ */
/* The rules                                                           */
/* ------------------------------------------------------------------ */

/**
 * Turn the org analytics into a ranked list of Smart Alerts. PURE + total:
 * given the same analytics it always returns the same alerts, and it never
 * throws. Critical first, then warnings, then info; stable within a severity.
 */
export function computeSmartAlerts(a: OrgAttendanceAnalytics): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const k = a.kpis;
  const route = `/attendance/dashboard?y=${a.year}&m=${a.month}`;

  // Graded-day denominators, derived only from the published KPI counts.
  const attended = k.present + k.halfDay + k.holidayPresent; // days someone worked
  const gradedBase =
    k.present + k.absent + k.halfDay + k.holidayPresent + k.paidLeave + k.unpaidLeave + k.compOff;
  const absentRate = gradedBase > 0 ? k.absent / gradedBase : 0;
  const incompleteRate = attended + k.incomplete > 0 ? k.incomplete / (attended + k.incomplete) : 0;
  const unpaidRate = gradedBase > 0 ? k.unpaidLeave / gradedBase : 0;
  const hoursRatio = a.targetHoursPerDay > 0 ? k.avgHoursPerDay / a.targetHoursPerDay : 1;

  /* — Workforce Health band — the composite headline. — */
  if (a.health.band.key === "critical") {
    alerts.push({
      id: "health-critical",
      severity: "critical",
      title: "Workforce health is critical",
      detail: `Composite health score is ${a.health.score}/100 for ${a.monthLabel} — below the 50-point critical line.`,
      metric: `${a.health.score}/100`,
      actionRoute: route,
    });
  } else if (a.health.band.key === "attention") {
    alerts.push({
      id: "health-attention",
      severity: "warning",
      title: "Workforce health needs attention",
      detail: `Composite health score is ${a.health.score}/100 for ${a.monthLabel}, in the "needs attention" band (50–69).`,
      metric: `${a.health.score}/100`,
      actionRoute: route,
    });
  }

  /* — Org attendance rate. — */
  if (k.attendanceRatePct < T.attendance.critical) {
    alerts.push({
      id: "attendance-critical",
      severity: "critical",
      title: "Org attendance critically low",
      detail: `Effective attendance is ${pct(k.attendanceRatePct)} across ${k.totalEmployees} employees — under the ${T.attendance.critical}% floor.`,
      metric: pct(k.attendanceRatePct),
      actionRoute: route,
    });
  } else if (k.attendanceRatePct < T.attendance.warning) {
    alerts.push({
      id: "attendance-warning",
      severity: "warning",
      title: "Attendance below target",
      detail: `Effective attendance is ${pct(k.attendanceRatePct)}, under the ${T.attendance.warning}% comfort line.`,
      metric: pct(k.attendanceRatePct),
      actionRoute: route,
    });
  } else if (k.attendanceRatePct >= T.attendance.excellent) {
    alerts.push({
      id: "attendance-strong",
      severity: "info",
      title: "Attendance is excellent",
      detail: `Effective attendance held at ${pct(k.attendanceRatePct)} for ${a.monthLabel}.`,
      metric: pct(k.attendanceRatePct),
    });
  }

  /* — Absenteeism spike. — */
  if (k.absent > 0 && absentRate >= T.absentRate.critical) {
    alerts.push({
      id: "absenteeism-critical",
      severity: "critical",
      title: "Absenteeism spike",
      detail: `${days(k.absent)} logged absent — ${pct(absentRate * 100)} of all graded days this month.`,
      metric: pct(absentRate * 100),
      actionRoute: route,
    });
  } else if (k.absent > 0 && absentRate >= T.absentRate.warning) {
    alerts.push({
      id: "absenteeism-warning",
      severity: "warning",
      title: "Elevated absenteeism",
      detail: `${days(k.absent)} logged absent — ${pct(absentRate * 100)} of graded days, above the ${pct(T.absentRate.warning * 100)} watch level.`,
      metric: pct(absentRate * 100),
      actionRoute: route,
    });
  }

  /* — Punctuality / late marks. — */
  if (k.punctualityRatePct < T.punctuality.critical) {
    alerts.push({
      id: "punctuality-critical",
      severity: "critical",
      title: "Punctuality critically low",
      detail: `On-time rate is ${pct(k.punctualityRatePct)} with ${k.lateMarks} un-waived late mark(s) this month.`,
      metric: pct(k.punctualityRatePct),
      actionRoute: route,
    });
  } else if (k.punctualityRatePct < T.punctuality.warning) {
    alerts.push({
      id: "punctuality-warning",
      severity: "warning",
      title: "Late arrivals trending up",
      detail: `On-time rate is ${pct(k.punctualityRatePct)}; ${k.lateMarks} un-waived late mark(s) recorded (${k.lateRaw} raw).`,
      metric: `${k.lateMarks} late`,
      actionRoute: route,
    });
  }

  /* — Incomplete punches (missed check-in/out). — */
  if (k.incomplete > 0 && incompleteRate >= T.incompleteRate.critical) {
    alerts.push({
      id: "incomplete-critical",
      severity: "critical",
      title: "Punch data is unreliable",
      detail: `${k.incomplete} incomplete punch(es) — ${pct(incompleteRate * 100)} of attended days are missing a check-in or check-out.`,
      metric: `${k.incomplete}`,
      actionRoute: route,
    });
  } else if (k.incomplete > 0 && incompleteRate >= T.incompleteRate.warning) {
    alerts.push({
      id: "incomplete-warning",
      severity: "warning",
      title: "High incomplete punches",
      detail: `${k.incomplete} incomplete punch(es) this month — ${pct(incompleteRate * 100)} of attended days.`,
      metric: `${k.incomplete}`,
      actionRoute: route,
    });
  }

  /* — Working-hours shortfall. — */
  if (attended > 0 && hoursRatio < T.hoursRatio.critical) {
    alerts.push({
      id: "hours-critical",
      severity: "critical",
      title: "Working hours well below target",
      detail: `Avg ${k.avgHoursPerDay.toFixed(1)}h/day vs the ${a.targetHoursPerDay}h target — a ${pct((1 - hoursRatio) * 100)} shortfall.`,
      metric: `${k.avgHoursPerDay.toFixed(1)}h`,
      actionRoute: route,
    });
  } else if (attended > 0 && hoursRatio < T.hoursRatio.warning) {
    alerts.push({
      id: "hours-warning",
      severity: "warning",
      title: "Working hours under target",
      detail: `Avg ${k.avgHoursPerDay.toFixed(1)}h/day vs the ${a.targetHoursPerDay}h target.`,
      metric: `${k.avgHoursPerDay.toFixed(1)}h`,
      actionRoute: route,
    });
  }

  /* — Unpaid-leave (LWP) signal. — */
  if (k.unpaidLeave > 0 && unpaidRate >= T.unpaidLeaveRate.critical) {
    alerts.push({
      id: "unpaid-leave-critical",
      severity: "critical",
      title: "Loss-of-pay leave is high",
      detail: `${days(k.unpaidLeave)} of unpaid (LWP) leave — ${pct(unpaidRate * 100)} of graded days, hitting payroll.`,
      metric: days(k.unpaidLeave),
      actionRoute: route,
    });
  } else if (k.unpaidLeave > 0 && unpaidRate >= T.unpaidLeaveRate.warning) {
    alerts.push({
      id: "unpaid-leave-warning",
      severity: "warning",
      title: "Unpaid leave to watch",
      detail: `${days(k.unpaidLeave)} of unpaid (LWP) leave — ${pct(unpaidRate * 100)} of graded days.`,
      metric: days(k.unpaidLeave),
      actionRoute: route,
    });
  }

  /* — Comp-off context (informational, not a deduction). — */
  if (k.compOff > 0) {
    alerts.push({
      id: "comp-off-info",
      severity: "info",
      title: "Comp-off redeemed",
      detail: `${days(k.compOff)} of comp-off taken this month — factored into the attendance base.`,
      metric: days(k.compOff),
    });
  }

  /* — Worst department by attendance / punctuality. — */
  const rankable = a.departments.filter((d) => d.headcount >= T.minDeptHeadcount);

  const worstAttendance = rankable
    .slice()
    .sort((x, y) => x.attendanceRatePct - y.attendanceRatePct)[0];
  if (worstAttendance && worstAttendance.attendanceRatePct < T.deptAttendance) {
    const isCrit = worstAttendance.attendanceRatePct < T.attendance.critical;
    alerts.push({
      id: `dept-attendance-${slug(worstAttendance.department)}`,
      severity: isCrit ? "critical" : "warning",
      title: `${worstAttendance.department}: weakest attendance`,
      detail: `${worstAttendance.department} (${worstAttendance.headcount} people) sits at ${pct(worstAttendance.attendanceRatePct)} attendance with ${days(worstAttendance.absent)} absent.`,
      metric: pct(worstAttendance.attendanceRatePct),
      actionRoute: route,
    });
  }

  const worstPunctuality = rankable
    .slice()
    .sort((x, y) => x.punctualityRatePct - y.punctualityRatePct)[0];
  if (
    worstPunctuality &&
    worstPunctuality.punctualityRatePct < T.deptPunctuality &&
    worstPunctuality.department !== worstAttendance?.department
  ) {
    alerts.push({
      id: `dept-punctuality-${slug(worstPunctuality.department)}`,
      severity: worstPunctuality.punctualityRatePct < T.punctuality.critical ? "critical" : "warning",
      title: `${worstPunctuality.department}: most late arrivals`,
      detail: `${worstPunctuality.department} is at ${pct(worstPunctuality.punctualityRatePct)} on-time with ${worstPunctuality.late} late mark(s).`,
      metric: pct(worstPunctuality.punctualityRatePct),
      actionRoute: route,
    });
  }

  /* — Today's live snapshot (only when the viewed month contains today). — */
  if (a.today && a.today.rosterSize > 0) {
    const notIn = a.today.rosterSize - a.today.clockedIn;
    const notInRate = notIn / a.today.rosterSize;
    if (notInRate >= 0.3 && notIn > 0) {
      alerts.push({
        id: "today-not-clocked-in",
        severity: notInRate >= 0.5 ? "warning" : "info",
        title: "Many not clocked in today",
        detail: `${notIn} of ${a.today.rosterSize} on the roster have not clocked in yet today.`,
        metric: `${notIn}`,
        actionRoute: "/attendance",
      });
    }
  }

  // Critical → warning → info; stable within each band (declaration order).
  return alerts
    .map((al, i) => ({ al, i }))
    .sort((p, q) => SEVERITY_RANK[p.al.severity] - SEVERITY_RANK[q.al.severity] || p.i - q.i)
    .map(({ al }) => al);
}

/** Count alerts by severity — handy for a header summary chip. */
export function summariseAlerts(alerts: SmartAlert[]): Record<AlertSeverity, number> {
  return alerts.reduce(
    (acc, al) => {
      acc[al.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 } as Record<AlertSeverity, number>,
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dept";
}
