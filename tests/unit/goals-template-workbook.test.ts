import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decorateGoalsTemplate } from "@/lib/goals/template-workbook";

/**
 * Runs the real decoration over the real shipped .xlsx and re-opens the result.
 *
 * Every assertion here is something that broke, or would have broken silently,
 * when the Client column moved from the end of the sheet to position 2 —
 * `spliceColumns` moves cells but not data validations, and it cannot rewrite a
 * formula's column references at all. None of that shows up in a type-check;
 * it shows up as a workbook someone opens a week later.
 */

const MASTER = {
  clients: ["AA Tech", "AICL", "Altus Corp"],
  areas: ["Sales", "Collection", "Marketing"],
  measures: ["Rs.", "Nos.", "Yes/No"],
  types: ["Goal", "Target", "Milestone"],
  roster: ["Dattaram Kap", "Jeevan Bharambe"],
};

const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;
const LAST_DATA_ROW = 303;

let wb: ExcelJS.Workbook;
let goals: ExcelJS.Worksheet;
let heads: string[];

/** Values a list validation actually points at, followed into the Lists sheet. */
function listValues(cell: ExcelJS.Cell): string[] {
  const dv = cell.dataValidation;
  if (!dv || dv.type !== "list") return [];
  const m = /Lists!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)/.exec(String(dv.formulae[0]));
  if (!m) return [];
  const lists = wb.getWorksheet("Lists")!;
  const col = lists.getColumn(m[1]!).number;
  const out: string[] = [];
  for (let r = Number(m[2]); r <= Number(m[4]); r++) out.push(String(lists.getCell(r, col).value ?? ""));
  return out;
}

const colOf = (header: string) => heads.indexOf(header) + 1;

beforeAll(async () => {
  const base = await readFile(path.join(process.cwd(), "public", "templates", "Altus-Goals-Template.xlsx"));
  const out = await decorateGoalsTemplate(base, MASTER);
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out as unknown as ArrayBuffer);
  goals = wb.getWorksheet("Goals")!;
  heads = [];
  for (let c = 1; c <= goals.columnCount; c++) heads.push(String(goals.getCell(HEADER_ROW, c).value ?? ""));
}, 60_000);

