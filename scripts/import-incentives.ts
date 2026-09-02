#!/usr/bin/env tsx
/**
 * Import the "Altus Eco System MIS" incentive tabs into the native incentive
 * tables (migration 0064). Source is `.mis-sheet-full.json` at the repo root
 * (gitignored) — an object keyed by tab name → array-of-rows (array of arrays
 * of FORMATTED strings as exported from the Google Sheet).
 *
 *   pnpm tsx --env-file=.env.local scripts/import-incentives.ts
 *
 * Tabs consumed:
 *   "3.Incentive Chart"     → incentive_catalog   (header at row index 2)
 *   "4.Incentive MIS"       → incentive_entries   (header at row index 2)
 *   "5. Altus Projects MIS" → incentive_projects  (header at row index 2)
 *
 * Idempotent: the three tables are cleared then re-inserted on every run, so
 * re-running fully resyncs with the sheet. Employee names are messy
 * ("Foo Bar ( Intern - Baz )"); we store the raw display name AND a best-effort
 * employee_id resolved by matching the leading name (suffix stripped) against
 * employees.name (case-insensitive). Money strings are stripped of ₹/commas.
 * Period months ("Apr-26") become first-of-month dates. `unpaid` is never
 * stored (always derived = approved − paid).
 *
 * This touches the LIVE DB — only the owner runs it.
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import {
  employees,
  incentiveCatalog,
  incentiveEntries,
  incentiveProjects,
  type NewIncentiveCatalog,
  type NewIncentiveEntry,
  type NewIncentiveProject,
} from "@/db/schema";

// --- parse helpers ---------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Apr-26" → "2026-04-01" (first-of-month). Returns null if unparseable. */
function parseMonYY(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^([A-Za-z]{3})[-\s]?(\d{2})$/);
  if (!m || !m[1] || !m[2]) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  const year = 2000 + Number(m[2]);
  return `${year}-${String(mon).padStart(2, "0")}-01`;
}

/** "20-Apr-2026" / "13/05/2026" → "YYYY-MM-DD". Returns null if unparseable. */
function parseDate(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  // dd-Mon-yyyy (optionally followed by a time, e.g. "16-Apr-2026, 11:56:40 PM")
  let m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m && m[1] && m[2] && m[3]) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // dd/mm/yyyy
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && m[1] && m[2] && m[3]) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** "Yes"/"No" (case-insensitive, trimmed) → boolean. Anything else → null. */
function parseYesNo(s: unknown): boolean | null {
  if (typeof s !== "string") return null;
  const t = s.trim().toLowerCase();
  if (t === "yes" || t === "y" || t === "true") return true;
  if (t === "no" || t === "n" || t === "false") return false;
  return null;
}

/** Strip ₹, commas, spaces → numeric string for Drizzle numeric(14,2). "" → "0". */
function parseAmount(s: unknown): string {
  if (typeof s === "number") return Number.isFinite(s) ? String(s) : "0";
  if (typeof s !== "string") return "0";
  const cleaned = s.replace(/[₹,\s]/g, "").trim();
  if (!cleaned || cleaned === "-") return "0";
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : "0";
}

