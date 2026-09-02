import "server-only";
import { generateText, GeminiNotConfiguredError } from "@/lib/ai/gemini";
import {
  computeComposites,
  scoreBand,
  type Composites,
} from "@/lib/hr/candidate/evaluation-v2-composites";
import {
  overallScore,
  eligibilityVerdict,
  allSectionScores,
  type ScoreContext,
} from "@/lib/hr/candidate/evaluation-v2-scoring";
import {
  CRITICAL_PREREQ_IDS,
  SECTION_BY_ID,
  type EvaluationInstance,
  type InterviewAiInsights,
} from "@/lib/hr/candidate/evaluation-v2";

/**
 * INTERVIEW INTELLIGENCE — AI (or heuristic) read-out over a candidate's
 * structured evaluation-v2 instance.
 *
 * MIRRORS lib/ai/attendance-insights.ts: try the repo's one LLM helper
 * (lib/ai/gemini.ts → generateText, Google Gemini via the generativelanguage
 * REST API), parse strict JSON, and — on a missing key
 * (GeminiNotConfiguredError) OR any parse/throw failure — fall back to a
 * DETERMINISTIC heuristic so the UI never shows a blank AI panel. `source` tells
 * the UI which engine ran. This function NEVER throws.
 *
 * Everything the prompt states is grounded ONLY in the computed scores
 * (composites, per-section micro-scores, the weighted interview score, and the
 * pre-requisite eligibility verdict) — the model is told never to invent
 * figures. No Anthropic/Claude client exists in this repo, so — per the reuse
 * rule — we build on Gemini rather than add a second provider.
 */

export interface InterviewInsightInput {
  /** The position/title the candidate applied for (free text). */
  positionApplied: string;
  /** The resolved rank/designation (from the ladder, else free text). */
  designation: string;
  /** The filled evaluation instance (interviewer or management). */
  instance: EvaluationInstance;
  /** Whether Sales / customer-facing sections feed the score. */
  isSalesRole: boolean;
}

/** Public entry: try the LLM, fall back to the heuristic on ANY failure. */
export async function generateInterviewInsights(
  input: InterviewInsightInput,
): Promise<InterviewAiInsights> {
  const generatedAt = new Date().toISOString();
  try {
    const text = await generateText(buildPrompt(input));
    const parsed = parseModelJson(text);
    if (parsed) return { ...parsed, source: "ai", generatedAt };
    // Unparseable → heuristic (still deterministic + useful).
    return heuristicInterviewInsights(input);
  } catch (err) {
    // Missing key or transient model error → graceful deterministic fallback.
    // Analytics must never throw into the HR evaluation screen.
    void err;
    return heuristicInterviewInsights(input);
  }
}

/* ------------------------------------------------------------------ */
/* Scoring snapshot                                                    */
/* ------------------------------------------------------------------ */

interface Snapshot {
  ctx: ScoreContext;
  composites: Composites;
  interviewScore: number | null;
  overallPct: number | null;
  overallAvg: number | null;
  gut: number | null;
  eligibility: ReturnType<typeof eligibilityVerdict>;
  criticalNoLabels: string[];
}

function snapshot(input: InterviewInsightInput): Snapshot {
  const ctx: ScoreContext = { isSalesRole: input.isSalesRole };
  const composites = computeComposites(input.instance, null, ctx);
  const overall = overallScore(input.instance, null, ctx);
  const eligibility = eligibilityVerdict(input.instance);
  const prereq = SECTION_BY_ID.prerequisites;
  const labelById = new Map(
    (prereq?.groups ?? []).flatMap((grp) => grp.items).map((i) => [i.id, i.label]),
  );
  const criticalNoLabels = eligibility.criticalNoItems.map(
    (id) => labelById.get(id) ?? id,
  );
  return {
    ctx,
    composites,
    interviewScore: composites.interviewScore,
    overallPct: overall.pct,
    overallAvg: overall.avg,
    gut: input.instance.overall,
    eligibility,
    criticalNoLabels,
  };
}

