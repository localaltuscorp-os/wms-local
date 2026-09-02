#!/usr/bin/env tsx
/**
 * Migrate UNIQUE tasks from the new sheets into the dashboard DB.
 * Reuses the exact parsing + dedup logic from import-sheet.ts (proven on
 * the original 655 tasks), generalised across the new files' "report"
 * sheets (the ones with the full Task-ID + Status layout).
 *
 *   pnpm tsx --env-file=.env.local scripts/import-new-sheets.ts            # DRY RUN
 *   pnpm tsx --env-file=.env.local scripts/import-new-sheets.ts --commit   # write
 *
 * Idempotent: tasks dedupe on legacy_import_key (same key family the
 * existing tasks use), employees match on lower(name). Re-running only
 * adds what's missing — so this is safe to run repeatedly.
 */
import * as XLSX from "xlsx";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks, taskEvents } from "@/db/schema";
import type { TaskStatus, EmployeeRole } from "@/db/enums";
import { computeLegacyImportKey } from "@/lib/import/legacy-key";
import { deriveShortId } from "@/lib/import/short-id";

const COMMIT = process.argv.includes("--commit");

// "report" layout sheets — Task ID @0, Initiator @4, Doer @5, Status @13.
const SOURCES = [
  { file: "data/Work To Employee new.xlsx", sheet: "Website Report" },
  { file: "data/Work To Employee new.xlsx", sheet: "Email Report" },
  { file: "data/Work To Employee new.xlsx", sheet: "Intern Report" },
];

const ALIASES: Record<string, string> = {
  "dhanashree solkar": "Dhanshree Solkar",
};

interface CleanName { name: string; isIntern: boolean; manager: string | null; }
function cleanName(raw: string): CleanName {
  let s = raw.replace(/\s+/g, " ").trim();
  let isIntern = false;
  let manager: string | null = null;
  const intern = s.match(/^(.*?)\s*\(\s*intern\s*-\s*([^)]*?)\s*\)\s*$/i);
  if (intern) { isIntern = true; s = (intern[1] ?? "").trim(); manager = (intern[2] ?? "").trim() || null; }
  const sales = s.match(/^sales\s*\d+\s*-\s*(.+)$/i);
  if (sales) s = (sales[1] ?? "").trim();
  s = s.replace(/Alifeyah/gi, "Alefiyah");
  const alias = ALIASES[s.toLowerCase()];
  if (alias) s = alias;
  return { name: s, isIntern, manager };
}

function mapStatus(raw: string): TaskStatus | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const table: Record<string, TaskStatus> = {
    "not started": "not_started", "initiated": "initiated", "follow up": "follow_up",
    "follow up 1": "follow_up_1", "follow up 2": "follow_up_2", "follow up 3": "follow_up_3",
    "need help": "need_help", "need info": "need_info", "done": "done", "approved": "approved",
    "not approved": "not_approved", "cancelled": "cancelled", "canceled": "cancelled", "transferred": "transferred",
  };
  return table[k] ?? null;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function parseCellDate(v: unknown): { ymd: string; date: Date } | null {
  if (v === null || v === undefined || v === "") return null;
  let serial: number | null = null;
  if (typeof v === "number") serial = v;
  else if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) serial = Number(v.trim());
  if (serial !== null) {
    const d = XLSX.SSF.parse_date_code(serial);
    if (!d || !d.y) return null;
    const ymd = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    const date = new Date(`${ymd}T${pad(d.H)}:${pad(d.M)}:${pad(d.S)}+05:30`);
    if (isNaN(date.getTime())) return null;
    return { ymd, date };
  }
  const date = new Date(String(v));
  if (isNaN(date.getTime())) return null;
  return { ymd: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, date };
}

