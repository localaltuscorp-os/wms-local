import "server-only";

import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { WEEKLY_GOALS_COLUMNS } from "@/lib/weekly-goals/template-columns";

/**
 * The Weekly Goals bulk-import workbook — the built-in served by
 * GET /api/templates/weekly_goals_bulk_import and by the Upload Master download
 * route.
 *
 * ── WHY THIS MOVED SERVER-SIDE ────────────────────────────────────────────
 * The template used to be a hardcoded CSV string inside the upload dialog
 * (components/weekly-goals/weekly-goals-import.tsx). That made it impossible for
 * an administrator to fix a column without a code change, and the file a person
 * downloaded was whatever the built bundle happened to contain. It is now a
 * registry template like every other, so Upload Master → Replace applies to the
 * Weekly Goals board's button the moment the row commits.
 *
 * ── COLUMNS ARE THE IMPORTER'S COLUMNS ────────────────────────────────────
 * `WEEKLY_GOALS_COLUMNS` (lib/weekly-goals/template-columns.ts) is the same
 * list app/(app)/weekly-goals/actions.ts recognises via `mapHeader`, so the
 * template and the parser cannot drift.
 *
 * Sheet 0 is the entry grid the importer reads; the worked example and the
 * explanation live on their own sheets, because anything non-blank on sheet 0
 * imports as a real goal.
 */

const HEADER_FILL = "FF334155";
const HEADER_TEXT = "FFFFFFFF";
const HAIRLINE = "FFE2E8F0";
const BAND_FILL = "FFF8FAFC";
const MUTED = "FF64748B";

const thin = { style: "thin" as const, color: { argb: HAIRLINE } };
const cellBorder = { top: thin, left: thin, bottom: thin, right: thin };

const HEADER_ROW = 1;
const DATA_ROWS = 200;

export async function buildWeeklyGoalsTemplate(): Promise<Buffer> {
  const roster = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(employees.name);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ALTUS Corp — Weekly Goals";
  wb.created = new Date();

  // ── Sheet 0: the grid the importer reads ─────────────────────────────
  const sheet = wb.addWorksheet("Weekly Goals", {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });
  sheet.columns = WEEKLY_GOALS_COLUMNS.map((c) => ({
    header: c.header,
    key: c.header,
    width: c.header === "Target" ? 46 : c.header === "Notes" ? 28 : 16,
  }));

  const head = sheet.getRow(HEADER_ROW);
  head.height = 22;
  WEEKLY_GOALS_COLUMNS.forEach((_, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.alignment = { vertical: "middle" };
    cell.border = cellBorder;
  });

  for (let r = HEADER_ROW + 1; r <= HEADER_ROW + DATA_ROWS; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= WEEKLY_GOALS_COLUMNS.length; c++) {
      const cell = row.getCell(c);
      cell.border = cellBorder;
      if (r % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      }
    }
  }

  // The Employee column's roster, so a name is picked rather than typed. The
  // importer matches on name OR email, so the list is names — the address is
  // shown in the help sheet for the fan-out case.
  if (roster.length > 0) {
    const employeeCol = String.fromCharCode(65 + WEEKLY_GOALS_COLUMNS.length - 1);
    for (let r = HEADER_ROW + 1; r <= HEADER_ROW + DATA_ROWS; r++) {
      sheet.getCell(`${employeeCol}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'How to use'!$B$2:$B$${roster.length + 1}`],
      };
    }
  }

  // ── Sheet 1: a worked example, off the entry grid ────────────────────
  const example = wb.addWorksheet("Example");
  example.columns = WEEKLY_GOALS_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: 22 }));
  example.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  example.addRow(WEEKLY_GOALS_COLUMNS.map((c) => c.example));

  // ── Sheet 2: what each column means + the roster ─────────────────────
  const howto = wb.addWorksheet("How to use");
  howto.columns = [
    { header: "Column", key: "col", width: 18 },
    { header: "Roster (Employee)", key: "roster", width: 34 },
    { header: "What it means", key: "help", width: 62 },
  ];
  howto.getRow(1).font = { bold: true };
  for (const c of WEEKLY_GOALS_COLUMNS) {
    howto.addRow([c.header, "", c.help]);
  }
  howto.getCell("A1").font = { bold: true, color: { argb: MUTED } };
  roster.forEach((r, i) => {
    howto.getCell(i + 2, 2).value = r.name ?? "";
  });
  howto.addRow([]);
  const note = howto.addRow([
    "Row 1 is the header row.",
    "",
    "The importer reads the FIRST sheet only. Put your rows straight under the header; do not rename the columns.",
  ]);
  note.font = { italic: true, color: { argb: MUTED } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
