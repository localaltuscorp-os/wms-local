import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";

// The renderer is `server-only`, which throws on import outside a server
// component. Same shim every other server-module test in this suite uses.
vi.mock("server-only", () => ({}));

import { renderSectionPdf } from "@/lib/reports/section-pdf";
import {
  isSectionReport,
  reportFilename,
  whatsappShareUrl,
  whatsappMessage,
  type SectionReport,
} from "@/lib/reports/section-report";

/**
 * The renderer has no visual test, so these pin the things that would fail
 * silently: a payload that is not a PDF at all, a single page where the rows
 * plainly need several, and a filename or share URL that a device rejects.
 */

const wide: SectionReport = {
  title: "Who is delegating, and how much",
  subtitle: "Targets for this window: 3 goals · 30 tasks · 30 commitments",
  meta: [
    { label: "Date Range", value: "Last 7 Days" },
    { label: "Search", value: "bharambe" },
  ],
  summary: "14 managers",
  columns: [
    { label: "Manager / Member", weight: 3, align: "left" },
    { label: "Self", weight: 1, align: "right" },
    { label: "Delegated Out", weight: 1, align: "right" },
    { label: "Total", weight: 1, align: "right" },
    { label: "Grand Total", weight: 1, align: "right" },
  ],
  rows: Array.from({ length: 90 }, (_, i) => [
    `Person ${i + 1}`,
    `${i} / 30`,
    `${i * 2} / 210`,
    String(i * 3),
    String(i * 4),
  ]),
  depth: Array.from({ length: 90 }, (_, i) => (i % 3 === 0 ? 0 : 1)),
};

const AT = new Date("2026-08-24T09:00:00Z");

