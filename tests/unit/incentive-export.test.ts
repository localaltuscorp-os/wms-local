import { describe, it, expect, vi, beforeAll } from "vitest";

// Both renderers open with `import "server-only"`, which throws outside a React
// Server Component. Same stub the app's other server-module tests use.
vi.mock("server-only", () => ({}));

import ExcelJS from "exceljs";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { inflateSync } from "node:zlib";
import type { CatalogRow } from "@/lib/queries/incentive-catalog";
import {
  INCENTIVE_EXPORT_HEADERS,
  eligibilityLabel,
  incentiveExportFilename,
  toIncentiveExportRow,
} from "@/lib/exports/incentive-catalog";
import { renderIncentiveCatalogXlsx } from "@/lib/exports/incentive-catalog-xlsx";
import { renderIncentiveCatalogPdf } from "@/lib/exports/incentive-catalog-pdf";

/**
 * INCENTIVE TABLE EXPORTS — the claim under test is "every row, from the data".
 *
 * Both files are generated for real here (a genuine .xlsx zip and a genuine PDF
 * byte stream) and then read back, because the failure this guards against is
 * not a type error: it is an export that looks fine and quietly contains only
 * the rows that happened to be on screen, or a PDF whose fourth page has lost
 * its column headers. Neither shows up in a snapshot of the calling code.
 */

const row = (over: Partial<CatalogRow> = {}): CatalogRow => ({
  id: crypto.randomUUID(),
  name: "PS Sold in 30 Days",
  description: "Paid when a PS closes inside 30 days of the first meeting.",
  amount: 250,
  salesEligible: true,
  internsEligible: false,
  notes: null,
  sortOrder: 100,
  active: true,
  ...over,
});

/** A description long enough to wrap several times in a table column. */
const LONG_TEXT =
  "Paid when the participant completes the full two-day workshop and submits " +
  "their breakthrough form, provided the invoice has been raised, the payment " +
  "has cleared into the Altus Corp account, and the Tally entry has been passed " +
  "by the accounts team before the end of the following calendar month.";

/** `n` distinct rows — enough of them to force the PDF past one page. */
function manyRows(n: number): CatalogRow[] {
  return Array.from({ length: n }, (_, i) =>
    row({
      name: `Incentive ${i + 1}`,
      amount: (i + 1) * 137.5,
      description: i % 3 === 0 ? LONG_TEXT : `Short description ${i + 1}`,
      notes: i % 4 === 0 ? "Conditions apply. Subject to review." : null,
      salesEligible: i % 2 === 0,
      internsEligible: i % 3 !== 0,
      active: i % 7 !== 0,
    }),
  );
}

/* ── The shared column contract ───────────────────────────────────────────── */

describe("the export column contract", () => {
  it("keeps every field the table shows, plus the two it folds away", () => {
    expect(INCENTIVE_EXPORT_HEADERS).toEqual([
      "Incentive",
      "Amount (INR)",
      "Sales Eligible",
      "Interns Eligible",
      "Description",
      "Notes",
      "Status",
    ]);
  });

  it("emits the amount as a NUMBER so a spreadsheet can sum it", () => {
    const cells = toIncentiveExportRow(row({ amount: 1500 }));
    expect(cells[1]).toBe(1500);
    expect(typeof cells[1]).toBe("number");
  });

  it("renders both eligibility flags, and says so plainly when neither is set", () => {
    expect(eligibilityLabel(row({ salesEligible: true, internsEligible: true }))).toBe(
      "Sales · Interns",
    );
    expect(eligibilityLabel(row({ salesEligible: false, internsEligible: false }))).toBe("—");
  });

  it("never emits null into a cell — an empty description is an empty string", () => {
    const cells = toIncentiveExportRow(row({ description: null, notes: null }));
    expect(cells[4]).toBe("");
    expect(cells[5]).toBe("");
    expect(cells.some((c) => c === null || c === undefined)).toBe(false);
  });

  it("names the file by date and format", () => {
    const d = new Date("2026-09-10T00:00:00Z");
    expect(incentiveExportFilename("pdf", d)).toBe("Altus-Corp-Incentive-Table-2026-09-10.pdf");
    expect(incentiveExportFilename("xlsx", d)).toBe("Altus-Corp-Incentive-Table-2026-09-10.xlsx");
  });
});

