import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));

import { buildComplianceTemplate } from "@/lib/compliance/bulk-template";
import { bulkColumns, readComplianceMatrix, type BulkPerson } from "@/lib/compliance/bulk";
import type { ComplianceKind } from "@/lib/compliance/schedule";

/**
 * The WCC / MCC bulk-upload workbook, opened the way Excel and the upload
 * dialog open it: its sheets, headers, dropdowns and hints — and a filled
 * copy read back into rows exactly as the dialog reads it.
 */

const people: BulkPerson[] = [
  { id: "p-priya", name: "Priya Shah", email: "priya@altus.in" },
  { id: "p-ravi", name: "Ravi Rao", email: "ravi@altus.in" },
];

async function open(kind: ComplianceKind) {
  const buf = await buildComplianceTemplate({ kind, people });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return { buf, wb };
}

/** What the upload dialog does with a file (components/compliance/compliance-bulk-upload.tsx). */
function readLikeTheDialog(data: ArrayBuffer | Buffer, kind: ComplianceKind) {
  const wb = XLSX.read(data, { type: "array" });
  const name = wb.SheetNames.find((n) => n.toUpperCase() === kind.toUpperCase())!;
  const sheet = wb.Sheets[name]!;
  const firstLine = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").s.r + 1;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
  return readComplianceMatrix(matrix, { kind, people, firstLine });
}

describe.each(["wcc", "mcc"] as const)("the %s workbook", (kind) => {
  const KIND = kind.toUpperCase();
  const cols = bulkColumns(kind);

  it("has the entry sheet first, then Examples and How to use, with the lists hidden", async () => {
    const { wb } = await open(kind);
    expect(wb.worksheets.map((w) => [w.name, w.state])).toEqual([
      ["Lists", "veryHidden"],
      [KIND, "visible"],
      ["Examples", "visible"],
      ["How to use", "visible"],
    ]);
  });

  it("writes the header on row 3, required columns starred, each with a note", async () => {
    const { wb } = await open(kind);
    const sheet = wb.getWorksheet(KIND)!;
    expect(String(sheet.getCell("A1").value)).toContain(`${KIND} — `);
    const header = cols.map((_, i) => String(sheet.getRow(3).getCell(i + 1).value));
    expect(header).toEqual(cols.map((c) => (c.required === "yes" ? `${c.header} *` : c.header)));
    expect(sheet.getRow(3).getCell(1).note).toBeTruthy();
  });

  it("gives every entry cell its dropdown or check, and a hint", async () => {
    const { wb } = await open(kind);
    const sheet = wb.getWorksheet(KIND)!;
    for (const [i, c] of cols.entries()) {
      for (const row of [4, 303]) {
        const v = sheet.getRow(row).getCell(i + 1).dataValidation;
        expect(v, `${c.header} row ${row}`).toBeTruthy();
        expect(v.prompt, c.header).toBe(c.prompt);
        if (c.list) expect(v.type, c.header).toBe("list");
      }
    }
    const freq = sheet.getRow(4).getCell(cols.findIndex((c) => c.field === "frequency") + 1).dataValidation;
    expect(freq.showErrorMessage).toBe(true);
    const lists = wb.getWorksheet("Lists")!;
    const listed = (formula: string) => {
      const [, col, from, to] = /^Lists!\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+)$/.exec(formula)!;
      return Array.from({ length: +to! - +from! + 1 }, (_, k) => lists.getCell(`${col}${+from! + k}`).value);
    };
    expect(listed(String(freq.formulae![0]))).toEqual(
      kind === "wcc"
        ? ["Mon to Sat", "Mon to Sun", "Each Day of the Week"]
        : ["Monthly", "2 times/month", "3 times/month", "Alternate Month", "Quarterly", "Half Yearly", "Annually"],
    );
    const who = sheet.getRow(4).getCell(1).dataValidation;
    expect(listed(String(who.formulae![0]))).toEqual(["Priya Shah", "Ravi Rao"]);
  });

  it("highlights what a row still needs", async () => {
    const { wb } = await open(kind);
    const cf = (wb.getWorksheet(KIND) as unknown as { conditionalFormattings: { ref: string }[] }).conditionalFormattings;
    expect(cf.length).toBeGreaterThanOrEqual(kind === "wcc" ? 4 : 6);
  });

  it("fills every example so that it reads clean", async () => {
    const { wb } = await open(kind);
    const ex = wb.getWorksheet("Examples")!;
    const reads: string[] = [];
    ex.eachRow((row, n) => {
      if (n > 1) reads.push(String(row.getCell(cols.length + 1).value));
    });
    expect(reads.length).toBeGreaterThanOrEqual(kind === "wcc" ? 5 : 8);
    for (const r of reads) expect(r).toMatch(kind === "wcc" ? /^(Mon to Sat|Mon to Sun|Each Day of the Week) — / : /^(Monthly|2 times\/month|3 times\/month|Alternate Month|Quarterly|Half Yearly|Annually) — /);
    // Every WCC example says how long it takes.
    if (kind === "wcc") for (const r of reads) expect(r).toMatch(/ · \d+ mins/);
  });

  it("reads back empty — no rows, no error — straight from the download", async () => {
    const { buf } = await open(kind);
    expect(readLikeTheDialog(buf, kind)).toEqual({ rows: [] });
  });
});

