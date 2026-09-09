/**
 * ALTUS PERFORMANCE ENGINE — deterministic Executive Summary + Action Plan.
 *
 * PURE + CLIENT-SAFE. Builds the Dossier's section-4 prose FROM the computed
 * numbers (never invents figures). The optional AI layer (phase 2) swaps this
 * function's output for an LLM narrative fed the same structured result.
 */

import { lowestBucket, highestBucket, type ScorecardResult } from "@/lib/performance/scoring";

export interface PerfNarrative {
  summary: string;
  directive: string;
}

const DIRECTIVES: Record<string, string> = {
  kpi: "Zero in on the lowest-achieving KPI lines — set a weekly cadence and review actuals every Friday so the incentive bucket climbs.",
  goals: "Lock the month's non-KPI goals in week one and track them in the weekly review; leaving them late is what drags this bucket.",
  culture: "Model the Altus values visibly this month — one concrete culture-positive action per week, surfaced in the team channel.",
  skillUpgrade: "Commit to one measurable skill upgrade with a deliverable (a shipped artefact, not just a course), reviewed at month-end.",
  knowledgeSharing: "Run at least two documented knowledge-shares (doc or session) so the team compounds what you learn.",
  problemSolving: "Take ownership of one thorny problem end-to-end and document the solution path — depth over breadth.",
  growthMindset: "Actively seek and act on feedback this month; note one change you made because of it.",
  mih: "Proactively unblock others — make one 'impossible' ask happen for a teammate and record the outcome.",
  teamNurture: "Invest in one direct report's growth with a concrete plan and a mid-month check-in.",
  attendTraining: "Attend the scheduled trainings and apply one takeaway to live work within the week.",
  teamPlayer: "Pick up one cross-functional task outside your lane and see it through to help the team win.",
};

export function deterministicNarrative(name: string, result: ScorecardResult): PerfNarrative {
  const top = highestBucket(result);
  const low = lowestBucket(result);
  const band =
    result.totalScore >= 80
      ? "an outstanding"
      : result.totalScore >= 65
        ? "a strong"
        : result.totalScore >= 50
          ? "a fair"
          : "a below-par";
  const summary =
    `${name} delivered ${band} month at ${result.totalScore}/100, unlocking ${result.incentivePct}% of the eligible KPI incentive` +
    (top ? `, strongest on ${top.label} (${Math.round(top.score)}/100).` : ".") +
    (low ? ` The clearest gap is ${low.label} at ${Math.round(low.score)}/100.` : "");
  const directive = low
    ? DIRECTIVES[low.id] ?? `Prioritise a concrete, measurable improvement in ${low.label} next month.`
    : "Maintain the momentum across all buckets and stretch the top KPI targets.";
  return { summary: summary.trim(), directive };
}