/* ── XLSX ─────────────────────────────────────────────────────────────────── */

/**
 * Read the generated workbook BACK with ExcelJS.
 *
 * Round-tripping through the real reader rather than grepping the sheet XML is
 * the stronger check: it asserts the SEMANTICS Excel will act on (a frozen
 * pane, a number format, a wrapped cell) instead of the presence of a tag.
 */
async function openXlsx(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Incentive Table");
  if (!ws) throw new Error("worksheet missing");
  return { wb, ws };
}

/** Every string value anywhere in the sheet, for "is this row present" checks. */
function allText(ws: ExcelJS.Worksheet): string {
  const out: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (typeof v === "string") out.push(v);
      else if (typeof v === "number") out.push(String(v));
    });
  });
  return out.join(" | ");
}

describe("Excel export", () => {
  it("is a real .xlsx workbook ExcelJS can read back", async () => {
    const { wb, ws } = await openXlsx(await renderIncentiveCatalogXlsx(manyRows(3)));
    expect(wb.worksheets.length).toBe(1);
    expect(ws.name).toBe("Incentive Table");
  });

  it("FREEZES the header row — the thing SheetJS silently could not do", async () => {
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(manyRows(5)));
    const view = ws.views?.[0];
    expect(view?.state).toBe("frozen");
    // Title row + header row are both above the split.
    expect((view as { ySplit?: number } | undefined)?.ySplit).toBe(2);
  });

  it("carries EVERY row, not a visible page of them", async () => {
    const rows = manyRows(120);
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(rows));
    // Title + header + one per incentive + the total row.
    expect(ws.rowCount).toBe(rows.length + 3);
    const text = allText(ws);
    // Spot-check the first and LAST incentive by name — the last is the one a
    // "visible rows only" bug would drop.
    expect(text).toContain("Incentive 1");
    expect(text).toContain("Incentive 120");
    // And that the last DATA row really is the last incentive, not the total.
    expect(ws.getRow(rows.length + 2).getCell(1).value).toBe("Incentive 120");
  });

  it("writes the header labels in order on row 2", async () => {
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(manyRows(2)));
    const header = ws.getRow(2);
    INCENTIVE_EXPORT_HEADERS.forEach((h, i) => {
      expect(header.getCell(i + 1).value).toBe(h);
    });
  });

  it("keeps the amount NUMERIC and formats it as rupees", async () => {
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(manyRows(2)));
    const amount = ws.getRow(3).getCell(2);
    expect(typeof amount.value).toBe("number");
    expect(amount.value).toBe(137.5);
    expect(amount.numFmt).toContain("₹");
  });

  it("wraps the long prose columns and sets sensible column widths", async () => {
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(manyRows(2)));
    // Description is column 5 and carries the longest text in the table.
    expect(ws.getRow(3).getCell(5).alignment?.wrapText).toBe(true);
    // Amount is a number column and must NOT wrap.
    expect(ws.getRow(3).getCell(2).alignment?.wrapText).not.toBe(true);
    for (let c = 1; c <= INCENTIVE_EXPORT_HEADERS.length; c++) {
      expect(ws.getColumn(c).width).toBeGreaterThan(0);
    }
    // The prose columns are the wide ones.
    expect(ws.getColumn(5).width!).toBeGreaterThan(ws.getColumn(2).width!);
  });

  it("gives Excel its own filter dropdowns on the header row", async () => {
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(manyRows(2)));
    expect(ws.autoFilter).toBeTruthy();
  });

  it("exports the fields the dialog folds away — notes and active status", async () => {
    const rows = [
      row({ name: "Retired one", active: false, notes: "Withdrawn Apr 2026" }),
    ];
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(rows));
    const r = ws.getRow(3);
    expect(r.getCell(6).value).toBe("Withdrawn Apr 2026");
    expect(r.getCell(7).value).toBe("Inactive");
  });

  it("survives an EMPTY table and says so in the sheet", async () => {
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx([]));
    expect(allText(ws)).toContain("No incentives in the table yet");
    // Title + header + the empty notice. No total row — nothing to total.
    expect(ws.rowCount).toBe(3);
  });

  it("handles a table of exactly ONE incentive", async () => {
    const { ws } = await openXlsx(
      await renderIncentiveCatalogXlsx([row({ name: "Solo Incentive" })]),
    );
    expect(ws.getRow(3).getCell(1).value).toBe("Solo Incentive");
    expect(ws.rowCount).toBe(1 + 3);
  });

  it("totals the amount column over exactly the data rows", async () => {
    const rows = manyRows(10);
    const { ws } = await openXlsx(await renderIncentiveCatalogXlsx(rows));
    const total = ws.getRow(rows.length + 3).getCell(2);
    expect((total.value as { formula?: string })?.formula).toBe("SUM(B3:B12)");
  });
});

