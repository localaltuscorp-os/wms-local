#!/usr/bin/env tsx
/**
 * Import the DCC KPI sheets into the native DCC tables — DCC v2 (roster-axis).
 * Handles the nested structure: sections, client-instanced sections (B =
 * Lawrence & Mayo / B-2 = Soul Storii), participant-list KPIs ("… Participant -
 * Wkly Target vs Actual …" followed by per-participant name rows), and the
 * schedule kinds from parseFrequency().
 *
 *   DRY RUN (no writes — prints the parsed nested structure):
 *     pnpm tsx --env-file=.env.local scripts/import-dcc.ts --only=ruchita
 *   COMMIT (UPSERT by natural key — preserves history; --only-scoped):
 *     pnpm tsx --env-file=.env.local scripts/import-dcc.ts --commit --only=ruchita
 *
 * COMMIT is upsert-not-delete: items keyed (owner, code|title, client_id) UPDATE
 * in place so their entries survive; genuinely-new items INSERT; items present
 * before but absent now are archived (never hard-deleted). --only is REQUIRED
 * for --commit (never re-import everyone at once).
 */
import { db } from "@/lib/db";
import { employees, dccKpiItems, dccEntries, dccClients, dccSubjects, dccItemSubjects } from "@/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { readSheetValues } from "@/lib/google/read-sheet";
import { parseFrequency, normFreq } from "@/lib/dcc/util";

const SHEET_ID = "1YjuNom1QX43O9X4GbQoF_fER0siolfR_V8czbextMtU";
const COMMIT = process.argv.includes("--commit");
const ONLY = (process.argv.find((a) => a.startsWith("--only=") || a.startsWith("--person="))?.split("=")[1] ?? "").toLowerCase();

const PERSON_TABS: Array<{ tab: string; emp: string }> = [
  { tab: "Ruchita KPI", emp: "Ruchita Ambre" },
  { tab: "Rohan KPI", emp: "Rohan Choudhary" },
  { tab: "Jeevan KPI", emp: "Jeevan Bharambe" },
  { tab: "Rutvisha KPI", emp: "Rutvisha Mehta" },
];

