// Apply 0049_collapse_statuses — data-only, idempotent. We run migration SQL
// through a one-off script rather than `pnpm db:migrate` because the drizzle
// journal is out of sync (see the migration-journal-out-of-sync memory).
//
//   pnpm tsx --env-file=.env.local scripts/apply-collapse-statuses.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync("db/migrations/0049_collapse_statuses.sql", "utf8");
  await sql.unsafe(file);

  // Post-conditions — both counts should be 0 after a successful run.
  const [followUps] = await sql<{ count: number }[]>`
    select count(*)::int as count from tasks
     where status in ('follow_up_1', 'follow_up_2', 'follow_up_3')`;
  const [strays] = await sql<{ count: number }[]>`
    select count(*)::int as count from tasks
     where archived = false
       and (status in ('transferred', 'cancelled')
            or approval_status in ('transferred', 'cancelled'))`;

  console.log(
    `OK — remaining granular follow-ups: ${followUps?.count ?? "?"}; ` +
      `un-archived transferred/cancelled: ${strays?.count ?? "?"}`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
