/**
 * Read-only connectivity + row-count probe for the Supabase Postgres database.
 *
 * Answers the question "is the dashboard empty because the DB is empty, or
 * because the app never queried it?" — it connects with the same DATABASE_URL
 * the app uses and prints counts for the tables the dashboard reads.
 *
 * Usage:  pnpm verify:db
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — run via `pnpm verify:db` so .env.local is loaded.");
  process.exit(1);
}

// Same pooler-safe settings as lib/db/index.ts (prepare:false for Supavisor).
const sql = postgres(url, { prepare: false, connect_timeout: 10, idle_timeout: 5, max: 1 });

// Tables the dashboard KPI strip + status table + top performers depend on.
const TABLES = [
  "employees",
  "tasks",
  "departments",
  "task_events",
  "weekly_goals",
  "attendance_log",
] as const;

async function main() {
  const host = (() => {
    try {
      return new URL(url!).host;
    } catch {
      return "<unparseable>";
    }
  })();

  console.log(`\nConnecting to ${host} ...`);
  const started = Date.now();
  const info = await sql<
    { db: string; usr: string; ver: string }[]
  >`select current_database() as db, current_user as usr, version() as ver`;
  console.log(`Connected in ${Date.now() - started}ms`);
  console.log(`  database : ${info[0]?.db ?? "?"}`);
  console.log(`  user     : ${info[0]?.usr ?? "?"}`);
  console.log(
    `  server   : ${(info[0]?.ver ?? "?").split(" ").slice(0, 2).join(" ")}\n`,
  );

  console.log("Table counts");
  console.log("------------");
  for (const t of TABLES) {
    const exists = await sql`
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${t}
      limit 1
    `;
    if (exists.length === 0) {
      console.log(`  ${t.padEnd(16)} (table not present)`);
      continue;
    }
    const counted = await sql<{ n: string }[]>`
      select count(*)::text as n from ${sql(t)}
    `;
    console.log(`  ${t.padEnd(16)} ${counted[0]?.n ?? "?"}`);
  }

  // Does the mock Demo User the DISABLE_AUTH path returns actually exist?
  const DEMO_ID = "00000000-0000-0000-0000-000000000000";
  const demo = await sql<{ id: string; name: string; email: string }[]>`
    select id, name, email from employees where id = ${DEMO_ID}
  `;
  console.log(
    `\nDemo User row (${DEMO_ID}): ${
      demo[0] ? `present — ${demo[0].name} <${demo[0].email}>` : "NOT present"
    }`,
  );

  // A sample of real employees, so it's obvious whether the roster is populated.
  const sample = await sql<{ name: string; email: string; is_active: boolean }[]>`
    select name, email, is_active from employees order by created_at asc limit 5
  `;
  if (sample.length) {
    console.log("\nFirst few employees:");
    for (const e of sample) {
      console.log(`  - ${e.name} <${e.email}>${e.is_active ? "" : " (inactive)"}`);
    }
  }

  // Task status spread — this is what the KPI strip aggregates.
  const byStatus = await sql<{ status: string; n: string }[]>`
    select status, count(*)::text as n from tasks group by status order by count(*) desc
  `;
  if (byStatus.length) {
    console.log("\nTasks by status:");
    for (const r of byStatus) console.log(`  ${r.status.padEnd(16)} ${r.n}`);
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\nDatabase probe FAILED:");
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    if (err && typeof err === "object" && "code" in err) {
      console.error(`  code: ${(err as { code: unknown }).code}`);
    }
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  });