// Sections whose blocks repeat per client (a code-less name row captions each).
const clientSections: Record<string, Set<string>> = {
  "ruchita ambre": new Set(["B"]),
  "rutvisha mehta": new Set(["B"]),
};

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DATE_RE = /^(\d{1,2})(?:st|nd|rd|th)?[-\s]([A-Za-z]{3,9})[-\s'.]*(\d{2,4})$/;

function parseDate(cell: string): string | null {
  const m = DATE_RE.exec(cell.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const isParticipantTitle = (t: string) => /participant\s*[-–]\s*wkly\s*target/i.test(t);
const sectionFamily = (col0: string) => col0.replace(/-\d+$/, "");
const subjectKind = (parentTitle: string): string | null =>
  /\bBSU\b/i.test(parentTitle) ? "BSU" : /\bPS\b/i.test(parentTitle) ? "PS" : null;

interface ParsedSubject { name: string; kind: string | null; overrideFreq: string | null; entries: Array<{ date: string; status: string | null; value: string | null; note: string | null }>; }
interface ParsedItem {
  section: string | null;
  code: string;
  title: string;
  frequency: string | null;
  weekdays: number | null;
  scheduleKind: string;
  needsReview: boolean;
  isParticipantList: boolean;
  clientName: string | null;
  entries: Array<{ date: string; status: string | null; value: string | null; note: string | null }>;
  subjects: ParsedSubject[];
}
interface ParsedClient { section: string; name: string; }
interface PersonParse { items: ParsedItem[]; clients: ParsedClient[]; }

function classify(raw: string): { status: string | null; value: string | null; note: string | null } | null {
  const s = raw.trim();
  if (!s || s === "-" || s === "\\" || s === ".") return null;
  const l = s.toLowerCase();
  const leadNum = /^(\d+(?:\.\d+)?)/.exec(s);
  if (/^(na|n\/a|not applicable|not required|not any|no any|none|not working)$/.test(l)) return { status: "NA", value: null, note: null };
  if (/(on leave|leave taken)/.test(l)) return { status: "NA", value: null, note: "On leave" };
  if (l === "holiday") return { status: "NA", value: null, note: "Holiday" };
  if (l === "yes" || l === "true") return { status: "Done", value: null, note: null };
  if (l === "no" || l === "false") return { status: "Not done", value: null, note: null };
  if (/not done|not taken/.test(l)) return { status: "Not done", value: null, note: null };
  if (/\bdone\b/.test(l)) return { status: "Done", value: leadNum ? leadNum[1]! : null, note: s.length > 6 ? s : null };
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return { status: n > 0 ? "Done" : "Not done", value: s, note: null }; }
  return { status: null, value: null, note: s };
}

function parsePersonTab(emp: string, grid: string[][]): PersonParse {
  const clientSecs = clientSections[emp.toLowerCase()] ?? new Set<string>();

  let dateRow = -1, best = 0;
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    let c = 0;
    for (const cell of grid[r] ?? []) if (parseDate(cell ?? "")) c++;
    if (c > best) { best = c; dateRow = r; }
  }
  let freqCol = -1;
  for (let r = 0; r <= dateRow + 1 && r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) if ((row[c] ?? "").trim().toLowerCase() === "frequency") { freqCol = c; break; }
    if (freqCol >= 0) break;
  }
  let dateCols = new Map<number, string>();
  const rebuildDates = (row: string[]) => { const m = new Map<number, string>(); for (let c = 0; c < row.length; c++) { const iso = parseDate(row[c] ?? ""); if (iso) m.set(c, iso); } if (m.size >= 3) dateCols = m; };
  if (dateRow >= 0) rebuildDates(grid[dateRow] ?? []);

  const items: ParsedItem[] = [];
  const clients: ParsedClient[] = [];
  let sectionLetter = "", sectionTitle = "", currentClient: string | null = null, prevCodeless = "";
  let currentParticipant: ParsedItem | null = null;
  let synth = 0;

  const applyFreqToItem = (it: ParsedItem, freq: string) => {
    it.frequency = freq;
    const pf = parseFrequency(freq);
    it.scheduleKind = pf.scheduleKind; it.weekdays = pf.weekdays; it.needsReview = pf.needsReview;
  };

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const col0 = (row[0] ?? "").trim();
    const title = normFreq(row[1] ?? "");
    const freq = freqCol >= 0 ? (row[freqCol] ?? "").trim() : "";

    const mkItem = (theCode: string): ParsedItem => {
      const pf = parseFrequency(freq);
      const isP = isParticipantTitle(title);
      const it: ParsedItem = {
        section: sectionTitle || null, code: theCode, title, frequency: freq || null,
        weekdays: pf.weekdays, scheduleKind: pf.scheduleKind, needsReview: pf.needsReview,
        isParticipantList: isP, clientName: currentClient, entries: [], subjects: [],
      };
      for (const [c, iso] of dateCols) { const v = classify(row[c] ?? ""); if (v) it.entries.push({ date: iso, ...v }); }
      items.push(it);
      return it;
    };

    let dcount = 0; for (const cell of row) if (parseDate(cell ?? "")) dcount++;
    if (dcount >= 3) {
      rebuildDates(row); currentParticipant = null;
      // a client caption can ride on a repeated date-header row (Ruchita:
      // "Lawrence & Mayo" / "Soul Storii" sit on the client block's date row).
      if (col0 === "" && title && !parseDate(title) && !isParticipantTitle(title)) prevCodeless = title;
      continue;
    }

    // section header — bare letter, optionally "-N" instance (B-2)
    if (/^[A-Z](-\d+)?$/.test(col0)) {
      const fam = sectionFamily(col0);
      // A participant-list KPI can be expressed AS a section header, with the
      // participant title in col1 and the roster in the code-less rows beneath
      // (Ruchita's E/F/G/H). Treat it as one participant KPI, not a plain section.
      if (isParticipantTitle(title)) {
        sectionLetter = fam; sectionTitle = title; currentClient = null;
        currentParticipant = mkItem(col0);
        prevCodeless = "";
        continue;
      }
      sectionLetter = fam; sectionTitle = title || col0; currentParticipant = null;
      if (clientSecs.has(fam) && prevCodeless) { currentClient = prevCodeless; clients.push({ section: fam, name: prevCodeless }); }
      else if (!clientSecs.has(fam)) currentClient = null;
      prevCodeless = "";
      continue;
    }

    if (!title) continue;

    let code: string | null = null;
    if (/^[A-Z]\d+$/.test(col0)) { code = col0; sectionLetter = col0[0]!; }
    else if (/^\d+$/.test(col0)) { code = (sectionLetter || "") + col0; }

    if (code) { const it = mkItem(code); currentParticipant = it.isParticipantList ? it : null; prevCodeless = ""; continue; }

    // code-less titled row
    if (isParticipantTitle(title)) {
      // a participant KPI whose code cell is blank (e.g. Rutvisha D10) — synthesize
      currentParticipant = mkItem(`${sectionLetter || "D"}p${++synth}`);
      prevCodeless = "";
      continue;
    }
    if (currentParticipant) {
      // a participant name row under the current participant KPI — capture its
      // per-date Done/NA cells so the roster's history survives the import.
      const nm = normFreq(title);
      const subEntries: ParsedSubject["entries"] = [];
      for (const [c, iso] of dateCols) { const v = classify(row[c] ?? ""); if (v) subEntries.push({ date: iso, ...v }); }
      currentParticipant.subjects.push({ name: nm, kind: subjectKind(currentParticipant.title), overrideFreq: freq || null, entries: subEntries });
      if (freq && !currentParticipant.frequency) applyFreqToItem(currentParticipant, freq);
      prevCodeless = "";
      continue;
    }
    // otherwise a section caption / sub-title (or a client caption to be confirmed)
    if (!/^frequency$/i.test(title)) { sectionTitle = title; prevCodeless = title; }
  }
  return { items, clients };
}

