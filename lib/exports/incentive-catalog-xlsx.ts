import "server-only";
import ExcelJS from "exceljs";
import type { CatalogRow } from "@/lib/queries/incentive-catalog";
import {
  INCENTIVE_AMOUNT_COLUMN,
  INCENTIVE_EXPORT_HEADERS,
  INCENTIVE_EXPORT_WIDTHS,
  INCENTIVE_WRAP_COLUMNS,
  toIncentiveExportRow,
} from "@/lib/exports/incentive-catalog";

/**
 * THE INCENTIVE TABLE as a real .xlsx workbook — every row, every column.
 *
 * ── WHY ExcelJS AND NOT SheetJS ────────────────────────────────────────────
 * Most exports in this app use SheetJS (`xlsx`), and that would have been the
 * obvious thing to copy. It cannot do the one thing this export was asked for:
 * SheetJS's community build DOES NOT WRITE FREEZE PANES. Setting `ws["!freeze"]`
 * is accepted, changes nothing, and produces a file with no `<pane>` element at
 * all — verified by unzipping its output. (`/accounts/cc-tracker/export` sets it
 * today and has silently never frozen anything.)
 *
 * ExcelJS writes panes, wrapped text and per-cell number formats properly, is
 * ALREADY used by this project for two other workbooks (/events/export.xlsx,
 * /goals/template.xlsx), and so is the existing pattern rather than a new
 * dependency.
 *
 * Lives in lib/ rather than inside the route so it can be unit-tested — a
 * Next.js route file may only export HTTP handlers.
 */

const BRAND = "FFE10600";
const INK = "FF0F172A";
const INK_SOFT = "FF475569";
const HAIRLINE = "FFE2E8F0";
const HEADER_BG = "FFF8FAFC";

/** ₹ with thousands separators and 2dp, negative in brackets. */
const INR_FORMAT = '"₹"#,##0.00;[Red]("₹"#,##0.00)';

/** Build the workbook. Returns the raw .xlsx bytes. */
export async function renderIncentiveCatalogXlsx(
  rows: CatalogRow[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Altus Corp — Incentive Table";
  wb.created = new Date();

  const ws = wb.addWorksheet("Incentive Table", {
    // ySplit: 2 — the title row AND the header row stay put, so scrolling a long
    // catalog never loses the column names. This is the line SheetJS could not
    // produce; see the header note.
    views: [{ state: "frozen", ySplit: 2 }],
  });

  INCENTIVE_EXPORT_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // ── Title row, merged across every column ────────────────────────────────
  const title = ws.addRow([
    `Altus Corp — Incentive Table · ${rows.length} ${rows.length === 1 ? "incentive" : "incentives"}`,
  ]);
  ws.mergeCells(title.number, 1, title.number, INCENTIVE_EXPORT_HEADERS.length);
  title.getCell(1).font = { bold: true, size: 14, color: { argb: BRAND } };
  title.getCell(1).alignment = { vertical: "middle" };
  title.height = 22;

  // ── Header row ───────────────────────────────────────────────────────────
  const header = ws.addRow([...INCENTIVE_EXPORT_HEADERS]);
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: INK_SOFT } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.border = { bottom: { style: "thin", color: { argb: HAIRLINE } } };
  });
  // Excel's own filter dropdowns, on the header row only.
  ws.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: INCENTIVE_EXPORT_HEADERS.length },
  };

  // ── Body ─────────────────────────────────────────────────────────────────
  const wrap = new Set<number>(INCENTIVE_WRAP_COLUMNS);
  for (const r of rows) {
    const row = ws.addRow(toIncentiveExportRow(r));
    row.eachCell((cell, col) => {
      cell.font = { size: 10, color: { argb: INK } };
      // Long descriptions and notes WRAP rather than spilling into the next
      // column or being clipped — the whole text is in the file and readable,
      // which is the point of exporting it.
      cell.alignment = wrap.has(col)
        ? { vertical: "top", wrapText: true }
        : { vertical: "top" };
      cell.border = { bottom: { style: "hair", color: { argb: HAIRLINE } } };
    });
    const amount = row.getCell(INCENTIVE_AMOUNT_COLUMN);
    amount.numFmt = INR_FORMAT;
    amount.alignment = { vertical: "top", horizontal: "right" };
    amount.font = { size: 10, bold: true, color: { argb: INK } };
  }

  if (rows.length === 0) {
    const empty = ws.addRow(["No incentives in the table yet."]);
    ws.mergeCells(empty.number, 1, empty.number, INCENTIVE_EXPORT_HEADERS.length);
    empty.getCell(1).font = { italic: true, size: 10, color: { argb: INK_SOFT } };
  } else {
    // Total row — the reason the amount column is a number and not "₹1,500".
    const total = ws.addRow([]);
    total.getCell(1).value = "Total";
    total.getCell(1).font = { bold: true, size: 10, color: { argb: INK } };
    const cell = total.getCell(INCENTIVE_AMOUNT_COLUMN);
    cell.value = { formula: `SUM(C1:C1)`.replace("C1:C1", amountRange(rows.length)) };
    cell.numFmt = INR_FORMAT;
    cell.font = { bold: true, size: 10, color: { argb: INK } };
    cell.alignment = { horizontal: "right" };
    total.eachCell((c) => {
      c.border = { top: { style: "thin", color: { argb: INK_SOFT } } };
    });
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/**
 * The A1 range covering the amount column's data rows.
 *
 * Rows 1 and 2 are the title and the header, so the body starts at 3 and the
 * last data row is `count + 2`. Built from the shared column index so moving a
 * column cannot leave the total summing the wrong one.
 */
function amountRange(count: number): string {
  const col = String.fromCharCode("A".charCodeAt(0) + INCENTIVE_AMOUNT_COLUMN - 1);
  return `${col}3:${col}${count + 2}`;
}
