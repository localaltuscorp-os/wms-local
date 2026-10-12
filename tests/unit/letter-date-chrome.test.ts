import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectFields } from "@/lib/hr/letters/types";
import { getLetter } from "@/lib/hr/letters/registry";

describe("letter document dates", () => {
  it("does not inject an automatic top-of-body date in the editor or PDF", () => {
    const editor = readFileSync("components/hr/letters/letter-editor.tsx", "utf8");
    const pdf = readFileSync("lib/hr/letters/pdf.ts", "utf8");

    expect(editor).not.toContain('className="alw-date"');
    expect(pdf).not.toMatch(/\.text\(letterDate,[\s\S]*?align:\s*"right"/);
  });

  it("keeps the Selection Letter's Joining Date explicitly editable", () => {
    const selection = getLetter("selection");
    expect(selection).toBeDefined();
    expect(collectFields(selection!).map((field) => field.id)).toContain("joiningDate");
  });
});