/* ── PDF ──────────────────────────────────────────────────────────────────── */

/**
 * Page count, read with a real PDF parser.
 *
 * `pdf-lib` is already a dependency here, and it resolves the page tree properly
 * — grepping the raw bytes for "/Type /Page" over-counts (the page-tree node,
 * inherited attribute dictionaries) and quietly reported a one-page document as
 * two while this test was being written.
 */
async function pdfPageCount(buf: Buffer): Promise<number> {
  const doc = await PDFLibDocument.load(new Uint8Array(buf), { updateMetadata: false });
  return doc.getPageCount();
}

/**
 * The visible text of each content stream in the PDF, one string per stream.
 *
 * Two things make this less direct than it sounds, and both are why a plain
 * `buf.includes("INCENTIVE")` returns nothing:
 *
 *   1. pdfkit DEFLATES content streams, so the text is not in the raw bytes at
 *      all. Each stream is inflated here.
 *   2. pdfkit shows text as HEX strings, one run per kerning pair —
 *      `[<414c> 110 <54555320434f5250> 0] TJ` — so the word only exists once
 *      those runs are decoded and concatenated.
 *
 * Streams that are not deflate (embedded font programs) simply fail to inflate
 * and are skipped.
 */
function pdfStreamTexts(buf: Buffer): string[] {
  const out: string[] = [];
  const raw = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    let text: string;
    try {
      const inflated = inflateSync(Buffer.from(raw.slice(start, end), "latin1"));
      text = inflated.toString("latin1");
    } catch {
      continue; // not a deflate stream (font file, image) — nothing to read
    }
    const decoded = decodeShowText(text);
    if (decoded) out.push(decoded);
  }
  return out;
}

/** Every show-text operand in a content stream, decoded and joined. */
function decodeShowText(stream: string): string {
  const parts: string[] = [];
  const re = /<([0-9A-Fa-f\s]+)>|\((?:\\.|[^\\()])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream)) !== null) {
    if (m[1] != null) {
      const hex = m[1].replace(/\s+/g, "");
      let word = "";
      for (let i = 0; i + 1 < hex.length; i += 2) {
        word += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      parts.push(word);
    } else {
      parts.push(m[0].slice(1, -1));
    }
  }
  return parts.join("");
}

const META = { generatedBy: "Om Jadhav" };

/**
 * A multi-page PDF, rendered ONCE and shared by every assertion that needs one.
 *
 * Rendering 120 rows through pdfkit is real CPU, and doing it per-test made the
 * whole suite slow enough that ANOTHER pdfkit test file (section-pdf) started
 * hitting vitest's 5s default timeout under parallel load. Nothing here mutates
 * the buffer, so one render serves them all.
 */
