import "server-only";
import { generateText, GeminiNotConfiguredError } from "@/lib/ai/gemini";
import { computeSmartAlerts, type SmartAlert } from "@/lib/attendance/analytics/alerts";
import type {
  OrgAttendanceAnalytics,
  DepartmentRollup,
} from "@/lib/attendance/analytics/org";

/**
 * WORKFORCE INTELLIGENCE — AI (or heuristic) executive read-out over the
 * org-wide attendance analytics.
 *
 * MIRRORS lib/ai/attendance-insights.ts + lib/ai/interview-insights.ts EXACTLY:
 * try the repo's single LLM helper (lib/ai/gemini.ts → generateText, Google
 * Gemini via the generativelanguage REST API), parse strict JSON, and — on a
 * missing key (GeminiNotConfiguredError) OR any parse/throw failure — fall back
 * to a DETERMINISTIC heuristic so the dashboard never shows a blank AI panel.
 * `source` tells the UI which engine ran. This function NEVER throws.
 *
 * There is NO Anthropic/Claude client in this repo, so — per the "reuse the one
 * helper" rule — we build on Gemini rather than add a second provider. And since
 * GEMINI_API_KEY is typically NOT set here, the heuristic path is the primary
 * experience and is written to be genuinely useful on its own: it derives
 * highlights from the strong metrics, concerns from the weak ones + the Smart
 * Alerts, and recommendations that target the worst departments / dimensions.
 *
 * Everything the prompt states is grounded ONLY in the folded numbers — the
 * model is told never to invent figures.
 */

export interface WorkforceInsights {
  /** 2-3 sentence executive summary of the month. */
  summary: string;
  /** What's going well — from the strong metrics. */
  highlights: string[];
  /** What needs attention — from the weak metrics + smart alerts. */
  concerns: string[];
  /** Concrete, prioritised next actions. */
  recommendations: string[];
  /** Per-department call-outs (best / worst movers). */
  departmentCallouts: string[];
  /** One-line directional read (the health band + headline drivers). */
  trend: string;
  /** Which engine produced this — for a small UI badge + honesty. */
  source: "ai" | "heuristic";
  /** ISO timestamp of generation. */
  generatedAt: string;
}

/** Public entry: try the LLM, fall back to the heuristic on ANY failure. */
export async function generateWorkforceInsights(
  a: OrgAttendanceAnalytics,
): Promise<WorkforceInsights> {
  const generatedAt = new Date().toISOString();
  try {
    const text = await generateText(buildPrompt(a));
    const parsed = parseModelJson(text);
    if (parsed) return { ...parsed, source: "ai", generatedAt };
    // Unparseable → heuristic (still deterministic + useful).
    return heuristicWorkforceInsights(a);
  } catch (err) {
    // Missing key or transient model error → graceful deterministic fallback.
    // Analytics must never throw into the Workforce Intelligence dashboard.
    void err;
    return heuristicWorkforceInsights(a);
  }
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

function deptLine(d: DepartmentRollup): string {
  return `  · ${d.department} (${d.headcount}p): attendance ${d.attendanceRatePct}%, on-time ${d.punctualityRatePct}%, ${d.avgHoursPerDay}h/day, ${d.absent} absent, ${d.late} late`;
}

function buildPrompt(a: OrgAttendanceAnalytics): string {
  const k = a.kpis;
  const alerts = computeSmartAlerts(a);

  const topDepts = a.departments
    .slice()
    .sort((x, y) => y.attendanceRatePct - x.attendanceRatePct)
    .slice(0, 3)
    .map(deptLine)
    .join("\n");
  const bottomDepts = a.departments
    .slice()
    .sort((x, y) => x.attendanceRatePct - y.attendanceRatePct)
    .slice(0, 3)
    .map(deptLine)
    .join("\n");

  const distribution = a.distribution
    .map((s) => `${s.label} ${s.value}`)
    .join(", ");

  const hours = a.hoursBuckets.map((b) => `${b.label}: ${b.count}`).join(", ");

  const mostLate = a.leaderboards.mostLate
    .slice(0, 3)
    .map((r) => `${r.name} (${r.value})`)
    .join(", ");
  const mostAbsent = a.leaderboards.mostAbsent
    .slice(0, 3)
    .map((r) => `${r.name} (${r.value})`)
    .join(", ");

  const alertLines = alerts
    .slice(0, 8)
    .map((al) => `  · [${al.severity}] ${al.title} — ${al.detail}`)
    .join("\n");

  const components = a.health.components
    .map((c) => `${c.label} ${c.score}/100 (w${c.weight})`)
    .join(", ");

  return `You are a workforce analytics lead writing a crisp, executive attendance read-out for HR + Finance leadership. Base EVERY statement ONLY on the numbers below — never invent figures, never moralize, be specific and concrete. Reference the actual percentages, counts and department names.

Period: ${a.monthLabel}
Headcount: ${k.totalEmployees}

Workforce Health: ${a.health.score}/100 (${a.health.band.label})
Health components: ${components}

Org KPIs:
  · Effective attendance: ${k.attendanceRatePct}%
  · Punctuality (on-time): ${k.punctualityRatePct}%  (${k.lateMarks} un-waived late, ${k.lateRaw} raw, ${k.earlyMarks} early-outs)
  · Avg hours/day: ${k.avgHoursPerDay} vs ${a.targetHoursPerDay} target  (total ${k.totalHours}h)
  · Absent days: ${k.absent} · Half-days: ${k.halfDay} · Incomplete punches: ${k.incomplete}
  · Paid leave: ${k.paidLeave} · Unpaid leave (LWP): ${k.unpaidLeave} · Comp-off: ${k.compOff}
  · Payable days: ${k.payableDays}

Day-type distribution: ${distribution || "n/a"}
Working-hours spread (people): ${hours || "n/a"}
Most late: ${mostLate || "none"}
Most absent: ${mostAbsent || "none"}

Top departments (by attendance):
${topDepts || "  · (none)"}
Bottom departments (by attendance):
${bottomDepts || "  · (none)"}

Rule-based alerts already computed:
${alertLines || "  · (none)"}

Return ONLY a JSON object, no prose around it, in EXACTLY this shape:
{
  "summary": "2-3 sentence executive read of the month",
  "highlights": ["short point", "..."],
  "concerns": ["short point", "..."],
  "recommendations": ["concrete next action", "..."],
  "departmentCallouts": ["short per-department note", "..."],
  "trend": "one sentence directional read referencing the health band and top drivers"
}
Rules: 2-4 items in each array; each point <= 16 words; highlights come from the STRONG metrics, concerns from the WEAK metrics and the alerts; recommendations must target the worst departments/metrics with a specific action; departmentCallouts must name real departments from the lists above; never manufacture a positive the numbers don't support; if there are genuinely no concerns, still return the array with the single best-available watch item.`;
}

/* ------------------------------------------------------------------ */
/* Strict JSON parse                                                   */
/* ------------------------------------------------------------------ */

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() || fallback : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean)
    : [];
}

