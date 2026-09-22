import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * THE DOWNLOAD SEAM, END TO END (minus the browser).
 *
 * These call the REAL route handlers — the generic /api/templates/[key] door,
 * the module routes kept for bookmarks, and Upload Master's own download — with
 * the session, the storage object and the `template_files` row stubbed. What is
 * being proved is the promise the whole feature rests on:
 *
 *   1. a module's "Download Template" serves a real workbook, and
 *   2. an administrator's REPLACEMENT is what it serves instead (Upload Master
 *      → Replace → the module's own button), and
 *   3. the Goals levels are addressed separately, so replacing Monthly does not
 *      touch Yearly, and
 *   4. an unknown key is a 404 rather than an empty file.
 *
 * The DB is stubbed rather than reached: `template_files` may not exist in a
 * given environment, and a test that needs production schema to pass is a test
 * that fails for the wrong reason.
 */

vi.mock("server-only", () => ({}));

interface OverrideRow {
  storagePath: string;
  contentType: string;
  fileName: string;
  fileSize: number;
}

/**
 * The `template_files` table, keyed by template — the PER-KEY part is what this
 * test is about, so it is modelled rather than ignored: a stub that answered
 * every key with the same row would make "replacing Monthly leaves Yearly
 * alone" pass for the wrong reason.
 */
const { overrides } = vi.hoisted(() => ({ overrides: new Map<string, unknown>() }));
vi.mock("@/lib/queries/template-files", () => ({
  getTemplateOverride: async (key: string) => overrides.get(key) ?? null,
}));

// The replacement's bytes, as Supabase Storage would hand them back.
const stored: Record<string, Buffer> = {};
vi.mock("@/lib/storage/objects", () => ({
  getObject: async (_bucket: string, path: string) => stored[path] ?? null,
}));
vi.mock("@/lib/supabase/admin", () => ({ DOCUMENTS_BUCKET: "documents" }));

// The guards: satisfied, because this test is about what the handler SERVES.
vi.mock("@/lib/tasks/scope", () => ({ currentTaskVisibility: async () => null }));
vi.mock("@/lib/auth/current", () => ({ requireUser: async () => ({ id: "me" }), requireAdmin: async () => ({ id: "me" }) }));
vi.mock("@/lib/goals/access", () => ({ requireGoalsAccess: async () => {} }));
vi.mock("@/lib/accounts/access", () => ({ requireAccountsAccess: async () => {} }));
vi.mock("@/lib/permissions/api-guard", () => ({ apiViewDenial: async () => null }));

// The builders read master data (roster, subjects, clients) to decorate their
// dropdowns. Empty is enough: this test is about which FILE is served.
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
vi.mock("@/lib/goals/lookups", () => ({ listGoalLookups: async () => ({ areas: [], measures: [], types: [] }) }));
vi.mock("@/lib/goals/template-workbook", () => ({ decorateGoalsTemplate: async (b: Buffer) => b }));

import { GET as genericGet } from "@/app/api/templates/[key]/route";
import { GET as tasksGet } from "@/app/(app)/tasks/template.xlsx/route";
import { GET as goalsGet } from "@/app/(app)/goals/template.xlsx/route";
import { GET as accountsGet } from "@/app/(app)/accounts/task-list/template/route";
import { GET as adminGet } from "@/app/(admin)/admin/upload-master/download/[key]/route";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";

const XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function params(key: string) {
  return { params: Promise.resolve({ key }) };
}

async function body(res: Response): Promise<Buffer> {
  return Buffer.from(await res.arrayBuffer());
}

function isXlsx(buf: Buffer): boolean {
  // Every .xlsx is a zip: "PK".
  return buf.length > 2 && buf[0] === 0x50 && buf[1] === 0x4b;
}

beforeEach(() => {
  overrides.clear();
  for (const k of Object.keys(stored)) delete stored[k];
});

