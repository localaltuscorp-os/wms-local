/**
 * Slow-query logger — wraps a postgres-js client so every query call is
 * timed and anything over `SLOW_MS` (default 300ms) is logged to the
 * server console with the query text + duration.
 *
 * Implemented as a Proxy on the client function. postgres-js exposes its
 * client as a callable (`sql\`SELECT ...\``) with attached helpers
 * (`sql.unsafe`, `sql.begin`, etc.). Drizzle drives both paths; we time
 * both by intercepting `apply` for the template-tag call and `get` for
 * the methods. The wrapped result's Promise is awaited via `.then` so we
 * fire the log when the query actually settles, not when it's queued.
 *
 * Zero behaviour change otherwise: the wrapper returns whatever
 * postgres-js returns, so query result shapes and error semantics are
 * untouched.
 */
type AnyFn = (...args: unknown[]) => unknown;

const DEFAULT_SLOW_MS = 300;

function clipSql(s: string, max = 200): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function describeArgs(args: unknown[]): string {
  // Template-tag invocation: first arg is a TemplateStringsArray.
  const first = args[0];
  if (Array.isArray(first) && typeof first[0] === "string") {
    return clipSql((first as readonly string[]).join("?"));
  }
  if (typeof first === "string") return clipSql(first);
  try {
    return clipSql(JSON.stringify(first));
  } catch {
    return "(unprintable query)";
  }
}

function timeAndLog<T>(label: string, started: number, p: T, slowMs: number): T {
  // p is whatever postgres-js handed back. If it's a thenable, attach.
  const maybe = p as unknown as { then?: AnyFn };
  if (maybe && typeof maybe.then === "function") {
    Promise.resolve(p as unknown).then(
      () => {
        const ms = Math.round(performance.now() - started);
        if (ms >= slowMs) {
          // eslint-disable-next-line no-console
          console.warn(`[slow-query] ${ms}ms — ${label}`);
        }
      },
      () => {
        const ms = Math.round(performance.now() - started);
        // Log every failed query, slow or not — failures are always
        // interesting. Errors propagate to the caller as normal.
        // eslint-disable-next-line no-console
        console.warn(`[slow-query] FAILED after ${ms}ms — ${label}`);
      },
    );
  }
  return p;
}

export function withSlowQueryLog<T extends AnyFn>(
  client: T,
  slowMs: number = DEFAULT_SLOW_MS,
): T {
  return new Proxy(client, {
    apply(target, thisArg, args) {
      const started = performance.now();
      const result = Reflect.apply(target as AnyFn, thisArg, args);
      return timeAndLog(describeArgs(args), started, result, slowMs);
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      // Time the common drizzle exit points: `unsafe`, `begin`, `array`,
      // `file`, `simple`. Anything else returns the raw value (Symbols,
      // property accessors postgres-js uses internally).
      if (typeof value !== "function") return value;
      if (prop !== "unsafe" && prop !== "begin" && prop !== "array" && prop !== "file" && prop !== "simple") {
        // Still bind so postgres-js internals that rely on `this` work.
        return (value as AnyFn).bind(target);
      }
      return new Proxy(value as AnyFn, {
        apply(fn, thisArg2, args) {
          const started = performance.now();
          const result = Reflect.apply(fn, thisArg2 ?? target, args);
          return timeAndLog(`${String(prop)}(${describeArgs(args)})`, started, result, slowMs);
        },
      });
    },
  }) as T;
}
