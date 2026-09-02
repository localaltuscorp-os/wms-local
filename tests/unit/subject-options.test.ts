import { describe, it, expect } from "vitest";
import {
  PINNED_SUBJECTS,
  RETIRED_SUBJECTS,
  applySubjectPolicy,
  isRetiredSubject,
} from "@/lib/tasks/subject-options";

describe("the subject/area option policy", () => {
  it("drops WMS and WMS App from the offered options", () => {
    const out = applySubjectPolicy(["Accounts", "WMS", "Marketing", "WMS App", "Sales"]);
    expect(out).not.toContain("WMS");
    expect(out).not.toContain("WMS App");
    expect(out).toEqual(expect.arrayContaining(["Accounts", "Marketing", "Sales"]));
  });

  it("offers Altus Ecosystem even when the source list has never heard of it", () => {
    expect(applySubjectPolicy(["Accounts"])).toContain("Altus Ecosystem");
    expect(applySubjectPolicy([])).toEqual(["Altus Ecosystem"]);
  });

  it("does not duplicate Altus Ecosystem when a row already exists for it", () => {
    const out = applySubjectPolicy(["Accounts", "Altus Ecosystem", "Sales"]);
    expect(out.filter((v) => v === "Altus Ecosystem")).toHaveLength(1);
  });

  it("keeps an existing Altus Ecosystem in its original position rather than re-sorting", () => {
    // Goal Areas are in a deliberate taxonomy order, not alphabetical — the
    // policy must not quietly reshuffle them.
    const areas = ["Sales", "Altus Ecosystem", "Collection", "Marketing"];
    expect(applySubjectPolicy(areas)).toEqual(areas);
  });

  it("appends a pinned option rather than sorting it in", () => {
    const areas = ["Sales", "Collection", "Marketing"];
    expect(applySubjectPolicy(areas)).toEqual([...areas, "Altus Ecosystem"]);
  });

  it("matches retired names regardless of case or stray whitespace", () => {
    // These were typed by hand over months; the spellings drifted.
    const out = applySubjectPolicy(["wms", "  WMS  ", "Wms App", "WMS APP", "Sales"]);
    expect(out).toEqual(["Sales", "Altus Ecosystem"]);
  });

  it("de-duplicates case-insensitively, keeping the first spelling seen", () => {
    expect(applySubjectPolicy(["Sales", "SALES", "sales"])).toEqual([
      "Sales",
      "Altus Ecosystem",
    ]);
  });

  it("trims the values it passes through", () => {
    expect(applySubjectPolicy(["  Sales  "])).toEqual(["Sales", "Altus Ecosystem"]);
  });

  it("drops empty and whitespace-only entries", () => {
    expect(applySubjectPolicy(["", "   ", "Sales"])).toEqual(["Sales", "Altus Ecosystem"]);
  });

  it("answers isRetiredSubject for the display side", () => {
    expect(isRetiredSubject("WMS")).toBe(true);
    expect(isRetiredSubject(" wms app ")).toBe(true);
    expect(isRetiredSubject("Altus Ecosystem")).toBe(false);
    expect(isRetiredSubject(null)).toBe(false);
    expect(isRetiredSubject(undefined)).toBe(false);
  });

  it("keeps the two lists disjoint — a value cannot be pinned and retired at once", () => {
    const retired = new Set(RETIRED_SUBJECTS.map((v) => v.toLowerCase()));
    for (const p of PINNED_SUBJECTS) expect(retired.has(p.toLowerCase())).toBe(false);
  });

  it("is idempotent — running it over its own output changes nothing", () => {
    const once = applySubjectPolicy(["Accounts", "WMS", "WMS App", "Sales"]);
    expect(applySubjectPolicy(once)).toEqual(once);
  });
});
