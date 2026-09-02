// @ts-nocheck
// Import the "till-now" onboarding form responses from the Google Sheet into
// onboarding_submissions. Attachments in the sheet are Google Drive links →
// stored as { link } refs. Matches each response to an employee by name.
//   dry-run:  pnpm tsx --env-file=.env.local scripts/import-onboarding.ts
//   apply:    pnpm tsx --env-file=.env.local scripts/import-onboarding.ts --apply
import { readSheetValuesReadonly } from "@/lib/google/read-sheet";
import { db } from "@/lib/db";
import { onboardingSubmissions, employees } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

const SID = "1tLcFc5vJXT6ep8dsvHWAUDm5mcAJM_PX0G9jcJnT6Kk";
const APPLY = process.argv.includes("--apply");

const TEXT = {
  firstName: 1, middleName: 2, lastName: 3, phone: 4,
  lastCtc: 6, lastCompanyName: 9, lastCompanyAddress: 10, lastDesignation: 11,
  fatherName: 12, fatherPhone: 13, motherName: 14, motherPhone: 15,
  brotherName: 16, brotherPhone: 17, sisterName: 18, sisterPhone: 19,
  ref1Name: 20, ref1Phone: 21, ref2Name: 22, ref2Phone: 23,
  permAddr1: 24, permAddr2: 25, permAddr3: 26, permCity: 27, permState: 28, permPincode: 29, permLandmark: 30,
  sameAsPermanent: 31, currAddr1: 32, currAddr2: 33, currAddr3: 34, currCity: 35, currState: 36, currPincode: 37, currLandmark: 38,
  aadharNo: 39, panNo: 41,
  bankAccountName: 43, bankAccountNo: 44, ifsCode: 45, micrCode: 46, branchAddress: 47, branchCity: 48, branchPincode: 49,
};
const FILES = {
  selfie: 5, lastSalaryCertificate: 7, lastSalaryBankProof: 8,
  aadharCopy: 40, panCopy: 42, cancelledCheque: 50, latestSelfie: 52, addressProof: 53,
};

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const clean = (s) => String(s ?? "").trim();

(async () => {
  const rows = await readSheetValuesReadonly(SID, "A1:BZ400");
  const data = rows.slice(1).filter((r) => r && clean(r[1])); // has a first name

  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const byName = new Map();
  for (const e of emps) {
    byName.set(norm(e.name), e.id);
    const parts = norm(e.name).split(" ");
    if (parts.length >= 2) byName.set(`${parts[0]} ${parts[parts.length - 1]}`, e.id); // first+last
  }

  // sheet-name → employee-name aliases for active staff whose form name drifted
  const ALIAS = new Map([
    ["pratham medhe", "pratham medhekar"],
    ["pratik patil patil", "pratik patil"],
  ]);
  const resolve = (r) => {
    const full = norm(`${clean(r[1])} ${clean(r[2])} ${clean(r[3])}`);
    const fl = norm(`${clean(r[1])} ${clean(r[3])}`);
    const aliased = ALIAS.get(full) ?? ALIAS.get(fl);
    return byName.get(full) ?? byName.get(fl) ?? (aliased ? byName.get(aliased) : null) ?? null;
  };

  // last row per employee wins (resubmissions)
  const byEmp = new Map();
  const unmatched = [];
  for (const r of data) {
    const eid = resolve(r);
    const label = `${clean(r[1])} ${clean(r[3])}`.trim();
    if (!eid) { unmatched.push(label); continue; }
    byEmp.set(eid, { r, label });
  }

  console.log(`sheet responses: ${data.length}`);
  console.log(`matched to employees: ${byEmp.size}`);
  console.log(`unmatched: ${unmatched.length}${unmatched.length ? " → " + [...new Set(unmatched)].join(", ") : ""}`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply to write)"); process.exit(0); }

  let wrote = 0;
  for (const [eid, { r }] of byEmp) {
    const fields = {};
    for (const [k, i] of Object.entries(TEXT)) {
      let v = clean(r[i]);
      if (k === "sameAsPermanent") v = /^y/i.test(v) ? "YES" : v ? "NO" : "";
      fields[k] = v;
    }
    const files = {};
    for (const [k, i] of Object.entries(FILES)) {
      const v = clean(r[i]);
      if (/^https?:\/\//i.test(v)) files[k] = { link: v.slice(0, 1000), fileName: v.slice(0, 200) };
    }
    await db.insert(onboardingSubmissions).values({
      employeeId: eid, fields, files, status: "submitted", submittedAt: new Date(),
    }).onConflictDoUpdate({
      target: onboardingSubmissions.employeeId,
      set: { fields, files, status: "submitted", updatedAt: new Date() },
    });
    wrote++;
  }
  console.log(`\n✓ imported ${wrote} onboarding submissions`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
