// Apply 0051_retire_need_help — data-only, idempotent. We run migration SQL
// through a one-off script rather than `pnpm db:migrate` because the drizzle
// journal is out of sync (see the migration-journal-out-of-sync memory).
//
//   pnpm tsx --env-file=.env.local scripts/apply-retire-need-help.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync("db/migrations/0051_retire_need_help.sql", "utf8");
  await sql.unsafe(file);

  // Post-condition — should be 0 after a successful run.
  const [strays] = await sql<{ count: number }[]>`
    select count(*)::int as count from tasks where status = 'need_help'`;

  console.log(`OK — remaining need_help tasks: ${strays?.count ?? "?"}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
