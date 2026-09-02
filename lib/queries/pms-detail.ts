/**
 * PMS Layer 2 — the per-person DETAIL read layer (server-only).
 *
 * Powers the /pms/[employeeId] drill-down: the raw monthly 360 reviews grouped
 * by relation, the person's personal (non-work) goals, and their human-released
 * recognition + promotion signals. These are operational reads (not the hot
 * dashboard path) — each critical select is wrapped in withRetry so a stale
 * pooled connection self-heals. The score itself comes from @/lib/queries/pms
 * (scoreFor); this module only adds the surrounding context the engine doesn't.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  employees,
  pmsMonthlyReview,
  pmsPersonalGoal,
  pmsRecognition,
  pmsPromotionSignal,
} from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

export type ReviewRelation = "manager" | "subordinate" | "peer" | "self";

export interface DetailReview {
  id: string;
  reviewerId: string | null;
  reviewerName: string | null;
  relation: ReviewRelation;
  period: string;
  attitude: number | null;
  behaviour: number | null;
  skill: number | null;
  changeTags: string[];
  explanation: string | null;
  scope: "internal" | "external";
  createdAt: Date;
}

export interface ReviewsByRelation {
  manager: DetailReview[];
  subordinate: DetailReview[];
  peer: DetailReview[];
  self: DetailReview[];
}

/**
 * The monthly 360 reviews FOR a subject, grouped by relation (manager /
 * subordinate / peer / self). Optionally scoped to one period ('YYYY-MM');
 * otherwise returns every period, newest first. Reviewer names are resolved in a
 * second batched query (no N+1).
 */
export async function getReviewsFor(
  subjectId: string,
  period?: string,
): Promise<ReviewsByRelation> {
  const where = period
    ? and(eq(pmsMonthlyReview.subjectId, subjectId), eq(pmsMonthlyReview.period, period))
    : eq(pmsMonthlyReview.subjectId, subjectId);

  const rows = await withRetry(
    () =>
      db
        .select({
          id: pmsMonthlyReview.id,
          reviewerId: pmsMonthlyReview.reviewerId,
          relation: pmsMonthlyReview.relation,
          period: pmsMonthlyReview.period,
          attitude: pmsMonthlyReview.attitude,
          behaviour: pmsMonthlyReview.behaviour,
          skill: pmsMonthlyReview.skill,
          changeTags: pmsMonthlyReview.changeTags,
          explanation: pmsMonthlyReview.explanation,
          scope: pmsMonthlyReview.scope,
          createdAt: pmsMonthlyReview.createdAt,
        })
        .from(pmsMonthlyReview)
        .where(where)
        .orderBy(desc(pmsMonthlyReview.period), desc(pmsMonthlyReview.createdAt)),
    { ...RETRY, label: "pms-detail-reviews" },
  );

  const reviewerIds = [...new Set(rows.map((r) => r.reviewerId).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (reviewerIds.length > 0) {
    const nameRows = await withRetry(
      () =>
        db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(inArray(employees.id, reviewerIds)),
      { ...RETRY, label: "pms-detail-reviewer-names" },
    );
    for (const n of nameRows) names.set(n.id, n.name);
  }

  const grouped: ReviewsByRelation = { manager: [], subordinate: [], peer: [], self: [] };
  for (const r of rows) {
    const rel = (r.relation as ReviewRelation) ?? "manager";
    const bucket = grouped[rel];
    if (!bucket) continue;
    bucket.push({
      id: r.id,
      reviewerId: r.reviewerId,
      reviewerName: r.reviewerId ? (names.get(r.reviewerId) ?? null) : null,
      relation: rel,
      period: r.period,
      attitude: r.attitude,
      behaviour: r.behaviour,
      skill: r.skill,
      changeTags: Array.isArray(r.changeTags) ? r.changeTags : [],
      explanation: r.explanation,
      scope: (r.scope as "internal" | "external") ?? "internal",
      createdAt: r.createdAt,
    });
  }
  return grouped;
}

export interface DetailPersonalGoal {
  id: string;
  period: string;
  title: string;
  detail: string | null;
  status: "active" | "done" | "dropped";
  position: number;
}

/**
 * The person's 3 personal (non-work) goals. Optionally scoped to one period;
 * otherwise every period, newest first, then by display position.
 */
export async function listPersonalGoals(
  employeeId: string,
  period?: string,
): Promise<DetailPersonalGoal[]> {
  const where = period
    ? and(eq(pmsPersonalGoal.employeeId, employeeId), eq(pmsPersonalGoal.period, period))
    : eq(pmsPersonalGoal.employeeId, employeeId);

  const rows = await withRetry(
    () =>
      db
        .select({
          id: pmsPersonalGoal.id,
          period: pmsPersonalGoal.period,
          title: pmsPersonalGoal.title,
          detail: pmsPersonalGoal.detail,
          status: pmsPersonalGoal.status,
          position: pmsPersonalGoal.position,
        })
        .from(pmsPersonalGoal)
        .where(where)
        .orderBy(desc(pmsPersonalGoal.period), pmsPersonalGoal.position),
    { ...RETRY, label: "pms-detail-goals" },
  );

  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    title: r.title,
    detail: r.detail,
    status: (r.status as "active" | "done" | "dropped") ?? "active",
    position: r.position ?? 0,
  }));
}

