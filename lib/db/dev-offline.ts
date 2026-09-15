/**
 * Local-dev-only escape hatch that lets read-only pages render when the
 * database is unreachable, instead of taking the whole route to the error
 * boundary.
 *
 * WHY THIS EXISTS
 * A server component that awaits a failing query rejects, and an unhandled
 * rejection in an RSC is not "a list is missing" — it is the entire route.
 * Every page falls to app/(app)/error.tsx, and its "Try again" re-runs the
 * same failing query, so there is no way out from inside the UI. On a machine
 * with placeholder or expired credentials in .env.local that makes the app
 * completely unbrowsable, which is exactly when you most want to look at it.
 * This is the read-layer sibling of DEV_AUTH_BYPASS (lib/auth/dev-bypass.ts),
 * which already covers the auth half of the same problem.
 *
 * Double-gated so it can NEVER activate by accident in a real deployment: the
 * env flag alone isn't enough, NODE_ENV must also not be "production".
 * Set DEV_DB_OFFLINE=true in .env.local to turn it on.
 *
 * SELECTS ONLY — THIS IS THE IMPORTANT PART
 * Only statements that read (SELECT, and WITH…SELECT) fall back to no rows.
 * Writes propagate their error exactly as they do today. Silently resolving an
 * INSERT to "[] rows" would tell the UI a save succeeded when nothing was
 * written, which is a far worse lie than an empty table — you would trust a
 * form that did nothing. A failed write must still look failed.
 *
 * IT TRIES THE REAL QUERY FIRST
 * The fallback is a catch, not a short-circuit, so a healthy database serves
 * real data with the flag still on and the app self-heals the moment working
 * credentials land — no second switch to remember to flip back. The cost is
 * one failed round-trip per query while the DB is down.
 *
 * KNOWN LIMITATION: an empty result is indistinguishable from a genuinely
 * empty table, so pages render their real empty state rather than a "database
 * is down" banner. The console warning below is the only signal. Acceptable in
 * local dev; unacceptable in production, hence the NODE_ENV gate.
 */
type AnyFn = (...args: unknown[]) => unknown;

export function devDbOfflineEnabled(): boolean {
  return process.env.DEV_DB_OFFLINE === "true" && process.env.NODE_ENV !== "production";
}

/** True for statements that only read, so returning no rows is honest. */
function isReadOnly(query: unknown): boolean {
  if (typeof query !== "string") return false;
  // Strip leading comments/whitespace before sniffing the verb.
  const head = query.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, "").slice(0, 12).toLowerCase();
  return head.startsWith("select") || head.startsWith("with ");
}

// One warning per minute, not per query — a dashboard fires 6-15 queries in a
// single Promise.all and a wall of identical stack traces buries the one line
// that says what is actually wrong.
let lastWarn = 0;
function warnOnce(reason: string): void {
  const now = Date.now();
  if (now - lastWarn < 60_000) return;
  lastWarn = now;
  // eslint-disable-next-line no-console
  console.warn(
    `[dev-db-offline] database unreachable, read queries are returning no rows. ` +
      `Pages will render EMPTY, not broken. Cause: ${reason}`,
  );
}

/**
 * Wraps a postgres-js client so failing reads resolve to `[]`.
 *
 * Implemented as a Proxy for the same reason as withSlowQueryLog: postgres-js
 * exposes a callable client with attached helpers, and drizzle drives it via
 * `client.unsafe(sql, params)` — sometimes awaiting it directly, sometimes
 * calling `.values()` on the returned PendingQuery first (postgres-js/session
 * .js, PostgresJsPreparedQuery.execute). Both paths have to be covered, so the
 * PendingQuery itself is proxied rather than replaced: `.values()` and every
 * other postgres-js method still exist, they just land on a caught promise.
 */
export function withDevOfflineFallback<T extends AnyFn>(client: T): T {
  const soften = <R>(query: unknown, result: R): R => {
    if (!isReadOnly(query)) return result;
    const pending = result as unknown as { then?: AnyFn };
    if (!pending || typeof pending.then !== "function") return result;

    return new Proxy(pending, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === "then" || prop === "catch" || prop === "finally") {
          // Route the await through a caught promise.
          const safe = Promise.resolve(target as unknown).catch((err: Error) => {
            warnOnce(String(err?.message ?? err).split("\n")[0] ?? "unknown error");
            return [] as unknown;
          });
          return (safe[prop as "then"] as AnyFn).bind(safe);
        }
        if (typeof value !== "function") return value;
        // `.values()`, `.execute()`, … return another thenable — soften it too.
        return (...args: unknown[]) =>
          soften(query, Reflect.apply(value as AnyFn, target, args));
      },
    }) as unknown as R;
  };

  return new Proxy(client, {
    apply(target, thisArg, args) {
      // Template-tag call: sql`SELECT …`. First arg is the strings array.
      const first = args[0];
      const text = Array.isArray(first) ? (first as readonly string[]).join(" ? ") : first;
      return soften(text, Reflect.apply(target as AnyFn, thisArg, args));
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      // `begin` (transactions) is deliberately NOT softened: a transaction
      // exists to make writes atomic, and a "successful" empty transaction is
      // the silent-write lie this module is built to avoid.
      if (prop !== "unsafe") return (value as AnyFn).bind(target);
      return new Proxy(value as AnyFn, {
        apply(fn, thisArg2, args) {
          return soften(args[0], Reflect.apply(fn, thisArg2 ?? target, args));
        },
      });
    },
  }) as T;
}
