#!/usr/bin/env tsx
/**
 * Import the legacy "Work To Employee (Altus Task Management Sheet).xlsx"
 * directly into the dashboard DB.
 *
 *   pnpm tsx --env-file=.env.local scripts/import-sheet.ts            # dry run
 *   pnpm tsx --env-file=.env.local scripts/import-sheet.ts --commit   # write
 *
 * Source sheet: "Website Report" (consolidated master — every person +
 * full status set).  No Firebase users are created; employees get a
 * clearly-placeholder email (slug@import.altuscorp.local) and firebase_uid
 * stays null until an admin invites them via /admin/employees.
 *
 * Idempotent: tasks dedupe on legacy_import_key, employees match on
 * lower(name).  Re-running only adds what's missing.
 */
import * as XLSX from "xlsx";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks, taskEvents } from "@/db/schema";
import type { TaskStatus, EmployeeRole } from "@/db/enums";
import { computeLegacyImportKey } from "@/lib/import/legacy-key";
import { deriveShortId } from "@/lib/import/short-id";

const FILE = "data/Work To Employee (Altus Task Management Sheet).xlsx";
const SHEET = "Website Report";
const COMMIT = process.argv.includes("--commit");

// ─────────────────────────────────────────────────────────────────────
// Name normalisation
// ─────────────────────────────────────────────────────────────────────
interface CleanName {
  name: string;
  isIntern: boolean;
  manager: string | null;
}

/** Known spelling variants in the sheet → the canonical name already in
 *  the DB, so we match the existing employee instead of duplicating. */
const ALIASES: Record<string, string> = {
  "dhanashree solkar": "Dhanshree Solkar",
};

/** Strip "( Intern - X )" suffix, "Sales N - " prefix, fix the Alifeyah
 *  typo, and collapse whitespace. */
function cleanName(raw: string): CleanName {
  let s = raw.replace(/\s+/g, " ").trim();
  let isIntern = false;
  let manager: string | null = null;

  const intern = s.match(/^(.*?)\s*\(\s*intern\s*-\s*([^)]*?)\s*\)\s*$/i);
  if (intern) {
    isIntern = true;
    s = (intern[1] ?? "").trim();
    manager = (intern[2] ?? "").trim() || null;
  }
  // "Sales 1 - Anand Singh" → "Anand Singh"
  const sales = s.match(/^sales\s*\d+\s*-\s*(.+)$/i);
  if (sales) s = (sales[1] ?? "").trim();

  // Known typo: Alifeyah → Alefiyah
  s = s.replace(/Alifeyah/gi, "Alefiyah");

  // Resolve known spelling variants to the canonical DB name.
  const alias = ALIASES[s.toLowerCase()];
  if (alias) s = alias;

  return { name: s, isIntern, manager };
}

// ─────────────────────────────────────────────────────────────────────
// Status mapping (fuller than lib/import/status-mapping — handles the
// granular follow_up_1/2/3 + need_info enum values).
// ─────────────────────────────────────────────────────────────────────
function mapStatus(raw: string): TaskStatus | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const table: Record<string, TaskStatus> = {
    "not started": "not_started",
    "initiated": "initiated",
    "follow up": "follow_up",
    "follow up 1": "follow_up_1",
    "follow up 2": "follow_up_2",
    "follow up 3": "follow_up_3",
    "need help": "need_help",
    "need info": "need_info",
    "done": "done",
    "approved": "approved",
    "not approved": "not_approved",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "transferred": "transferred",
  };
  return table[k] ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Date handling — sheet cells are Excel serials; treat the calendar
// date as IST.  Returns {ymd, iso} or null.
// ─────────────────────────────────────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function parseCellDate(v: unknown): { ymd: string; date: Date } | null {
  if (v === null || v === undefined || v === "") return null;
  let serial: number | null = null;
  if (typeof v === "number") serial = v;
  else if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) serial = Number(v.trim());

  if (serial !== null) {
    const d = XLSX.SSF.parse_date_code(serial);
    if (!d || !d.y) return null;
    const ymd = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    // Interpret the naive sheet datetime as IST.
    const iso = `${ymd}T${pad(d.H)}:${pad(d.M)}:${pad(d.S)}+05:30`;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return { ymd, date };
  }
  // Fallback: a real date string.
  const date = new Date(String(v));
  if (isNaN(date.getTime())) return null;
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return { ymd, date };
}

