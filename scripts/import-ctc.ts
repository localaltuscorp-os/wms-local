// @ts-nocheck
// Import each employee's latest CTC from the salary sheet (salary_breakup) into
// their salary_profiles, so computed salary produces real amounts.
//   dry:   pnpm tsx --env-file=.env.local scripts/import-ctc.ts
//   apply: pnpm tsx --env-file=.env.local scripts/import-ctc.ts --apply
import { db } from "@/lib/db";
import { salaryProfiles } from "@/db/schema";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const arr = (r) => (Array.isArray(r) ? r : r?.rows ?? []);

(async () => {
  // latest annual_ctc per matched employee (most recent month with a CTC > 0)
  const rows = arr(await db.execute(sql`
    select distinct on (employee_id) employee_id eid, employee_name nm, annual_ctc::numeric ctc
    from salary_breakup
    where employee_id is not null and annual_ctc::numeric > 0
    order by employee_id, month desc`));

  console.log(`${rows.length} employees with a CTC in the sheet`);
  rows.slice(0, 8).forEach((r) => console.log(`  ${r.nm}: ${Number(r.ctc).toLocaleString("en-IN")}/yr`));
  if (!APPLY) { console.log("\n(dry-run — pass --apply)"); process.exit(0); }

  let n = 0;
  for (const r of rows) {
    await db.insert(salaryProfiles)
      .values({ employeeId: r.eid, annualCtc: Number(r.ctc).toFixed(2) })
      .onConflictDoUpdate({ target: salaryProfiles.employeeId, set: { annualCtc: Number(r.ctc).toFixed(2), updatedAt: new Date() } });
    n++;
  }
  console.log(`\n✓ upserted CTC for ${n} employees`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
