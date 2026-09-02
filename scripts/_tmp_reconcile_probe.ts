import { db } from "../lib/db";
import { employees, salaryProfiles, salaryRuns } from "../db/schema";
import { eq } from "drizzle-orm";
import { SALARY_NAME_ALIASES } from "../lib/salary/profile-sheet";

// June-2026 Salary Breakup rows the user pasted (daysInMonth=30).
// [name, annualCtc|null, payableDays, sheetNet|null]
const JUNE: Array<[string, number | null, number, number | null]> = [
  ["Dattaram Kap", 228000, 28, 17733],
  ["Parvez Khan", 300000, 20, 16667],
  ["Jeevan Bharambe", 456000, 28, 35467],
  ["Ruchita Ambre", 624000, 20, 34667],
  ["Rohan Chowdhary", 528000, 29, 42533],
  ["Dhanshree Shigvan", 300000, 15, 12500],
  ["Rutvisha Mehta", 360000, 26.5, 26500],
  ["Anand Singh", 576000, 15.5, 24800],
  ["Dhruv Javeri", 90000, 23, 5750],
  ["Prakash Kumavat", 204000, 28, 15867],
  ["Himanshu Lad", 360000, 20, 20000],
  ["Siddhesh Walve", 276000, 27, 20700],
  ["Mishtie Kanani", 72000, 27, 5400],
  ["Pratham Rajendra Medhekar", 72000, 26.5, 5300],
  ["Pukharaj Munilal Suthar", 72000, 20, 4000],
  ["Siddhi Rajendra Lakade", 72000, 17, 3400],
  ["Hitesh Sandeep Vichare", 72000, 17, 3400],
  ["Satish  Sonawane", 600000, 15, 25000],
  ["Yug   verma", 120000, 27, 9000],
  ["Shreya Shukla", 72000, 28, 5600],
  ["Shreya Randhe", 72000, 28, 5600],
  ["Hardik", 72000, 29.5, 5900],
  ["Suresh Yadav", 72000, 29, 5800],
  ["Krish Maheshwari", 72000, 27, 5400],
  ["Kripsha joshi", 72000, 25, 5000],
  ["Sanket Thorat", null, 17, null],
  ["Kiran", null, 18, null],
  ["Pratik Patil", 72000, 20, 4000],
  ["Sayyad Daniyal", 72000, 24, 4800],
  ["Tanay Kaul", null, 26, null],
  ["Atul Asthane", 72000, 21, 4200],
  ["Proveeka Makwana", 72000, 21, 4200],
  ["Vinayak Ghadge", 72000, 9, 1800],
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function ourNet(annualCtc: number, payable: number, daysInMonth: number): number {
  // engine parity: pt=0 (exempt), tds=0, advances=0, no late deduction
  return Math.round((annualCtc / 12 / daysInMonth) * payable);
}

async function main() {
  const emps = await db
    .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
    .from(employees);
  const byNorm = new Map(emps.map((e) => [norm(e.name), e]));

  const profs = await db.select().from(salaryProfiles);
  const profByEmp = new Map(profs.map((p) => [p.employeeId, p]));

  const runs = await db.select().from(salaryRuns);
  const runsByMonth = new Map<string, Set<string>>();
  for (const r of runs) {
    if (!runsByMonth.has(r.month)) runsByMonth.set(r.month, new Set());
    runsByMonth.get(r.month)!.add(r.employeeId);
  }
  console.log(`Employees: ${emps.length} (active ${emps.filter((e) => e.isActive).length})`);
  console.log(`Salary profiles: ${profs.length}`);
  console.log(`Existing runs — 2026-06: ${runsByMonth.get("2026-06")?.size ?? 0}, 2026-07: ${runsByMonth.get("2026-07")?.size ?? 0}\n`);

  let matched = 0, unmatched = 0, ctcOk = 0, ctcMismatch = 0, ctcMissing = 0, netOk = 0, netBad = 0;
  const unmatchedNames: string[] = [];
  console.log("SHEET NAME".padEnd(28), "MATCH", "APP CTC", "SHEET CTC", "OURNET", "SHEETNET");
  for (const [rawName, ctc, payable, sheetNet] of JUNE) {
    const aliased = SALARY_NAME_ALIASES[rawName.replace(/\s+/g, " ").trim()] ?? rawName;
    const emp = byNorm.get(norm(aliased)) ?? byNorm.get(norm(rawName));
    if (!emp) { unmatched++; unmatchedNames.push(rawName); console.log(rawName.padEnd(28), "NO-MATCH"); continue; }
    matched++;
    const prof = profByEmp.get(emp.id);
    const appCtc = prof ? Number(prof.annualCtc) : null;
    if (appCtc == null) ctcMissing++;
    else if (ctc != null && appCtc === ctc) ctcOk++;
    else ctcMismatch++;
    let ourN: number | null = null;
    if (ctc != null) { ourN = ourNet(ctc, payable, 30); if (ourN === sheetNet) netOk++; else netBad++; }
    console.log(
      rawName.padEnd(28),
      "OK".padEnd(5),
      String(appCtc ?? "-").padStart(8),
      String(ctc ?? "-").padStart(9),
      String(ourN ?? "-").padStart(7),
      String(sheetNet ?? "-").padStart(8),
      ourN != null && ourN !== sheetNet ? "  <-- NET MISMATCH" : "",
    );
  }
  console.log(`\nMatched ${matched}/${JUNE.length}, unmatched ${unmatched}`);
  console.log(`CTC: ok ${ctcOk}, mismatch ${ctcMismatch}, missing-profile ${ctcMissing}`);
  console.log(`Net (formula vs sheet): ok ${netOk}, bad ${netBad}`);
  if (unmatchedNames.length) console.log(`\nUNMATCHED (not in app employees):\n - ${unmatchedNames.join("\n - ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
