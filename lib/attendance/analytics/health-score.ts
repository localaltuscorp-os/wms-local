/**
 * Workforce Health Score — the composite headline metric for the Attendance
 * Workforce Intelligence dashboard. PURE + client-safe (no DB, no server-only).
 *
 * Blends the operational signals into a single 0–100 score + rating band, each
 * component contributing a weighted, normalised sub-score. Every input is a plain
 * aggregate already produced by the existing engines (MonthSummary folds), so the
 * score reconciles with the rest of the dashboard.
 *
 * Weights (sum 100) — tune here in ONE place:
 *   Attendance 30 · Punctuality 20 · Working Hours 20 · Incomplete Punches 10 ·
 *   Leave discipline 10 · Consistency (early-leave) 10.
 * Overtime + Comp-Off are shown as context, not scored down (they're not "bad").
 */

export interface HealthInputs {
  /** Effective attendance ratio 0..1 (present + ½·half + HP + PL + CO over the
   *  attended+absent denominator). */
  attendanceRate: number;
  /** Punctuality ratio 0..1 (1 − unforgiven-late / attended days). */
  punctualityRate: number;
  /** Average worked hours per attended day. */
  avgHoursPerDay: number;
  /** Org target hours/day (org full-day threshold, e.g. 9). */
  targetHoursPerDay: number;
  /** Incomplete punch count over total attended days (0..1, lower is better). */
  incompleteRate: number;
  /** Unpaid-leave (LWP) days over payable-day base (0..1, lower is better). */
  unpaidLeaveRate: number;
  /** Early-leave count over attended days (0..1, lower is better). */
  earlyLeaveRate: number;
}

export type HealthBandKey = "excellent" | "good" | "attention" | "critical";

export interface HealthBand {
  key: HealthBandKey;
  label: string;
  tone: string;
}

export const HEALTH_BANDS: Record<HealthBandKey, HealthBand> = {
  excellent: { key: "excellent", label: "Excellent", tone: "#15803d" },
  good: { key: "good", label: "Good", tone: "#16a34a" },
  attention: { key: "attention", label: "Needs Attention", tone: "#d97706" },
  critical: { key: "critical", label: "Critical", tone: "#dc2626" },
};

export interface HealthComponent {
  key: string;
  label: string;
  /** This component's 0..100 sub-score. */
  score: number;
  /** Its weight in the blend. */
  weight: number;
  /** Weighted contribution (score × weight / 100). */
  contribution: number;
  /** One-line human explanation. */
  note: string;
}

export interface WorkforceHealth {
  /** 0..100 overall. */
  score: number;
  band: HealthBand;
  components: HealthComponent[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const pct = (n: number) => Math.round(clamp01(n) * 100);

/** Band a 0..100 score: ≥85 Excellent · ≥70 Good · ≥50 Needs Attention · else Critical. */
export function healthBandFor(score: number): HealthBand {
  if (score >= 85) return HEALTH_BANDS.excellent;
  if (score >= 70) return HEALTH_BANDS.good;
  if (score >= 50) return HEALTH_BANDS.attention;
  return HEALTH_BANDS.critical;
}

export function computeWorkforceHealth(i: HealthInputs): WorkforceHealth {
  const attendance = pct(i.attendanceRate);
  const punctuality = pct(i.punctualityRate);
  // Hours: full credit at/above target, linear below, floored at 0.
  const hours = pct(i.targetHoursPerDay > 0 ? i.avgHoursPerDay / i.targetHoursPerDay : 0);
  const completeness = pct(1 - i.incompleteRate);
  const leaveDiscipline = pct(1 - i.unpaidLeaveRate);
  const consistency = pct(1 - i.earlyLeaveRate);

  const raw: Omit<HealthComponent, "contribution">[] = [
    { key: "attendance", label: "Attendance", score: attendance, weight: 30, note: `${attendance}% effective attendance` },
    { key: "punctuality", label: "Punctuality", score: punctuality, weight: 20, note: `${punctuality}% on-time arrivals` },
    { key: "hours", label: "Working Hours", score: hours, weight: 20, note: `${i.avgHoursPerDay.toFixed(1)}h/day vs ${i.targetHoursPerDay}h target` },
    { key: "completeness", label: "Punch Completeness", score: completeness, weight: 10, note: `${completeness}% complete punches` },
    { key: "leave", label: "Leave Discipline", score: leaveDiscipline, weight: 10, note: `${100 - leaveDiscipline}% unpaid-leave rate` },
    { key: "consistency", label: "Consistency", score: consistency, weight: 10, note: `${100 - consistency}% early-exit rate` },
  ];

  const components: HealthComponent[] = raw.map((c) => ({
    ...c,
    contribution: Math.round((c.score * c.weight) / 100),
  }));
  const score = Math.round(components.reduce((s, c) => s + (c.score * c.weight) / 100, 0));
  return { score, band: healthBandFor(score), components };
}
