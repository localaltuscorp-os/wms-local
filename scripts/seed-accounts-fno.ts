// Seed Accounts · FNO Income (section 8) from sheet tab "8. FNO Income" (header
// row 5, data rows 6+). FY 2025-26. Each month is a (Rs, %) pair starting col 6:
// month i Rs at col 6+2*i (% at 7+2*i — derived, so we only seed the Rs).
// Skips Total / Grand Total rows. Idempotent by (fy, code).
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-fno.ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsFnoItems, accountsFnoMonths } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";
import { parseAmount } from "@/lib/accounts/amounts";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const FY = 2025;
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

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
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("8. FNO Income!A6:AE25")}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const rows = ((await res.json()) as { values?: string[][] }).values ?? [];

  let nItems = 0, nMonths = 0, sort = 0;
  for (const row of rows) {
    const agency = clean(row[2]);
    const code = clean(row[0]);
    const lower = (agency ?? "").toLowerCase();
    if (!agency || !code || lower === "total" || lower === "grand total") continue;
    sort += 1;

    const values = {
      fyStartYear: FY, code, entity: clean(row[1]), agency, capital: amt(row[3]), sortOrder: sort,
    };

    let itemId: string | undefined;
    const [ex] = await db.select({ id: accountsFnoItems.id }).from(accountsFnoItems)
      .where(and(eq(accountsFnoItems.fyStartYear, FY), eq(accountsFnoItems.code, code))).limit(1);
    if (ex) { await db.update(accountsFnoItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsFnoItems.id, ex.id)); itemId = ex.id; }
    else { const [ins] = await db.insert(accountsFnoItems).values(values).returning({ id: accountsFnoItems.id }); itemId = ins!.id; }
    nItems += 1;

    for (let i = 0; i < 12; i++) {
      const amount = amt(row[6 + i * 2]); // Rs column of the (Rs, %) pair
      if (amount === null) continue;
      const month = FY_MONTHS[i]!;
      await db.insert(accountsFnoMonths).values({ itemId, month, amount })
        .onConflictDoUpdate({ target: [accountsFnoMonths.itemId, accountsFnoMonths.month], set: { amount, updatedAt: new Date() } });
      nMonths += 1;
    }
  }
  console.log(`FNO: seeded ${nItems} agencies · ${nMonths} month-amounts (FY ${FY}-${(FY + 1) % 100}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