function emailFor(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug}@import.altuscorp.local`;
}

// ─────────────────────────────────────────────────────────────────────
interface RawRow {
  taskIdLegacy: string;
  subject: string;
  client: string;
  initiator: string;
  doer: string;
  task: string;
  due: unknown;
  ts: unknown;
  initiatorNotes: string;
  status: string;
  line: number;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function loadRows(): RawRow[] {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Sheet "${SHEET}" not found in ${FILE}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  // header at row 0
  const out: RawRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const row: RawRow = {
      taskIdLegacy: str(r[0]),
      ts: r[1],
      subject: str(r[2]),
      client: str(r[3]),
      initiator: str(r[4]),
      doer: str(r[5]),
      task: str(r[6]),
      due: r[7],
      initiatorNotes: str(r[8]),
      status: str(r[13]),
      line: i + 1,
    };
    // Skip fully-empty / structural rows.
    if (!row.doer && !row.initiator && !row.task) continue;
    out.push(row);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`Sheet import — ${SHEET}  [${COMMIT ? "COMMIT (writing)" : "DRY RUN"}]`);
  console.log(`${"═".repeat(64)}\n`);

  const rows = loadRows();
  console.log(`Loaded ${rows.length} data rows from "${SHEET}".\n`);

  // 1. Resolve the full cast of people (doers + initiators), cleaned.
  const people = new Map<
    string,
    { name: string; isIntern: boolean; managers: Set<string>; asDoer: boolean; asInitiator: boolean }
  >();
  function note(rawName: string, kind: "doer" | "initiator") {
    const raw = str(rawName);
    if (!raw) return null;
    const c = cleanName(raw);
    const key = c.name.toLowerCase();
    let p = people.get(key);
    if (!p) {
      p = { name: c.name, isIntern: false, managers: new Set(), asDoer: false, asInitiator: false };
      people.set(key, p);
    }
    if (c.isIntern) {
      p.isIntern = true;
      if (c.manager) p.managers.add(c.manager);
    }
    if (kind === "doer") p.asDoer = true;
    else p.asInitiator = true;
    return key;
  }
  for (const r of rows) {
    note(r.doer, "doer");
    note(r.initiator, "initiator");
  }

  // 2. Load existing employees, match by lower(name).
  const existing = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees);
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));

  // 3. Plan employee creation.
  const toCreate: {
    key: string;
    name: string;
    email: string;
    role: EmployeeRole;
    isIntern: boolean;
    managers: string[];
  }[] = [];
  const resolvedId = new Map<string, string>(); // key → employee id (existing only)
  const resolvedEmail = new Map<string, string>(); // key → email (existing or planned)

  for (const [key, p] of people) {
    const ex = byName.get(key);
    if (ex) {
      resolvedId.set(key, ex.id);
      resolvedEmail.set(key, ex.email);
      continue;
    }
    const role: EmployeeRole = p.asDoer && p.asInitiator ? "both" : p.asInitiator ? "initiator" : "doer";
    const email = emailFor(p.name);
    toCreate.push({ key, name: p.name, email, role, isIntern: p.isIntern, managers: [...p.managers] });
    resolvedEmail.set(key, email);
  }

  console.log(`People referenced: ${people.size}`);
  console.log(`  • already in DB: ${people.size - toCreate.length}`);
  console.log(`  • to create:     ${toCreate.length}`);
  const interns = toCreate.filter((e) => e.isIntern);
  if (interns.length) {
    console.log(`\nInterns to create (cleaned name → manager):`);
    for (const e of interns) console.log(`    ${e.name}  →  ${e.managers.join(", ") || "(unknown)"}`);
  }
  console.log(`\nNew employees:`);
  for (const e of toCreate) console.log(`    [${e.role}]\t${e.name}\t<${e.email}>`);

  if (COMMIT) {
    for (const e of toCreate) {
      const [ins] = await db
        .insert(employees)
        .values({ name: e.name, email: e.email, role: e.role, firebaseUid: null })
        .onConflictDoNothing()
        .returning({ id: employees.id });
      let id = ins?.id;
      if (!id) {
        const [row] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(sql`lower(${employees.name}) = ${e.key}`)
          .limit(1);
        id = row?.id;
      }
      if (id) resolvedId.set(e.key, id);
    }
  }

  // 4. Plan + insert tasks.
  let created = 0,
    skippedDup = 0,
    failed = 0;
  const fails: { line: number; reason: string }[] = [];
  const seenKeys = new Set<string>();

  for (const r of rows) {
    const doerKey = cleanName(r.doer).name.toLowerCase();
    const initKey = cleanName(r.initiator).name.toLowerCase();
    if (!doerKey) { failed++; fails.push({ line: r.line, reason: "empty doer" }); continue; }
    if (!initKey) { failed++; fails.push({ line: r.line, reason: "empty initiator" }); continue; }

    const status = r.status ? mapStatus(r.status) : "not_started";
    if (!status) { failed++; fails.push({ line: r.line, reason: `unknown status "${r.status}"` }); continue; }

    const assign = parseCellDate(r.ts);
    const due = parseCellDate(r.due) ?? assign; // fall back to assign date
    if (!due) { failed++; fails.push({ line: r.line, reason: "no due/assign date" }); continue; }
    const createdAt = assign?.date ?? due.date;

    const title = r.task || r.subject || `(imported row ${r.line})`;
    const doerEmail = resolvedEmail.get(doerKey)!;
    const initEmail = resolvedEmail.get(initKey)!;

    const key = computeLegacyImportKey({
      doerEmail,
      initiatorEmail: initEmail,
      assignDate: assign?.ymd ?? due.ymd,
      dueDate: due.ymd,
      status,
      subject: title,
    });
    if (seenKeys.has(key)) { skippedDup++; continue; }
    seenKeys.add(key);

    const notesParts: string[] = [];
    if (r.client) notesParts.push(`Client/Participant: ${r.client}`);
    const notes = notesParts.length ? notesParts.join("\n") : null;

    if (!COMMIT) {
      const dup = await db.query.tasks.findFirst({ where: eq(tasks.legacyImportKey, key) });
      if (dup) skippedDup++;
      else created++;
      continue;
    }

    const dup = await db.query.tasks.findFirst({ where: eq(tasks.legacyImportKey, key) });
    if (dup) { skippedDup++; continue; }

    const doerId = resolvedId.get(doerKey);
    const initId = resolvedId.get(initKey);
    if (!doerId || !initId) {
      failed++;
      fails.push({ line: r.line, reason: `unresolved employee (doer=${!!doerId} init=${!!initId})` });
      continue;
    }

    const id = crypto.randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tasks).values({
          id,
          title,
          subject: r.subject || null,
          description: r.initiatorNotes || null,
          notes,
          doerId,
          initiatorId: initId,
          createdById: initId,
          status,
          priority: "not_imp_not_urgent",
          createdAt,
          dueAt: due.date,
          shortId: deriveShortId(id),
          legacyImportKey: key,
        });
        await tx.insert(taskEvents).values({
          taskId: id,
          actorId: initId,
          eventType: "created",
          note: `imported from "${SHEET}" sheet on ${new Date().toISOString().slice(0, 10)}`,
          createdAt,
        });
      });
      created++;
    } catch (err) {
      failed++;
      fails.push({ line: r.line, reason: `DB: ${(err as Error).message}` });
    }
  }

  console.log(`\n${"─".repeat(64)}`);
  console.log(`Tasks ${COMMIT ? "created" : "would create"}: ${created}`);
  console.log(`Tasks skipped (duplicate):  ${skippedDup}`);
  console.log(`Tasks failed:               ${failed}`);
  for (const f of fails.slice(0, 15)) console.log(`    - row ${f.line}: ${f.reason}`);
  if (fails.length > 15) console.log(`    … ${fails.length - 15} more`);
  console.log(`${"─".repeat(64)}\n`);
  if (!COMMIT) console.log(`Dry run only — re-run with --commit to write.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