/** Strip the " ( Intern - … )" / "( Intern : … )" suffix; collapse whitespace. */
function normName(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/\(\s*intern[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strOrNull(v: unknown): string | null {
  const t = str(v);
  return t ? t : null;
}

function intOrNull(v: unknown): number | null {
  const t = str(v);
  if (!t) return null;
  const n = parseInt(t.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// --- main ------------------------------------------------------------------

type Sheet = Record<string, unknown[][]>;

async function main() {
  const raw = readFileSync(".mis-sheet-full.json", "utf8");
  const sheet = JSON.parse(raw) as Sheet;

  // Employee resolver: leading display name → employee id (case-insensitive).
  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const byName = new Map(emps.map((e) => [e.name.trim().toLowerCase(), e.id]));
  const resolved = new Set<string>();
  const unresolved = new Set<string>();
  function resolveEmp(displayName: unknown): string | null {
    const norm = normName(displayName);
    if (!norm) return null;
    const id = byName.get(norm.toLowerCase()) ?? null;
    if (id) resolved.add(norm);
    else unresolved.add(norm);
    return id;
  }

  // 1. incentive_catalog ← "3.Incentive Chart" (header at row index 2).
  const chart = sheet["3.Incentive Chart"] ?? [];
  const catalogRows: NewIncentiveCatalog[] = [];
  const seenNames = new Set<string>();
  for (let i = 3; i < chart.length; i++) {
    const r = chart[i] ?? [];
    const name = str(r[1]);
    if (!name) continue; // skip blank/footnote rows
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue; // name is UNIQUE — keep first
    seenNames.add(key);
    catalogRows.push({
      name,
      description: strOrNull(r[2]),
      amount: parseAmount(r[3]),
      salesEligible: parseYesNo(r[4]),
      internsEligible: parseYesNo(r[5]),
      notes: strOrNull(r[6]),
      sortOrder: intOrNull(r[0]) ?? i,
      active: true,
    });
  }

  // 2. incentive_entries ← "4.Incentive MIS" (header at row index 2).
  // Cols: Sr.No|Entry Date|Incentive Name|Month|Emp Name|Participant Name|
  //       Prospect/Group|Amount|Approved|Approved Amt|Paid|Paid Amt|Paid Date|Unpaid|Notes
  const mis = sheet["4.Incentive MIS"] ?? [];
  const entryRows: NewIncentiveEntry[] = [];
  for (let i = 3; i < mis.length; i++) {
    const r = mis[i] ?? [];
    const incentiveName = str(r[2]);
    const empName = str(r[4]);
    if (!incentiveName && !empName) continue; // skip wholly-blank rows
    entryRows.push({
      srcSrNo: intOrNull(r[0]),
      entryDate: parseDate(r[1]),
      incentiveName: incentiveName || "(unknown)",
      periodMonth: parseMonYY(r[3]),
      empName: empName || "(unknown)",
      employeeId: resolveEmp(r[4]),
      participantName: strOrNull(r[5]),
      prospectGroupName: strOrNull(r[6]),
      amount: parseAmount(r[7]),
      approved: parseYesNo(r[8]) ?? false,
      approvedAmt: parseAmount(r[9]),
      paid: parseYesNo(r[10]) ?? false,
      paidAmt: parseAmount(r[11]),
      paidDate: parseDate(r[12]),
      // r[13] is "Unpaid" — DERIVED, never stored. r[14] is Notes.
      note: strOrNull(r[14]),
    });
  }

  // 3. incentive_projects ← "5. Altus Projects MIS" (header at row index 2).
  // Cols (25): Sr.No|Timestamp|Subject|Project Name|Project Initiator|
  //   Supervisor/Executor|Intern:|Project Details|Due Date|Incentive|
  //   Emp Incentive Amount|Intern Incentive Amount|Initiator Notes|Attach1|
  //   Attach2|Approved|Emp Approved Amt|Intern Approved Amt|Paid|Emp Paid Amt|
  //   Intern Paid Amt|Paid Date|Emp Unpaid Amt|Intern Unpaid Amt|Notes
  const proj = sheet["5. Altus Projects MIS"] ?? [];
  const projectRows: NewIncentiveProject[] = [];
  for (let i = 3; i < proj.length; i++) {
    const r = proj[i] ?? [];
    const subject = str(r[2]);
    const projectName = str(r[3]);
    if (!subject && !projectName) continue; // skip wholly-blank rows
    projectRows.push({
      srcSrNo: intOrNull(r[0]),
      subject: strOrNull(r[2]),
      projectName: strOrNull(r[3]),
      initiatorName: strOrNull(r[4]),
      supervisorName: strOrNull(r[5]),
      supervisorId: resolveEmp(r[5]),
      internName: strOrNull(r[6]),
      // "None" is a sentinel, not a person.
      internId: str(r[6]).toLowerCase() === "none" ? null : resolveEmp(r[6]),
      projectDetails: strOrNull(r[7]),
      periodMonth: parseMonYY(r[8]), // Due Date col holds "Mon-YY"
      approved: parseYesNo(r[15]) ?? false,
      empAmount: parseAmount(r[10]),
      internAmount: parseAmount(r[11]),
      empApprovedAmt: parseAmount(r[16]),
      internApprovedAmt: parseAmount(r[17]),
      paid: parseYesNo(r[18]) ?? false,
      empPaidAmt: parseAmount(r[19]),
      internPaidAmt: parseAmount(r[20]),
      paidDate: parseDate(r[21]),
      // r[22]/r[23] are Emp/Intern Unpaid — DERIVED, never stored.
      initiatorNotes: strOrNull(r[12]),
      note: strOrNull(r[24]),
    });
  }

  // Idempotent resync: clear then insert (FKs are SET NULL, no children).
  await db.transaction(async (tx) => {
    await tx.delete(incentiveProjects);
    await tx.delete(incentiveEntries);
    await tx.delete(incentiveCatalog);
    if (catalogRows.length) await tx.insert(incentiveCatalog).values(catalogRows);
    if (entryRows.length) await tx.insert(incentiveEntries).values(entryRows);
    if (projectRows.length) await tx.insert(incentiveProjects).values(projectRows);
  });

  console.log("Incentive MIS import complete:");
  console.log(`  incentive_catalog : ${catalogRows.length} rows`);
  console.log(`  incentive_entries : ${entryRows.length} rows`);
  console.log(`  incentive_projects: ${projectRows.length} rows`);
  console.log(`  employees matched : ${resolved.size}`);
  if (unresolved.size) {
    console.log(`  unmatched names (${unresolved.size}): ${[...unresolved].sort().join(" | ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