/** Extract the first JSON object from the model text and map to the contract
 *  (minus source/generatedAt, which the caller stamps). */
function parseModelJson(
  text: string,
): Omit<WorkforceInsights, "source" | "generatedAt"> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const summary = str(o.summary);
  const highlights = strArr(o.highlights);
  const concerns = strArr(o.concerns);
  // Guard against an empty/garbage object.
  if (!summary && highlights.length === 0 && concerns.length === 0) return null;
  return {
    summary: summary || "Attendance read-out.",
    highlights,
    concerns,
    recommendations: strArr(o.recommendations),
    departmentCallouts: strArr(o.departmentCallouts),
    trend: str(o.trend),
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic heuristic fallback                                    */
/* ------------------------------------------------------------------ */

/**
 * A rules-based executive read-out — the PRIMARY path when GEMINI_API_KEY is
 * absent. Mines the strong metrics for highlights, the weak metrics + Smart
 * Alerts for concerns, and targets the worst departments/dimensions for
 * recommendations. NEVER throws.
 */
export function heuristicWorkforceInsights(
  a: OrgAttendanceAnalytics,
): WorkforceInsights {
  const generatedAt = new Date().toISOString();
  const k = a.kpis;
  const alerts = computeSmartAlerts(a);

  const highlights: string[] = [];
  const concerns: string[] = [];
  const recommendations: string[] = [];
  const departmentCallouts: string[] = [];

  /* — Highlights: the metrics clearing a strong bar. — */
  if (k.attendanceRatePct >= 90) highlights.push(`Effective attendance strong at ${k.attendanceRatePct}%.`);
  if (k.punctualityRatePct >= 90) highlights.push(`Punctuality healthy — ${k.punctualityRatePct}% on-time.`);
  if (a.targetHoursPerDay > 0 && k.avgHoursPerDay >= a.targetHoursPerDay)
    highlights.push(`Hours on target at ${k.avgHoursPerDay.toFixed(1)}h/day (goal ${a.targetHoursPerDay}h).`);
  if (k.incomplete === 0 && k.present > 0) highlights.push("No incomplete punches — clean check-in/out data.");
  if (k.unpaidLeave === 0 && k.payableDays > 0) highlights.push("Zero loss-of-pay leave this month.");
  if (a.health.band.key === "excellent") highlights.push(`Workforce health excellent at ${a.health.score}/100.`);

  const bestDept = a.departments
    .filter((d) => d.headcount >= 3)
    .slice()
    .sort((x, y) => y.attendanceRatePct - x.attendanceRatePct)[0];
  if (bestDept && bestDept.attendanceRatePct >= 90)
    highlights.push(`${bestDept.department} leads at ${bestDept.attendanceRatePct}% attendance.`);

  /* — Concerns: the Smart Alerts are already ranked + factual. — */
  for (const al of alerts.filter((x) => x.severity !== "info").slice(0, 4)) {
    concerns.push(`${al.title}: ${al.detail}`);
  }
  // If nothing tripped, still surface the single lowest health component.
  if (concerns.length === 0) {
    const weakest = a.health.components.slice().sort((x, y) => x.score - y.score)[0];
    if (weakest) concerns.push(`${weakest.label} is the softest driver at ${weakest.score}/100 — ${weakest.note}.`);
  }

  /* — Recommendations: target the worst departments/metrics. — */
  const worstDept = a.departments
    .filter((d) => d.headcount >= 3)
    .slice()
    .sort((x, y) => x.attendanceRatePct - y.attendanceRatePct)[0];
  if (worstDept && worstDept.attendanceRatePct < 85)
    recommendations.push(
      `Review ${worstDept.department} (${worstDept.attendanceRatePct}% attendance, ${worstDept.absent} absent) with its manager.`,
    );
  if (k.punctualityRatePct < 85 && k.lateMarks > 0)
    recommendations.push(`Address ${k.lateMarks} late mark(s) — reinforce the grace-time policy.`);
  if (k.incomplete > 0)
    recommendations.push(`Chase ${k.incomplete} incomplete punch(es) so payroll grades cleanly.`);
  if (a.targetHoursPerDay > 0 && k.avgHoursPerDay < a.targetHoursPerDay * 0.85)
    recommendations.push(
      `Investigate the ${k.avgHoursPerDay.toFixed(1)}h/day average vs the ${a.targetHoursPerDay}h target.`,
    );
  if (k.unpaidLeave > 0)
    recommendations.push(`Confirm the ${k.unpaidLeave} unpaid-leave day(s) before the payroll run.`);
  if (recommendations.length === 0)
    recommendations.push("Hold the current cadence — no corrective action needed this month.");

  /* — Department call-outs — best + worst, plus late hot-spot. — */
  if (bestDept)
    departmentCallouts.push(
      `${bestDept.department}: ${bestDept.attendanceRatePct}% attendance, ${bestDept.punctualityRatePct}% on-time.`,
    );
  if (worstDept && worstDept.department !== bestDept?.department)
    departmentCallouts.push(
      `${worstDept.department}: ${worstDept.attendanceRatePct}% attendance, ${worstDept.absent} absent day(s).`,
    );
  const lateDept = a.departments
    .filter((d) => d.headcount >= 3 && d.late > 0)
    .slice()
    .sort((x, y) => x.punctualityRatePct - y.punctualityRatePct)[0];
  if (
    lateDept &&
    lateDept.department !== bestDept?.department &&
    lateDept.department !== worstDept?.department
  )
    departmentCallouts.push(
      `${lateDept.department}: most late arrivals (${lateDept.late}, ${lateDept.punctualityRatePct}% on-time).`,
    );
  if (departmentCallouts.length === 0)
    departmentCallouts.push("Departments are evenly matched this month — no outlier.");

  /* — Fallback highlight so the panel is never empty. — */
  if (highlights.length === 0) {
    const strongest = a.health.components.slice().sort((x, y) => y.score - x.score)[0];
    if (strongest) highlights.push(`${strongest.label} is the strongest driver at ${strongest.score}/100.`);
    else highlights.push("Attendance recorded; no standout positives this month.");
  }

  /* — Trend + summary. — */
  const trend = trendLine(a, alerts);
  const criticalCount = alerts.filter((x) => x.severity === "critical").length;
  const summary =
    a.health.band.key === "excellent" || a.health.band.key === "good"
      ? `${a.monthLabel}: workforce health is ${a.health.band.label.toLowerCase()} at ${a.health.score}/100 — ${k.attendanceRatePct}% attendance and ${k.punctualityRatePct}% punctuality across ${k.totalEmployees} people.${criticalCount ? ` ${criticalCount} item(s) still need attention.` : ""}`
      : `${a.monthLabel}: workforce health is ${a.health.band.label.toLowerCase()} at ${a.health.score}/100, dragged by ${weakestDriverLabel(a)} — ${k.attendanceRatePct}% attendance, ${k.punctualityRatePct}% punctuality. ${criticalCount || concerns.length} issue(s) to work.`;

  return {
    summary,
    highlights: highlights.slice(0, 4),
    concerns: concerns.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    departmentCallouts: departmentCallouts.slice(0, 4),
    trend,
    source: "heuristic",
    generatedAt,
  };
}

function weakestDriverLabel(a: OrgAttendanceAnalytics): string {
  const weakest = a.health.components.slice().sort((x, y) => x.score - y.score)[0];
  return weakest ? `${weakest.label.toLowerCase()} (${weakest.score}/100)` : "several factors";
}

function trendLine(a: OrgAttendanceAnalytics, alerts: SmartAlert[]): string {
  const crit = alerts.filter((x) => x.severity === "critical").length;
  const warn = alerts.filter((x) => x.severity === "warning").length;
  const driver = a.health.components.slice().sort((x, y) => x.score - y.score)[0];
  if (a.health.band.key === "excellent")
    return `Strong, stable month — ${a.health.band.label} health at ${a.health.score}/100 with no critical flags.`;
  if (crit > 0)
    return `Under pressure — ${crit} critical + ${warn} warning alert(s); ${driver ? `${driver.label.toLowerCase()} is the weakest link.` : "watch the health drivers."}`;
  return `Holding — ${a.health.band.label} at ${a.health.score}/100; ${warn} watch item(s), led by ${driver ? driver.label.toLowerCase() : "attendance"}.`;
}