describe("a filled template, uploaded", () => {
  it("MCC: comes back as rows with their Excel row numbers", async () => {
    const { wb } = await open("mcc");
    const sheet = wb.getWorksheet("MCC")!;
    sheet.getRow(4).values = ["Priya Shah", "Accounts", "Pay the GST", "Monthly", 20];
    sheet.getRow(5).values = ["Ravi Rao", "", "Send the MIS", "2 times/month", 15, "Last day"];
    sheet.getRow(7).values = ["Priya Shah", "Statutory", "File the TDS return", "Quarterly", "Last day", null, null, "July"];
    sheet.getRow(8).values = ["Priya Shah", "", "Visit 12 client sites", "Monthly", 5, null, null, null, 12, "visits"];
    const out = readLikeTheDialog(Buffer.from(await wb.xlsx.writeBuffer()), "mcc");
    expect(out.error).toBeUndefined();
    expect(out.rows.map((r) => [r.line, r.ownerName, r.frequency, r.when, r.counts, r.errors])).toEqual([
      [4, "Priya Shah", "Monthly", "by the 20th", null, []],
      [5, "Ravi Rao", "2 times/month", "by the 15th & month-end", null, []],
      [7, "Priya Shah", "Quarterly", "by month-end · Jul, Oct, Jan, Apr", null, []],
      [8, "Priya Shah", "Monthly", "by the 5th", "12 visits", []],
    ]);
  });

  it("WCC: comes back as rows, the Days read from a typed list", async () => {
    const { wb } = await open("wcc");
    const sheet = wb.getWorksheet("WCC")!;
    sheet.getRow(4).values = ["Priya Shah", "Calls", "Call every lead", "Mon to Sat"];
    sheet.getRow(5).values = ["Ravi Rao", "", "Send 25 emails", "Each Day of the Week", "Mon, Wed & Fri", 45, 25, "emails"];
    sheet.getRow(6).values = ["Ravi Rao", "Security", "Check the CCTV", "Mon to Sun", null, 10];
    const out = readLikeTheDialog(Buffer.from(await wb.xlsx.writeBuffer()), "wcc");
    expect(out.rows.map((r) => [r.line, r.when, r.minutes, r.counts, r.errors])).toEqual([
      [4, "Every day but Sunday", null, null, []],
      [5, "Each Mon, Wed & Fri", 45, "25 emails", []],
      [6, "Every day", 10, null, []],
    ]);
  });

  it("WCC: checks Mins in Excel itself — a whole number, 1 to 1440", async () => {
    const { wb } = await open("wcc");
    const sheet = wb.getWorksheet("WCC")!;
    const at = bulkColumns("wcc").findIndex((c) => c.field === "mins") + 1;
    expect(String(sheet.getRow(3).getCell(at).value)).toBe("Mins");
    const v = sheet.getRow(4).getCell(at).dataValidation;
    expect(v).toMatchObject({ type: "whole", operator: "between", formulae: [1, 1440], showErrorMessage: true });
  });
});
