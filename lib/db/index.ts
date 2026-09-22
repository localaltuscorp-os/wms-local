import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";
import { withSlowQueryLog } from "./slow-query";
import { DUMMY_MODE, DUMMY_DB_DIR } from "./dummy-dir";
import { devDbOfflineEnabled, withDevOfflineFallback } from "./dev-offline";

/**
 * The PGlite drizzle driver's factory — as a TYPE, and only a type.
 *
 * THIS IS NOT COSMETIC. It used to be a real import:
 *
 *   import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
 *
 * and that one line, not the `require()` in `dummyDb()`, is what put PGlite in
 * ~430 of this app's serverless functions. See the long note in `dummyDb()`
 * for the mechanism; the short version is that this file is imported by every
 * route that touches the database, `drizzle-orm/pglite` is bundled rather than
 * externalized, and the driver's own `import("@electric-sql/pglite")` is
 * externalized into a LITERAL specifier that Next's file tracer follows.
 *
 * `typeof import(...)` in a type position is erased at compile time, so this
 * contributes nothing to any bundle. Do not "tidy" it back into an import.
 */
type DrizzlePgliteFactory = typeof import("drizzle-orm/pglite")["drizzle"];

// Cache the postgres client on globalThis so Next.js HMR doesn't leak
// connections on every save. In production this just runs once.
const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pg ??
  postgres(env.DATABASE_URL, {
    // Required for Supabase's pgbouncer (transaction-mode pooler):
    // prepared statements are per-session and break under txn pooling.
    prepare: false,
    // We connect to the Supabase TRANSACTION pooler (Supavisor, port 6543), not
    // Postgres directly. The pooler accepts up to ~200 client connections and
    // multiplexes them onto its own server pool (≈40) against the DB's 60-conn
    // ceiling. So this `max` is connections to the POOLER, not to Postgres —
    // the pooler, not us, guards the 60 ceiling. An over-tight pool is actually
    // harmful: a page like the dashboard fires 6–15 queries in one Promise.all,
    // and with only 4 slots a single STALE connection blocks a quarter of them.
    //
    // INCIDENT 2026-06-17: after a Supabase restart-storm (network restrictions
    // toggle + pooler bounce), warm Vercel instances kept handing out dead
    // connections from before the bounce. With no query timeout, a query on a
    // dead socket hung FOREVER → authed pages intermittently stuck on "Loading…"
    // (≈1 in 5 requests). Root cause was NOT the 60-conn ceiling (queries are
    // <200ms on ~800 rows) — it was stale connections + no timeout. Hardening:
    //   • max 4→10  — headroom for parallel page queries; safe vs the pooler's
    //                 200-client limit even across ~15 warm instances.
    //   • max_lifetime 30m→10m and idle_timeout 20s→10s — recycle aggressively
    //                 so a connection orphaned by a pooler restart is dropped
    //                 (idle >10s → closed) instead of lingering up to 30m and
    //                 being handed out dead. This is the primary anti-hang fix.
    //
    // NOTE on query timeouts: Supabase already enforces a server-side
    // statement_timeout of 2min by default, so a query that REACHES the server
    // can't hang forever. We deliberately do NOT pass `connection: {
    // statement_timeout }` — Supavisor (the txn pooler) silently ignores
    // startup GUCs (verified: it still reports 2min), so it'd be a misleading
    // no-op. The aggressive recycling above + postgres-js's default TCP
    // keep_alive (60s) are what actually bound the dead-socket case.
    max: 10,
    idle_timeout: 10,
    max_lifetime: 60 * 10,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pg = client;
}

// Phase 0.1 — opt-in slow-query logger. Enable in any environment by
// setting SLOW_QUERY_MS (e.g. "300"). Disabled by default so production
// stays quiet until we deliberately turn it on. NODE_ENV=development
// auto-enables at 300ms so local clicks immediately surface hotspots.
const slowEnvVar = process.env.SLOW_QUERY_MS;
const slowMs = slowEnvVar
  ? Number(slowEnvVar)
  : process.env.NODE_ENV === "development"
    ? 300
    : NaN;
const tracedClient = Number.isFinite(slowMs) ? withSlowQueryLog(client, slowMs) : client;

/**
 * DUMMY MODE — the whole app, pointed at a throwaway Postgres with no server.
 *
 * PGlite is real PostgreSQL compiled to WASM, running inside this process and
 * storing its data in `.pglite/`. It speaks the same SQL and drizzle drives it
 * through the same query builder, so every one of the app's 344 query functions
 * works unchanged — which is the point: the alternative was stubbing them one
 * by one, and there are 108 modules of them.
 *
 * Build the data first with `pnpm dummy:setup`, then run `pnpm dev:dummy`.
 * Alongside this, lib/auth/current.ts signs you in as a dummy employee, so
 * neither the real database nor Firebase is contacted at all.
 *
 * DEVELOPMENT ONLY — `DUMMY_MODE` (lib/db/dummy-dir.ts) is hard-false when
 * NODE_ENV is production, so a production build cannot be switched onto fake
 * data and a bypassed login by setting one environment variable.
 *
 * The instance is cached on globalThis for the same reason the postgres client
 * is: Next's HMR re-evaluates this module on every save, and PGlite holds an
 * exclusive lock on its data directory — a second instance would fail to open
 * it. One process at a time, which is also why `pnpm dummy:setup` must not run
 * while the dev server is up.
 */
const globalForDummy = globalThis as unknown as { __pglite?: ReturnType<DrizzlePgliteFactory> };

/**
 * Make `execute()` return what the postgres-js driver returns: the ROWS.
 *
 * The two drivers disagree, and the app was written against postgres-js. Given
 * `db.execute(sql\`select ...\`)`:
 *
 *   postgres-js → an array of rows          → `rows.map(...)` works
 *   PGlite      → `{ rows, fields, ... }`   → `rows.map is not a function`
 *
 * There are 116 `execute()` call sites, most of them casting the result
 * straight to an array (`r as unknown as Row[]`), so the cast hides the
 * mismatch from TypeScript and it only shows up at runtime. Normalising here —
 * one seam — is the alternative to editing 116 of them, and it keeps DUMMY MODE
 * a thing you can delete in one commit.
 *
 * `transaction` is wrapped too, so a `tx.execute(...)` inside one gets the same
 * treatment as `db.execute(...)` outside it.
 */
function withPostgresJsResultShape<T extends object>(instance: T): T {
  return new Proxy(instance, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== "function") return value;

      if (prop === "execute") {
        return (...args: unknown[]) =>
          Promise.resolve(
            (value as (...a: unknown[]) => unknown).apply(target, args),
          ).then((result) => {
            const rows = (result as { rows?: unknown })?.rows;
            return Array.isArray(rows) ? rows : result;
          });
      }

      if (prop === "transaction") {
        return (callback: (tx: object) => unknown, ...rest: unknown[]) =>
          (value as (...a: unknown[]) => unknown).call(
            target,
            (tx: object) => callback(withPostgresJsResultShape(tx)),
            ...rest,
          );
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}

/**
 * SAY IT BEFORE PGlite SWALLOWS IT.
 *
 * PGlite keeps a `postmaster.pid` in its data directory, and it is removed on a
 * clean shutdown. Kill the dev server instead — which is exactly what happens
 * when the OS reaps it for memory, or when Next's render worker dies and takes
 * the process with it — and the file survives. The next `pnpm dev:dummy` then
 * fails deep inside the first query with nothing but
 *
 *   [cause]: Error: PGlite failed to initialize properly
 *
 * which says nothing about a lock file and sends you looking at your own query.
 * We do NOT delete it here: if a second dev server really is running, that file
 * is the only thing keeping two processes off one data directory. A line of
 * warning at the moment of the attempt is the honest half of the trade.
 */
function warnOnStaleDummyLock(): void {
  try {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { statSync } = require("node:fs") as typeof import("node:fs");
    const lock = join(DUMMY_DB_DIR, "postmaster.pid");
    if (!existsSync(lock)) return;
    // EMPTY is the stale signature. A live PGlite writes its pid and data path
    // into this file (~55 bytes); a killed one leaves the zero-byte husk it had
    // opened with. Warning on mere existence cried wolf on every re-init inside
    // a healthy dev server, which is the fastest way to teach someone to ignore
    // the one message that matters.
    if (statSync(lock).size > 0) return;
    console.warn(
      `[dummy-mode] ${lock} is a STALE LOCK — the last dev server was killed rather than stopped, ` +
        `and PGlite is about to fail to start ("PGlite failed to initialize properly"). Delete that ` +
        `file, or run \`pnpm dummy:setup --reset\` to rebuild the fixture database, then start again.`,
    );
  } catch {
    // Never let a diagnostic stop the database from opening.
  }
}

function dummyDb() {
  if (globalForDummy.__pglite) return globalForDummy.__pglite;
  /* Required at call time, not imported at module scope: this pulls in a
   * multi-megabyte WASM build, and the real database path must never pay for it.
   *
   * ── AND THROUGH A VARIABLE, WHICH IS THE PART THAT ACTUALLY WORKS ────────
   * Call-time was not enough. Next's file tracer reads the BUILD OUTPUT and
   * follows any `require()` whose specifier is a string literal, wherever it
   * sits — a function body is no different from module scope to a static
   * analyser. So on 2026-09-15 this package was measured in 426 of 431
   * deployed functions at 17.2 MB each: 7.14 GB, 69% of a Functions Storage
   * bill that had gone over its 10 GB allowance.
   *
   * Neither of the other two defences helps, and it is worth knowing why:
   *   · `devDependencies` governs INSTALL, and Vercel installs dev deps to
   *     build with, so the files are present to be traced.
   *   · `serverExternalPackages` (next.config.ts) governs BUNDLING. Leaving it
   *     as a plain runtime require out of node_modules is the entire point of
   *     that option — which means the tracer must copy node_modules in.
   *
   * A variable specifier cannot be resolved statically, so the tracer does not
   * follow it and the package stays out of every deployed function. Node
   * resolves it perfectly well at runtime, which is all DUMMY_MODE needs.
   *
   * DELIBERATELY NOT `outputFileTracingExcludes`, which was tried first. Not
   * because it was proven harmful — it was blamed for emptying every trace and
   * was innocent — but because a variable specifier is precise BY CONSTRUCTION:
   * there is no glob to get wrong, nothing else can be caught by it, and it
   * cannot break production even if it saves nothing, because production never
   * reaches this function. The full reasoning, and the warning about trusting
   * local `.nft.json` numbers at all, is in next.config.ts.
   *
   * If this ever runs on a deployment it throws MODULE_NOT_FOUND here, which is
   * the right failure: DUMMY_MODE is the local sandbox and must never be on.
   *
   * ── THE OTHER HALF, WHICH THE FIRST FIX MISSED (found 2026-09-18) ────────
   * The variable specifier below was correct and it did NOT work, because the
   * package was still being pulled in through a completely different door:
   *
   *   import { drizzle as drizzlePglite } from "drizzle-orm/pglite";   // line 2
   *
   * `drizzle-orm/pglite` is NOT in `serverExternalPackages`, so webpack BUNDLES
   * that driver into this module's chunk — and the chunk that owns `lib/db` is
   * shared by every route that queries the database. The driver's own
   * `import { PGlite } from "@electric-sql/pglite"` IS externalized, so webpack
   * emits it as a runtime `a.exports = import("@electric-sql/pglite")` — a
   * LITERAL specifier. Next's tracer follows a literal dynamic import exactly as
   * it follows a literal `require`, so PGlite went into ~430 functions again.
   *
   * Verified in the build output, not inferred: the string
   * `import("@electric-sql/pglite")` appeared in 430 of 1066 files under
   * `.next/server`. Hiding THIS require was never going to matter while that
   * import existed. Both doors are now shut — the driver is `require`d at call
   * time through a variable, like PGlite itself.
   *
   * The lesson worth keeping: when you hide one reference, grep the BUILD
   * OUTPUT for the specifier. A leak you cannot see in the source is still a
   * leak, and `pnpm build` + `grep -rl "electric-sql/pglite" .next/server`
   * answers it in seconds.
   *
   * `scripts/measure-functions-storage.mjs --leaks` does this automatically. */
  const PGLITE = "@electric-sql/pglite";
  const { PGlite } = require(PGLITE) as typeof import("@electric-sql/pglite");
  const { pg_trgm } = require(`${PGLITE}/contrib/pg_trgm`);
  const { unaccent } = require(`${PGLITE}/contrib/unaccent`);
  // Same treatment, same reason — see the note above and next.config.ts.
  const DRIZZLE_PGLITE = "drizzle-orm/pglite";
  const { drizzle: drizzlePglite } = require(DRIZZLE_PGLITE) as typeof import("drizzle-orm/pglite");
  warnOnStaleDummyLock();
  const instance = withPostgresJsResultShape(
    drizzlePglite(new PGlite({ dataDir: DUMMY_DB_DIR, extensions: { pg_trgm, unaccent } }), {
      schema,
    }),
  );
  globalForDummy.__pglite = instance;
  console.log(`[dummy-mode] using the fixture database at ${DUMMY_DB_DIR} — no Supabase, no Firebase`);
  return instance;
}

// DEV_DB_OFFLINE (local dev only) - let read queries fall back to no rows when
// the database is unreachable, so pages render their empty state rather than
// sending the whole route to the error boundary. Off unless the flag is set, and
// it wraps OUTSIDE the slow-query logger on purpose: the logger still sees and
// reports the real failure before it is softened. Applies to the REAL postgres
// client only - DUMMY_MODE's PGlite database is local and always reachable, so
// there is nothing there for it to soften. See ./dev-offline.
const dbClient = devDbOfflineEnabled() ? withDevOfflineFallback(tracedClient) : tracedClient;

export const db = DUMMY_MODE
  ? (dummyDb() as unknown as ReturnType<typeof drizzle<typeof schema>>)
  : drizzle(dbClient, { schema });
export * from "@/db/schema";
export type { Employee, NewEmployee, Task, NewTask } from "@/db/schema";
