import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";
import { withSlowQueryLog } from "./slow-query";

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

export const db = drizzle(tracedClient, { schema });
export * from "@/db/schema";
export type { Employee, NewEmployee, Task, NewTask } from "@/db/schema";
