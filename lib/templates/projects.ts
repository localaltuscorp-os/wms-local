import "server-only";

import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { PLAN_KINDS, KIND_LABEL, type PlanKind } from "@/lib/project-plan/levels";
import { columnsFor } from "@/lib/project-plan/bulk";

/**
 * The Project Plan bulk-upload workbook — the built-in served by
 * GET /api/templates/projects_bulk_import?kind=… and by the Upload Master
 * download route.
 *
 * ── ONE FEATURE, ONE KEY, SIX FILES ───────────────────────────────────────
 * The Projects dialog uploads projects, milestones, results, actions and
 * sub-actions through ONE screen with a kind selector. Each kind has its own
 * column set (a Project has no Start/End of its own — see `columnsFor`), so the
 * workbook is built per kind from the SAME manifest the dialog parses with
 * (lib/project-plan/bulk.ts). One registry key covers all six: an administrator
 * replaces "Projects — Bulk Import" once and every kind's download serves it,
 * which is the honest model — it is one feature with one button.
 *
 * The `kind` parameter only ever selects which built-in to generate; a replaced
 * file is served for every kind, exactly as Upload Master promises.
 */

const HEADER_FILL = "FF334155";
const HEADER_TEXT = "FFFFFFFF";
const HAIRLINE = "FFE2E8F0";
const BAND_FILL = "FFF8FAFC";
const MUTED = "FF64748B";

const thin = { style: "thin" as const, color: { argb: HAIRLINE } };
const cellBorder = { top: thin, left: thin, bottom: thin, right: thin };

const HEADER_ROW = 1;
const DATA_ROWS = 120;

export function isPlanKind(raw: string | null | undefined): raw is PlanKind {
  return Boolean(raw) && (PLAN_KINDS as readonly string[]).includes(String(raw));
}

export async function buildProjectsTemplate(kind: string): Promise<Buffer> {
  const safeKind: PlanKind = isPlanKind(kind) ? kind : "project";
  const cols = columnsFor(safeKind);
  const label = KIND_LABEL[safeKind];

  const roster = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(employees.name);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ALTUS Corp — Project Plan";
  wb.created = new Date();

  // Sheet 0 is what the dialog parses. Header first — the parser scans the top
  // ten rows for it, so a title row would be tolerated, but there is no reason
  // to make it work for it.
  const sheet = wb.addWorksheet(`${label}s`.slice(0, 31), {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });
  sheet.columns = cols.map((c) => ({
    header: c.header,
    key: c.header,
    width: c.field === "description" ? 42 : c.field === "name" ? 38 : 16,
  }));

  const head = sheet.getRow(HEADER_ROW);
  head.height = 22;
  cols.forEach((_, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.alignment = { vertical: "middle" };
    cell.border = cellBorder;
  });

  for (let r = HEADER_ROW + 1; r <= HEADER_ROW + DATA_ROWS; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= cols.length; c++) {
      const cell = row.getCell(c);
      cell.border = cellBorder;
      if (r % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      }
    }
  }

  // Owner is matched by name or email on import — offer the roster.
  const ownerIdx = cols.findIndex((c) => c.field === "owner");
  if (ownerIdx >= 0 && roster.length > 0) {
    const letter = sheet.getColumn(ownerIdx + 1).letter;
    for (let r = HEADER_ROW + 1; r <= HEADER_ROW + DATA_ROWS; r++) {
      sheet.getCell(`${letter}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'How to use'!$B$2:$B$${roster.length + 1}`],
      };
    }
  }

  // A worked example, on its OWN sheet — a filled row on sheet 0 would import
  // as a real plan node.
  const example = wb.addWorksheet("Example");
  example.columns = cols.map((c) => ({ header: c.header, key: c.header, width: 22 }));
  example.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  example.addRow(
    cols.map((c) => {
      if (c.field === "name") return `Example ${label.toLowerCase()}`;
      if (c.field === "owner") return roster[0]?.name ?? "Person's name";
      if (c.field === "description") return "What this covers (optional)";
      return "2026-06-12";
    }),
  );

  // What each column means, plus the roster the Owner column validates against.
  const howto = wb.addWorksheet("How to use");
  howto.columns = [
    { header: "Column", key: "col", width: 18 },
    { header: "Roster (Owner)", key: "roster", width: 34 },
    { header: "What it means", key: "help", width: 58 },
  ];
  howto.getRow(1).font = { bold: true };
  for (const c of cols) howto.addRow([c.header, "", c.hint]);
  roster.forEach((r, i) => {
    howto.getCell(i + 2, 2).value = r.name ?? "";
  });
  howto.addRow([]);
  const note = howto.addRow([
    "Row 1 is the header row.",
    "",
    `Only Name is required. Upload one sheet of ${label.toLowerCase()}s at a time — pick the level in the Bulk upload dialog when you import.`,
  ]);
  note.font = { italic: true, color: { argb: MUTED } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The built-in's filename for a kind — what a person sees in their Downloads. */
export function projectsTemplateFileName(kind: string): string {
  const safeKind: PlanKind = isPlanKind(kind) ? kind : "project";
  return `Project-Plan-${safeKind}-template.xlsx`;
}
