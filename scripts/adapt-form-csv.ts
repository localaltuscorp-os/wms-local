#!/usr/bin/env tsx
/**
 * One-shot adapter: tasksandall.csv (Google Form response log) →
 * _reference/employees.csv + _reference/tasks.csv (the canonical shape
 * the existing legacy importer consumes).
 *
 * The form-response CSV captures task SUBMISSIONS only — there is no
 * status column, no employee directory, only names (not emails).  This
 * adapter:
 *   1. Normalises name variants ("Jeevan - Altus" / "Jeevan-Altus" → "Jeevan Bharambhe").
 *   2. Joins names → emails via the hard-coded ROSTER below (provided by
 *      Hetesh + Manan).
 *   3. Defaults missing fields: status = "not started", priority = blank.
 *   4. Drops rows that reference an unmapped name with a TBD email so
 *      the row still imports (admin can fix later via /admin/employees).
 *
 * Run:  pnpm tsx scripts/adapt-form-csv.ts
 * Then: pnpm import:legacy -- --employees-csv=_reference/employees.csv \
 *                              --tasks-csv=_reference/tasks.csv --commit
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

interface RosterEntry {
  canonicalName: string;
  email: string;
  role: "doer" | "initiator" | "both";
  isAdmin: boolean;
  department: string | null;
}

// Roster provided by Hetesh + Manan.  Keys are the lowercased name as it
// appears in the form-response CSV (including the "- Altus" variants).
// `canonicalName` is what we want stored in the employees table.
const ROSTER: Record<string, RosterEntry> = {
  // --- admins ---
  "pravin joshi":          { canonicalName: "Pravin Joshi",        email: "pravin@vpinnacle.com",                     role: "both",      isAdmin: true,  department: null },
  "manan vasa":            { canonicalName: "Manan Vasa",          email: "altus@vpinnacle.com",                      role: "both",      isAdmin: true,  department: "Altus" },
  "manan vasa - altus":    { canonicalName: "Manan Vasa",          email: "altus@vpinnacle.com",                      role: "both",      isAdmin: true,  department: "Altus" },

  // --- initiators (some also doers — set role to "both" where CSV shows both) ---
  "vardhan gharat":        { canonicalName: "Vardhan Gharat",      email: "vardhan@vpinnacle.com",                    role: "both",      isAdmin: false, department: null },
  "priyanka sane":         { canonicalName: "Priyanka Sane",       email: "priyanka@vpinnacle.com",                   role: "both",      isAdmin: false, department: null },
  "babli pandey":          { canonicalName: "Babli Pandey",        email: "babli@vpinnacle.com",                      role: "both",      isAdmin: false, department: null },
  "poonam mehta":          { canonicalName: "Poonam Mehta",        email: "poonam@vpinnacle.com",                     role: "both",      isAdmin: false, department: null },
  "jeevan - altus":        { canonicalName: "Jeevan Bharambhe",    email: "jeevanbharambhe.altuscorp@gmail.com",      role: "both",      isAdmin: false, department: "Altus" },
  "jeevan-altus":          { canonicalName: "Jeevan Bharambhe",    email: "jeevanbharambhe.altuscorp@gmail.com",      role: "both",      isAdmin: false, department: "Altus" },
  "prakash-altus":         { canonicalName: "Prakash Kumavat",     email: "prakashkumavat.altuscorp@gmail.com",       role: "initiator", isAdmin: false, department: "Altus" },

  // --- doers ---
  "shilpa pawar":          { canonicalName: "Shilpa Pawar",        email: "shilpa@vpinnacle.com",                     role: "doer",      isAdmin: false, department: null },
  "bhavika":               { canonicalName: "Bhavika",             email: "bhavika@vpinnacle.com",                    role: "doer",      isAdmin: false, department: null },

  // --- TBD: in CSV but no email provided.  Placeholder so the 12 task
  //     rows referencing them still import.  Admin will fix from
  //     /admin/employees after go-live.
  "yashvi dodia":          { canonicalName: "Yashvi Dodia",        email: "yashvi.tbd@vpinnacle.com",                 role: "both",      isAdmin: false, department: null },
  "chirag tawde":          { canonicalName: "Chirag Tawde",        email: "chirag.tbd@vpinnacle.com",                 role: "doer",      isAdmin: false, department: null },
  "dhruv - altus":         { canonicalName: "Dhruv (Altus)",       email: "dhruv.tbd@altuscorp.in",                   role: "doer",      isAdmin: false, department: "Altus" },
  "dhruv-altus":           { canonicalName: "Dhruv (Altus)",       email: "dhruv.tbd@altuscorp.in",                   role: "doer",      isAdmin: false, department: "Altus" },
  "rutvisha - altus":      { canonicalName: "Rutvisha (Altus)",    email: "rutvisha.tbd@altuscorp.in",                role: "doer",      isAdmin: false, department: "Altus" },
};

interface FormRow {
  Timestamp: string;
  Subject: string;
  "Client/Participant Name": string;
  "Task Initiator": string;
  "Task Doer": string;
  Task: string;
  "Due Date": string;
  "Initiator Notes": string;
  "Attachment 1": string;
  "Attachment 2": string;
  "Column 1": string;
}

function lookup(rawName: string): RosterEntry | null {
  const key = rawName.trim().toLowerCase();
  return ROSTER[key] ?? null;
}

/** Convert "M-D-YYYY", "M/D/YYYY", "MM-DD-YYYY HH:MM" → "YYYY-MM-DD". */
function toIsoDate(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const trimmed = raw.trim();
  // Strip a trailing time component if present.
  const datePart = trimmed.split(/\s+/)[0] ?? trimmed;
  const m = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const month = m[1].padStart(2, "0");
  const day = m[2].padStart(2, "0");
  const year = m[3];
  return `${year}-${month}-${day}`;
}

