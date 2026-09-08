// One-off: ensure every incentive_requests ledger column exists, using the
// app's own DATABASE_URL (no Supabase dashboard needed).
//   pnpm tsx --env-file=.env.local scripts/fix-incentive-columns.ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set — run with --env-file=.env.local");
const sql = postgres(url, { max: 1, prepare: false });

const stmts = [
  `alter table incentive_requests add column if not exists amount     integer not null default 0`,
  `alter table incentive_requests add column if not exists paid       boolean not null default false`,
  `alter table incentive_requests add column if not exists paid_amt   integer not null default 0`,
  `alter table incentive_requests add column if not exists paid_date  date`,
  `alter table incentive_requests add column if not exists conditions jsonb`,
  `alter table incentive_requests add column if not exists label      text`,
  `alter table incentive_requests add column if not exists source     text not null default 'form'`,
  `alter table incentive_requests add column if not exists source_ref text`,
  `alter table incentive_requests add column if not exists archived   boolean not null default false`,
];

async function main() {
  for (const s of stmts) {
    await sql.unsafe(s);
    console.log("✓", s.slice(0, 64));
  }
  console.log("\nAll incentive columns ensured. You can now save project incentives.");
}

main().then(() => sql.end()).catch(async (e) => {
  console.error("FAILED:", e?.message ?? e);
  await sql.end();
  process.exit(1);
});