describe("Goals bulk-import workbook", () => {
  it("puts Client in column 2, right beside Area", () => {
    expect(heads.slice(0, 3)).toEqual(["Area", "Client", "Goal Title"]);
  });

  it("keeps every original column", () => {
    for (const h of ["Goal Title", "Target Date", "Measure", "Actual", "Target", "Delegated", "Type", "Weight"]) {
      expect(heads).toContain(h);
    }
  });

  it.each([
    ["Area", MASTER.areas],
    ["Client", MASTER.clients],
    ["Measure", MASTER.measures],
    ["Type", MASTER.types],
    ["Delegated", MASTER.roster],
  ])("gives %s a dropdown of the live values", (header, expected) => {
    // Top, middle and bottom of the grid — a validation applied to only the
    // first row looks fine in a spot check and is useless on row 200.
    for (const r of [FIRST_DATA_ROW, 150, LAST_DATA_ROW]) {
      expect(listValues(goals.getCell(r, colOf(header as string)))).toEqual(expected);
    }
  });

  it("leaves the free-text and numeric columns unvalidated", () => {
    for (const h of ["Goal Title", "Actual", "Target", "Weight"]) {
      expect(goals.getCell(FIRST_DATA_ROW, colOf(h)).dataValidation).toBeFalsy();
    }
  });

  it("keeps Target Date's day-number rule, and only on Target Date", () => {
    // This is the one that broke: spliceColumns left the rule pinned to column
    // 3, which after the insert is Goal Title — typing a goal there was
    // rejected as "Day only".
    const dv = goals.getCell(FIRST_DATA_ROW, colOf("Target Date")).dataValidation;
    expect(dv?.type).toBe("whole");
    expect(dv?.formulae).toEqual([1, 31]);
    expect(goals.getCell(FIRST_DATA_ROW, colOf("Goal Title")).dataValidation).toBeFalsy();
  });

  it("repoints the Weight formula at Goal Title, not at Client", () => {
    // Weight is an equal split across filled Goal Titles. Goal Title moved from
    // B to C; a formula still reading $B would now be counting CLIENTS, and
    // would have gone on producing plausible wrong numbers in silence.
    const wCol = colOf("Weight");
    for (const r of [FIRST_DATA_ROW, 5, LAST_DATA_ROW]) {
      const formula = (goals.getCell(r, wCol).value as ExcelJS.CellFormulaValue).formula;
      expect(formula).toContain(`$C${r}`);
      expect(formula).toContain("COUNTA($C$4:$C$303)");
      expect(formula).not.toContain("$B");
    }
  });

  it("carries no stale cached value on the rewritten formulas", () => {
    // A formula with no stored result is one Excel recalculates on open.
    const cell = goals.getCell(FIRST_DATA_ROW, colOf("Weight")).value as ExcelJS.CellFormulaValue;
    expect(cell.result).toBeUndefined();
  });

  it("rules the inserted column like the rest of the table", () => {
    // The old bug: only the HEADER was styled, so 300 data cells had a dropdown
    // but no borders and no banding — a blank white strip beside a ruled table.
    for (const r of [FIRST_DATA_ROW, 5, 150, LAST_DATA_ROW]) {
      const client = goals.getCell(r, colOf("Client"));
      const area = goals.getCell(r, colOf("Area"));
      expect(Object.keys(client.border ?? {}).sort()).toEqual(["bottom", "left", "right", "top"]);
      // Same row, same band: copied per row, not from one fixed template cell.
      expect(JSON.stringify(client.fill ?? null)).toBe(JSON.stringify(area.fill ?? null));
    }
  });

  it("turns gridlines on for every visible sheet", () => {
    for (const ws of wb.worksheets) {
      if (ws.state === "veryHidden" || ws.state === "hidden") continue;
      expect(ws.views.every((v) => v.showGridLines)).toBe(true);
    }
  });

  it("keeps the Lists sheet out of sight", () => {
    expect(wb.getWorksheet("Lists")!.state).toBe("veryHidden");
  });

  it("spans the title band across the widened grid", () => {
    // The band is two merged rows. Left at its old width it would stop one
    // column short and leave a bare white cell above the new column.
    const merges = (goals as unknown as { model: { merges: string[] } }).model.merges;
    const last = goals.getColumn(goals.columnCount).letter;
    expect(merges).toContain(`A1:${last}1`);
    expect(merges).toContain(`A2:${last}2`);
  });

  it("gives the Examples sheet a Client column with a real value in it", () => {
    const ex = wb.getWorksheet("Examples")!;
    const exHeads: string[] = [];
    for (let c = 1; c <= ex.columnCount; c++) exHeads.push(String(ex.getCell(1, c).value ?? ""));
    expect(exHeads.slice(0, 3)).toEqual(["Area", "Client", "Goal Title"]);
    // Both reference rows carry one, and it is a client that actually exists.
    expect(String(ex.getCell(2, 2).value)).toBe("AA Tech");
    expect(String(ex.getCell(3, 2).value)).toBe("AICL");
  });

  it("documents the column in How to use", () => {
    const how = wb.getWorksheet("How to use")!;
    const rows: string[] = [];
    for (let r = 1; r <= how.rowCount; r++) rows.push(String(how.getCell(r, 1).value ?? ""));
    expect(rows).toContain("Client");
  });

  it("degrades to no dropdown rather than a broken one when a list is empty", () => {
    // An empty range is an Excel error, not an empty dropdown.
    expect(async () => {
      const base = await readFile(path.join(process.cwd(), "public", "templates", "Altus-Goals-Template.xlsx"));
      await decorateGoalsTemplate(base, { clients: [], areas: [], measures: [], types: [], roster: [] });
    }).not.toThrow();
  });
});

describe("Goals workbook with no master data at all", () => {
  it("still produces a valid file, with Client in place and no empty dropdowns", async () => {
    const base = await readFile(path.join(process.cwd(), "public", "templates", "Altus-Goals-Template.xlsx"));
    const out = await decorateGoalsTemplate(base, { clients: [], areas: [], measures: [], types: [], roster: [] });
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(out as unknown as ArrayBuffer);
    const g = w.getWorksheet("Goals")!;
    expect(String(g.getCell(HEADER_ROW, 2).value)).toBe("Client");
    expect(g.getCell(FIRST_DATA_ROW, 2).dataValidation).toBeFalsy();
    // The fallback example names are used when there are no real clients.
    const ex = w.getWorksheet("Examples")!;
    expect(String(ex.getCell(2, 2).value)).toBe("Carbide India");
  }, 60_000);
});
