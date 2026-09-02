// Update Accounts · Weekly Checklist from "weekly checklist.xlsx".
// Upserts the W1.. item definitions (by code) and seeds the per-week completion
// grid. Each dated week column (row 3, e.g. "13/4 to 18/4") is mapped to a
// (year, month, week-of-month) cell by its END date — which lines the source
// weeks up cleanly with the app's day-bucket weeks. FY context: Jul-Dec → 2025,
// Jan-Jun → 2026. Idempotent (items by code, checks by (item,yr,mth,wk)).
//
//   pnpm tsx scripts/seed-accounts-weekly-update.ts
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { accountsWeeklyItems, accountsWeeklyChecks } from "@/db/schema";
import { WEEKLY_CHECK_STATUSES, weekNoForDay } from "@/lib/accounts/weekly";

const FILE = "weekly checklist.xlsx";
const FIRST_WK_COL = 9; // columns 9..N are the weekly cells

function clean(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s ? s : null;
}
function normStatus(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const hit = (WEEKLY_CHECK_STATUSES as readonly string[]).find((x) => x.toLowerCase() === s.toLowerCase());
  return hit ?? null;
}
/** Parse "D/M to D/M" (or "D/M") → the END day & month. */
function endDayMonth(label: string): { day: number; month: number } | null {
  const parts = label.split(/to/i);
  const last = (parts[parts.length - 1] ?? "").trim();
  const m = last.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;
  return { day: parseInt(m[1]!, 10), month: parseInt(m[2]!, 10) };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" });

  // Row 3 (index 2) holds the week date-ranges; row 4 (index 3) the field header.
  const weekRow = rows[2] ?? [];
  const headerRow = rows[3] ?? [];
  const lastCol = Math.max(weekRow.length, headerRow.length);

  // Build the week-column → (year, month, week) map from the END date.
  const weekCols: Array<{ col: number; year: number; month: number; week: number; label: string }> = [];
  for (let c = FIRST_WK_COL; c < lastCol; c++) {
    const label = clean(weekRow[c]);
    if (!label) continue;
    const dm = endDayMonth(label);
    if (!dm) continue;
    const year = dm.month >= 7 ? 2025 : 2026;
    weekCols.push({ col: c, year, month: dm.month, week: weekNoForDay(dm.day), label });
  }

  let nItems = 0, nChecks = 0, sort = 0;
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i]!;
    const code = clean(row[0]);
    const title = clean(row[1]);
    if (!code || !title) continue; // skip blank W27..W30
    sort += 1;

    const values = {
      code, title,
      deadline: clean(row[2]),
      category: clean(row[3]),
      responsiblePerson: clean(row[4]),
      accountsNotes: clean(row[5]),
      mananNotes: clean(row[6]),
      fileLink: clean(row[7]),
      frequency: clean(row[8]),
      sortOrder: sort,
    };

    const [ex] = await db.select({ id: accountsWeeklyItems.id }).from(accountsWeeklyItems)
      .where(eq(accountsWeeklyItems.code, code)).limit(1);
    let itemId: string;
    if (ex) { await db.update(accountsWeeklyItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsWeeklyItems.id, ex.id)); itemId = ex.id; }
    else { const [ins] = await db.insert(accountsWeeklyItems).values(values).returning({ id: accountsWeeklyItems.id }); itemId = ins!.id; }
    nItems += 1;

    for (const wc of weekCols) {
      const status = normStatus(row[wc.col]);
      if (!status) continue;
      await db.insert(accountsWeeklyChecks)
        .values({ itemId, periodYear: wc.year, periodMonth: wc.month, weekNo: wc.week, status })
        .onConflictDoUpdate({
          target: [accountsWeeklyChecks.itemId, accountsWeeklyChecks.periodYear, accountsWeeklyChecks.periodMonth, accountsWeeklyChecks.weekNo],
          set: { status, updatedAt: new Date() },
        });
      nChecks += 1;
    }
  }

  console.log(`Weekly: ${nItems} items upserted · ${nChecks} week-checks across ${weekCols.length} columns.`);
  console.log("Months covered:", [...new Set(weekCols.map((w) => `${w.month}/${w.year}`))].join(", "));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
