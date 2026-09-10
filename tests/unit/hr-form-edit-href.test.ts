import { describe, it, expect } from "vitest";
import { employeeFormEditHref, hrFormModuleHref } from "@/lib/hr/forms/edit-href";

/**
 * The rule these tests protect is a safety rule, not a formatting one: an edit
 * link that reaches an employee-scoped form WITHOUT the employee's id opens the
 * viewer's own record. The admin then edits, saves, sees a success toast, and
 * has changed the wrong person's address.
 *
 * So: every link this returns carries an id, or it returns null.
 */
describe("employeeFormEditHref", () => {
  const EMP = "11111111-2222-3333-4444-555555555555";

  it("puts the subject's id on the onboarding editor", () => {
    expect(employeeFormEditHref("onboarding", EMP)).toBe(
      `/dossier/onboarding?emp=${EMP}`,
    );
  });

  it("never returns an id-less link for a known form", () => {
    for (const key of ["onboarding"]) {
      const href = employeeFormEditHref(key, EMP);
      expect(href).not.toBeNull();
      expect(href).toContain(EMP);
    }
  });

  it("returns null rather than an unscoped link when there is no employee", () => {
    expect(employeeFormEditHref("onboarding", "")).toBeNull();
    expect(employeeFormEditHref("onboarding", "   ")).toBeNull();
  });

  it("returns null for forms whose module takes no employee id", () => {
    // The exit workspace picks its own person; there is nothing safe to deep-link.
    expect(employeeFormEditHref("exit-interview", EMP)).toBeNull();
    expect(employeeFormEditHref("exit-handover", EMP)).toBeNull();
  });

  it("returns null for a form key that isn't registered", () => {
    expect(employeeFormEditHref("not-a-form", EMP)).toBeNull();
  });

  it("percent-encodes the id it is handed", () => {
    expect(employeeFormEditHref("onboarding", "a b&c")).toBe(
      "/dossier/onboarding?emp=a%20b%26c",
    );
  });
});

describe("hrFormModuleHref", () => {
  it("resolves a registered form to its module", () => {
    expect(hrFormModuleHref("onboarding")).toBe("/dossier/onboarding");
    // /hr/exit is the Exit MODULE's own route now (it shows the blank "pick a
    // step" pane); the workspace that answers this form moved a level down so
    // the module row and its step stopped pointing at the same page.
    expect(hrFormModuleHref("exit-interview")).toBe("/hr/exit/interview");
  });

  it("is null for an unknown key", () => {
    expect(hrFormModuleHref("not-a-form")).toBeNull();
  });
});
