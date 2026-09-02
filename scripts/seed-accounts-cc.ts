// Seed the Accounts · Credit Cards Master (section 4/12) from the master sheet
// tabs "4. CC Master 25-26" (FY 2025-26) and "12. CC Master 26-27" (FY 2026-27).
// Layout: 9 static card columns (0-8), then 12 month blocks of 9 fields each
// (Apr→Mar) starting col 9. Idempotent: cards keyed by (fy, code).
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-cc.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsCcCards, accountsCcMonths } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const TABS: Array<{ tab: string; fy: number }> = [
  { tab: "4. CC Master 25-26", fy: 2025 },
  { tab: "12. CC Master 26-27", fy: 2026 },
];

// Financial-year month order (Apr→Mar) → block index maps to this calendar month.
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const STATIC_COLS = 9; // card fields occupy cols 0-8
const BLOCK = 9; // fields per month

function clean(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s ? s : null;
}

async function fetchRows(tab: string): Promise<string[][]> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const range = encodeURIComponent(`${tab}!A5:DZ80`); // data rows (header is row 4)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${tab} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

async function seedTab(tab: string, fy: number): Promise<{ cards: number; months: number }> {
  const rows = await fetchRows(tab);
  let nCards = 0;
  let nMonths = 0;
  let sort = 0;

  for (const row of rows) {
    const cardName = clean(row[2]);
    if (!cardName) continue;
    sort += 1;
    const code = clean(row[0]);

    const cardValues = {
      fyStartYear: fy,
      code,
      entityName: clean(row[1]),
      cardName,
      ecs: clean(row[3]),
      ecsFrom: clean(row[4]),
      stmtPeriod: clean(row[5]),
      stmtStartDay: clean(row[6]),
      dueDay: clean(row[7]),
      softCopyAutoEmail: clean(row[8]),
      sortOrder: sort,
    };

    let cardId: string | undefined;
    if (code) {
      const [existing] = await db
        .select({ id: accountsCcCards.id })
        .from(accountsCcCards)
        .where(and(eq(accountsCcCards.fyStartYear, fy), eq(accountsCcCards.code, code)))
        .limit(1);
      if (existing) {
        await db.update(accountsCcCards).set({ ...cardValues, updatedAt: new Date() }).where(eq(accountsCcCards.id, existing.id));
        cardId = existing.id;
      }
    }
    if (!cardId) {
      const [inserted] = await db.insert(accountsCcCards).values(cardValues).returning({ id: accountsCcCards.id });
      cardId = inserted!.id;
    }
    nCards += 1;

    // 12 month blocks.
    for (let i = 0; i < 12; i++) {
      const base = STATIC_COLS + i * BLOCK;
      const rec = {
        hardCopy: clean(row[base + 0]),
        googleDrive: clean(row[base + 1]),
        tallyEntry: clean(row[base + 2]),
        balanceTally: clean(row[base + 3]),
        ccPaidDate: clean(row[base + 4]),
        ccPaidAmt: clean(row[base + 5]),
        intFinChgs: clean(row[base + 6]),
        chgReversed: clean(row[base + 7]),
        notes: clean(row[base + 8]),
      };
      if (Object.values(rec).every((v) => v === null)) continue;
      const month = FY_MONTHS[i]!;
      await db
        .insert(accountsCcMonths)
        .values({ cardId, month, ...rec })
        .onConflictDoUpdate({
          target: [accountsCcMonths.cardId, accountsCcMonths.month],
          set: { ...rec, updatedAt: new Date() },
        });
      nMonths += 1;
    }
  }
  return { cards: nCards, months: nMonths };
}

async function main() {
  for (const { tab, fy } of TABS) {
    try {
      const r = await seedTab(tab, fy);
      console.log(`${tab} (FY${fy}): ${r.cards} cards · ${r.months} month-records`);
    } catch (e) {
      console.error(`${tab}:`, (e as Error).message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
