// Seed the Accounts · Due Dates Checklist (section 5) from the master sheet tab
// "5. Due Date". Idempotent: items keyed by code (S. No.) — re-running updates
// in place. Header is row 6; data starts row 7.
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-due.ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsDueItems } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const TAB = "5. Due Date";

function clean(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s ? s : null;
}

async function main() {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const range = encodeURIComponent(`${TAB}!A7:S80`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = ((await res.json()) as { values?: string[][] }).values ?? [];

  let count = 0;
  let sort = 0;
  for (const row of rows) {
    const compliance = clean(row[2]);
    if (!compliance) continue;
    sort += 1;
    const code = clean(row[0]);
    const values = {
      code,
      area: clean(row[1]),
      compliance,
      frequency: clean(row[3]),
      ecs: clean(row[4]),
      ecsFrom: clean(row[5]),
      statementPeriod: clean(row[6]),
      statementDate: clean(row[7]),
      dueDate: clean(row[8]),
      softCopyAutoEmail: clean(row[9]),
      hardCopy: clean(row[10]),
      softCopy: clean(row[11]),
      tallyEntry: clean(row[12]),
      balanceTally: clean(row[13]),
      paidDate: clean(row[14]),
      paidAmt: clean(row[15]),
      intFinChgs: clean(row[16]),
      chgReversed: clean(row[17]),
      notes: clean(row[18]),
      sortOrder: sort,
    };

    let existing: { id: string } | undefined;
    if (code) {
      [existing] = await db
        .select({ id: accountsDueItems.id })
        .from(accountsDueItems)
        .where(eq(accountsDueItems.code, code))
        .limit(1);
    }
    if (existing) {
      await db.update(accountsDueItems).set({ ...values, updatedAt: new Date() }).where(eq(accountsDueItems.id, existing.id));
    } else {
      await db.insert(accountsDueItems).values(values);
    }
    count += 1;
  }
  console.log(`Seeded ${count} due-date items.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
