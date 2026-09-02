// Validate 0096 SQL by running it inside a transaction and ROLLING BACK — no
// persisted change to the live DB. Catches syntax/DDL errors before ship.
//   pnpm tsx --env-file=.env.local scripts/validate-0096.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });
const body = readFileSync("db/migrations/0096_pms_training_v2.sql", "utf8");

async function main() {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      // verify a couple of tables materialised inside the txn
      const rows = (await tx.unsafe(
        `select table_name from information_schema.tables
         where table_name in ('tc_sessions','pms_monthly_review','tc_self_learning','pms_personal_goal')
         order by table_name`,
      )) as unknown as { table_name: string }[];
      console.log("  tables created in txn:", rows.map((r) => r.table_name).join(", "));
      throw new Error("__ROLLBACK__"); // intentional rollback — nothing persists
    });
  } catch (e) {
    if ((e as Error).message === "__ROLLBACK__") {
      console.log("✓ 0096 applied cleanly inside a transaction, then rolled back (no DB change).");
      return;
    }
    throw e;
  }
}

main().then(() => sql.end()).catch(async (e) => { console.error("✗ SQL ERROR:", e); await sql.end(); process.exit(1); });