function summarize(p: PersonParse): string {
  const simple = p.items.filter((i) => !i.isParticipantList && i.scheduleKind === "scheduled").length;
  const weekly = p.items.filter((i) => i.scheduleKind === "weekly").length;
  const monthly = p.items.filter((i) => i.scheduleKind === "monthly").length;
  const adhoc = p.items.filter((i) => i.scheduleKind === "adhoc" || i.scheduleKind === "event").length;
  const part = p.items.filter((i) => i.isParticipantList);
  const withClient = p.items.filter((i) => i.clientName).length;
  const subs = part.reduce((a, i) => a + i.subjects.length, 0);
  const aggEntries = p.items.reduce((a, i) => a + i.entries.length, 0);
  const subEntries = part.reduce((a, i) => a + i.subjects.reduce((b, s) => b + s.entries.length, 0), 0);
  return `items ${p.items.length} (scheduled ${simple}, weekly ${weekly}, monthly ${monthly}, adhoc/event ${adhoc}) · clients ${p.clients.length} (${p.clients.map((c) => c.name).join(", ") || "—"}) · client-items ${withClient} · participant-KPIs ${part.length} (${subs} subjects) · entries ${aggEntries}+${subEntries}sub`;
}

async function main() {
  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const byName = new Map(emps.map((e) => [e.name.trim().toLowerCase(), e.id]));
  const resolve = (name: string) => byName.get(name.trim().toLowerCase()) ?? null;

  console.log(`\nDCC v2 import — ${COMMIT ? "COMMIT" : "DRY RUN"}${ONLY ? ` (only: ${ONLY})` : ""}\n${"=".repeat(70)}`);

  for (const { tab, emp } of PERSON_TABS) {
    if (ONLY && !emp.toLowerCase().includes(ONLY) && !tab.toLowerCase().includes(ONLY)) continue;
    let grid: string[][];
    try { grid = await readSheetValues(SHEET_ID, `'${tab}'!A1:GZ`); }
    catch (e) { console.log(`✗ ${tab}: read failed — ${e instanceof Error ? e.message : e}`); continue; }
    const parse = parsePersonTab(emp, grid);
    const empId = resolve(emp);
    console.log(`\n${empId ? "✓" : "✗ NO EMP"} ${emp} (${tab})`);
    console.log(`   ${summarize(parse)}`);
    for (const it of parse.items.filter((i) => i.isParticipantList)) {
      console.log(`   ▸ [${it.code}] ${it.title.slice(0, 44)}  → ${it.subjects.length} subjects: ${it.subjects.map((s) => s.name).slice(0, 6).join(", ")}${it.subjects.length > 6 ? "…" : ""}`);
    }
    for (const c of parse.clients) console.log(`   ◈ client: ${c.name} (section ${c.section})`);
    const flags = parse.items.filter((i) => i.needsReview);
    if (flags.length) console.log(`   ⚑ needsReview (${flags.length}): ${flags.map((i) => `${i.code}"${i.title.slice(0, 22)}"`).slice(0, 8).join(", ")}`);

    if (COMMIT && empId && ONLY) {
      await commitPerson(empId, parse);
      console.log(`   ✔ committed`);
    }
  }
  if (COMMIT && !ONLY) console.log(`\n⚠ --commit requires --only=<person> (never re-import everyone at once).`);
  console.log(`\n${COMMIT ? "Done." : "Dry run only — no writes. Add --commit --only=<person> to write."}\n`);
}