function main() {
  const formCsvPath = resolve("_reference/tasksandall.csv");
  const employeesOut = resolve("_reference/employees.csv");
  const tasksOut = resolve("_reference/tasks.csv");

  const csv = readFileSync(formCsvPath, "utf-8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as FormRow[];

  // --- employees.csv ---
  // Dedupe by canonical email; keep the first occurrence's metadata.
  const employees = new Map<string, RosterEntry>();
  for (const r of Object.values(ROSTER)) {
    if (!employees.has(r.email)) employees.set(r.email, r);
  }
  const employeesCsv = stringify(
    [...employees.values()].map((e) => ({
      name: e.canonicalName,
      email: e.email,
      role: e.role,
      department: e.department ?? "",
      is_admin: e.isAdmin ? "true" : "false",
    })),
    { header: true, columns: ["name", "email", "role", "department", "is_admin"] },
  );
  writeFileSync(employeesOut, employeesCsv);

  // --- tasks.csv ---
  const taskRows: Record<string, string>[] = [];
  const skipped: { line: number; reason: string; raw: FormRow }[] = [];
  rows.forEach((r, i) => {
    const line = i + 2; // +1 for header, +1 for 1-indexed
    const initiator = lookup(r["Task Initiator"]);
    const doer = lookup(r["Task Doer"]);
    if (!initiator) {
      skipped.push({ line, reason: `unknown initiator "${r["Task Initiator"]}"`, raw: r });
      return;
    }
    if (!doer) {
      skipped.push({ line, reason: `unknown doer "${r["Task Doer"]}"`, raw: r });
      return;
    }
    const assignDate = toIsoDate(r.Timestamp);
    if (!assignDate) {
      skipped.push({ line, reason: `bad timestamp "${r.Timestamp}"`, raw: r });
      return;
    }
    let dueDate = toIsoDate(r["Due Date"]) ?? assignDate;
    // Defensive: some rows have garbled date components like "2026-14-05"
    // (month 14).  Detect + swap to DD-MM-YYYY interpretation, else fall
    // back to the assign date.
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dueDate)) {
      // Swap month/day if month >12 but day ≤12.
      const m = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m && Number(m[2]) > 12 && Number(m[3]) <= 12) {
        dueDate = `${m[1]}-${m[3]}-${m[2]}`;
      } else {
        dueDate = assignDate;
      }
    }
    const category = (r.Subject ?? "").trim();
    const client = (r["Client/Participant Name"] ?? "").trim();
    // Compose a unique-enough subject: "{category} — {client}" so
    // multiple "Documentation" rows for different clients don't collide
    // on the legacy_import_key hash.  Fall back gracefully when either
    // half is empty.
    let subject: string;
    if (category && client) subject = `${category} — ${client}`;
    else if (category)       subject = category;
    else if (client)         subject = client;
    else                     subject = `(imported row ${line})`;
    const description = (r.Task ?? "").trim() || null;

    taskRows.push({
      doer: doer.canonicalName,
      initiator: initiator.canonicalName,
      assignDate,
      dueDate,
      status: "not started",
      subject,
      description: description ?? "",
      priority: "",
    });
  });
  const tasksCsv = stringify(taskRows, {
    header: true,
    columns: ["doer", "initiator", "assignDate", "dueDate", "status", "subject", "description", "priority"],
  });
  writeFileSync(tasksOut, tasksCsv);

  // --- report ---
  console.log(`employees.csv  → ${employees.size} rows (${[...employees.values()].filter((e) => e.email.includes(".tbd@")).length} TBD)`);
  console.log(`tasks.csv      → ${taskRows.length} rows imported (${skipped.length} skipped)`);
  if (skipped.length > 0) {
    console.log(`\nSkipped rows:`);
    for (const s of skipped.slice(0, 20)) {
      console.log(`  line ${s.line}: ${s.reason}`);
    }
    if (skipped.length > 20) console.log(`  …and ${skipped.length - 20} more`);
  }
}

main();
