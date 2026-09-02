/**
 * Hard wall-clock timeout for a DB await.
 *
 * Why this exists: against the Supabase transaction pooler, a warm Vercel
 * instance can hand out a connection the pooler already bounced. A query sent on
 * that dead socket does NOT throw and does NOT resolve — postgres-js waits on TCP
 * (keep-alive ≈60s) before it ever errors. Server Components `await` that query,
 * so the whole page hangs on its skeleton "forever" (the recurring intermittent
 * "stuck on Loading…" incident). `try/catch` can't save you — there's no error to
 * catch, only an await that never settles.
 *
 * `withTimeout` races the await against a timer so a hang becomes a fast
 * rejection. Callers that already fail-open (e.g. the layout gates) then degrade
 * gracefully instead of hanging; the abandoned query's dead connection is
 * recycled by postgres-js's idle/keep-alive cleanup, and the user's retry lands
 * on a fresh connection. Legitimate queries here are <200ms, so a multi-second
 * timeout only ever trips on a genuine hang — never on healthy load.
 */
export class DbTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`DB timeout: "${label}" did not settle within ${ms}ms (likely a stale pooled connection)`);
    this.name = "DbTimeoutError";
  }
}

export function withTimeout<T>(
  work: Promise<T> | PromiseLike<T>,
  ms: number,
  label = "query",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DbTimeoutError(label, ms)), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Like {@link withTimeout} but never rejects — on timeout OR error it returns
 * `fallback` (and logs). For non-critical, fail-open reads where a transient DB
 * blip must not break the page: gates, org settings, optional side panels.
 */
export async function withTimeoutOr<T>(
  work: Promise<T> | PromiseLike<T>,
  ms: number,
  fallback: T,
  label = "query",
): Promise<T> {
  try {
    return await withTimeout(work, ms, label);
  } catch (err) {
    console.warn(`[db-timeout] ${label} fell back:`, (err as Error)?.message ?? err);
    return fallback;
  }
}

/**
 * Retry a DB unit-of-work under a per-attempt {@link withTimeout}, self-healing
 * a stale pooled connection.
 *
 * Why a FACTORY and not a single promise: against the Supabase transaction
 * pooler a warm instance can be handed a connection the pooler already bounced.
 * A query on that dead socket never settles — `withTimeout` turns the hang into
 * a rejection, but the underlying postgres-js Promise stays pinned to the SAME
 * dead connection (it's still "draining" on the abandoned socket). Re-awaiting it
 * would just hang again. So on retry we call `make()` AGAIN to build a FRESH
 * query promise; postgres-js then checks out a DIFFERENT connection from the
 * pool (the timed-out one is still reserved draining), which is healthy — the
 * retry lands clean. This is the dead-pooled-connection self-heal.
 *
 * `timeoutMs` may be a single number (same budget every attempt) or a per-attempt
 * array (e.g. `[6000, 12000]` — short first try, longer second). When the array
 * is shorter than `attempts`, the last value is reused. Defaults: attempts=2.
 * Throws the last error if every attempt fails (callers keep their own fallback).
 */
export async function withRetry<T>(
  make: () => Promise<T> | PromiseLike<T>,
  opts: { attempts?: number; timeoutMs: number | number[]; label?: string },
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  const label = opts.label ?? "query";
  const budgets = Array.isArray(opts.timeoutMs) ? opts.timeoutMs : [opts.timeoutMs];
  // Always have a usable budget even if a caller passes an empty array.
  const lastBudget = budgets[budgets.length - 1] ?? 8000;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ms = budgets[Math.min(i, budgets.length - 1)] ?? lastBudget;
    try {
      // Fresh factory call each attempt → fresh promise → fresh connection.
      return await withTimeout(make(), ms, label);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.warn(
          `[db-retry] ${label} attempt ${i + 1}/${attempts} failed (${(err as Error)?.message ?? err}); retrying on a fresh connection`,
        );
      }
    }
  }
  throw lastErr;
}
