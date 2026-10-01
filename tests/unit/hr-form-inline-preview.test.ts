import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("HR record form preview", () => {
  it("loads the complete saved responses for the selected employee", () => {
    const loader = read("app/(app)/hr/record/person-files.ts");
    expect(loader).toContain("responses: hrFormSubmissions.responses");
    expect(loader).toContain("responses: r.responses ?? []");
    expect(loader).toContain("where(eq(hrFormSubmissions.employeeId, emp.id))");
  });

  it("opens View in a read-only modal instead of navigating away", () => {
    const screen = read("components/hr/record/hr-record-screen.tsx");
    expect(screen).toContain("setPreview(f)");
    expect(screen).toContain("<FormPreviewModal form={preview}");
  });

  it("shows every answer and retains the authorised PDF download", () => {
    const modal = read("components/hr/forms/form-preview-modal.tsx");
    expect(modal).toContain("form.responses");
    expect(modal).toContain("response.question");
    expect(modal).toContain("response.answer");
    expect(modal).toContain("/api/hr/forms/${form.id}/pdf");
    expect(modal).toContain('aria-modal="true"');
  });
});
