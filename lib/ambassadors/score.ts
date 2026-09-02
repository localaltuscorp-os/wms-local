/**
 * Partner Score + tier — pure, client-safe, transparent.
 *
 * Score is 0–100 from five normalized signals, weighted:
 *   volume        25  — how many referrals they've sent (saturating)
 *   conversion    30  — win rate of their referrals
 *   revenue       25  — converted rupees they've driven (saturating)
 *   recency       10  — how recently they were active (decays over 90d)
 *   payoutHealth  10  — share of owed commission actually paid (relationship trust)
 *
 * Saturation points are deliberately modest so a genuinely active partner can
 * reach the top band; tune in one place via the constants below. Tiers:
 *   Elite ≥ 75 · Gold ≥ 50 · Silver < 50.
 */

export type Tier = "elite" | "gold" | "silver";

export interface ScoreInput {
  /** Total referrals sent. */
  referrals: number;
  /** Win rate 0..1 (converted / total). */
  conversionRate: number;
  /** Converted revenue driven, in rupees. */
  revenue: number;
  /** Days since their last activity/referral (Infinity if never). */
  daysSinceActivity: number;
  /** Paid commission / generated commission, 0..1 (1 when nothing owed). */
  paidRatio: number;
}

export const SCORE_WEIGHTS = { volume: 25, conversion: 30, revenue: 25, recency: 10, payoutHealth: 10 } as const;

/** Referral count at which the volume signal saturates to full marks. */
export const VOLUME_SATURATION = 20;
/** Converted revenue (₹) at which the revenue signal saturates to full marks. */
export const REVENUE_SATURATION = 1_000_000; // ₹10L
/** Activity older than this (days) scores zero recency; fresh = full. */
export const RECENCY_WINDOW_DAYS = 90;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function computePartnerScore(input: ScoreInput): number {
  const volume = clamp01(input.referrals / VOLUME_SATURATION);
  const conversion = clamp01(input.conversionRate);
  const revenue = clamp01(input.revenue / REVENUE_SATURATION);
  const recency = clamp01(1 - input.daysSinceActivity / RECENCY_WINDOW_DAYS);
  const payoutHealth = clamp01(input.paidRatio);

  const raw =
    volume * SCORE_WEIGHTS.volume +
    conversion * SCORE_WEIGHTS.conversion +
    revenue * SCORE_WEIGHTS.revenue +
    recency * SCORE_WEIGHTS.recency +
    payoutHealth * SCORE_WEIGHTS.payoutHealth;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function tierFor(score: number): Tier {
  if (score >= 75) return "elite";
  if (score >= 50) return "gold";
  return "silver";
}

export const TIER_LABELS: Record<Tier, string> = { elite: "Elite", gold: "Gold", silver: "Silver" };
