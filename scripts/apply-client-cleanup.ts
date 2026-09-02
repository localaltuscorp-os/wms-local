// Apply 0052_client_cleanup — data-only, idempotent, reversible (backup table).
// Run via:  pnpm tsx --env-file=.env.local scripts/apply-client-cleanup.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const file = readFileSync("db/migrations/0052_client_cleanup.sql", "utf8");
  await sql.unsafe(file);

  const [backup] = await sql<{ n: number }[]>`
    select count(*)::int as n from client_cleanup_backup_0052`;
  const [deactivated] = await sql<{ n: number }[]>`
    select count(*)::int as n from clients where is_active = false`;
  const [activeRoster] = await sql<{ n: number }[]>`
    select count(*)::int as n from clients where is_active = true`;
  // Any task still on a known-variant spelling? (should be 0)
  const [strays] = await sql<{ n: number }[]>`
    select count(*)::int as n from tasks
     where lower(btrim(client)) in (
       'altus  corp','altus','altus corpq','alus corp','aktus corp - bsu',
       'altus vorp','altus corp & cg','pr & company','carbide','carbite india',
       'alok kanani','chouhan & sons','chowhan and sons','ehara','soul storii',
       'ajit jain','aatech','colour graphicsekyc','vasa fmaily'
     )`;
  // ('hys' omitted — the canonical 'HYS' lowercases to it, so it'd false-positive.)

  console.log(
    `OK — merged tasks backed up: ${backup?.n ?? "?"}; ` +
      `roster active: ${activeRoster?.n ?? "?"}, inactive: ${deactivated?.n ?? "?"}; ` +
      `remaining variant-spelling tasks (want 0): ${strays?.n ?? "?"}`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
