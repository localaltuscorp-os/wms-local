import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";

/**
 * TEMPLATE ↔ IMPORTER CONSISTENCY.
 *
 * The promise Upload Master makes is that what an administrator replaces is what
 * the module hands over — and the promise the registry makes is that the file a
 * module hands over is one its own importer can read. Those are two different
 * promises, and only the second can be checked without a browser: here, every
 * registered key is built and its header row is compared with the manifest its
 * importer parses.
 *
 * If somebody renames a column in a manifest and not in the template — or the
 * other way round — this test goes red, rather than somebody's Monday-morning
 * upload silently importing zero rows.
 */

vi.mock("server-only", () => ({}));

// The builders decorate their workbooks with live master data. None of that
// matters here: this test is about the COLUMN LAYOUT, so the reads answer empty
// and the Goals workbook is handed back undecorated (the real file on disk).
// `vi.mock` is hoisted above every const in this file, so the stub is built
// inside `vi.hoisted` — the factory below must not close over a plain const.
const { dbStub } = vi.hoisted(() => ({
  dbStub: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => [], limit: async () => [] }),
        orderBy: async () => [],
      }),
    }),
    query: { employees: { findFirst: async () => null } },
  },
}));
vi.mock("@/lib/db", () => ({ db: dbStub }));
vi.mock("@/lib/queries/subjects", () => ({ listActiveSubjectNames: async () => [] }));
vi.mock("@/lib/queries/clients", () => ({ listActiveClientNames: async () => [] }));
vi.mock("@/lib/goals/lookups", () => ({
  listGoalLookups: async () => ({ areas: [], measures: [], types: [] }),
}));
vi.mock("@/lib/goals/template-workbook", () => ({
  decorateGoalsTemplate: async (base: Buffer) => base,
}));

import { buildTemplate } from "@/lib/templates/resolve";
import { TEMPLATE_REGISTRY } from "@/lib/templates/registry";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";
import {
  TASK_TEMPLATE_COLUMNS,
  columnForHeader as taskColumnForHeader,
} from "@/lib/tasks/template-columns";
import { columnForHeader as goalColumnForHeader } from "@/lib/goals/template-columns";
import { WEEKLY_GOALS_COLUMNS } from "@/lib/weekly-goals/template-columns";
import { columnsFor } from "@/lib/project-plan/bulk";
import { PLAN_KINDS } from "@/lib/project-plan/levels";

/** Every cell of the first `rows` rows of a sheet, as strings. */
function headCells(buffer: Buffer, sheetName?: string, rows = 6): string[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const name = sheetName ?? wb.SheetNames[0]!;
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
  });
  return matrix
    .slice(0, rows)
    .flat()
    .map((c) => String(c ?? "").trim());
}

/**
 * The workbook's header row: the first row in the top `limit` rows with two or
 * more cells the importer recognises. Scanned rather than assumed, because the
 * styled templates carry a banner and a blank line above the grid.
 */
function headerRowCells(
  buffer: Buffer,
  sheetName: string,
  recognizes: (raw: unknown) => unknown,
  limit = 8,
): string[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, {
    header: 1,
    blankrows: true,
    defval: "",
  });
  for (let r = 0; r < Math.min(matrix.length, limit); r++) {
    if ((matrix[r] ?? []).filter((c) => recognizes(c)).length >= 2) {
      return (matrix[r] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
    }
  }
  return [];
}

function sheetNames(buffer: Buffer): string[] {
  return XLSX.read(buffer, { type: "buffer" }).SheetNames;
}

async function built(key: string, opts: Parameters<typeof buildTemplate>[1] = {}) {
  const t = await buildTemplate(key, opts);
  if (!t) throw new Error(`no built-in for ${key}`);
  return { ...t, buffer: Buffer.from(t.buffer) };
}

