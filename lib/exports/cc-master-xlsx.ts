import "server-only";
import ExcelJS from "exceljs";
import type { CcCardRow, CcMonthRow } from "@/lib/queries/accounts-cc";
import { fyLabel, fyMonthCols } from "@/lib/accounts/cc";

/**
 * THE CREDIT CARDS MASTER as a workbook — 9 static card columns, then 12
 * monthly blocks of 9 fields (Apr→Mar). 117 columns wide.
 *
 * ── WHY THIS MOVED OFF SheetJS ─────────────────────────────────────────────
 * The route used to build this with SheetJS and set `ws["!freeze"] = { xSplit:
 * 9, ySplit: 3 }`. That line did NOTHING. SheetJS's community build does not
 * write freeze panes: the property is accepted, no error is raised, and the
 * emitted sheet has no `<pane>` element at all — verified by unzipping its
 * output. So every export ever produced here scrolled the card names off the
 * left and the field names off the top.
 *
 * That matters more on this sheet than almost any other in the app. It is 117
 * columns wide: by the time you scroll to "Jan", the "Card Name" column is long
 * gone, and the 9 repeating field names ("Hard Copy", "Tally Entry", …) are
 * identical in all twelve blocks. Without the frozen panes a cell in the middle
 * of the grid is unidentifiable — you cannot tell which card or which field you
 * are looking at. The freeze is not polish here, it is what makes the file
 * readable.
 *
 * ExcelJS writes panes properly and is already used by three other workbooks in
 * this project (/events/export.xlsx, /goals/template.xlsx,
 * lib/exports/incentive-catalog-xlsx.ts), so this is the existing pattern.
 *
 * ── A FAITHFUL PORT, NOT A REDESIGN ────────────────────────────────────────
 * Identical cell values, identical row order, identical column widths, identical
 * sheet name. Only the writer changed — plus the header rows now carry bold
 * text, because ExcelJS can express that and a 117-column grid needs every cue
 * it can get. Deliberately NOT added: merged cells over the month bands. That
 * would change the file's shape, and the ask was the freeze.
 */

const MONTH_FIELDS = [
  "Hard Copy", "Google Drive", "Tally Entry", "Balance Tally",
  "CC Paid Date", "CC Paid Amt", "Int + Fin Chgs", "Chg Reversed?", "Notes",
] as const;

const STATIC_HEADERS = [
  "S. No", "Entity Name", "Card Name", "ECS", "ECS From?",
  "Stmt Period", "St Dt", "Due Dt", "Soft Copy Auto Email?",
] as const;

/** Widths for the 9 static columns, positionally. Monthly blocks get 12 each. */
const STATIC_WIDTHS = [6, 16, 22, 8, 12, 12, 6, 6, 16] as const;
const MONTH_COL_WIDTH = 12;

/**
 * How many columns are frozen, and how many rows.
 *
 * `FROZEN_COLS` is the static block; `FROZEN_ROWS` is title + month band + field
 * names. Named rather than inlined because the two header rows below and this
 * split have to agree — a header row added without moving the split would
 * scroll away, which is the failure this whole module exists to fix.
 */
const FROZEN_COLS = STATIC_HEADERS.length; // 9
const FROZEN_ROWS = 3;

const INK = "FF0F172A";
const INK_SOFT = "FF475569";
const HEADER_BG = "FFF1F5F9";
const HAIRLINE = "FFE2E8F0";

export async function renderCcMasterXlsx(input: {
  fy: number;
  cards: CcCardRow[];
  months: CcMonthRow[];
}): Promise<ArrayBuffer> {
  const { fy, cards, months } = input;
  const cols = fyMonthCols(fy); // Apr→Mar
  const byKey = new Map(months.map((m) => [`${m.cardId}:${m.month}`, m]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Altus Corp — Credit Cards Master";
  wb.created = new Date();

  const ws = wb.addWorksheet(`CC Master ${fyLabel(fy)}`, {
    // THE FIX. Card names stay put when you scroll right; field names stay put
    // when you scroll down.
    views: [{ state: "frozen", xSplit: FROZEN_COLS, ySplit: FROZEN_ROWS }],
  });

  // ── Column widths ────────────────────────────────────────────────────────
  STATIC_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  const totalMonthCols = cols.length * MONTH_FIELDS.length;
  for (let i = 0; i < totalMonthCols; i++) {
    ws.getColumn(FROZEN_COLS + i + 1).width = MONTH_COL_WIDTH;
  }

  // ── Row 1: title ─────────────────────────────────────────────────────────
  const title = ws.addRow([`Credit Cards Master · ${fyLabel(fy)}`]);
  title.getCell(1).font = { bold: true, size: 13, color: { argb: INK } };
  title.height = 20;

  // ── Row 2: the month band — year label over the first cell of each block ──
  const groupRow: string[] = [...STATIC_HEADERS.map(() => "")];
  for (const c of cols) {
    for (let i = 0; i < MONTH_FIELDS.length; i++) {
      groupRow.push(i === 0 ? c.yearLabel : "");
    }
  }
  const band = ws.addRow(groupRow);
  band.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 10, color: { argb: INK } };
    cell.alignment = { vertical: "middle" };
  });

  // ── Row 3: field names ───────────────────────────────────────────────────
  const fieldRow: string[] = [...STATIC_HEADERS];
  for (const _ of cols) fieldRow.push(...MONTH_FIELDS);
  const header = ws.addRow(fieldRow);
  header.height = 18;
  header.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 9.5, color: { argb: INK_SOFT } };
    cell.alignment = { vertical: "middle", wrapText: false };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.border = { bottom: { style: "thin", color: { argb: HAIRLINE } } };
  });

  // ── Body — one row per card ──────────────────────────────────────────────
  for (const c of cards) {
    const row: string[] = [
      c.code ?? "", c.entityName ?? "", c.cardName, c.ecs ?? "", c.ecsFrom ?? "",
      c.stmtPeriod ?? "", c.stmtStartDay ?? "", c.dueDay ?? "", c.softCopyAutoEmail ?? "",
    ];
    for (const col of cols) {
      const m = byKey.get(`${c.id}:${col.month}`);
      row.push(
        m?.hardCopy ?? "", m?.googleDrive ?? "", m?.tallyEntry ?? "", m?.balanceTally ?? "",
        m?.ccPaidDate ?? "", m?.ccPaidAmt ?? "", m?.intFinChgs ?? "", m?.chgReversed ?? "",
        m?.notes ?? "",
      );
    }
    ws.addRow(row);
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** The download filename for one financial year. */
export function ccMasterFilename(fy: number): string {
  return `CC-Master-${fyLabel(fy).replace(/[^0-9A-Za-z-]/g, "")}.xlsx`;
}

/** Exported for the test, so the sheet's shape is asserted, not assumed. */
export const CC_MASTER_SHAPE = {
  MONTH_FIELDS,
  STATIC_HEADERS,
  FROZEN_COLS,
  FROZEN_ROWS,
} as const;
