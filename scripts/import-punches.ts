// @ts-nocheck
// Attendance integration: (a) seed company holidays from the HR sheet, and
// (b) synthesize attendance_logs punches from the sheet's present days up to
// 2026-07-10 (clock-in 10:30, clock-out 19:30; half-days out 13:00), so the
// app's punch grader reproduces the sheet. source="admin" → fully reversible
// (delete where source='admin' and reason='sheet_import').
//   dry:   pnpm tsx --env-file=.env.local scripts/import-punches.ts
//   apply: pnpm tsx --env-file=.env.local scripts/import-punches.ts --apply
import { db } from "@/lib/db";
import { attendanceLogs, holidays } from "@/db/schema";
import { zonedWallClockToUtc } from "@/lib/attendance/backfill";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const TZ = "Asia/Kolkata";
const CUTOFF = "2026-07-10";
const arr = (r) => (Array.isArray(r) ? r : r?.rows ?? []);

// present-day code → { inHHmm, outHHmm } ; codes not listed get no punch
function timesFor(code) {
  const c = String(code).trim().toUpperCase();
  if (c === "P" || c === "H-P" || c === "P.H" || c === "P-N.V") return ["10:30", "19:30"]; // full
  if (c === "H/D" || c === "H-H/D") return ["10:30", "13:00"]; // half (150 min < 300)
  return null;
}

(async () => {
  // ── (a) holidays: dates ≥5 employees marked 'H' ──────────────────────────
  const holRows = arr(await db.execute(sql`
    select date, count(*) n from attendance_sheet_day
    where status_code ilike 'H' and date is not null and date <= ${CUTOFF}
    group by date having count(*) >= 5 order by date`));
  console.log(`holidays to seed: ${holRows.length} dates`);

  // ── (b) present-day punches ──────────────────────────────────────────────
  const days = arr(await db.execute(sql`
    select employee_id eid, date, status_code code
    from attendance_sheet_day
    where employee_id is not null and date is not null and date <= ${CUTOFF}
    order by employee_id, date`));
  const punchDays = days.filter((d) => timesFor(d.code));
  console.log(`present-ish days: ${punchDays.length} → ${punchDays.length * 2} punch rows`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply)"); process.exit(0); }

  // seed holidays (idempotent on unique holiday_date)
  let hn = 0;
  for (const h of holRows) {
    await db.insert(holidays)
      .values({ holidayDate: h.date, label: "Holiday (HR sheet)", isActive: true })
      .onConflictDoNothing();
    hn++;
  }
  console.log(`✓ seeded ${hn} holidays`);

  // synth punches in chunks (idempotent on (employee_id, log_date, kind))
  const values = [];
  for (const d of punchDays) {
    const [tin, tout] = timesFor(d.code);
    values.push({ employeeId: d.eid, logDate: d.date, kind: "in", loggedAt: zonedWallClockToUtc(d.date, tin, TZ), source: "admin", reason: "sheet_import", verifyMethod: "none" });
    values.push({ employeeId: d.eid, logDate: d.date, kind: "out", loggedAt: zonedWallClockToUtc(d.date, tout, TZ), source: "admin", reason: "sheet_import", verifyMethod: "none" });
  }
  const CHUNK = 500;
  let pn = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    await db.insert(attendanceLogs).values(values.slice(i, i + CHUNK)).onConflictDoNothing();
    pn += Math.min(CHUNK, values.length - i);
    if (i % 2500 === 0) console.log(`  …${pn}/${values.length}`);
  }
  console.log(`✓ inserted ${pn} synthetic punch rows`);
  process.exit(0);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
