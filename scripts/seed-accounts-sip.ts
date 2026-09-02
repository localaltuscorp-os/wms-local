// Seed Accounts · SIP Tracker (section 6) from sheet tab "6. SIP" (the SIP /
// Mutual-Funds block: header row 5, data rows 6-16). FY 2025-26. Idempotent by
// (fy, code). Month columns 8-19 = Apr 25 … Mar 26.
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-sip.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsSipItems, accountsSipMonths } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";
import { parseAmount } from "@/lib/accounts/amounts";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const FY = 2025;
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]; // cols 8..19 → these months

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
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("6. SIP!A6:U16")}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const rows = ((await res.json()) as { values?: string[][] }).values ?? [];

  let nItems = 0, nMonths = 0, sort = 0;
  for (const row of rows) {
    const fund = clean(row[2]);
    const code = clean(row[0]);
    if (!fund || (row[5] ?? "").trim().toLowerCase() === "total") continue;
    sort += 1;

    const values = {
      fyStartYear: FY, code, entity: clean(row[1]), fundName: fund, location: clean(row[3]),
      sipDate: clean(row[4]), type: clean(row[5]), amount: amt(row[6]), sortOrder: sort,
    };

    let itemId: string | undefined;
    if (code) {
      const [ex] = await db.select({ id: accountsSipItems.id }).from(accountsSipItems)
        .where(and(eq(accountsSipItems.fyStartYear, FY), eq(accountsSipItems.code, code))).limit(1);
      if (ex) { await db.update(accountsSipItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsSipItems.id, ex.id)); itemId = ex.id; }
    }
    if (!itemId) { const [ins] = await db.insert(accountsSipItems).values(values).returning({ id: accountsSipItems.id }); itemId = ins!.id; }
    nItems += 1;

    for (let i = 0; i < 12; i++) {
      const amount = amt(row[8 + i]);
      if (amount === null) continue;
      const month = FY_MONTHS[i]!;
      await db.insert(accountsSipMonths).values({ itemId, month, amount })
        .onConflictDoUpdate({ target: [accountsSipMonths.itemId, accountsSipMonths.month], set: { amount, updatedAt: new Date() } });
      nMonths += 1;
    }
  }
  console.log(`SIP: seeded ${nItems} funds · ${nMonths} month-amounts (FY ${FY}-${(FY + 1) % 100}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
