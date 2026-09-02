// Import Accounts · Cash Withdrawal Tracker from the uploaded "cash withdrawl.xlsx".
// TWO tables: withdrawals (S.No · Entity · Name on Cheque · Cheque No · Chq Date
// · Amount · Apr..Mar) and per-entity caps (Entity · Max Allowed). Month cols
// 6-17 = Apr..Mar (FY 2025-26). ₹0 / blank months skipped. Cols 18+ are a weekly
// "Done" overlay we don't model. Idempotent: items by (fy,code), caps by (fy,entity).
//
//   pnpm tsx scripts/import-accounts-cash-xlsx.ts
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { accountsCashItems, accountsCashMonths, accountsCashLimits } from "@/db/schema";
import { parseAmount } from "@/lib/accounts/amounts";

const FILE = "cash withdrawl.xlsx";
const FY = 2025;
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]; // cols 6..17

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
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" });

  const wHdr = rows.findIndex((r) => clean(r[0]) === "S. No." && clean(r[2]) === "Name on Cheque");
  const cHdr = rows.findIndex((r) => clean(r[0]) === "S. No." && clean(r[2]) === "Max Allowed");
  if (wHdr < 0 || cHdr < 0) throw new Error("Could not locate the withdrawals / caps headers.");

  // ── Withdrawals ──
  let nItems = 0, nMonths = 0, sort = 0;
  for (let i = wHdr + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const entity = clean(row[1]);
    if ((entity ?? "").toLowerCase() === "grand total") break;
    if (i >= cHdr) break;
    const chequeNo = clean(row[3]);
    const amount = amt(row[5]);
    const monthVals = FY_MONTHS.map((_, k) => parseAmount(row[6 + k] ?? null));
    const hasMonth = monthVals.some((v) => v !== null && v !== 0);
    if (!chequeNo && amount === null && !hasMonth) continue; // entity-only divider / blank row
    sort += 1;
    const code = clean(row[0]);

    const values = {
      fyStartYear: FY, code, entity, nameOnCheque: clean(row[2]), chequeNo,
      chqDate: clean(row[4]), amount, sortOrder: sort,
    };
    let itemId: string | undefined;
    if (code) {
      const [ex] = await db.select({ id: accountsCashItems.id }).from(accountsCashItems)
        .where(and(eq(accountsCashItems.fyStartYear, FY), eq(accountsCashItems.code, code))).limit(1);
      if (ex) { await db.update(accountsCashItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsCashItems.id, ex.id)); itemId = ex.id; }
    }
    if (!itemId) { const [ins] = await db.insert(accountsCashItems).values(values).returning({ id: accountsCashItems.id }); itemId = ins!.id; }
    nItems += 1;

    for (let k = 0; k < 12; k++) {
      const v = monthVals[k];
      if (v === null || v === 0) continue;
      await db.insert(accountsCashMonths).values({ itemId, month: FY_MONTHS[k]!, amount: String(v) })
        .onConflictDoUpdate({ target: [accountsCashMonths.itemId, accountsCashMonths.month], set: { amount: String(v), updatedAt: new Date() } });
      nMonths += 1;
    }
  }

  // ── Caps ──
  let nCaps = 0, csort = 0;
  for (let i = cHdr + 1; i < rows.length; i++) {
    const entity = clean(rows[i]![1]);
    if (!entity || entity.toLowerCase() === "grand total") {
      if (entity && entity.toLowerCase() === "grand total") break;
      continue;
    }
    csort += 1;
    const values = { fyStartYear: FY, code: clean(rows[i]![0]), entity, maxAllowed: amt(rows[i]![2]), sortOrder: csort };
    const [ex] = await db.select({ id: accountsCashLimits.id }).from(accountsCashLimits)
      .where(and(eq(accountsCashLimits.fyStartYear, FY), eq(accountsCashLimits.entity, entity))).limit(1);
    if (ex) await db.update(accountsCashLimits).set({ ...values, updatedAt: new Date() }).where(eq(accountsCashLimits.id, ex.id));
    else await db.insert(accountsCashLimits).values(values);
    nCaps += 1;
  }

  console.log(`Cash: ${nItems} withdrawals · ${nMonths} month-amounts · ${nCaps} entity caps (FY ${FY}-${(FY + 1) % 100}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
