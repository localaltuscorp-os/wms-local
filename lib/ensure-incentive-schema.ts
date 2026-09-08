import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Belt-and-suspenders self-heal for the incentive ledger columns.
 *
 * Across many folder swaps / partial migration runs some databases ended up
 * with only SOME of the `incentive_requests` ledger columns, so a full INSERT
 * (project/sheet/weekly-goal incentives) failed on the first missing column —
 * and nothing ever landed in the Incentive tab. Migration 0060 asserts these
 * columns, but only if the operator successfully runs `pnpm db:migrate`.
 *
 * This guard runs the same idempotent `ADD COLUMN IF NOT EXISTS` statements
 * lazily, once per server process, right before we write to the ledger. Every
 * statement no-ops on a healthy DB, so it's cheap insurance that the feature
 * works even when migrations lag behind.
 */
const STATEMENTS = [
  // The original table (migration 0053) pinned `type` to the four form schemes
  // via a CHECK constraint. Project / sheet / weekly-goal incentives use new
  // type values, so that check silently rejected every such INSERT and nothing
  // reached the Incentive tab. Drop it — the type is validated in the action
  // layer. Postgres' auto-name for the unnamed column check is *_type_check.
  sql`alter table incentive_requests drop constraint if exists incentive_requests_type_check`,
  sql`alter table incentive_requests add column if not exists amount     integer not null default 0`,
  sql`alter table incentive_requests add column if not exists paid       boolean not null default false`,
  sql`alter table incentive_requests add column if not exists paid_amt   integer not null default 0`,
  sql`alter table incentive_requests add column if not exists paid_date  date`,
  sql`alter table incentive_requests add column if not exists conditions jsonb`,
  sql`alter table incentive_requests add column if not exists label      text`,
  sql`alter table incentive_requests add column if not exists source     text not null default 'form'`,
  sql`alter table incentive_requests add column if not exists source_ref text`,
  sql`alter table incentive_requests add column if not exists archived   boolean not null default false`,
  sql`alter table weekly_goals      add column if not exists incentive_amount integer not null default 0`,
  sql`alter table org_settings      add column if not exists incentive_social_earner text not null default 'Rohan Choudhary'`,
];

let ensured: Promise<void> | null = null;

export function ensureIncentiveColumns(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const stmt of STATEMENTS) await db.execute(stmt);
    })().catch((err) => {
      // Reset so a later call can retry; surface nothing here — the caller's
      // own insert will throw a precise error if a column truly is missing.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}
