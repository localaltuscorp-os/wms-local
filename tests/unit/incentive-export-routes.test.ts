import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * THE TWO EXPORT ROUTES, invoked as HTTP handlers.
 *
 * The renderers are covered by incentive-export.test.ts; what is left is the
 * route contract, and it is the part a reviewer cannot check by reading:
 *
 *   · does an unauthenticated request get a clean 403 rather than a stack trace
 *     rendered through the error boundary,
 *   · do the response headers actually make a browser SAVE a file with the
 *     right name and type,
 *   · and — the whole point of the change — does the route read the FULL
 *     catalog from the data layer rather than anything the client sent.
 *
 * `listIncentiveCatalog` is mocked, so the assertion "it exported every row"
 * is made against a known dataset the request had no way to influence.
 */

const requireUser = vi.fn();
const listIncentiveCatalog = vi.fn();

vi.mock("@/lib/auth/current", () => ({
  requireUser: () => requireUser(),
}));
vi.mock("@/lib/queries/incentive-catalog", () => ({
  listIncentiveCatalog: () => listIncentiveCatalog(),
}));

const { GET: getPdf } = await import("@/app/(app)/incentive/export.pdf/route");
const { GET: getXlsx } = await import("@/app/(app)/incentive/export.xlsx/route");

type Row = {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  salesEligible: boolean;
  internsEligible: boolean;
  notes: string | null;
  sortOrder: number;
  active: boolean;
};

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    name: `Incentive ${i + 1}`,
    description: `Applies when condition ${i + 1} is met.`,
    amount: (i + 1) * 100,
    salesEligible: i % 2 === 0,
    internsEligible: true,
    notes: null,
    sortOrder: 100,
    active: true,
  }));

beforeEach(() => {
  requireUser.mockReset();
  listIncentiveCatalog.mockReset();
  requireUser.mockResolvedValue({ id: "emp-1", name: "Om Jadhav", isAdmin: false });
  listIncentiveCatalog.mockResolvedValue(rows(12));
});

describe("access", () => {
  it("both routes answer 403 — not a thrown error — when not signed in", async () => {
    requireUser.mockRejectedValue(new Error("no session"));
    for (const handler of [getPdf, getXlsx]) {
      const res = await handler();
      expect(res.status).toBe(403);
      expect(await res.text()).toBe("Forbidden");
    }
  });

  it("is open to any signed-in employee, not just admins", async () => {
    // The catalog is readable in-app by everyone; only EDITING is admin-gated,
    // so an export behind requireAdmin would withhold a file from people who
    // can already read every row of it on screen.
    requireUser.mockResolvedValue({ id: "emp-2", name: "Intern", isAdmin: false });
    expect((await getPdf()).status).toBe(200);
    expect((await getXlsx()).status).toBe(200);
  });
});

describe("the PDF route", () => {
  it("returns a real PDF as a named attachment", async () => {
    const res = await getPdf();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="Altus-Corp-Incentive-Table-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
    // Never cached — the catalog changes and a stale export is a wrong export.
    expect(res.headers.get("cache-control")).toBe("no-store");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("reads the catalog from the DATA LAYER, once, with no client input", async () => {
    await getPdf();
    expect(listIncentiveCatalog).toHaveBeenCalledTimes(1);
    // No arguments: there is no filter, page or row-set a request could pass to
    // narrow what gets exported.
    expect(listIncentiveCatalog).toHaveBeenCalledWith();
  });

  it("grows with the catalog — 120 rows produce more document than 5", async () => {
    listIncentiveCatalog.mockResolvedValue(rows(5));
    const small = Buffer.from(await (await getPdf()).arrayBuffer()).length;
    listIncentiveCatalog.mockResolvedValue(rows(120));
    const big = Buffer.from(await (await getPdf()).arrayBuffer()).length;
    expect(big).toBeGreaterThan(small * 3);
  });

  it("serves an empty catalog as a valid one-page PDF, not an error", async () => {
    listIncentiveCatalog.mockResolvedValue([]);
    const res = await getPdf();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("refuses an absurd catalog with 422 rather than timing out", async () => {
    listIncentiveCatalog.mockResolvedValue(rows(10_001));
    const res = await getPdf();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "export_too_large" });
  });
});

describe("the XLSX route", () => {
  it("returns a real workbook as a named attachment", async () => {
    const res = await getXlsx();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="Altus-Corp-Incentive-Table-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const buf = Buffer.from(await res.arrayBuffer());
    // A .xlsx is a zip: "PK\x03\x04".
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });

  it("reads the catalog from the DATA LAYER, once, with no client input", async () => {
    await getXlsx();
    expect(listIncentiveCatalog).toHaveBeenCalledTimes(1);
    expect(listIncentiveCatalog).toHaveBeenCalledWith();
  });

  it("serves an empty catalog as a valid workbook", async () => {
    listIncentiveCatalog.mockResolvedValue([]);
    const res = await getXlsx();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");
  });

  it("refuses an absurd catalog with 422", async () => {
    listIncentiveCatalog.mockResolvedValue(rows(10_001));
    const res = await getXlsx();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "export_too_large" });
  });
});
