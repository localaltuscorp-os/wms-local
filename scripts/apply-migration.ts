// Generic idempotent-migration applier (no ALTER TYPE ADD VALUE — those need
// the standalone path). Usage: pnpm tsx --env-file=.env.local \
//   scripts/apply-migration.ts db/migrations/0026_xxx.sql
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) throw new Error("Pass a migration .sql path");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(readFileSync(file as string, "utf8"));
  console.log(`OK — applied ${file}`);
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
