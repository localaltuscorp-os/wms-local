import "server-only";

import ExcelJS from "exceljs";
import { VENDOR_COLUMNS } from "@/lib/operations/directory";
import { requiredHeader } from "./field-config";

const DATA_ROWS = 500;

/**
 * Vendor Directory's built-in workbook. Categories are supplied by the Vendor
 * Category Master at download time, so this workbook cannot drift from the
 * importer that validates the same master.
 */
export async function buildVendorTemplate(
  categories: readonly string[],
  required: ReadonlySet<string>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ALTUS Corp — Vendor Directory";
  const lists = workbook.addWorksheet("Lists", { state: "veryHidden" });
  lists.getCell("A1").value = "Vendor Categories";
  categories.forEach((category, index) => {
    lists.getCell(`A${index + 2}`).value = category;
  });

  const sheet = workbook.addWorksheet("Vendors", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  const headers = VENDOR_COLUMNS.map((column) => requiredHeader(column.label, column.key, required));
  const header = sheet.addRow(headers);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  VENDOR_COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(16, Math.min(28, column.label.length + 5));
  });
  sheet.autoFilter = { from: "A1", to: `${columnLetter(VENDOR_COLUMNS.length)}1` };

  const categoryIndex = VENDOR_COLUMNS.findIndex((column) => column.key === "category") + 1;
  if (categoryIndex && categories.length > 0) {
    const range = `Lists!$A$2:$A$${categories.length + 1}`;
    for (let row = 2; row <= DATA_ROWS + 1; row += 1) {
      sheet.getCell(row, categoryIndex).dataValidation = {
        type: "list",
        allowBlank: !required.has("category"),
        formulae: [range],
        showErrorMessage: true,
        errorTitle: "Choose a Vendor Category",
        error: "Use a category from Vendor Category Master.",
      };
    }
  }
  const result = await workbook.xlsx.writeBuffer();
  return Buffer.from(result);
}

function columnLetter(column: number): string {
  let value = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + ((n - 1) % 26)) + value;
  return value;
}
