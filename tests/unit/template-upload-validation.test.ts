import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { validateTemplateWorkbook } from "@/lib/templates/upload-validation";
import { templateDef } from "@/lib/templates/registry";

function workbook(key: string): Buffer {
  const fields = templateDef(key)!.variants![0]!.fields.map((field) => field.label);
  const sheet = XLSX.utils.aoa_to_sheet([fields]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Import");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Upload Master workbook validation", () => {
  it("accepts a readable workbook with registry headers", () => {
    expect(validateTemplateWorkbook("projects_bulk_import", workbook("projects_bulk_import"))).toEqual({ ok: true });
  });

  it("rejects corrupt bytes", () => {
    expect(validateTemplateWorkbook("projects_bulk_import", Buffer.from("not xlsx"))).toEqual({
      ok: false,
      error: "Workbook is not a readable XLSX file.",
    });
  });

  it("rejects wrong headers", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["wrong", "headers"]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Import");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = validateTemplateWorkbook("projects_bulk_import", buffer);
    expect(result.ok).toBe(false);
  });
});
