import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { scoreFor } from "@/lib/queries/pms";
import {
  getReviewsFor,
  listPersonalGoals,
  getSignalsFor,
  type ReviewRelation,
  type DetailReview,
} from "@/lib/queries/pms-detail";
import type { ScoreBreakdown } from "@/lib/pms/engines/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Score band → key + label (green ≥80 / amber ≥60 / red) — mirrors /pms/[id]. */
function band(score: number): { key: "strong" | "on_track" | "needs_focus"; label: string } {
  if (score >= 80) return { key: "strong", label: "Strong" };
  if (score >= 60) return { key: "on_track", label: "On track" };
  return { key: "needs_focus", label: "Needs focus" };
}

/** The five pillars, in the web page's order — name + one-line hint. */
const PILLARS: { key: keyof ScoreBreakdown; name: string; hint: string | null }[] = [
  { key: "kpi", name: "KPI", hint: "Weekly Goals achievement + Incentive target-vs-actual." },
  {
    key: "skillUpgrade",
    name: "Skill Upgrade",
    hint: "Training attended & given, self-learning and the weekly Share — pro-rated to this month.",
  },
  { key: "compliance", name: "Compliance", hint: "DCC compliance and Daily-Checklist completion." },
  { key: "attitude", name: "Attitude & Mindset", hint: null },
  { key: "teamwork", name: "Team Work", hint: null },
];

/** Sub-signal display labels — mirrors the web detail page SUB_LABELS. */
const SUB_LABELS: Record<string, string> = {
  weekly: "Weekly Goals",
  incentive: "Incentive",
  attended: "Training attended",
  given: "Training given",
  selfLearn: "Self-learning",
  share: "Weekly Share",
  dcc: "DCC",
  checklist: "Daily Checklist",
};

const RELATION_LABEL: Record<ReviewRelation, string> = {
  manager: "Manager review",
  subordinate: "Subordinate (upward) review",
  peer: "Peer / colleague review",
  self: "Self review",
};

const RELATION_ORDER: ReviewRelation[] = ["manager", "subordinate", "peer", "self"];

/** en-IN friendly date, wrapped in `new Date()` so a string bound never leaks. */
function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function reviewDto(r: DetailReview) {
  return {
    id: r.id,
    relation: r.relation,
    relationLabel: RELATION_LABEL[r.relation],
    reviewerName: r.reviewerName,
    period: r.period,
    scope: r.scope,
    attitude: r.attitude,
    behaviour: r.behaviour,
    skill: r.skill,
    changeTags: r.changeTags,
    explanation: r.explanation,
  };
}

/**
 * GET /api/mobile/performance — the signed-in user's own PMS score: the 0–100
 * five-pillar performance summary (owner-scoped) that powers the web
 * /pms/[employeeId] detail page. Reuses the exact web read layer (scoreFor +
 * pms-detail reviews/goals/signals) so the two never diverge. Read-only.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const [scoreResult, reviews, goals, signals] = await Promise.all([
    scoreFor(me.id),
    getReviewsFor(me.id),
    listPersonalGoals(me.id),
    getSignalsFor(me.id),
  ]);

  const { score, breakdown } = scoreResult.score;
  const b = band(score);

  const pillars = PILLARS.map((p) => {
    const pillar = breakdown[p.key];
    const subSignals = pillar.detail
      ? Object.entries(pillar.detail).map(([key, rate]) => ({
          key,
          label: SUB_LABELS[key] ?? key,
          rate: rate == null ? null : Number(rate),
        }))
      : [];
    return {
      key: p.key,
      name: p.name,
      hint: p.hint,
      weight: pillar.weight,
      rate: pillar.rate == null ? null : Number(pillar.rate),
      subSignals,
    };
  });

  // Flatten the 360 reviews in manager → subordinate → peer → self order,
  // preserving each relation's newest-first ordering.
  const flatReviews = RELATION_ORDER.flatMap((rel) => reviews[rel].map(reviewDto));

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      employee: {
        name: me.name,
        department: me.department,
        avatarUrl: me.avatarUrl,
        tenureDays: scoreResult.tenureDays,
      },
      score,
      band: b.key,
      bandLabel: b.label,
      promotion: {
        eligible: scoreResult.promotion.eligible,
        rationale: scoreResult.promotion.rationale,
      },
      pillars,
      reviews: flatReviews,
      reviewCount: flatReviews.length,
      personalGoals: goals.map((g) => ({
        id: g.id,
        period: g.period,
        title: g.title,
        detail: g.detail,
        status: g.status,
        position: g.position,
      })),
      recognition: signals.recognition.map((r) => ({
        id: r.id,
        period: r.period,
        kind: r.kind,
        reason: r.reason,
        status: r.status,
        scoreSnapshot: r.scoreSnapshot == null ? null : Math.round(r.scoreSnapshot),
        releasedAt: fmtDate(r.releasedAt),
      })),
      promotionSignals: signals.promotion.map((p) => ({
        id: p.id,
        status: p.status,
        rationale: p.rationale,
        scoreSnapshot: p.scoreSnapshot == null ? null : Math.round(p.scoreSnapshot),
        eligibleSince: fmtDate(p.eligibleSince),
        decidedAt: fmtDate(p.decidedAt),
      })),
    },
    { headers: MOBILE_CORS },
  );
}
