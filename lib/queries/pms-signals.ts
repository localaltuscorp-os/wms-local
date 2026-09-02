import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db, pmsRecognition, pmsPromotionSignal, employees } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import {
  getIncentiveTargetVsActual,
  type IncentiveTargetVsActual,
} from "@/lib/queries/incentives";

/**
 * Read layer for the PMS *human-release* surfaces (Law 8 — recognition,
 * promotion and any payout-adjacent consequence stay human-released, never
 * auto). server-only.
 *
 * These read the `pms_recognition` / `pms_promotion_signal` projection rows
 * (suggested/flagged by the score engine) joined to the live employee row so
 * the admin sees name + department + score-snapshot + rationale before they
 * decide. The transitions themselves live in the signals server actions; this
 * file only reads. Each select is wrapped in withRetry so a stale pooled
 * connection self-heals — this is an admin analytics surface, not the hot path.
 *
 * It also re-exposes the Incentive Target-vs-Actual roll-up (which feeds the
 * KPI pillar) as `incentiveTargetVsActual(year)` so the signals page can show
 * target vs actual vs attainment without reaching across modules itself.
 */

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

export interface RecognitionRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  avatarUrl: string | null;
  period: string;
  kind: string;
  reason: string | null;
  scoreSnapshot: number | null;
  status: "suggested" | "released" | "dismissed";
  releasedById: string | null;
  releasedByName: string | null;
  releasedAt: string | null;
  createdAt: string;
}

export interface PromotionSignalRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  avatarUrl: string | null;
  scoreSnapshot: number | null;
  eligibleSince: string | null;
  rationale: string | null;
  status: "flagged" | "acknowledged" | "actioned" | "dismissed";
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Recognition suggestions/decisions. Optional `period` ('YYYY-MM') narrows to
 * one cycle; omit for every period. Open ("suggested") rows first, then
 * newest-decided first. Joined to the subject employee + (optional) releaser.
 */
export async function listRecognitions(period?: string): Promise<RecognitionRow[]> {
  const releaser = employees;
  const rows = await withRetry(
    () =>
      db
        .select({
          id: pmsRecognition.id,
          employeeId: pmsRecognition.employeeId,
          employeeName: employees.name,
          department: employees.department,
          avatarUrl: employees.avatarUrl,
          period: pmsRecognition.period,
          kind: pmsRecognition.kind,
          reason: pmsRecognition.reason,
          scoreSnapshot: pmsRecognition.scoreSnapshot,
          status: pmsRecognition.status,
          releasedById: pmsRecognition.releasedById,
          releasedAt: pmsRecognition.releasedAt,
          createdAt: pmsRecognition.createdAt,
        })
        .from(pmsRecognition)
        .innerJoin(employees, eq(pmsRecognition.employeeId, employees.id))
        .where(period ? eq(pmsRecognition.period, period) : undefined)
        .orderBy(desc(pmsRecognition.createdAt)),
    { ...RETRY, label: "pms-recognitions" },
  );

  const releaserIds = Array.from(
    new Set(rows.map((r) => r.releasedById).filter((x): x is string => !!x)),
  );
  const releaserNames = new Map<string, string>();
  if (releaserIds.length > 0) {
    const names = await withRetry(
      () =>
        db
          .select({ id: releaser.id, name: releaser.name })
          .from(releaser)
          .where(inArray(releaser.id, releaserIds)),
      { ...RETRY, label: "pms-recognition-releasers" },
    );
    for (const n of names) releaserNames.set(n.id, n.name);
  }

  const open = rows.filter((r) => r.status === "suggested");
  const decided = rows.filter((r) => r.status !== "suggested");

  return [...open, ...decided].map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    department: r.department,
    avatarUrl: r.avatarUrl,
    period: r.period,
    kind: r.kind,
    reason: r.reason,
    scoreSnapshot: num(r.scoreSnapshot),
    status: r.status as RecognitionRow["status"],
    releasedById: r.releasedById,
    releasedByName: r.releasedById ? (releaserNames.get(r.releasedById) ?? null) : null,
    releasedAt: iso(r.releasedAt),
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Promotion signals — flagged-first, then newest-decided. Joined to the subject
 * employee + (optional) decider. The engine only ever *flags*; every transition
 * here is a human decision recorded against the row.
 */
export async function listPromotionSignals(): Promise<PromotionSignalRow[]> {
  const rows = await withRetry(
    () =>
      db
        .select({
          id: pmsPromotionSignal.id,
          employeeId: pmsPromotionSignal.employeeId,
          employeeName: employees.name,
          department: employees.department,
          avatarUrl: employees.avatarUrl,
          scoreSnapshot: pmsPromotionSignal.scoreSnapshot,
          eligibleSince: pmsPromotionSignal.eligibleSince,
          rationale: pmsPromotionSignal.rationale,
          status: pmsPromotionSignal.status,
          decidedById: pmsPromotionSignal.decidedById,
          decidedAt: pmsPromotionSignal.decidedAt,
          createdAt: pmsPromotionSignal.createdAt,
        })
        .from(pmsPromotionSignal)
        .innerJoin(employees, eq(pmsPromotionSignal.employeeId, employees.id))
        .orderBy(desc(pmsPromotionSignal.createdAt)),
    { ...RETRY, label: "pms-promotion-signals" },
  );

  const deciderIds = Array.from(
    new Set(rows.map((r) => r.decidedById).filter((x): x is string => !!x)),
  );
  const deciderNames = new Map<string, string>();
  if (deciderIds.length > 0) {
    const names = await withRetry(
      () =>
        db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(inArray(employees.id, deciderIds)),
      { ...RETRY, label: "pms-promotion-deciders" },
    );
    for (const n of names) deciderNames.set(n.id, n.name);
  }

  const flagged = rows.filter((r) => r.status === "flagged");
  const decided = rows.filter((r) => r.status !== "flagged");

  return [...flagged, ...decided].map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    department: r.department,
    avatarUrl: r.avatarUrl,
    scoreSnapshot: num(r.scoreSnapshot),
    eligibleSince: iso(r.eligibleSince),
    rationale: r.rationale,
    status: r.status as PromotionSignalRow["status"],
    decidedById: r.decidedById,
    decidedByName: r.decidedById ? (deciderNames.get(r.decidedById) ?? null) : null,
    decidedAt: iso(r.decidedAt),
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Thin re-read of the Incentive Target-vs-Actual roll-up for `year` (the KPI
 * pillar's incentive leg). Wrapped in withRetry like every other read here.
 */
export async function incentiveTargetVsActual(year: number): Promise<IncentiveTargetVsActual> {
  return withRetry(() => getIncentiveTargetVsActual(year), {
    ...RETRY,
    label: "pms-signals-incentive-tva",
  });
}
