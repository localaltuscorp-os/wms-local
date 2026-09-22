import "server-only";
import ExcelJS from "exceljs";
import { safeSheetName, uniqueFileName } from "./names";
import type { DatasetRows, ExportFile } from "./types";

/**
 * The module's workbook: one tab per dataset, plus a "Files" tab listing every
 * attachment with a link to its copy in the same folder.
 *
 * WHY THE LINKS ARE RELATIVE. Asked for on 21 Sep: "I will store all the PDFs'
 * links and images accordingly". A signed Supabase URL expires within hours, so
 * a workbook full of them is useless by the time anyone opens it. The files are
 * copied into the run's own folder instead, and a row links to its neighbour —
 * which keeps working after the folder is moved, shared or downloaded.
 */

export interface SheetInput {
  readonly tab: string;
  readonly data: DatasetRows;
  /** The name each file was given inside the folder, in the order they appear. */
  readonly fileNames: readonly string[];
}

export { safeSheetName, uniqueFileName };

/**
 * Build the .xlsx. Header row frozen and bold, columns sized to their content
 * so nobody has to widen 30 columns by hand before reading anything.
 */
export async function buildWorkbook(args: {
  moduleLabel: string;
  since: Date | null;
  until: Date;
  sheets: readonly SheetInput[];
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Altus OS";
  wb.created = args.until;

  const taken = new Set<string>();

  // A cover tab, because a folder of dated workbooks is unreadable without one:
  // which module is this, and what window does it cover?
  const cover = wb.addWorksheet(safeSheetName("About this export", taken));
  cover.columns = [{ width: 26 }, { width: 60 }];
  cover.addRows([
    ["Module", args.moduleLabel],
    ["Covers", args.since ? "Added or changed since the last export" : "Everything (first export)"],
    ["From", args.since ?? "the beginning"],
    ["Up to", args.until],
    ["Made by", "Altus OS — Module Backups"],
  ]);
  cover.getColumn(1).font = { bold: true };

  const allFiles: { tab: string; name: string }[] = [];

  for (const sheet of args.sheets) {
    const ws = wb.addWorksheet(safeSheetName(sheet.tab, taken));
    ws.addRow([...sheet.data.columns]);
    for (const row of sheet.data.rows) ws.addRow([...row]);

    const header = ws.getRow(1);
    header.font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (sheet.data.rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.data.columns.length } };
    }
    ws.columns.forEach((column, i) => {
      let width = String(sheet.data.columns[i] ?? "").length + 2;
      for (const row of sheet.data.rows) {
        const value = row[i];
        const len = value instanceof Date ? 19 : String(value ?? "").length;
        if (len + 2 > width) width = Math.min(len + 2, 60);
      }
      column.width = width;
    });

    sheet.fileNames.forEach((name) => allFiles.push({ tab: sheet.tab, name }));
  }

  if (allFiles.length > 0) {
    const ws = wb.addWorksheet(safeSheetName("Files", taken));
    ws.addRow(["From tab", "File", "Open"]);
    ws.getRow(1).font = { bold: true };
    for (const file of allFiles) {
      const row = ws.addRow([file.tab, file.name, "Open"]);
      // Relative to the workbook, i.e. the file sitting beside it in the folder.
      row.getCell(3).value = { text: "Open", hyperlink: `./${encodeURIComponent(file.name)}` };
      row.getCell(3).font = { color: { argb: "FF0563C1" }, underline: true };
    }
    ws.columns = [{ width: 28 }, { width: 60 }, { width: 10 }];
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Total bytes a set of files would add, for the manual download's size cap. */
export function fileCount(files: readonly ExportFile[] | undefined): number {
  return files?.length ?? 0;
}