describe("renderSectionPdf", () => {
  it("produces a real PDF", async () => {
    const pdf = await renderSectionPdf(wide, AT);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("paginates rather than clipping — 90 rows do not fit one sheet", async () => {
    const pdf = await renderSectionPdf(wide, AT);
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });

  it("renders an empty result without throwing", async () => {
    const pdf = await renderSectionPdf({ ...wide, rows: [], depth: [] }, AT);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("payload guard", () => {
  it("accepts a well-formed report and rejects malformed ones", () => {
    expect(isSectionReport(wide)).toBe(true);
    expect(isSectionReport(null)).toBe(false);
    expect(isSectionReport({ ...wide, title: "" })).toBe(false);
    expect(isSectionReport({ ...wide, columns: [] })).toBe(false);
    // Numbers, not strings — the renderer formats nothing, so a raw number
    // would reach pdfkit and throw mid-document.
    expect(isSectionReport({ ...wide, rows: [[1, 2]] })).toBe(false);
  });
});

describe("filename and share link", () => {
  it("names the file the way the spec asks", () => {
    expect(reportFilename("Delegation Scorecard", AT)).toBe(
      "Altus_Delegation_Scorecard_24Aug2026.pdf",
    );
  });

  it("strips punctuation a filesystem would reject", () => {
    expect(reportFilename("Who is delegating, and how much?", AT)).toBe(
      "Altus_Who_is_delegating_and_how_much_24Aug2026.pdf",
    );
  });

  it("strips the phone to digits — the API rejects '+' and spacing", () => {
    const url = whatsappShareUrl("+91 98200 12345", whatsappMessage("Danyal", "Tasks"));
    expect(url.startsWith("https://api.whatsapp.com/send?phone=919820012345&text=")).toBe(true);
    expect(decodeURIComponent(url.split("&text=")[1]!)).toBe(
      "Hi Danyal, attached is your Tasks report snapshot from Altus Corp Dashboard.",
    );
  });
});

/**
 * GEOMETRY REGRESSION.
 *
 * The first renderer collided with itself because `public/logo.png` is 973x1074
 * — taller than wide — and was placed with `{ width: 108 }`, which made it
 * 119pt tall inside a 44pt header band. It ran through the title, the filter
 * line and the first rows. These pin the two facts that made that possible, so
 * a future edit that reintroduces either fails here rather than in a reader's
 * inbox.
 */
describe("header geometry", () => {
  it("the logo asset really is taller than it is wide", () => {
    // If this ever flips, `fit: [120, 36]` still contains it — but the comment
    // explaining WHY the box is stated on both axes would be stale.
    const png = readFileSync(join(process.cwd(), "public", "logo.png"));
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    expect(h).toBeGreaterThan(w);
  });

  it("embeds ONE asset, however many pages it spans", async () => {
    // The count is per DISTINCT asset, not per page: pdfkit caches by path, so
    // a 5-page report must not carry five logos. A transparent PNG also emits a
    // soft-mask XObject alongside the image itself, hence the pair.
    const count = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
    const onePage = await renderSectionPdf({ ...wide, rows: wide.rows.slice(0, 4), depth: undefined }, AT);
    const manyPages = await renderSectionPdf(wide, AT);
    expect(count(manyPages)).toBe(count(onePage));
    // One artwork + its alpha mask. Three would mean a second asset came back —
    // which is exactly what the old duplicated "watermark" was.
    expect(count(onePage)).toBeLessThanOrEqual(2);
  });

  it("keeps a long title off the top-right timestamp", async () => {
    // The title is on its own full-width line BELOW the branding band, so a
    // long one cannot reach the stamp however far it runs.
    const long = { ...wide, title: "Who is delegating, and how much across every reporting line" };
    const pdf = await renderSectionPdf(long, AT);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});

/* ── Reading the laid-out page back ────────────────────────────────────────
   pdfkit emits `1 0 0 1 x y Tm` per text run, with y measured from the page
   BOTTOM. Flipping it gives the baseline's distance from the top, which is the
   only way to assert "this sits below that" without a rendering harness. */
const PAGE_H = 595.28; // A4 landscape

function readText(pdf: Buffer): { x: number; top: number; text: string }[] {
  const out: { x: number; top: number; text: string }[] = [];
  const raw = pdf.toString("latin1");
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let body: string;
    try {
      body = inflateSync(Buffer.from(m[1]!.replace(/\r?\n$/, ""), "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const blk of body.matchAll(/BT([\s\S]*?)ET/g)) {
      const tm = /1 0 0 1 ([-\d.]+) ([-\d.]+) Tm/.exec(blk[1]!);
      if (!tm) continue;
      const text = [...blk[1]!.matchAll(/<([0-9a-fA-F]+)>/g)]
        .map((h) => Buffer.from(h[1]!, "hex").toString("latin1"))
        .join("");
      if (!text) continue;
      out.push({ x: Number(tm[1]), top: PAGE_H - Number(tm[2]), text });
    }
  }
  return out;
}

const find = (items: ReturnType<typeof readText>, needle: string) =>
  items.find((i) => i.text.includes(needle));

describe("nothing overlaps anything", () => {
  it("stacks the band, title, subtitle, pill, filters and table in that order", async () => {
    const items = readText(await renderSectionPdf(wide, AT));
    const stampRow = find(items, "Generated ")!;
    const bandTag = find(items, "Executive Dashboard Report")!;
    const title = find(items, "WHO IS DELEGATING")!;
    const subtitle = find(items, "Targets for this window")!;
    const pill = find(items, "14 managers")!;
    const filters = find(items, "Date Range:")!;
    const head = find(items, "MANAGER / MEMBER")!;

    // Row 1 is two halves. The logo occupies the left (an image, so it has no
    // text run of its own); both text runs must sit in the RIGHT half, which is
    // what keeps them clear of it.
    expect(stampRow.x).toBeGreaterThan(400);
    expect(bandTag.x).toBeGreaterThan(400);

    // Strictly descending, each element on its own line. The pill is BELOW the
    // title now — inline after the subtitle was only ever safe while the
    // subtitle stayed short.
    expect(title.top).toBeGreaterThan(stampRow.top);
    expect(subtitle.top).toBeGreaterThan(title.top);
    expect(pill.top).toBeGreaterThan(subtitle.top);
    expect(filters.top).toBeGreaterThan(pill.top);
    expect(head.top).toBeGreaterThan(filters.top);
  });

  it("keeps the band's text above its closing rule", async () => {
    const items = readText(await renderSectionPdf(wide, AT));
    const bandTag = find(items, "Executive Dashboard Report")!;
    // The rule sits at top(34) + BRAND_H(32) = 66. A 7.5pt baseline at ~56
    // descends to ~58, so it must clear 66 rather than straddle it — the fault
    // the old 10pt sub-tag had against a 60pt band.
    expect(bandTag.top).toBeLessThan(66 - 5);
  });

  it("puts the footer at the BOTTOM of every page", async () => {
    // pdfkit auto-paginates any text that would cross the bottom margin, which
    // silently threw the first footer to y=40 — on top of the branding.
    const items = readText(await renderSectionPdf(wide, AT));
    const feet = items.filter((i) => i.text.startsWith("Page "));
    expect(feet.length).toBeGreaterThan(1); // one per page
    for (const f of feet) expect(f.top).toBeGreaterThan(PAGE_H * 0.85);
    expect(feet.map((f) => f.text)).toContain("Page 1 of " + feet.length);
  });
});

/**
 * SINGLE-PAGE CAPACITY.
 *
 * The vertical budget in section-pdf.ts is solved for 25 rows on one sheet.
 * That sum is spread across nine constants, so it is exactly the kind of thing
 * that decays silently when one of them is nudged — a report that used to fit
 * quietly becomes two pages and nobody notices until it is in an inbox.
 */
describe("one page holds 25 rows", () => {
  const pageCount = (pdf: Buffer) =>
    (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  const sized = (n: number): SectionReport => ({
    title: "Overdue Tasks by Person",
    subtitle: "On-time rate & late spread — heaviest overdue burden first",
    meta: [{ label: "Date Range", value: "Last 7 Days" }],
    summary: `${n} People`,
    columns: [
      { label: "Person", weight: 3, align: "left" },
      { label: "On-time rate", weight: 1.4, align: "center" },
      { label: "15+ late", weight: 1, align: "right", tone: "count" },
      { label: "Late", weight: 1, align: "right", tone: "count" },
    ],
    rows: Array.from({ length: n }, (_, i) => [`Person ${i + 1}`, "80%", String(i % 4), String(i)]),
  });

  it("fits 25 and only spills at 26", async () => {
    expect(pageCount(await renderSectionPdf(sized(25), AT))).toBe(1);
    expect(pageCount(await renderSectionPdf(sized(26), AT))).toBe(2);
  });

  it("adds no trailing blank page — every sheet carries rows", async () => {
    // The old footer wrote past `page.maxY()`, and pdfkit answers that by
    // silently starting a new page. Three writes per page meant 2-3 blank
    // sheets trailing every export. A page count that tracks the row count
    // exactly is what proves they are gone.
    for (const [rows, pages] of [[5, 1], [25, 1], [26, 2], [50, 2], [51, 3]] as const) {
      expect(pageCount(await renderSectionPdf(sized(rows), AT))).toBe(pages);
    }
  });
});