export interface DetailRecognition {
  id: string;
  period: string;
  kind: string;
  reason: string | null;
  scoreSnapshot: number | null;
  status: "suggested" | "released" | "dismissed";
  releasedAt: Date | null;
}

export interface DetailPromotionSignal {
  id: string;
  scoreSnapshot: number | null;
  eligibleSince: Date | null;
  rationale: string | null;
  status: "flagged" | "acknowledged" | "actioned" | "dismissed";
  decidedAt: Date | null;
}

export interface DetailSignals {
  recognition: DetailRecognition[];
  promotion: DetailPromotionSignal[];
}

/**
 * The human-released recognition + promotion signals for a person (newest
 * first). These are advisory flags a human acts on — never auto-applied.
 */
export async function getSignalsFor(employeeId: string): Promise<DetailSignals> {
  const [recRows, promoRows] = await Promise.all([
    withRetry(
      () =>
        db
          .select({
            id: pmsRecognition.id,
            period: pmsRecognition.period,
            kind: pmsRecognition.kind,
            reason: pmsRecognition.reason,
            scoreSnapshot: pmsRecognition.scoreSnapshot,
            status: pmsRecognition.status,
            releasedAt: pmsRecognition.releasedAt,
          })
          .from(pmsRecognition)
          .where(eq(pmsRecognition.employeeId, employeeId))
          .orderBy(desc(pmsRecognition.createdAt)),
      { ...RETRY, label: "pms-detail-recognition" },
    ),
    withRetry(
      () =>
        db
          .select({
            id: pmsPromotionSignal.id,
            scoreSnapshot: pmsPromotionSignal.scoreSnapshot,
            eligibleSince: pmsPromotionSignal.eligibleSince,
            rationale: pmsPromotionSignal.rationale,
            status: pmsPromotionSignal.status,
            decidedAt: pmsPromotionSignal.decidedAt,
          })
          .from(pmsPromotionSignal)
          .where(eq(pmsPromotionSignal.employeeId, employeeId))
          .orderBy(desc(pmsPromotionSignal.createdAt)),
      { ...RETRY, label: "pms-detail-promotion" },
    ),
  ]);

  return {
    recognition: recRows.map((r) => ({
      id: r.id,
      period: r.period,
      kind: r.kind,
      reason: r.reason,
      scoreSnapshot: r.scoreSnapshot == null ? null : Number(r.scoreSnapshot),
      status: (r.status as "suggested" | "released" | "dismissed") ?? "suggested",
      releasedAt: r.releasedAt,
    })),
    promotion: promoRows.map((r) => ({
      id: r.id,
      scoreSnapshot: r.scoreSnapshot == null ? null : Number(r.scoreSnapshot),
      eligibleSince: r.eligibleSince,
      rationale: r.rationale,
      status: (r.status as "flagged" | "acknowledged" | "actioned" | "dismissed") ?? "flagged",
      decidedAt: r.decidedAt,
    })),
  };
}
