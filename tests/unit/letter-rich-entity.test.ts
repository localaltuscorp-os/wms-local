import { describe, expect, it } from "vitest";
import { templateToRichHtml } from "@/lib/hr/letters/rich";
import { initialValues } from "@/lib/hr/letters/types";
import assignmentTemplate from "@/lib/hr/letters/templates/assignment";
import selectionTemplate from "@/lib/hr/letters/templates/selection";
import employeeOfMonthTemplate from "@/lib/hr/letters/templates/employee-of-the-month";

describe("rich letter entity and sign-off rendering", () => {
  it("keeps a new Selection Letter's inline entity aligned with its default letterhead", () => {
    expect(initialValues(selectionTemplate).offerEntity).toBe("Altus Corp");
  });

  it("uses the selected entity for an Assignment Letter's role text", () => {
    const html = templateToRichHtml(
      assignmentTemplate,
      { ...initialValues(assignmentTemplate), company: "Unleashed" },
      "unleashed",
    );

    expect(html).toContain("role at Unleashed");
    expect(html).toContain("For Unleashed");
  });

  it("places a selection signature before its name and place", () => {
    const html = templateToRichHtml(
      selectionTemplate,
      { ...initialValues(selectionTemplate), offerEntity: "Unleashed" },
      "unleashed",
    );
    const signature = html.lastIndexOf("<img");

    expect(signature).toBeGreaterThan(html.indexOf("For Unleashed"));
    expect(signature).toBeLessThan(html.lastIndexOf("<strong>"));
    expect(signature).toBeLessThan(html.indexOf("Place :"));
  });

  it("uses the transparent Director signature when a management letter is signed by the Director", () => {
    const html = templateToRichHtml(
      employeeOfMonthTemplate,
      initialValues(employeeOfMonthTemplate),
      "altus-corp",
      "neutral",
      "director",
    );

    expect(html).toContain('/signatures/manan-vasa-sign.png');
    expect(html).not.toContain("proprietor-signature.jpg");
  });
});
