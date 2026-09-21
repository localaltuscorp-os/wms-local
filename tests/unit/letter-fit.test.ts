import { describe, it, expect, vi } from "vitest";

// pdf.ts is a server module; the guard package throws outside a server bundle.
vi.mock("server-only", () => ({}));

import { FIT_FLOOR, FIT_STEPS, PAGE_CONTENT_H, countPdfPages, fitOnePageDefault } from "@/lib/hr/letters/fit";
import { getLetter } from "@/lib/hr/letters/registry";
import { renderLetterPdf } from "@/lib/hr/letters/pdf";

describe("fit steps", () => {
  it("start at full size and only ever shrink, down to the floor", () => {
    expect(FIT_STEPS[0]).toBe(1);
    for (let i = 1; i < FIT_STEPS.length; i++) {
      expect(FIT_STEPS[i]!).toBeLessThan(FIT_STEPS[i - 1]!);
    }
    expect(FIT_FLOOR).toBe(FIT_STEPS[FIT_STEPS.length - 1]);
    expect(FIT_FLOOR).toBeGreaterThanOrEqual(0.75);
  });

  it("measures against one A4 page of letter body", () => {
    expect(PAGE_CONTENT_H).toBe(827);
  });
});

describe("fitOnePageDefault", () => {
  it("is on for the two revised-CTC letters; the 2-page Offer letter starts off", () => {
    expect(fitOnePageDefault("selection")).toBe(false);
    expect(fitOnePageDefault("appraisal-revised-ctc")).toBe(true);
    expect(fitOnePageDefault("promotion-revised-ctc")).toBe(true);
    expect(fitOnePageDefault("relieving")).toBe(false);
  });
});

describe("countPdfPages", () => {
  it("counts page objects, not the page tree", () => {
    const pdf = "<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>";
    expect(countPdfPages(pdf)).toBe(2);
    expect(countPdfPages(new TextEncoder().encode(pdf))).toBe(2);
    expect(countPdfPages("not a pdf")).toBe(0);
  });
});

describe("renderLetterPdf with fitOnePage", () => {
  it("never makes the Offer letter longer, and fits one page when the floor allows", async () => {
    const template = getLetter("selection");
    expect(template).toBeDefined();
    const values: Record<string, string> = { candidateName: "Test Candidate", position: "Executive" };

    const full = await renderLetterPdf({ template: template!, values });
    const fitted = await renderLetterPdf({ template: template!, values, fitOnePage: true });

    const fullPages = countPdfPages(full);
    const fittedPages = countPdfPages(fitted);
    expect(fullPages).toBeGreaterThan(0);
    expect(fittedPages).toBeGreaterThan(0);
    expect(fittedPages).toBeLessThanOrEqual(fullPages);
  }, 60_000);

  it("leaves a letter that already fits untouched", async () => {
    const template = getLetter("birthday");
    expect(template).toBeDefined();
    const full = await renderLetterPdf({ template: template!, values: {} });
    const fitted = await renderLetterPdf({ template: template!, values: {}, fitOnePage: true });
    expect(countPdfPages(full)).toBe(1);
    expect(countPdfPages(fitted)).toBe(1);
  }, 60_000);
});