describe("every registered template", () => {
  it("is reachable through buildTemplate", async () => {
    for (const def of TEMPLATE_REGISTRY) {
      const t = await buildTemplate(def.key);
      expect(t, def.key).not.toBeNull();
      expect(t!.buffer.byteLength, def.key).toBeGreaterThan(0);
      expect(t!.fileName, def.key).toMatch(/\.xlsx$/);
    }
  });

  it("declares a module and a feature for the Upload Master list", () => {
    for (const def of TEMPLATE_REGISTRY) {
      expect(def.module, def.key).toBeTruthy();
      expect(def.feature, def.key).toBeTruthy();
      expect(def.name, def.key).toBeTruthy();
    }
  });

  it("registers each key exactly once", () => {
    const keys = TEMPLATE_REGISTRY.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Tasks workbook", () => {
  it("carries every column in the Tasks manifest, and nothing else", async () => {
    const { buffer } = await built(TEMPLATE_KEYS.tasks);
    expect(sheetNames(buffer)).toContain("Tasks");

    // The importer reads the sheet named "Tasks"; the header row sits under a
    // banner, so it is found the same way the parser finds it.
    const headers = headerRowCells(buffer, "Tasks", taskColumnForHeader);
    const mapped = headers.map((h) => taskColumnForHeader(h)?.field).filter(Boolean);

    for (const col of TASK_TEMPLATE_COLUMNS) {
      expect(mapped, `column "${col.header}" (${col.field})`).toContain(col.field);
    }
    // A column the importer does not recognise is a column a person fills in and
    // the upload then drops on the floor.
    const unrecognised = headers.filter((h) => !taskColumnForHeader(h));
    expect(unrecognised).toEqual([]);
  });
});

describe("Weekly Goals workbook", () => {
  it("carries the exact headers its importer recognises", async () => {
    const { buffer } = await built(TEMPLATE_KEYS.weeklyGoals);
    const cells = headCells(buffer);
    for (const col of WEEKLY_GOALS_COLUMNS) {
      expect(cells, `column "${col.header}"`).toContain(col.header);
    }
  });

  it("keeps the example rows OFF the sheet the importer reads", async () => {
    // Anything non-blank under the header imports as a real goal.
    const { buffer } = await built(TEMPLATE_KEYS.weeklyGoals);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    expect(grid.length).toBe(1); // header row only
  });
});

describe("Goals workbooks", () => {
  const keys = [
    TEMPLATE_KEYS.goals,
    TEMPLATE_KEYS.monthlyGoals,
    TEMPLATE_KEYS.quarterlyGoals,
    TEMPLATE_KEYS.yearlyGoals,
  ];

  it.each(keys)("%s parses, names the Goals sheet, and every column maps", async (key) => {
    const { buffer } = await built(key, { level: "month", periodKey: "2026-07" });
    expect(sheetNames(buffer)).toContain("Goals");

    // The Goals entry sheet is deliberately LEANER than the manifest — the
    // parser accepts the full alias set, and the file offers the columns a
    // person actually fills in. What must hold is that the importer recognises
    // EVERY column the file shows, and that the one required column is there.
    const headers = headerRowCells(buffer, "Goals", goalColumnForHeader);
    expect(headers.length).toBeGreaterThan(0);
    const unrecognised = headers.filter((h) => !goalColumnForHeader(h));
    expect(unrecognised).toEqual([]);

    const fields = headers.map((h) => goalColumnForHeader(h)?.field);
    expect(fields).toContain("title"); // the only hard requirement on import
  });
});

describe("Projects workbook", () => {
  it.each(PLAN_KINDS)("carries the %s kind's columns", async (kind) => {
    const { buffer } = await built(TEMPLATE_KEYS.projects, { kind });
    const cells = headCells(buffer);
    for (const col of columnsFor(kind)) {
      expect(cells, `${kind}: column "${col.header}"`).toContain(col.header);
    }
    // Start/End only exist for the scheduled kinds — offering them on a Project
    // would invite dates the plan then refuses to store.
    const hasScheduleCols = columnsFor(kind).some((c) => c.field === "startsAt");
    expect(cells.includes("Start Date")).toBe(hasScheduleCols);
  });

  it("falls back to the Project kind for an unknown kind rather than throwing", async () => {
    const t = await buildTemplate(TEMPLATE_KEYS.projects, { kind: "not_a_kind" });
    expect(t).not.toBeNull();
    expect(t!.buffer.byteLength).toBeGreaterThan(0);
  });
});

describe("Accounts workbook", () => {
  it("carries both sheets its importer reads", async () => {
    const { buffer } = await built(TEMPLATE_KEYS.accountsTaskList);
    const names = sheetNames(buffer);
    expect(names).toContain("Accounts Task List");
    expect(names).toContain("Screenshots to Post");

    const taskCells = headCells(buffer, "Accounts Task List");
    for (const h of ["Area", "Task Description", "Status", "Target Date", "Actual Date"]) {
      expect(taskCells, `task header "${h}"`).toContain(h);
    }
    const shotCells = headCells(buffer, "Screenshots to Post");
    for (const h of ["Project Name", "Project Details", "Frequency"]) {
      expect(shotCells, `shot header "${h}"`).toContain(h);
    }
  });
});
