// Apply 0070_goal_task_link (idempotent). See migration-journal-out-of-sync memory.
//   pnpm tsx --env-file=.env.local scripts/apply-goal-task-link.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync("db/migrations/0070_goal_task_link.sql", "utf8"));
  const cols = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where (table_name = 'weekly_goals' and column_name = 'task_id')
       or (table_name = 'tasks' and column_name = 'origin_goal_id')`;
  const idx = await sql<{ indexname: string }[]>`
    select indexname from pg_indexes
    where indexname in ('weekly_goals_task_id_idx', 'tasks_origin_goal_idx')`;
  console.log("OK — columns:", cols.map((c) => `${c.table_name}.${c.column_name}`).join(", "));
  console.log("OK — indexes:", idx.map((i) => i.indexname).join(", "));
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
