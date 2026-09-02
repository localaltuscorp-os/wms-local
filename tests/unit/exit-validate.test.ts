import { describe, expect, it } from "vitest";
import { validateExitSubmission } from "@/lib/hr/exit/validate";

/**
 * The bug this guards: Submit accepted a completely blank form. That wrote an
 * index row with `responses: []`, rendered a PDF reading "No answers were
 * recorded on this form", and mailed it to the HR desk as a completed document.
 *
 * The bar is deliberately LOW — a real, dated, attributable form, not a fully
 * answered one. These tests pin that intent in both directions: a blank form is
 * refused, and a partially-answered one is accepted.
 */

const interview = (fields: Record<string, string>, ratings?: Record<string, number>) => ({
  fields,
  ...(ratings ? { ratings } : {}),
});

const SIGNED = {
  header_dateOfInterview: "2026-08-12",
  sign_employeeName: "Jane Doe",
};

describe("validateExitSubmission — interview", () => {
  it("refuses a completely blank form", () => {
    const res = validateExitSubmission("interview", interview({}));
    expect(res.ok).toBe(false);
  });

  it("refuses a form with answers but no date or signature", () => {
    const res = validateExitSubmission("interview", interview({ q1: "Better compensation." }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["header_dateOfInterview", "sign_employeeName"]);
  });

  it("names the missing date when only the signature is present", () => {
    const res = validateExitSubmission("interview", interview({ sign_employeeName: "Jane Doe", q1: "x" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missing).toEqual(["header_dateOfInterview"]);
      expect(res.error).toMatch(/date/i);
    }
  });

  it("names the missing signature when only the date is present", () => {
    const res = validateExitSubmission("interview", interview({ header_dateOfInterview: "2026-08-12", q1: "x" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missing).toEqual(["sign_employeeName"]);
      expect(res.error).toMatch(/signature/i);
    }
  });

  it("refuses a signed and dated form with no answers at all", () => {
    // The exact shape that produced the "No answers were recorded" PDF.
    const res = validateExitSubmission("interview", interview({ ...SIGNED }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/at least one question/i);
  });

  it("does not count identity header fields as answers", () => {
    const res = validateExitSubmission(
      "interview",
      interview({ ...SIGNED, header_employeeName: "Jane Doe", header_designation: "Analyst" }),
    );
    expect(res.ok).toBe(false);
  });

  it("treats whitespace-only answers as unanswered", () => {
    const res = validateExitSubmission("interview", interview({ ...SIGNED, q1: "   " }));
    expect(res.ok).toBe(false);
  });

  it("accepts a single free-text answer", () => {
    expect(validateExitSubmission("interview", interview({ ...SIGNED, q1: "Relocation." }).valueOf()).ok).toBe(true);
  });

  it("accepts a single multiple-choice answer", () => {
    expect(validateExitSubmission("interview", interview({ ...SIGNED, q8: "Yes" })).ok).toBe(true);
  });

  it("accepts a rating on its own", () => {
    expect(validateExitSubmission("interview", interview({ ...SIGNED }, { overall: 4 })).ok).toBe(true);
  });

  it("accepts the closing feedback blocks on their own", () => {
    expect(
      validateExitSubmission("interview", interview({ ...SIGNED, infrastructure_feedback: "Desks were cramped." })).ok,
    ).toBe(true);
  });

  it("accepts a comment left without its choice selected", () => {
    expect(validateExitSubmission("interview", interview({ ...SIGNED, q2_comments: "Mostly, yes." })).ok).toBe(true);
  });
});

describe("validateExitSubmission — handover", () => {
  it("refuses a blank checklist", () => {
    const res = validateExitSubmission("handover", { fields: {}, checked: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["header_lastWorkingDay"]);
  });

  it("refuses a dated checklist with nothing ticked", () => {
    const res = validateExitSubmission("handover", {
      fields: { header_lastWorkingDay: "2026-08-31" },
      checked: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/at least one clearance/i);
  });

  it("refuses when the last working day is whitespace", () => {
    const res = validateExitSubmission("handover", {
      fields: { header_lastWorkingDay: "  " },
      checked: { kt_document: true },
    });
    expect(res.ok).toBe(false);
  });

  it("ignores a tick set to false", () => {
    const res = validateExitSubmission("handover", {
      fields: { header_lastWorkingDay: "2026-08-31" },
      checked: { kt_document: false },
    });
    expect(res.ok).toBe(false);
  });

  it("accepts a dated checklist with one item cleared", () => {
    const res = validateExitSubmission("handover", {
      fields: { header_lastWorkingDay: "2026-08-31" },
      checked: { kt_document: true },
    });
    expect(res.ok).toBe(true);
  });

  it("does NOT require every item — a handover is filed with clearances outstanding", () => {
    const res = validateExitSubmission("handover", {
      fields: { header_lastWorkingDay: "2026-08-31" },
      checked: { assets_returned: true, access_revoked: true },
    });
    expect(res.ok).toBe(true);
  });
});