/** Format a 0..10 score for the prompt/heuristic, "—" when unrated. */
function fmt(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

function buildPrompt(input: InterviewInsightInput): string {
  const s = snapshot(input);
  const c = s.composites;

  const sectionLines = allSectionScores(input.instance, null, s.ctx)
    .filter((sec) => sec.applicable)
    .map(
      (sec) =>
        `  · ${sec.title}: ${sec.micro === null ? "unrated" : `${sec.micro.toFixed(1)}/10`} (weight ${sec.weight})`,
    )
    .join("\n");

  const scorecardLines = c.scorecard
    .map((row) => `  · ${row.label}: ${fmt(row.score)}/10`)
    .join("\n");

  const notes = Object.entries(input.instance.notes ?? {})
    .map(([, v]) => (v ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
  const textboxes = Object.entries(input.instance.textboxes ?? {})
    .map(([k, v]) => `${k}: ${(v ?? "").trim()}`)
    .filter((l) => l.split(": ")[1]);

  const elig = s.eligibility;
  const eligLine = elig.dealbreaker
    ? `DEAL-BREAKER: un-excepted critical "No" on — ${s.criticalNoLabels.join(", ")}`
    : elig.flaggedForReview
      ? `Flagged for review (critical "No" but an exception was recorded): ${s.criticalNoLabels.join(", ")}`
      : `Pre-requisites clean (${elig.answered}/${elig.total} answered, no critical blocks)`;

  return `You are a senior HR interviewer writing a fair, evidence-based read-out of a candidate's structured interview scorecard. Base EVERY statement ONLY on the numbers and facts given below — never invent scores, never moralize, be specific and concrete. All sub-scores are 0–10 unless a percentage is stated.

Role applied for: ${input.positionApplied || "—"}
Resolved designation: ${input.designation || "—"}
Sales / customer-facing role: ${input.isSalesRole ? "yes" : "no"}

Weighted Overall Interview Score: ${s.interviewScore === null ? "—" : `${s.interviewScore}/100`}
Interviewer's manual gut score: ${s.gut === null ? "—" : `${s.gut}/10`}
Eligibility: ${eligLine}

Headline scorecard (0–10):
${scorecardLines || "  · (none rated)"}

Composite indices (0–10):
  · Leadership: ${fmt(c.drivers.leadership)} · Execution: ${fmt(c.drivers.execution)} · Learning: ${fmt(c.drivers.learning)} · Communication: ${fmt(c.drivers.communication)} · Ownership: ${fmt(c.drivers.ownership)}
  · Technical: ${fmt(c.technical.technical)} · Digital-Literacy: ${fmt(c.technical.digitalLiteracy)} · AI-Readiness: ${fmt(c.technical.aiReadiness)}
  · Base average: ${fmt(c.base.average)} (strength index ${c.base.strengthIndex}%, weakness index ${c.base.weaknessIndex}%)
  · Customer-Facing: ${fmt(c.customerFacing)}${input.isSalesRole ? ` · Sales Readiness: ${fmt(c.salesReadiness)}` : ""}

Section micro-scores (applicable only):
${sectionLines || "  · (none rated)"}
${notes.length ? `\nInterviewer notes:\n- ${notes.join("\n- ")}` : ""}${textboxes.length ? `\nWritten assessment:\n- ${textboxes.join("\n- ")}` : ""}

Return ONLY a JSON object, no prose around it, in EXACTLY this shape:
{
  "summary": "2-3 sentence overall read of the candidate",
  "strengths": ["short point", "..."],
  "concerns": ["short point", "..."],
  "behavioural": "one sentence on temperament / attitude / culture, grounded in the base & driver scores",
  "technical": "one sentence on technical & digital / AI readiness",
  "learningPotential": "one sentence on growth mindset & hunger to learn",
  "leadershipPotential": "one sentence on leadership & ownership readiness",
  "cultureMatch": "one sentence on culture fit",
  "roleSuitability": "one sentence verdict on fit for the applied role, referencing the interview score & eligibility",
  "recommendedDepartment": "the single best-fit department/function for this candidate",
  "trainingSuggestions": ["concrete upskilling area", "..."],
  "salaryRange": "a plausible monthly CTC band in INR for this designation (e.g. \\"INR 25,000-35,000/month\\")",
  "nextRound": "what the next interview round should focus on",
  "nextRoundQuestions": ["a probing question targeting a weak area", "..."],
  "riskFactors": ["a concrete risk", "..."]
}
Rules: 2-4 items in each array; each array point <= 16 words; reference concrete scores where useful; strengths must come from the higher scores, concerns/riskFactors from the lower scores and any critical "No"; if eligibility is a deal-breaker, say so in roleSuitability and riskFactors. Never manufacture a strength that the scores don't support.`;
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
): Omit<InterviewAiInsights, "source" | "generatedAt"> | null {
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
  const strengths = strArr(o.strengths);
  const concerns = strArr(o.concerns);
  // Guard against an empty/garbage object.
  if (!summary && strengths.length === 0 && concerns.length === 0) return null;
  return {
    summary: summary || "Interview read-out.",
    strengths,
    concerns,
    behavioural: str(o.behavioural),
    technical: str(o.technical),
    learningPotential: str(o.learningPotential),
    leadershipPotential: str(o.leadershipPotential),
    cultureMatch: str(o.cultureMatch),
    roleSuitability: str(o.roleSuitability),
    recommendedDepartment: str(o.recommendedDepartment),
    trainingSuggestions: strArr(o.trainingSuggestions),
    salaryRange: str(o.salaryRange),
    nextRound: str(o.nextRound),
    nextRoundQuestions: strArr(o.nextRoundQuestions),
    riskFactors: strArr(o.riskFactors),
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic heuristic fallback                                    */
/* ------------------------------------------------------------------ */

/** Placeholder CTC band by designation rank — explainable, not authoritative. */
function salaryBandFor(designation: string): string {
  const d = designation.toLowerCase();
  if (d.includes("sr vp") || d.includes("senior vp")) return "INR 2,00,000-3,50,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("vp")) return "INR 1,50,000-2,50,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("avp")) return "INR 1,10,000-1,60,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("sr manager") || d.includes("senior manager")) return "INR 90,000-1,30,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("manager")) return "INR 60,000-90,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("sr executive") || d.includes("senior executive")) return "INR 40,000-60,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("executive")) return "INR 25,000-40,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("trainee")) return "INR 18,000-28,000/month (indicative — confirm with CTC workbench)";
  if (d.includes("intern")) return "INR 10,000-18,000/month (indicative — confirm with CTC workbench)";
  return "INR 25,000-40,000/month (indicative — set against the CTC workbench)";
}

interface NamedScore {
  label: string;
  score: number | null;
}

/** A rules-based read-out — used whenever the LLM is unavailable. NEVER throws. */
export function heuristicInterviewInsights(
  input: InterviewInsightInput,
): InterviewAiInsights {
  const generatedAt = new Date().toISOString();
  const s = snapshot(input);
  const c = s.composites;

  // The composites we mine for strengths / concerns / next-round targeting.
  const composites: NamedScore[] = [
    { label: "Behavioural", score: c.scorecard.find((x) => x.key === "behavioural")?.score ?? null },
    { label: "Communication", score: c.drivers.communication },
    { label: "Technical", score: c.technical.technical },
    { label: "Digital literacy", score: c.technical.digitalLiteracy },
    { label: "AI readiness", score: c.technical.aiReadiness },
    { label: "Leadership", score: c.drivers.leadership },
    { label: "Execution", score: c.drivers.execution },
    { label: "Learning", score: c.drivers.learning },
    { label: "Ownership", score: c.drivers.ownership },
    { label: "Culture fit", score: c.scorecard.find((x) => x.key === "culture-fit")?.score ?? null },
  ];
  if (input.isSalesRole) {
    composites.push({ label: "Sales readiness", score: c.salesReadiness });
    composites.push({ label: "Customer-facing", score: c.customerFacing });
  }

  const rated = composites.filter((x) => x.score !== null) as { label: string; score: number }[];

  // Strengths = composites >= 7.5, best first.
  const strengths = rated
    .filter((x) => x.score >= 7.5)
    .sort((a, b) => b.score - a.score)
    .map((x) => `${x.label} is strong (${x.score.toFixed(1)}/10)`);

  // Concerns = composites <= 5, worst first.
  const concerns = rated
    .filter((x) => x.score <= 5)
    .sort((a, b) => a.score - b.score)
    .map((x) => `${x.label} is weak (${x.score.toFixed(1)}/10)`);

  // Lowest rated composites → next-round question targets.
  const lowest = [...rated].sort((a, b) => a.score - b.score).slice(0, 3);
  const nextRoundQuestions = lowest.map(
    (x) => `Probe ${x.label.toLowerCase()} with a concrete scenario (scored ${x.score.toFixed(1)}/10).`,
  );

  // Risk factors — critical "No" pre-requisites + any low composites.
  const riskFactors: string[] = [];
  if (s.eligibility.dealbreaker) {
    riskFactors.push(`Deal-breaker: un-excepted critical "No" on ${s.criticalNoLabels.join(", ")}.`);
  } else if (s.eligibility.flaggedForReview) {
    riskFactors.push(`Flagged pre-requisite(s) with a recorded exception: ${s.criticalNoLabels.join(", ")}.`);
  }
  for (const x of rated.filter((r) => r.score <= 4).slice(0, 3)) {
    riskFactors.push(`Low ${x.label.toLowerCase()} (${x.score.toFixed(1)}/10) may hamper on-the-job performance.`);
  }
  if (c.base.weaknessIndex >= 30) {
    riskFactors.push(`${c.base.weaknessIndex}% of base parameters scored 4 or below.`);
  }

  // Role suitability — from the weighted interview score + eligibility gate.
  const score = s.interviewScore;
  let roleSuitability: string;
  if (s.eligibility.dealbreaker) {
    roleSuitability = `Not recommended as-is — a critical pre-requisite is a "No" without an exception${score === null ? "" : ` (interview score ${score}/100)`}.`;
  } else if (score === null) {
    roleSuitability = "Insufficient ratings to judge role suitability — complete the scorecard.";
  } else if (score >= 75) {
    roleSuitability = `Strong fit for ${input.positionApplied || "the role"} — interview score ${score}/100.`;
  } else if (score >= 60) {
    roleSuitability = `Workable fit for ${input.positionApplied || "the role"} (${score}/100); shore up the weak areas.`;
  } else if (score >= 45) {
    roleSuitability = `Borderline for ${input.positionApplied || "the role"} (${score}/100) — a second round is advisable.`;
  } else {
    roleSuitability = `Weak fit for ${input.positionApplied || "the role"} at ${score}/100.`;
  }

  // Training suggestions — the lowest technical / learning composites.
  const trainingSuggestions: string[] = [];
  if ((c.technical.digitalLiteracy ?? 10) < 6) trainingSuggestions.push("Digital-literacy upskilling (Sheets / Excel / Docs).");
  if ((c.technical.aiReadiness ?? 10) < 6) trainingSuggestions.push("AI-tools onboarding (ChatGPT / Claude workflows).");
  if ((c.drivers.communication ?? 10) < 6) trainingSuggestions.push("Communication & articulation coaching.");
  if ((c.drivers.execution ?? 10) < 6) trainingSuggestions.push("Execution discipline & work-speed practice.");
  if (input.isSalesRole && (c.salesReadiness ?? 10) < 6) trainingSuggestions.push("Sales fundamentals & objection handling.");
  if (trainingSuggestions.length === 0) trainingSuggestions.push("Standard 15-day pre-employment onboarding.");

  // One-liners per dimension.
  const behavioural = describe(
    "Behaviour & temperament",
    c.scorecard.find((x) => x.key === "behavioural")?.score ?? c.base.average,
  );
  const technical = describe("Technical proficiency", c.technical.technical);
  const learningPotential = describe("Learning potential", c.drivers.learning);
  const leadershipPotential = describe("Leadership potential", c.drivers.leadership);
  const cultureMatch = describe("Culture match", c.scorecard.find((x) => x.key === "culture-fit")?.score ?? null);

  const nextRound = s.eligibility.dealbreaker
    ? "Resolve the pre-requisite blocker before any further round."
    : lowest.length
      ? `Focus the next round on ${lowest.map((x) => x.label.toLowerCase()).join(", ")}.`
      : "Confirm role-specific depth and reference checks.";

  const summary =
    score === null
      ? "Scorecard is only partly filled — complete the ratings for a reliable read."
      : `${input.positionApplied || "Candidate"}: weighted interview score ${score}/100 with ${strengths.length} clear strength(s) and ${concerns.length} concern(s).${s.eligibility.dealbreaker ? " A critical pre-requisite is unmet." : ""}`;

  const recommendedDepartment = input.isSalesRole
    ? "Sales / Business Development"
    : bestDepartment(c);

  return {
    summary,
    strengths: strengths.length ? strengths : ["No composite scored 7.5+ yet — no standout strengths."],
    concerns: concerns.length ? concerns : ["No composite scored 5 or below — no major concerns flagged."],
    behavioural,
    technical,
    learningPotential,
    leadershipPotential,
    cultureMatch,
    roleSuitability,
    recommendedDepartment,
    trainingSuggestions,
    salaryRange: salaryBandFor(input.designation),
    nextRound,
    nextRoundQuestions: nextRoundQuestions.length ? nextRoundQuestions : ["Deep-dive on role-specific experience with a real example."],
    riskFactors: riskFactors.length ? riskFactors : ["No hard blockers surfaced from the current scores."],
    source: "heuristic",
    generatedAt,
  };
}

/** A one-line qualitative read for a single 0..10 dimension. */
function describe(label: string, score: number | null): string {
  if (score === null) return `${label}: not enough ratings to assess.`;
  const band = scoreBand(score).label.toLowerCase();
  return `${label} is ${band} at ${score.toFixed(1)}/10.`;
}

/** Best-fit non-sales department from the strongest composite signal. */
function bestDepartment(c: Composites): string {
  const candidates: NamedScore[] = [
    { label: "Operations / Execution", score: c.drivers.execution },
    { label: "Technology / Digital", score: c.technical.technical },
    { label: "Leadership track", score: c.drivers.leadership },
    { label: "Learning & Development", score: c.drivers.learning },
  ];
  const best = candidates
    .filter((x) => x.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  return best?.label ?? "General / to be assessed";
}
