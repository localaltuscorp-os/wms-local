// Seed Accounts · Cash Withdrawal Tracker (section 10) from sheet tab
// "10. Cash Withdrawal Tracker". TWO tables:
//   • withdrawals  — header row 5, data rows 6-53 (skip dividers/placeholders &
//     the Grand Total row); month cols 6-17 = Apr..Mar FY 2025-26.
//   • per-entity caps — header row 58, data rows 59-70 (entity + Max Allowed).
// Idempotent by (fy, code) / (fy, entity). ₹0 / blank months are skipped.
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-cash.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsCashItems, accountsCashMonths, accountsCashLimits } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";
import { parseAmount } from "@/lib/accounts/amounts";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const TAB = "10. Cash Withdrawal Tracker";
const FY = 2025;
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]; // cols 6..17

function clean(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s ? s : null;
}
function amt(raw: string | undefined): string | null {
  const n = parseAmount(raw ?? null);
  return n === null ? null : String(n);
}

async function fetchRange(range: string): Promise<string[][]> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!${range}`)}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${range} ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

async function seedWithdrawals(): Promise<{ items: number; months: number }> {
  const rows = await fetchRange("A6:R53");
  let nItems = 0, nMonths = 0, sort = 0;
  for (const row of rows) {
    const entity = clean(row[1]);
    if ((entity ?? "").toLowerCase() === "grand total") continue;
    const chequeNo = clean(row[3]);
    const amount = amt(row[5]);
    const monthVals = FY_MONTHS.map((_, i) => parseAmount(row[6 + i] ?? null));
    const hasMonth = monthVals.some((v) => v !== null && v !== 0);
    // Real withdrawal = has a cheque no, a cheque amount, or a non-zero month.
    if (!chequeNo && amount === null && !hasMonth) continue;
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

    for (let i = 0; i < 12; i++) {
      const v = monthVals[i];
      if (v === null || v === 0) continue; // ₹0 / blank = no withdrawal that month
      const month = FY_MONTHS[i]!;
      await db.insert(accountsCashMonths).values({ itemId, month, amount: String(v) })
        .onConflictDoUpdate({ target: [accountsCashMonths.itemId, accountsCashMonths.month], set: { amount: String(v), updatedAt: new Date() } });
      nMonths += 1;
    }
  }
  return { items: nItems, months: nMonths };
}

async function seedLimits(): Promise<number> {
  const rows = await fetchRange("A59:E70");
  let n = 0, sort = 0;
  for (const row of rows) {
    const entity = clean(row[1]);
    if (!entity) continue;
    sort += 1;
    const values = { fyStartYear: FY, code: clean(row[0]), entity, maxAllowed: amt(row[2]), sortOrder: sort };
    const [ex] = await db.select({ id: accountsCashLimits.id }).from(accountsCashLimits)
      .where(and(eq(accountsCashLimits.fyStartYear, FY), eq(accountsCashLimits.entity, entity))).limit(1);
    if (ex) await db.update(accountsCashLimits).set({ ...values, updatedAt: new Date() }).where(eq(accountsCashLimits.id, ex.id));
    else await db.insert(accountsCashLimits).values(values);
    n += 1;
  }
  return n;
}

async function main() {
  const w = await seedWithdrawals();
  const limits = await seedLimits();
  console.log(`Cash: ${w.items} withdrawals · ${w.months} month-amounts · ${limits} entity caps (FY ${FY}-${(FY + 1) % 100}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
