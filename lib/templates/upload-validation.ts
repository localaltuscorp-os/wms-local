import * as XLSX from "xlsx";
import { templateDef } from "./registry";

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\s*\*\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function rows(buffer: Buffer, sheetName: string): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", WTF: true, cellDates: false });
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" }) : [];
}

function hasHeaders(sheetRows: unknown[][], expected: readonly string[]): boolean {
  const wanted = new Set(expected.map(clean));
  return sheetRows.slice(0, 20).some((row) => {
    const actual = new Set(row.map(clean).filter(Boolean));
    return [...wanted].every((header) => actual.has(header));
  });
}

/** Validate replacement bytes before storage. Reject corrupt or wrong-template workbooks. */
export function validateTemplateWorkbook(key: string, buffer: Buffer): { ok: true } | { ok: false; error: string } {
  const def = templateDef(key);
  if (!def) return { ok: false, error: "Unknown template." };
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return { ok: false, error: "Workbook is not a readable XLSX file." };
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", WTF: true });
  } catch {
    return { ok: false, error: "Workbook is not a readable XLSX file." };
  }
  if (!workbook.SheetNames.length) return { ok: false, error: "Workbook is not a readable XLSX file." };

  const variants = def.variants ?? [];
  if (!variants.length) return { ok: true };
  const sheetRows = workbook.SheetNames.map((name) => rows(buffer, name));
  const matched = variants.some((variant) =>
    sheetRows.some((sheet) => hasHeaders(sheet, variant.fields.map((field) => field.label))),
  );
  if (!matched) {
    return { ok: false, error: `Workbook headers do not match ${def.name}. Download the current template and try again.` };
  }
  return { ok: true };
}
