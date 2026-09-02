// Apply migration 0162 — HR Management-Assessment upgrade: Skills Master
// (skill_lookups) + org_settings.hr_assignment_owner_id.
// Idempotent. Also best-effort seeds the HR assignment owner to Rutvisha when
// the column is still null (safe to re-run).
// pnpm tsx --env-file=.env.local scripts/apply-0162-hr-ma-skills-owner.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const FILE = "db/migrations/0162_hr_ma_skills_owner.sql";

async function main() {
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`,
  );
  await sql.unsafe(readFileSync(FILE, "utf8"));
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0162_hr_ma_skills_owner.sql') on conflict do nothing`,
  );

  // Best-effort: default the HR assignment owner to Rutvisha if still unset.
  // Only writes when the column is null AND a matching employee exists — safe
  // and idempotent (a later run finds the column already populated → no-op).
  const seeded = (await sql`
    update org_settings
    set hr_assignment_owner_id = (
      select id from employees where name ilike 'Rutvisha%' order by name limit 1
    )
    where id = 1
      and hr_assignment_owner_id is null
      and exists (select 1 from employees where name ilike 'Rutvisha%')
    returning hr_assignment_owner_id
  `) as unknown as { hr_assignment_owner_id: string | null }[];

  const cols = (await sql`
    select column_name from information_schema.columns
    where table_name = 'org_settings' and column_name = 'hr_assignment_owner_id'
  `) as unknown as { column_name: string }[];

  const skillTable = (await sql`
    select to_regclass('public.skill_lookups') as t
  `) as unknown as { t: string | null }[];

  console.log(
    `OK — applied ${FILE}.\n` +
      `  skill_lookups table: ${skillTable[0]?.t ?? "MISSING"}\n` +
      `  org_settings.hr_assignment_owner_id column: ${cols[0]?.column_name ?? "MISSING"}\n` +
      `  Rutvisha owner seeded this run: ${seeded.length > 0 ? "yes" : "no (already set or no match)"}`,
  );
}
main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
