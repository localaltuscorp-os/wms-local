// Seed the Accounts · Quarter/Month/Annual Checklist (section 3) from the master
// sheet tab "3. Mth Qtr Annual Checklist". Idempotent: items are keyed by their
// code (M1, M2, …) — re-running updates in place rather than duplicating. Month
// cells are mapped to the financial-year model (Apr→Mar).
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-monthly.ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsMonthlyItems, accountsMonthlyChecks } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const TAB = "3. Mth Qtr Annual Checklist";

// Column index (0-based) → which (month, fyStartYear) it represents. The sheet
// shows FY 2025-26 (Aug→Mar) then begins FY 2026-27 (Apr, May 2026).
const MONTH_COLS: Array<{ col: number; month: number; fy: number }> = [
  { col: 9, month: 8, fy: 2025 },
  { col: 10, month: 9, fy: 2025 },
  { col: 11, month: 10, fy: 2025 },
  { col: 12, month: 11, fy: 2025 },
  { col: 13, month: 12, fy: 2025 },
  { col: 14, month: 1, fy: 2025 },
  { col: 15, month: 2, fy: 2025 },
  { col: 16, month: 3, fy: 2025 },
  // col 17 is a blank separator in the sheet
  { col: 18, month: 4, fy: 2026 },
  { col: 19, month: 5, fy: 2026 },
];

/** Normalise a sheet status cell to the closed set, or null to skip. */
function normStatus(raw: string | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "done") return "Done";
  if (s === "pending") return "Pending";
  if (s === "need help" || s === "needs help") return "Need Help";
  if (s === "na" || s === "n/a" || s === "not applicable") return "Not Applicable";
  return null; // anything else (stray notes) is ignored
}

function clean(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s ? s : null;
}

async function fetchRows(): Promise<string[][]> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const range = encodeURIComponent(`${TAB}!A6:T200`); // data rows (header is row 5)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { values?: string[][] };
  return j.values ?? [];
}

async function main() {
  const rows = await fetchRows();
  let upItems = 0;
  let upChecks = 0;
  let sort = 0;

  for (const row of rows) {
    const code = clean(row[0]);
    const title = clean(row[1]);
    if (!title) continue; // skip blank/spacer rows
    sort += 1;

    const values = {
      code,
      title,
      responsiblePerson: clean(row[2]),
      deadline: clean(row[3]),
      type: clean(row[4]),
      accountsNotes: clean(row[5]),
      mananNotes: clean(row[6]),
      fileLink: clean(row[7]),
      frequency: clean(row[8]),
      sortOrder: sort,
    };

    // Upsert the item by code (fall back to a fresh insert when code is blank).
    let itemId: string | undefined;
    if (code) {
      const [existing] = await db
        .select({ id: accountsMonthlyItems.id })
        .from(accountsMonthlyItems)
        .where(eq(accountsMonthlyItems.code, code))
        .limit(1);
      if (existing) {
        await db
          .update(accountsMonthlyItems)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(accountsMonthlyItems.id, existing.id));
        itemId = existing.id;
      }
    }
    if (!itemId) {
      const [inserted] = await db
        .insert(accountsMonthlyItems)
        .values(values)
        .returning({ id: accountsMonthlyItems.id });
      itemId = inserted!.id;
    }
    upItems += 1;

    // Upsert the month cells.
    for (const mc of MONTH_COLS) {
      const status = normStatus(row[mc.col]);
      if (!status) continue;
      await db
        .insert(accountsMonthlyChecks)
        .values({ itemId, fyStartYear: mc.fy, month: mc.month, status })
        .onConflictDoUpdate({
          target: [
            accountsMonthlyChecks.itemId,
            accountsMonthlyChecks.fyStartYear,
            accountsMonthlyChecks.month,
          ],
          set: { status, updatedAt: new Date() },
        });
      upChecks += 1;
    }
  }

  console.log(`Seeded ${upItems} items · ${upChecks} month-checks.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
