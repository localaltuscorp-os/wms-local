// Seed Accounts · Vasa Family Interpersonal Balance from "interpersonal
// balance.xlsx". The sheet is a pairwise MATRIX (row entity × col entity =
// amount). Per the sheet's own legend ("MJV has to pay CMV" ↔ a positive cell),
// a positive [row][col] means ROW OWES COL. We flatten the positive cells into
// "row Owes col amount" records (each debt once; the mirror cell is negative).
// Uses the SECOND (more complete / latest) matrix block. Idempotent by
// (party, counterparty).
//
//   pnpm tsx scripts/seed-accounts-vasa.ts
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { accountsVasaBalances } from "@/db/schema";
import { parseAmount } from "@/lib/accounts/amounts";

const FILE = "interpersonal balance.xlsx";

/** Canonicalise the entity-name variants used across the rows vs columns. */
function canon(raw: string): string {
  const s = raw.trim();
  if (/^GP\s*\(CG New\)$/i.test(s) || /^CG New$/i.test(s)) return "CG New";
  if (/^DHARAV$/i.test(s)) return "Dharav";
  return s;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" });

  // Matrix header row = col1 empty and cols 2-5 are the entity names MJV/IJV/CMV/KAS.
  // There are two such blocks; use the LAST (most recent / most complete) one.
  const headerIdxs: number[] = [];
  const isHeader = (r: string[]) =>
    (r[1] ?? "").trim() === "" &&
    ["MJV", "IJV", "CMV", "KAS"].every((n, k) => (r[2 + k] ?? "").trim() === n);
  rows.forEach((r, i) => { if (isHeader(r)) headerIdxs.push(i); });
  if (headerIdxs.length === 0) throw new Error("Could not find a matrix header row.");
  const hIdx = headerIdxs[headerIdxs.length - 1]!; // latest block
  const header = rows[hIdx]!;

  // Column entities (cols 2..13).
  const cols: Array<{ c: number; name: string }> = [];
  for (let c = 2; c <= 13; c++) {
    const name = (header[c] ?? "").trim();
    if (name) cols.push({ c, name: canon(name) });
  }

  // Data rows until a blank party.
  const debts: Array<{ party: string; counterparty: string; amount: number }> = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const party = (rows[i]![1] ?? "").trim();
    if (!party) break;
    const p = canon(party);
    for (const { c, name } of cols) {
      const v = parseAmount(rows[i]![c] ?? null);
      if (v === null || v <= 0) continue; // positive = party owes col; mirror is negative
      if (p === name) continue;
      debts.push({ party: p, counterparty: name, amount: v });
    }
  }

  let n = 0, sort = 0;
  for (const d of debts) {
    sort += 1;
    const [ex] = await db.select({ id: accountsVasaBalances.id }).from(accountsVasaBalances)
      .where(and(eq(accountsVasaBalances.party, d.party), eq(accountsVasaBalances.counterparty, d.counterparty), eq(accountsVasaBalances.archived, false)))
      .limit(1);
    const values = { party: d.party, direction: "Owes", counterparty: d.counterparty, amount: String(d.amount), sortOrder: sort };
    if (ex) await db.update(accountsVasaBalances).set({ ...values, updatedAt: new Date() }).where(eq(accountsVasaBalances.id, ex.id));
    else await db.insert(accountsVasaBalances).values(values);
    n += 1;
  }
  console.log(`Vasa: ${n} interpersonal debts imported (from the latest matrix block, header @R${hIdx + 1}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
