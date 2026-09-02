import "server-only";

/**
 * Phase 3.3 — per-actor sliding-window rate limiter.
 *
 * In-memory by design: every Vercel function instance keeps its own
 * counters. For our small-team scale that's fine and avoids a network
 * round-trip on every write. If we ever need cross-instance enforcement,
 * swap the `buckets` Map for a Vercel KV / Redis call behind the same
 * `rateLimit(key, kind)` signature — no caller changes.
 *
 * Defaults (per-user, per-rolling-60s):
 *   - write: 60   — the typical user can't physically click that fast;
 *                   a compromised session hammering the API hits this
 *                   well below DB saturation.
 *   - read:  600  — page renders + RSC prefetches add up quickly, so
 *                   reads get a 10× ceiling. Mostly a safety net for
 *                   automated scrapers / runaway loops.
 *
 * Returns:
 *   { ok: true }                       — proceed.
 *   { ok: false, retryAfterMs: ... }   — too fast; caller maps to 429.
 */

export type RateLimitKind = "write" | "read";

const LIMITS: Record<RateLimitKind, { max: number; windowMs: number }> = {
  write: { max: 60, windowMs: 60_000 },
  read: { max: 600, windowMs: 60_000 },
};

// Map key = `${kind}:${actorId}` → list of attempt timestamps (ms).
// We trim entries older than `windowMs` on every check, keeping the
// map size bounded by (concurrent users × kinds × max-per-window).
const buckets = new Map<string, number[]>();

/**
 * Periodic prune so an idle key doesn't sit forever. Cheap — runs at
 * most once per `PRUNE_INTERVAL_MS` per Node instance.
 */
const PRUNE_INTERVAL_MS = 5 * 60_000;
let lastPruneAt = 0;
function maybePrune(now: number) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [key, stamps] of buckets) {
    const kind = (key.startsWith("write:") ? "write" : "read") as RateLimitKind;
    const cutoff = now - LIMITS[kind].windowMs;
    while (stamps.length > 0 && (stamps[0] ?? 0) < cutoff) stamps.shift();
    if (stamps.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Milliseconds the caller should wait before retrying. Only set when ok=false. */
  retryAfterMs?: number;
  /** Current remaining tokens in the window, after counting this attempt. */
  remaining: number;
  /** Window cap for this kind. */
  limit: number;
}

/**
 * Records an attempt by `actorId` against the `kind` bucket and decides
 * whether it's allowed. Caller passes the actor id (Firebase UID or
 * employee.id is fine — both unique-per-actor). Failure returns the ms
 * until the oldest in-window entry ages out, so the caller can echo a
 * Retry-After header.
 */
export function rateLimit(actorId: string, kind: RateLimitKind): RateLimitResult {
  const now = Date.now();
  maybePrune(now);
  const { max, windowMs } = LIMITS[kind];
  const key = `${kind}:${actorId}`;
  let stamps = buckets.get(key);
  if (!stamps) {
    stamps = [];
    buckets.set(key, stamps);
  }
  const cutoff = now - windowMs;
  while (stamps.length > 0 && (stamps[0] ?? 0) < cutoff) stamps.shift();
  if (stamps.length >= max) {
    const oldest = stamps[0] ?? now;
    return {
      ok: false,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
      remaining: 0,
      limit: max,
    };
  }
  stamps.push(now);
  return { ok: true, remaining: max - stamps.length, limit: max };
}

/**
 * Sugar for the common write-action pattern: returns a Result-shape
 * error compatible with the rest of the codebase's server actions, or
 * null on allow. Use as:
 *   const limited = rateLimitOrError(me.id, "write");
 *   if (limited) return limited;
 */
export function rateLimitOrError(
  actorId: string,
  kind: RateLimitKind = "write",
): { ok: false; error: string } | null {
  const r = rateLimit(actorId, kind);
  if (r.ok) return null;
  const secs = Math.ceil((r.retryAfterMs ?? 0) / 1000);
  return {
    ok: false,
    error: `Too many ${kind} requests. Try again in ${secs}s.`,
  };
}

/** Test-only helper — wipes the in-memory buckets. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
  lastPruneAt = 0;
}