function emailFor(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug}@import.altuscorp.local`;
}
function str(v: unknown): string { return v === null || v === undefined ? "" : String(v).trim(); }

interface RawRow {
  subject: string; client: string; initiator: string; doer: string; task: string;
  due: unknown; ts: unknown; initiatorNotes: string; status: string; src: string; line: number;
}

function loadRows(file: string, sheet: string): RawRow[] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheet];
  if (!ws) { console.warn(`  ! sheet "${sheet}" not in ${file} — skipping`); return []; }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  const out: RawRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const row: RawRow = {
      ts: r[1], subject: str(r[2]), client: str(r[3]), initiator: str(r[4]), doer: str(r[5]),
      task: str(r[6]), due: r[7], initiatorNotes: str(r[8]), status: str(r[13]),
      src: `${sheet}`, line: i + 1,
    };
    if (!row.doer && !row.initiator && !row.task) continue;
    out.push(row);
  }
  return out;
}

async function main() {
  console.log(`\n${"=".repeat(64)}\nNEW-SHEET migration  [${COMMIT ? "COMMIT (writing)" : "DRY RUN"}]\n${"=".repeat(64)}\n`);

  const allRows: RawRow[] = [];
  for (const s of SOURCES) {
    const rows = loadRows(s.file, s.sheet);
    console.log(`  ${s.sheet}: ${rows.length} data rows`);
    allRows.push(...rows);
  }
  console.log(`\nTotal data rows across report sheets: ${allRows.length}\n`);

  // People
  const people = new Map<string, { name: string; isIntern: boolean; managers: Set<string>; asDoer: boolean; asInitiator: boolean }>();
  function note(rawName: string, kind: "doer" | "initiator") {
    const raw = str(rawName); if (!raw) return;
    const c = cleanName(raw); const key = c.name.toLowerCase();
    let p = people.get(key);
    if (!p) { p = { name: c.name, isIntern: false, managers: new Set(), asDoer: false, asInitiator: false }; people.set(key, p); }
    if (c.isIntern) { p.isIntern = true; if (c.manager) p.managers.add(c.manager); }
    if (kind === "doer") p.asDoer = true; else p.asInitiator = true;
  }
  for (const r of allRows) { note(r.doer, "doer"); note(r.initiator, "initiator"); }

  const existing = await db.select({ id: employees.id, name: employees.name, email: employees.email }).from(employees);
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));

  const toCreate: { key: string; name: string; email: string; role: EmployeeRole }[] = [];
  const resolvedId = new Map<string, string>();
  const resolvedEmail = new Map<string, string>();
  for (const [key, p] of people) {
    const ex = byName.get(key);
    if (ex) { resolvedId.set(key, ex.id); resolvedEmail.set(key, ex.email); continue; }
    const role: EmployeeRole = p.asDoer && p.asInitiator ? "both" : p.asInitiator ? "initiator" : "doer";
    const email = emailFor(p.name);
    toCreate.push({ key, name: p.name, email, role });
    resolvedEmail.set(key, email);
  }
  console.log(`People referenced: ${people.size}  (in DB: ${people.size - toCreate.length}, new: ${toCreate.length})`);
  if (toCreate.length) for (const e of toCreate) console.log(`    NEW employee [${e.role}] ${e.name} <${e.email}>`);

  if (COMMIT) {
    for (const e of toCreate) {
      const [ins] = await db.insert(employees).values({ name: e.name, email: e.email, role: e.role, firebaseUid: null }).onConflictDoNothing().returning({ id: employees.id });
      let id = ins?.id;
      if (!id) { const [row] = await db.select({ id: employees.id }).from(employees).where(sql`lower(${employees.name}) = ${e.key}`).limit(1); id = row?.id; }
      if (id) resolvedId.set(e.key, id);
    }
  }

  let created = 0, skippedDup = 0, failed = 0;
  const fails: { src: string; line: number; reason: string }[] = [];
  const seenKeys = new Set<string>();
  const sampleNew: string[] = [];

  for (const r of allRows) {
    const doerKey = cleanName(r.doer).name.toLowerCase();
    const initKey = cleanName(r.initiator).name.toLowerCase();
    if (!doerKey) { failed++; fails.push({ src: r.src, line: r.line, reason: "empty doer" }); continue; }
    if (!initKey) { failed++; fails.push({ src: r.src, line: r.line, reason: "empty initiator" }); continue; }
    const status = r.status ? mapStatus(r.status) : "not_started";
    if (!status) { failed++; fails.push({ src: r.src, line: r.line, reason: `unknown status "${r.status}"` }); continue; }
    const assign = parseCellDate(r.ts);
    const due = parseCellDate(r.due) ?? assign;
    if (!due) { failed++; fails.push({ src: r.src, line: r.line, reason: "no due/assign date" }); continue; }
    const createdAt = assign?.date ?? due.date;
    const title = r.task || r.subject || `(imported ${r.src} row ${r.line})`;
    const doerEmail = resolvedEmail.get(doerKey)!;
    const initEmail = resolvedEmail.get(initKey)!;
    const key = computeLegacyImportKey({ doerEmail, initiatorEmail: initEmail, assignDate: assign?.ymd ?? due.ymd, dueDate: due.ymd, status, subject: title });
    if (seenKeys.has(key)) { skippedDup++; continue; }
    seenKeys.add(key);

    const dup = await db.query.tasks.findFirst({ where: eq(tasks.legacyImportKey, key) });
    if (dup) { skippedDup++; continue; }

    if (!COMMIT) {
      created++;
      if (sampleNew.length < 12) sampleNew.push(`[${r.src}] ${status} · ${title.slice(0, 70)}`);
      continue;
    }
    const doerId = resolvedId.get(doerKey); const initId = resolvedId.get(initKey);
    if (!doerId || !initId) { failed++; fails.push({ src: r.src, line: r.line, reason: `unresolved employee` }); continue; }
    const notes = r.client ? `Client/Participant: ${r.client}` : null;
    const id = crypto.randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tasks).values({
          id, title, subject: r.subject || null, description: r.initiatorNotes || null, notes,
          doerId, initiatorId: initId, createdById: initId, status, priority: "not_imp_not_urgent",
          createdAt, dueAt: due.date, shortId: deriveShortId(id), legacyImportKey: key,
        });
        await tx.insert(taskEvents).values({ taskId: id, actorId: initId, eventType: "created", note: `imported from "${r.src}" on ${new Date().toISOString().slice(0, 10)}`, createdAt });
      });
      created++;
    } catch (err) { failed++; fails.push({ src: r.src, line: r.line, reason: `DB: ${(err as Error).message}` }); }
  }

  console.log(`\n${"-".repeat(64)}`);
  console.log(`UNIQUE tasks ${COMMIT ? "created" : "that WOULD be created"}: ${created}`);
  console.log(`Skipped (already in system / dup): ${skippedDup}`);
  console.log(`Failed/unparseable rows: ${failed}`);
  if (sampleNew.length) { console.log(`\nSample of new tasks:`); for (const s of sampleNew) console.log(`    ${s}`); }
  if (fails.length) { console.log(`\nFailures (first 12):`); for (const f of fails.slice(0, 12)) console.log(`    ${f.src} row ${f.line}: ${f.reason}`); if (fails.length > 12) console.log(`    … ${fails.length - 12} more`); }
  console.log(`${"-".repeat(64)}\n`);
  if (!COMMIT) console.log(`DRY RUN — nothing written. Re-run with --commit to migrate.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
