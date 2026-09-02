// Targeted, idempotent apply of migration 0096 (PMS rating v2 + Training engine).
// Own max:1 connection. Safe to re-run. ADDITIVE only — touches no existing table.
//   pnpm tsx --env-file=.env.local scripts/apply-0096-pms-training-v2.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  const f = "0096_pms_training_v2.sql";
  await sql.unsafe(readFileSync(`db/migrations/${f}`, "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ($1) on conflict do nothing`, [f]);
  console.log(`✓ applied ${f}`);
  const tables = [
    "tc_sessions",
    "tc_session_attendees",
    "tc_session_feedback",
    "tc_assessments",
    "tc_self_learning",
    "tc_shares",
    "tc_share_feedback",
    "pms_monthly_review",
    "pms_personal_goal",
  ];
  for (const name of tables) {
    const [t] = (await sql.unsafe(
      `select count(*)::int as n from information_schema.tables where table_name=$1`,
      [name],
    )) as unknown as { n: number }[];
    console.log(`  ${name.padEnd(24)} ${t?.n ? "present ✓" : "MISSING ✗"}`);
  }
  const [cfg] = (await sql.unsafe(
    `select weights from pms_score_config where id='default'`,
  )) as unknown as { weights: Record<string, number> }[];
  const migrated = cfg && "kpi" in (cfg.weights ?? {});
  console.log(`  pms_score_config → v2 (kpi weight) ${migrated ? "migrated ✓" : "NOT migrated ✗"}`);
  console.log(`    weights = ${JSON.stringify(cfg?.weights)}`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