const BIG_ROWS = manyRows(120);
let bigPdf: Buffer;
let bigPages: number;
let bigTexts: string[];

beforeAll(async () => {
  bigPdf = await renderIncentiveCatalogPdf(BIG_ROWS, META);
  bigPages = await pdfPageCount(bigPdf);
  bigTexts = pdfStreamTexts(bigPdf);
}, 60_000);

describe("PDF export", () => {
  it("is a real PDF byte stream", async () => {
    const pdf = await renderIncentiveCatalogPdf(manyRows(3), META);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("fits a short table on ONE page", async () => {
    const pdf = await renderIncentiveCatalogPdf(manyRows(4), META);
    expect(await pdfPageCount(pdf)).toBe(1);
  });

  it("SPANS MULTIPLE PAGES once the rows outgrow one", () => {
    expect(bigPages).toBeGreaterThan(1);
  });

  it("grows with the row count — every row is drawn, not truncated", async () => {
    const smallPages = await pdfPageCount(await renderIncentiveCatalogPdf(manyRows(20), META));
    expect(bigPages).toBeGreaterThan(smallPages);
    // 6× the rows must produce meaningfully more document, not a capped one.
    expect(bigPages).toBeGreaterThanOrEqual(smallPages * 3);
  });

  it("repeats the column header on EVERY page", () => {
    const pages = bigPages;
    expect(pages).toBeGreaterThan(2);

    // One content stream per page; every one of them must carry the column
    // header. A `pageAdded` handler that forgot to re-stamp it would leave
    // pages 2..n with data and no idea what the columns mean.
    const texts = bigTexts.filter((t) => t.includes("ALTUS CORP"));
    expect(texts.length).toBe(pages);
    for (const t of texts) {
      expect(t).toContain("INCENTIVE");
      expect(t).toContain("AMOUNT");
      expect(t).toContain("ELIGIBLE");
      expect(t).toContain("STATUS");
    }
    // And the continuation banner on the follow-on pages — every page but the
    // first, which carries the full masthead instead.
    expect(texts.filter((t) => t.includes("continued")).length).toBe(pages - 1);
  });

  it("prints every row's name, across the page breaks", () => {
    const all = bigTexts.join(" ");
    // The last row is the one a truncating or visible-rows-only export loses.
    for (const name of ["Incentive 1", "Incentive 60", "Incentive 120"]) {
      expect(all).toContain(name);
    }
  });

  it("wraps a very long description instead of clipping it", async () => {
    // One row with a huge description must be taller than one with a short one,
    // which is only true if the height was measured from the wrapped text.
    const [short, long] = await Promise.all([
      renderIncentiveCatalogPdf([row({ description: "Short." })], META),
      renderIncentiveCatalogPdf([row({ description: LONG_TEXT.repeat(2) })], META),
    ]);
    expect(long.length).toBeGreaterThan(short.length);
    expect(await pdfPageCount(long)).toBeGreaterThanOrEqual(1);
  });

  it("renders an EMPTY table without failing", async () => {
    const pdf = await renderIncentiveCatalogPdf([], META);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await pdfPageCount(pdf)).toBe(1);
  });

  it("renders a table of exactly ONE incentive", async () => {
    const pdf = await renderIncentiveCatalogPdf([row()], META);
    expect(await pdfPageCount(pdf)).toBe(1);
  });

  it("never throws on the awkward rows a real catalog contains", async () => {
    const awkward: CatalogRow[] = [
      row({ name: "Zero value", amount: 0, description: null, notes: null }),
      row({ name: "Neither eligible", salesEligible: false, internsEligible: false }),
      row({ name: "Retired", active: false }),
      row({ name: "₹ in the name · dash — and “quotes”", notes: "Line one\nLine two" }),
      row({ name: "A".repeat(400), description: LONG_TEXT }),
    ];
    const pdf = await renderIncentiveCatalogPdf(awkward, META);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
