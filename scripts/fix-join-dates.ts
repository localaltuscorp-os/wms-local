// @ts-nocheck
// Derive each employee's join date from the attendance sheet: the first day
// they appear PRESENT. Fixes wrong DB join dates (e.g. Dattaram 6 Jul → 20 Apr)
// so the punch grader stops zeroing pre-join attendance. Reversible (prints old
// values). Only touches active employees who have present days in the sheet.
//   dry:   pnpm tsx --env-file=.env.local scripts/fix-join-dates.ts
//   apply: pnpm tsx --env-file=.env.local scripts/fix-join-dates.ts --apply
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
const APPLY = process.argv.includes("--apply");
const arr = (r) => (Array.isArray(r) ? r : r?.rows ?? []);

(async () => {
  // first present day per employee (present-ish codes only)
  const firsts = arr(await db.execute(sql`
    select a.employee_id eid, min(a.date) first_present
    from attendance_sheet_day a
    where a.employee_id is not null and a.date is not null
      and (a.status_code ilike 'P' or a.status_code ilike 'H/D' or a.status_code ilike 'H-P%'
           or a.status_code ilike 'H-H/D' or a.status_code ilike 'P.H' or a.status_code ilike 'P-N.V')
    group by a.employee_id`));

  const emps = arr(await db.execute(sql`select id, name, joined_at::date jd, is_active from employees`));
  const byId = new Map(emps.map((e) => [e.id, e]));

  const changes = [];
  for (const f of firsts) {
    const e = byId.get(f.eid);
    if (!e || !e.is_active) continue;
    const cur = e.jd ? String(e.jd) : null;
    const next = String(f.first_present);
    if (cur !== next) changes.push({ id: f.eid, name: e.name, from: cur, to: next });
  }

  console.log(`${changes.length} active employees would get a corrected join date:`);
  changes.slice(0, 40).forEach((c) => console.log(`  ${c.name}: ${c.from ?? "(none)"} → ${c.to}`));

  if (!APPLY) { console.log("\n(dry-run — pass --apply)"); process.exit(0); }
  for (const c of changes) {
    await db.execute(sql`update employees set joined_at = ${c.to}::date where id = ${c.id}`);
  }
  console.log(`\n✓ updated ${changes.length} join dates`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
