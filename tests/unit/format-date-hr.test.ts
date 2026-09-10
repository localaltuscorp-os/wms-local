import { describe, expect, it } from "vitest";
import { formatDate, formatDateHr } from "@/lib/format";
import { HR_STAGES, type HrStageKey } from "@/lib/hr/lifecycle";
import { HR_SECTIONS, HR_SECTION_LABEL } from "@/lib/hr/forms/registry";

describe("formatDateHr (HR module date format)", () => {
  it("renders DD-MMM-YYYY", () => {
    expect(formatDateHr("1984-01-21")).toBe("21-Jan-1984");
    expect(formatDateHr(new Date(2026, 8, 7))).toBe("07-Sep-2026");
    expect(formatDateHr("2026-12-01")).toBe("01-Dec-2026");
  });

  it("pads single-digit days, matching the app-wide format", () => {
    expect(formatDateHr("2026-03-05")).toBe("05-Mar-2026");
    // Same instant, same components - only the separator differs.
    expect(formatDateHr("2026-03-05")).toBe(formatDate("2026-03-05").replace(/ /g, "-"));
  });

  it("treats YYYY-MM-DD as a local calendar day (no UTC day-shift)", () => {
    // The bug this guards: parsing as UTC midnight renders the PREVIOUS day for
    // anyone behind UTC, which would silently misdate every letter.
    expect(formatDateHr("2026-01-01")).toBe("01-Jan-2026");
    expect(formatDateHr("2026-12-31")).toBe("31-Dec-2026");
  });

  it("passes empty and unparseable input through untouched", () => {
    expect(formatDateHr(null)).toBe("");
    expect(formatDateHr(undefined)).toBe("");
    expect(formatDateHr("")).toBe("");
    // An unparseable string is returned as-is - crucially WITHOUT its spaces
    // being turned into hyphens, which a blind .replace() would have done.
    expect(formatDateHr("not a date")).toBe("not a date");
    expect(formatDateHr("Immediately on joining")).toBe("Immediately on joining");
  });

  it("leaves the app-wide formatDate alone", () => {
    expect(formatDate("1984-01-21")).toBe("21 Jan 1984");
  });
});

describe("HR lifecycle sections", () => {
  it("is the six sections in lifecycle order, with Post-Joining retired", () => {
    expect(HR_STAGES.map((s) => s.key)).toEqual([
      "pre-interview",
      "post-interview",
      "pre-joining",
      "during",
      "appraisal",
      "exit",
    ]);
    expect(HR_STAGES.map((s) => s.key)).not.toContain("post-joining");
  });

  it("keeps the forms registry pinned to the same keys and order", () => {
    expect([...HR_SECTIONS]).toEqual(HR_STAGES.map((s) => s.key));
    for (const s of HR_STAGES) {
      expect(HR_SECTION_LABEL[s.key as HrStageKey]).toBeTruthy();
    }
  });

  it("puts each moved item in the section it was asked for", () => {
    const where = (slug: string) =>
      HR_STAGES.find((s) => s.items.some((i) => i.slug === slug))?.key;

    expect(where("acceptance-letter")).toBe("post-interview");
    expect(where("free-training")).toBe("post-interview");

    expect(where("induction")).toBe("during");
    expect(where("employee-of-the-month")).toBe("during");
    expect(where("birthday-wishes")).toBe("during");
    expect(where("resignation-rejection")).toBe("during");

    expect(where("appraisal")).toBe("appraisal");
    expect(where("increment")).toBe("appraisal");
    expect(where("appraisal-revised-ctc")).toBe("appraisal");
    expect(where("promotion-revised-ctc")).toBe("appraisal");
    expect(where("end-of-probation")).toBe("appraisal");
    expect(where("promotion")).toBe("appraisal");

    expect(where("letter-of-recommendation")).toBe("exit");
    expect(where("experience-letter")).toBe("exit");
    expect(where("relieving-letter")).toBe("exit");
    expect(where("completion-certificate")).toBe("exit");
  });

  it("has no empty section and no duplicated slug", () => {
    for (const s of HR_STAGES) expect(s.items.length).toBeGreaterThan(0);
    const slugs = HR_STAGES.flatMap((s) => s.items.map((i) => `${s.key}/${i.slug}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
