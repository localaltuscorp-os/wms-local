// Pure, DB-free ranking helpers for global search. The SQL layer returns raw
// match signals per row; these functions turn them into a deterministic order.
// Kept pure so the ranking rules (active-before-archived, exact-id-wins,
// substring-beats-fuzzy, recency tiebreak) are unit-testable without a DB.

export interface NormalizedQuery {
  /** Trimmed, internal-whitespace-collapsed query text. */
  q: string;
  /** ILIKE pattern: %escaped%. Safe to interpolate as a bound parameter. */
  like: string;
  /** Exact friendly task number when the query is a bare/`#`-prefixed integer. */
  asNumber: number | null;
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const q = raw.trim().replace(/\s+/g, " ");
  const numericCandidate = q.replace(/^#/, "");
  const asNumber = /^\d+$/.test(numericCandidate) ? Number(numericCandidate) : null;
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  return { q, like: `%${escaped}%`, asNumber };
}

export interface RankSignals {
  /** pg word_similarity / similarity, max across matched columns (0..1). */
  similarity: number;
  /** ts_rank for FTS matches (tasks only). */
  ftsRank?: number;
  /** True when a case-insensitive substring matched (beats fuzzy-only). */
  ilikeHit: boolean;
  /** True for an exact id / friendly-number match — always ranks first. */
  exactId: boolean;
  /** Archived rows tier below all active rows. */
  archived?: boolean;
  /** Inactive people tier below all active people. */
  inactive?: boolean;
  /** Epoch ms of created_at/updated_at — newer wins ties. */
  recencyMs: number;
}

const EXACT_BONUS = 100;
const ILIKE_BONUS = 0.5;

/** A sortable relevance score. Ignores tiering (archived/inactive) — that's
 *  applied as the primary sort key in {@link rankHits}. */
export function scoreHit(s: RankSignals): number {
  let score = Math.max(s.similarity, s.ftsRank ?? 0);
  if (s.ilikeHit) score += ILIKE_BONUS;
  if (s.exactId) score += EXACT_BONUS;
  return score;
}

/** Tier 1 = active, Tier 0 = archived/inactive. Active always sorts first. */
function tierOf(s: RankSignals): number {
  return s.archived || s.inactive ? 0 : 1;
}

export function rankHits<T extends { signals: RankSignals }>(hits: T[]): T[] {
  return [...hits].sort((a, b) => {
    const tier = tierOf(b.signals) - tierOf(a.signals);
    if (tier !== 0) return tier;
    const score = scoreHit(b.signals) - scoreHit(a.signals);
    if (score !== 0) return score;
    return b.signals.recencyMs - a.signals.recencyMs;
  });
}
