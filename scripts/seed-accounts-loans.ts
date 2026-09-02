// Seed Accounts · SIP → Loans sub-tables from the uploaded "sip tracker .xlsx".
// Block 2 (EMI) header has cols 8..22 = Apr-24…Mar-25 + Apr/May/Jun-26 (the
// period columns) and 2 loan rows; block 3 (closing balance) repeats the same
// loans & months. Idempotent by loan_name / period label.
//
//   pnpm tsx scripts/seed-accounts-loans.ts
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { accountsLoanItems, accountsLoanPeriods, accountsLoanCells } from "@/db/schema";
import { parseAmount } from "@/lib/accounts/amounts";

const FILE = "sip tracker .xlsx";
const FIRST_MONTH_COL = 8;
const LAST_MONTH_COL = 22;

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}
function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });

  // Locate the two blocks by their header markers.
  const emiHdr = rows.findIndex((r) => clean(r[2]) === "Loan Name" && clean(r[4]) === "EMI Date");
  const closeHdr = rows.findIndex((r) => clean(r[2]) === "Loan Name" && (clean(r[3]) ?? "").toLowerCase().startsWith("loan a/c closing"));
  if (emiHdr < 0) throw new Error("Could not find the EMI block header (Loan Name / EMI Date).");

  // Period columns from the EMI header row.
  const periodDefs: Array<{ label: string; col: number }> = [];
  for (let c = FIRST_MONTH_COL; c <= LAST_MONTH_COL; c++) {
    const label = clean(rows[emiHdr]![c]);
    if (label) periodDefs.push({ label, col: c });
  }

  // Upsert periods (by label), capture ids in order.
  const periodId = new Map<string, string>();
  let psort = 0;
  for (const p of periodDefs) {
    psort += 1;
    const [ex] = await db.select({ id: accountsLoanPeriods.id }).from(accountsLoanPeriods).where(eq(accountsLoanPeriods.label, p.label)).limit(1);
    if (ex) { await db.update(accountsLoanPeriods).set({ sortOrder: psort, archived: false }).where(eq(accountsLoanPeriods.id, ex.id)); periodId.set(p.label, ex.id); }
    else { const [ins] = await db.insert(accountsLoanPeriods).values({ label: p.label, sortOrder: psort }).returning({ id: accountsLoanPeriods.id }); periodId.set(p.label, ins!.id); }
  }

  // Read loan rows from a block until a blank loan name.
  function readBlock(startIdx: number): Array<{ row: string[]; name: string }> {
    const out: Array<{ row: string[]; name: string }> = [];
    for (let i = startIdx + 1; i < rows.length; i++) {
      const name = clean(rows[i]![2]);
      const sno = clean(rows[i]![0]);
      if (!name && !sno) break; // blank row ends the block
      if (!name || name === "Loan Name") continue;
      out.push({ row: rows[i]!, name });
    }
    return out;
  }

  const emiRows = readBlock(emiHdr);
  const closeRows = closeHdr >= 0 ? readBlock(closeHdr) : [];
  const closeByName = new Map(closeRows.map((x) => [x.name.toLowerCase(), x.row]));

  // Upsert loans (by loan_name) + cells.
  let nLoans = 0, nCells = 0, isort = 0;
  for (const { row, name } of emiRows) {
    isort += 1;
    const values = { code: clean(row[0]), entity: clean(row[1]), loanName: name, location: clean(row[3]), emiDate: clean(row[4]), sortOrder: isort };
    const [ex] = await db.select({ id: accountsLoanItems.id }).from(accountsLoanItems).where(eq(accountsLoanItems.loanName, name)).limit(1);
    let loanId: string;
    if (ex) { await db.update(accountsLoanItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsLoanItems.id, ex.id)); loanId = ex.id; }
    else { const [ins] = await db.insert(accountsLoanItems).values(values).returning({ id: accountsLoanItems.id }); loanId = ins!.id; }
    nLoans += 1;

    const closeRow = closeByName.get(name.toLowerCase());
    for (const p of periodDefs) {
      const emi = amt(row[p.col]);
      const closing = closeRow ? amt(closeRow[p.col]) : null;
      if (emi === null && closing === null) continue;
      const pid = periodId.get(p.label)!;
      await db.insert(accountsLoanCells).values({ loanId, periodId: pid, emi, closingBalance: closing })
        .onConflictDoUpdate({ target: [accountsLoanCells.loanId, accountsLoanCells.periodId], set: { emi, closingBalance: closing, updatedAt: new Date() } });
      nCells += 1;
    }
  }

  console.log(`Loans: ${periodDefs.length} periods · ${nLoans} loans · ${nCells} cells (EMI block @R${emiHdr + 1}, closing block @R${closeHdr + 1}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
