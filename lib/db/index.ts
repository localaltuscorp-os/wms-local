import { drizzle } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";
import { withSlowQueryLog } from "./slow-query";
import { DUMMY_MODE, DUMMY_DB_DIR } from "./dummy-dir";
import { devDbOfflineEnabled, withDevOfflineFallback } from "./dev-offline";

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
const globalForDummy = globalThis as unknown as { __pglite?: ReturnType<typeof drizzlePglite> };

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

function dummyDb() {
  if (globalForDummy.__pglite) return globalForDummy.__pglite;
  // Required at call time, not imported at module scope: this pulls in a
  // multi-megabyte WASM build, and the real database path must never pay for it.
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");
  const { unaccent } = require("@electric-sql/pglite/contrib/unaccent");
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
