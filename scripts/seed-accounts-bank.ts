// Seed Accounts · Bank Balance Tracker (section 9) from sheet tab
// "9. Bank Balance" (header row 5, data rows 6-22; skip Grand Total). FY 2026-27
// (dates are Apr 2026+). 14 dated week columns (the per-month "Difference"
// columns 8/14/19 are sheet formulas — skipped; we compute diff live).
// Idempotent by (fy, code) for items, (fy, label) for weeks.
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-bank.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsBankItems, accountsBankWeeks, accountsBankBalances } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";
import { parseAmount } from "@/lib/accounts/amounts";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const FY = 2026;

// Week label → source column index in the sheet row.
const WEEKS: Array<{ label: string; col: number }> = [
  { label: "05.04.2026", col: 3 }, { label: "12.04.2026", col: 4 }, { label: "19.04.2026", col: 5 },
  { label: "25.04.2026", col: 6 }, { label: "30.04.2026", col: 7 },
  { label: "02.05.2026", col: 9 }, { label: "09.05.2026", col: 10 }, { label: "16.05.2026", col: 11 },
  { label: "23.05.2026", col: 12 }, { label: "30.05.2026", col: 13 },
  { label: "07-06-2026", col: 15 }, { label: "13.06.2026", col: 16 }, { label: "20.06.2026", col: 17 },
  { label: "June Wk4", col: 18 },
];

function clean(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s ? s : null;
}
function amt(raw: string | undefined): string | null {
  const n = parseAmount(raw ?? null);
  return n === null ? null : String(n);
}

async function main() {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("9. Bank Balance!A6:S22")}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const rows = ((await res.json()) as { values?: string[][] }).values ?? [];

  // 1) Weeks (idempotent by label).
  const weekId = new Map<string, string>();
  let wsort = 0;
  for (const w of WEEKS) {
    wsort += 1;
    const [ex] = await db.select({ id: accountsBankWeeks.id }).from(accountsBankWeeks)
      .where(and(eq(accountsBankWeeks.fyStartYear, FY), eq(accountsBankWeeks.label, w.label))).limit(1);
    if (ex) { await db.update(accountsBankWeeks).set({ sortOrder: wsort }).where(eq(accountsBankWeeks.id, ex.id)); weekId.set(w.label, ex.id); }
    else { const [ins] = await db.insert(accountsBankWeeks).values({ fyStartYear: FY, label: w.label, sortOrder: wsort }).returning({ id: accountsBankWeeks.id }); weekId.set(w.label, ins!.id); }
  }

  // 2) Items + balances.
  let nItems = 0, nBal = 0, isort = 0;
  for (const row of rows) {
    const entity = clean(row[1]);
    if (!entity || entity.toLowerCase() === "grand total") continue;
    isort += 1;
    const code = clean(row[0]);
    const values = { fyStartYear: FY, code, entity, targetBalance: amt(row[2]), sortOrder: isort };

    let itemId: string | undefined;
    if (code) {
      const [ex] = await db.select({ id: accountsBankItems.id }).from(accountsBankItems)
        .where(and(eq(accountsBankItems.fyStartYear, FY), eq(accountsBankItems.code, code))).limit(1);
      if (ex) { await db.update(accountsBankItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsBankItems.id, ex.id)); itemId = ex.id; }
    }
    if (!itemId) { const [ins] = await db.insert(accountsBankItems).values(values).returning({ id: accountsBankItems.id }); itemId = ins!.id; }
    nItems += 1;

    for (const w of WEEKS) {
      const balance = amt(row[w.col]); // keep 0 (a real balance); only blank → null/skip
      if (balance === null) continue;
      const wid = weekId.get(w.label)!;
      await db.insert(accountsBankBalances).values({ itemId, weekId: wid, balance })
        .onConflictDoUpdate({ target: [accountsBankBalances.itemId, accountsBankBalances.weekId], set: { balance, updatedAt: new Date() } });
      nBal += 1;
    }
  }
  console.log(`Bank: ${WEEKS.length} weeks · ${nItems} accounts · ${nBal} balance cells (FY ${FY}-${(FY + 1) % 100}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
