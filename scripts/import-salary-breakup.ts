// Import Salary_Breakup.xlsx AS-IS into salary_breakup (applies mig 0099 first).
//   pnpm tsx --env-file=.env.local scripts/import-salary-breakup.ts
import { readFileSync } from "node:fs";
import postgres from "postgres";
import * as XLSX from "xlsx";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

const numOrNull = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const num0 = (v: unknown): number => numOrNull(v) ?? 0;
const txt = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
/** Excel serial → 'YYYY-MM-01' (month bucket). */
function monthOf(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function main() {
  // 1) migration
  await sql.unsafe(`create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now());`);
  await sql.unsafe(readFileSync("db/migrations/0099_salary_breakup.sql", "utf8"));
  await sql.unsafe(`insert into __schema_applied (filename) values ('0099_salary_breakup.sql') on conflict do nothing`);

  // 2) employee name → id
  const emps = (await sql`select id, name from employees`) as unknown as { id: string; name: string }[];
  const idByName = new Map(emps.map((e) => [norm(e.name), e.id]));

  // 3) rows
  const wb = XLSX.readFile("Salary_Breakup.xlsx");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: "" });

  let imported = 0, matched = 0, unmatched: string[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]!;
    const name = txt(r[3]);
    const monthSerial = r[2];
    if (!name || typeof monthSerial !== "number") continue;
    const month = monthOf(monthSerial);
    const empId = idByName.get(norm(name)) ?? null;
    if (empId) matched++; else unmatched.push(name);

    await sql`
      insert into salary_breakup (
        sr_no, fy, month, employee_name, employee_id, designation, company_name,
        present, holiday, weekly_off, poh_full, poh_half, half_day, absent,
        days_in_month, total_days_worked, set_off, cf, final_working_days,
        annual_ctc, monthly_ctc, payable_after_leave, pt, payable_after_pt,
        advance, previous_pending, final_payment, salary_given, remarks, manan_remarks
      ) values (
        ${numOrNull(r[0])}, ${txt(r[1])}, ${month}, ${name}, ${empId}, ${txt(r[4])}, ${txt(r[5])},
        ${num0(r[6])}, ${num0(r[7])}, ${num0(r[8])}, ${num0(r[9])}, ${num0(r[10])}, ${num0(r[11])}, ${num0(r[12])},
        ${num0(r[13])}, ${num0(r[14])}, ${numOrNull(r[15])}, ${numOrNull(r[16])}, ${num0(r[17])},
        ${num0(r[18])}, ${num0(r[19])}, ${num0(r[20])}, ${num0(r[21])}, ${num0(r[22])},
        ${num0(r[23])}, ${num0(r[24])}, ${num0(r[25])}, ${numOrNull(r[26])}, ${txt(r[27])}, ${txt(r[28])}
      )
      on conflict (employee_name, month) do update set
        sr_no=excluded.sr_no, fy=excluded.fy, employee_id=excluded.employee_id,
        designation=excluded.designation, company_name=excluded.company_name,
        present=excluded.present, holiday=excluded.holiday, weekly_off=excluded.weekly_off,
        poh_full=excluded.poh_full, poh_half=excluded.poh_half, half_day=excluded.half_day, absent=excluded.absent,
        days_in_month=excluded.days_in_month, total_days_worked=excluded.total_days_worked,
        set_off=excluded.set_off, cf=excluded.cf, final_working_days=excluded.final_working_days,
        annual_ctc=excluded.annual_ctc, monthly_ctc=excluded.monthly_ctc,
        payable_after_leave=excluded.payable_after_leave, pt=excluded.pt, payable_after_pt=excluded.payable_after_pt,
        advance=excluded.advance, previous_pending=excluded.previous_pending, final_payment=excluded.final_payment,
        salary_given=excluded.salary_given, remarks=excluded.remarks, manan_remarks=excluded.manan_remarks,
        imported_at=now()
    `;
    imported++;
  }
  const mRows = (await sql`select array_agg(distinct to_char(month,'Mon-YY')) as months from salary_breakup`) as unknown as { months: string[] }[];
  console.log(`✓ imported ${imported} rows · matched ${matched} to employees · ${new Set(unmatched).size} name(s) unmatched`);
  if (unmatched.length) console.log("  unmatched:", [...new Set(unmatched)].join(", "));
  console.log("  months:", mRows[0]?.months?.join(", "));
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
