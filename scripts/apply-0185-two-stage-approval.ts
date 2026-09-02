// Apply mig 0185: two-stage task approval (approval_level + per-stage audit).
// Idempotent. Run against the shared DB before the approval code goes live.
//   pnpm tsx --env-file=.env.local scripts/apply-0185-two-stage-approval.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const ddl = readFileSync("db/migrations/0185_task_two_stage_approval.sql", "utf8");
  await sql.unsafe(ddl);
  const [col] = (await sql`
    select data_type from information_schema.columns
     where table_name = 'tasks' and column_name = 'approval_level'`) as unknown as any[];
  console.log("tasks.approval_level:", col ? `present (${col.data_type})` : "MISSING");
  const [n] = (await sql`select count(*)::int as n from tasks where approval_level = 'admin'`) as unknown as any[];
  console.log("tasks backfilled to admin-approved:", n?.n ?? 0);
  console.log("0185 applied");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
