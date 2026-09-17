import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * SELF-HEAL FOR MIGRATION 0216, so the deploy cannot outrun the SQL.
 *
 * Code that reads a column before its migration has run is precisely what took
 * Daily Goals, attendance punch-in and sign-in down on 8 and 9 September, and
 * migrations on this project are applied to production BY HAND — so there is
 * always a window between the deploy landing and someone running the file.
 * Without this, that window is an incentive page that throws for everybody.
 *
 * The statements are the additive half of `0216_incentive_eligibility.sql`,
 * verbatim and idempotent. They no-op on a healthy database, they run once per
 * server process, and the migration file remains the record of intent — this is
 * insurance, not a replacement for running it.
 *
 * Same shape as `lib/ensure-incentive-schema.ts`, which exists for the same
 * reason.
 */
const STATEMENTS = [
  sql`alter table incentive_catalog add column if not exists applies_to_all boolean not null default true`,
  sql`create table if not exists incentive_eligibility (
        id           uuid primary key default gen_random_uuid(),
        incentive_id uuid not null references incentive_catalog(id) on delete cascade,
        employee_id  uuid not null references employees(id)         on delete cascade,
        created_at   timestamptz not null default now()
      )`,
  sql`create unique index if not exists incentive_eligibility_pair_uq
        on incentive_eligibility (incentive_id, employee_id)`,
  sql`create index if not exists incentive_eligibility_employee_idx
        on incentive_eligibility (employee_id)`,
];

let ensured: Promise<void> | null = null;

/**
 * Runs once per process and is then a resolved promise forever.
 *
 * NEVER THROWS. A database whose role cannot run DDL is a perfectly normal
 * production posture, and the callers all degrade to "every incentive applies
 * to everyone" — which is the pre-0216 behaviour, and the right thing to show
 * when the rules cannot be read. Failing the page instead would trade a
 * missing feature for a broken one.
 */
export function ensureEligibilitySchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const stmt of STATEMENTS) await db.execute(stmt);
    })().catch(() => {
      // Deliberately swallowed. Left resolved rather than reset: retrying this
      // on every request against a database that will never allow it would add
      // four failing statements to every page load.
    });
  }
  return ensured;
}
