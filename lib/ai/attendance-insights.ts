import "server-only";
import { generateText, GeminiNotConfiguredError } from "@/lib/ai/gemini";
import type { AttendanceMetrics, Ratio } from "@/lib/salary/attendance-metrics";
import { fmtPct, fmtRatio, ratio } from "@/lib/salary/attendance-metrics";

// WS-5 Salary — AI pros/cons read-out on a person's attendance discipline.
//
// REUSES the repo's existing LLM helper (lib/ai/gemini.ts → generateText),
// which is the only AI client in the codebase (Google Gemini via the
// generativelanguage REST API; model overridable via GEMINI_MODEL, default
// "gemini-2.5-flash"). There is NO Anthropic/Claude client in this repo, so —
// per the slice's "reuse the existing helper" rule — we build on Gemini rather
// than introduce a second provider.
//
// ALWAYS renders: if the key is missing (GeminiNotConfiguredError) or the model
// errors/times-out, we fall back to a DETERMINISTIC heuristic read-out so the
// salary sheet never shows a blank AI panel. `source` tells the UI which ran.

export interface AttendanceInsights {
  /** One-line overall read. */
  summary: string;
  pros: string[];
  cons: string[];
  /** Which engine produced this — for a small UI badge + honesty. */
  source: "ai" | "heuristic";
}

export interface InsightsInput {
  employeeName: string;
  /** "YYYY-MM" of the selected month. */
  month: string;
  thisMonth: AttendanceMetrics;
  last3Months: AttendanceMetrics;
  ytd: AttendanceMetrics;
  /** Accountant remarks for the month (reasons carry the "why"). */
  exGratiaRemarks: string[];
  deductionRemarks: string[];
}

/** Public entry: try the LLM, fall back to the heuristic on ANY failure. */
export async function generateAttendanceInsights(
  input: InsightsInput,
): Promise<AttendanceInsights> {
  try {
    const text = await generateText(buildPrompt(input));
    const parsed = parseModelJson(text);
    if (parsed) return { ...parsed, source: "ai" };
    // Unparseable → heuristic (still deterministic + useful).
    return heuristicInsights(input);
  } catch (err) {
    // Missing key or transient model error → graceful deterministic fallback.
    if (!(err instanceof GeminiNotConfiguredError)) {
      // Non-config errors are swallowed on purpose: analytics must never throw
      // into the salary page. (Config error is the expected "no key" path.)
    }
    return heuristicInsights(input);
  }
}

// ── prompt ───────────────────────────────────────────────────────────────────

function line(label: string, m: AttendanceMetrics): string {
  const late = ratio(m.lateDays, m.attendedDays);
  const waived = ratio(m.lateWaivedDays, m.attendedDays);
  const early = ratio(m.startedEarlyDays, m.attendedDays);
  const leftEarly = ratio(m.leftEarlyDays, m.attendedDays);
  return [
    `${label}: attended ${m.attendedDays}d`,
    `late ${fmtRatio(late)} (${fmtPct(late)})`,
    `late-waived ${fmtRatio(waived)} (${fmtPct(waived)})`,
    `started-on-time/early ${fmtRatio(early)} (${fmtPct(early)})`,
    `left-early ${fmtRatio(leftEarly)} (${fmtPct(leftEarly)})`,
  ].join(" · ");
}

function buildPrompt(input: InsightsInput): string {
  const remarks = [
    ...input.exGratiaRemarks.map((r) => `ex-gratia: ${r}`),
    ...input.deductionRemarks.map((r) => `deduction: ${r}`),
  ];
  return `You are an HR analyst writing a short, fair attendance read-out for a salary sheet. Base every statement ONLY on the numbers given — never invent figures, never moralize, be specific and concrete.

Employee: ${input.employeeName}
Selected month: ${input.month}

${line("This month", input.thisMonth)}
${line("Last 3 months", input.last3Months)}
${line("Fiscal year to date", input.ytd)}
${remarks.length ? `Accountant remarks:\n- ${remarks.join("\n- ")}` : "Accountant remarks: none"}

Return ONLY a JSON object, no prose around it, in exactly this shape:
{"summary": "one sentence overall read", "pros": ["short point", "..."], "cons": ["short point", "..."]}
Rules: 1-3 pros and 1-3 cons; each point <= 14 words; if there are genuinely no cons, return an empty cons array (do not manufacture one); reference the ratios/percentages where useful.`;
}

/** Extract the first JSON object from the model text and validate its shape. */
function parseModelJson(
  text: string,
): { summary: string; pros: string[]; cons: string[] } | null {
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
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const pros = Array.isArray(o.pros) ? o.pros.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean) : [];
  const cons = Array.isArray(o.cons) ? o.cons.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean) : [];
  if (!summary && pros.length === 0 && cons.length === 0) return null;
  return { summary: summary || "Attendance read-out.", pros, cons };
}

// ── deterministic fallback ─────────────────────────────────────────────────────
//
// Thresholds are intentionally simple and explainable (no fake precision).

function pctOf(r: Ratio): number {
  return r.pct;
}

/** A rules-based pros/cons read-out — used whenever the LLM is unavailable. */
export function heuristicInsights(input: InsightsInput): AttendanceInsights {
  const pros: string[] = [];
  const cons: string[] = [];

  const m = input.thisMonth;
  const ytd = input.ytd;
  const lateThis = ratio(m.lateNetDays, m.attendedDays);
  const earlyThis = ratio(m.startedEarlyDays, m.attendedDays);
  const lateYtd = ratio(ytd.lateNetDays, ytd.attendedDays);

  // Pros
  if (m.attendedDays > 0 && earlyThis.pct >= 80) {
    pros.push(`Punctual — started on-time/early ${fmtRatio(earlyThis)} (${fmtPct(earlyThis)}) this month`);
  }
  if (m.lateNetDays === 0 && m.attendedDays > 0) {
    pros.push("No un-waived late arrivals this month");
  }
  if (m.lateWaivedDays > 0) {
    pros.push(`Made up ${m.lateWaivedDays} late day(s) with a full day's work (waived)`);
  }
  if (input.exGratiaRemarks.length > 0) {
    pros.push(`Ex-gratia recognised this month (${input.exGratiaRemarks.length})`);
  }

  // Cons
  if (lateThis.pct >= 20 && m.lateNetDays > 0) {
    cons.push(`Late ${fmtRatio(lateThis)} (${fmtPct(lateThis)}) this month — above comfort`);
  } else if (m.lateNetDays >= 3) {
    cons.push(`${m.lateNetDays} un-waived late arrivals this month`);
  }
  if (lateYtd.pct >= 15 && ytd.lateNetDays > 0) {
    cons.push(`YTD lateness ${fmtRatio(lateYtd)} (${fmtPct(lateYtd)}) is trending`);
  }
  if (m.leftEarlyDays >= 2) {
    cons.push(`Left early on ${m.leftEarlyDays} day(s)`);
  }
  if (input.deductionRemarks.length > 0) {
    cons.push(`Disciplinary deduction(s) recorded (${input.deductionRemarks.length})`);
  }

  if (pros.length === 0) pros.push("Attendance recorded; no standout positives this month");

  const summary =
    m.lateNetDays === 0 && pctOf(earlyThis) >= 80
      ? "Strong, disciplined month — punctual with a clean late record."
      : m.lateNetDays > 0
        ? `Attendance is workable but lateness needs attention (${fmtRatio(lateThis)} un-waived).`
        : "Steady attendance this month.";

  return { summary, pros, cons, source: "heuristic" };
}