describe("the generic download door", () => {
  it("serves the Tasks built-in as a real spreadsheet", async () => {
    const res = await genericGet(new Request("http://x/api/templates/tasks"), params(TEMPLATE_KEYS.tasks));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX_CT);
    expect(res.headers.get("content-disposition")).toContain("Altus-Tasks-Template.xlsx");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(isXlsx(await body(res))).toBe(true);
  });

  it("serves the Weekly Goals workbook with its own filename", async () => {
    const res = await genericGet(
      new Request("http://x/api/templates/weekly_goals_bulk_import"),
      params(TEMPLATE_KEYS.weeklyGoals),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("Weekly-Goals-Template.xlsx");
    expect(isXlsx(await body(res))).toBe(true);
  });

  it("serves the Projects workbook for the requested kind", async () => {
    const res = await genericGet(
      new Request("http://x/api/templates/projects_bulk_import?kind=action"),
      params(TEMPLATE_KEYS.projects),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("action");
    expect(isXlsx(await body(res))).toBe(true);
  });

  it("404s an unknown key rather than answering with an empty file", async () => {
    const res = await genericGet(new Request("http://x/api/templates/nope"), params("nope"));
    expect(res.status).toBe(404);
  });
});

describe("a replaced template is what the modules download", () => {
  const REPLACEMENT = Buffer.from("PK\u0003\u0004 the administrator's own workbook");

  beforeEach(() => {
    stored["templates/tasks/abc/Replaced.xlsx"] = REPLACEMENT;
    overrides.set(TEMPLATE_KEYS.tasks, {
      storagePath: "templates/tasks/abc/Replaced.xlsx",
      contentType: XLSX_CT,
      fileName: "Replaced.xlsx",
      fileSize: REPLACEMENT.length,
    } satisfies OverrideRow);
  });

  it("serves the replacement from the generic door", async () => {
    const res = await genericGet(new Request("http://x/api/templates/tasks"), params(TEMPLATE_KEYS.tasks));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("Replaced.xlsx");
    expect((await body(res)).equals(REPLACEMENT)).toBe(true);
  });

  it("serves the same replacement from the module route kept for bookmarks", async () => {
    const res = await tasksGet(new Request("http://x/tasks/template.xlsx"));
    expect(res.status).toBe(200);
    expect((await body(res)).equals(REPLACEMENT)).toBe(true);
  });

  it("serves it from Upload Master's own download too", async () => {
    const res = await adminGet(new Request("http://x/admin/upload-master/download/tasks"), params(TEMPLATE_KEYS.tasks));
    expect(res.status).toBe(200);
    expect((await body(res)).equals(REPLACEMENT)).toBe(true);
  });
});

describe("the Goals levels are addressed separately", () => {
  const MONTHLY = Buffer.from("PK\u0003\u0004 monthly replacement");

  beforeEach(() => {
    stored["templates/monthly_goals_bulk_import/x/Monthly.xlsx"] = MONTHLY;
    overrides.set(TEMPLATE_KEYS.monthlyGoals, {
      storagePath: "templates/monthly_goals_bulk_import/x/Monthly.xlsx",
      contentType: XLSX_CT,
      fileName: "Monthly.xlsx",
      fileSize: MONTHLY.length,
    } satisfies OverrideRow);
  });

  it("applies a monthly replacement to the monthly download", async () => {
    const res = await goalsGet(new Request("http://x/goals/template.xlsx?level=month"));
    expect((await body(res)).equals(MONTHLY)).toBe(true);
  });

  it("leaves the yearly download on its own built-in", async () => {
    const res = await goalsGet(new Request("http://x/goals/template.xlsx?level=year"));
    const buf = await body(res);
    expect(buf.equals(MONTHLY)).toBe(false);
    expect(isXlsx(buf)).toBe(true);
  });

  it("serves the monthly replacement through the generic door's monthly key", async () => {
    const res = await genericGet(
      new Request("http://x/api/templates/monthly_goals_bulk_import?level=month&periodKey=2026-07"),
      params(TEMPLATE_KEYS.monthlyGoals),
    );
    expect((await body(res)).equals(MONTHLY)).toBe(true);
  });
});

describe("the Accounts workbook", () => {
  it("still resolves through the registry from its module route", async () => {
    const res = await accountsGet(new Request("http://x/accounts/task-list/template"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("Accounts-Task-List-Template.xlsx");
    expect(isXlsx(await body(res))).toBe(true);
  });
});