async function commitPerson(empId: string, parse: PersonParse) {
  const ZERO = "00000000-0000-0000-0000-000000000000";
  await db.transaction(async (tx) => {
    // 1. clients upsert (owner, section, lower(name))
    const clientIdByName = new Map<string, string>();
    for (const c of parse.clients) {
      const rows = (await tx.execute(sql`
        INSERT INTO dcc_clients (owner_employee_id, section, name)
        VALUES (${empId}, ${c.section}, ${c.name})
        ON CONFLICT (owner_employee_id, section, lower(name)) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      clientIdByName.set(c.name.toLowerCase(), rows[0]!.id);
    }

    const seen = new Set<string>();
    let sort = 0;
    for (const it of parse.items) {
      const clientId = it.clientName ? clientIdByName.get(it.clientName.toLowerCase()) ?? null : null;
      // Natural key: participant KPIs by (owner, section, title) [codes can be
      // synthesized/blank]; others by (owner, code, client_id) with client-history
      // re-anchor from the old free-text section = client name.
      let existing: string | null = null;
      if (it.isParticipantList) {
        const [e] = (await tx.execute(sql`
          SELECT id FROM dcc_kpi_items WHERE owner_employee_id=${empId} AND is_participant_list=true AND title=${it.title} LIMIT 1
        `)) as unknown as Array<{ id: string }>;
        existing = e?.id ?? null;
      } else {
        const [e] = (await tx.execute(sql`
          SELECT id FROM dcc_kpi_items WHERE owner_employee_id=${empId} AND code=${it.code}
            AND COALESCE(client_id, ${ZERO}::uuid) = COALESCE(${clientId}::uuid, ${ZERO}::uuid) LIMIT 1
        `)) as unknown as Array<{ id: string }>;
        existing = e?.id ?? null;
        if (!existing && clientId && it.clientName) {
          // re-anchor: old importer stored the client name in the free-text section
          const [old] = (await tx.execute(sql`
            SELECT id FROM dcc_kpi_items WHERE owner_employee_id=${empId} AND code=${it.code}
              AND client_id IS NULL AND lower(section)=${it.clientName.toLowerCase()} LIMIT 1
          `)) as unknown as Array<{ id: string }>;
          existing = old?.id ?? null;
        }
      }

      let itemId: string;
      if (existing) {
        await tx.update(dccKpiItems).set({
          section: it.section, code: it.code, title: it.title, frequency: it.frequency, weekdays: it.weekdays,
          scheduleKind: it.scheduleKind, needsReview: it.needsReview, isParticipantList: it.isParticipantList,
          clientId, templateCode: clientId ? it.code : null, sortOrder: sort++, archived: false, updatedAt: new Date(),
        }).where(eq(dccKpiItems.id, existing));
        itemId = existing;
      } else {
        const [row] = await tx.insert(dccKpiItems).values({
          ownerEmployeeId: empId, section: it.section, code: it.code, title: it.title, frequency: it.frequency,
          weekdays: it.weekdays, scheduleKind: it.scheduleKind, needsReview: it.needsReview,
          isParticipantList: it.isParticipantList, clientId, templateCode: clientId ? it.code : null,
          sortOrder: sort++, createdById: empId,
        }).returning({ id: dccKpiItems.id });
        itemId = row!.id;
      }
      seen.add(itemId);

      // 2. subjects + links (participant KPIs)
      for (const s of it.subjects) {
        const srows = (await tx.execute(sql`
          INSERT INTO dcc_subjects (owner_employee_id, name, kind)
          VALUES (${empId}, ${s.name}, ${s.kind})
          ON CONFLICT (owner_employee_id, lower(name)) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `)) as unknown as Array<{ id: string }>;
        const subjId = srows[0]!.id;
        const ov = s.overrideFreq ? parseFrequency(s.overrideFreq) : null;
        await tx.execute(sql`
          INSERT INTO dcc_item_subjects (item_id, subject_id, schedule_kind, weekdays)
          VALUES (${itemId}, ${subjId}, ${ov?.scheduleKind ?? null}, ${ov?.weekdays ?? null})
          ON CONFLICT (item_id, subject_id) DO UPDATE SET archived = false
        `);
        const subjByDate = new Map(s.entries.map((e) => [e.date, e]));
        for (const e of subjByDate.values()) {
          await tx.execute(sql`
            INSERT INTO dcc_entries (item_id, entry_date, status, value_number, note, filled_by_id, subject_id)
            VALUES (${itemId}, ${e.date}, ${e.status}, ${e.value}, ${e.note}, ${empId}, ${subjId})
            ON CONFLICT (item_id, entry_date, COALESCE(subject_id, ${ZERO}::uuid))
            DO UPDATE SET status=EXCLUDED.status, value_number=EXCLUDED.value_number, note=EXCLUDED.note, updated_at=now()
          `);
        }
      }

      // 3. entries from the sheet grid (aggregate, subject_id NULL) — upsert
      const byDate = new Map(it.entries.map((e) => [e.date, e]));
      for (const e of byDate.values()) {
        await tx.execute(sql`
          INSERT INTO dcc_entries (item_id, entry_date, status, value_number, note, filled_by_id, subject_id)
          VALUES (${itemId}, ${e.date}, ${e.status}, ${e.value}, ${e.note}, ${empId}, NULL)
          ON CONFLICT (item_id, entry_date, COALESCE(subject_id, ${ZERO}::uuid))
          DO UPDATE SET status=EXCLUDED.status, value_number=EXCLUDED.value_number, note=EXCLUDED.note, updated_at=now()
        `);
      }
    }

    // 4. archive items present before but absent now (never hard-delete)
    const present = [...seen];
    if (present.length) {
      await tx.update(dccKpiItems)
        .set({ archived: true, updatedAt: new Date() })
        .where(and(eq(dccKpiItems.ownerEmployeeId, empId), eq(dccKpiItems.archived, false), notInArray(dccKpiItems.id, present)));
    }
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
