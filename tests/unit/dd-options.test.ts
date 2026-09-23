import { describe, it, expect } from "vitest";
import { labelForListKey, slugifyListKey, DD_KNOWN_CATEGORIES } from "@/lib/dd-options/constants";
import {
  CreateDdOptionSchema,
  CreateDdCategorySchema,
  RetireDdOptionSchema,
} from "@/lib/validators/dd-option";

/**
 * DD MASTER — the pure pieces: category labelling/slugging and the input
 * validation every action re-checks server-side. The DB-touching parts of
 * app/(app)/operations/masters/dd/actions.ts (duplicate-code lookups, the
 * retire-not-delete write) are exercised through the app itself; the rules
 * that decide what is even a legal input live here, untangled from Drizzle.
 */

describe("labelForListKey", () => {
  it("uses the known-category label", () => {
    expect(labelForListKey("batch_number")).toBe("Batch Number");
    expect(labelForListKey("handholding_calls")).toBe("Handholding Calls");
    expect(labelForListKey("product_names")).toBe("Product Names");
  });

  it("humanizes an unknown key — a future category needs no code change", () => {
    expect(labelForListKey("office_locations")).toBe("Office Locations");
    expect(labelForListKey("vendor-type")).toBe("Vendor Type");
  });

  it("every known category is covered by a real, non-empty label", () => {
    for (const c of DD_KNOWN_CATEGORIES) {
      expect(c.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("slugifyListKey", () => {
  it("lowercases and joins on underscores", () => {
    expect(slugifyListKey("Batch Number")).toBe("batch_number");
    expect(slugifyListKey("  Handholding  Calls  ")).toBe("handholding_calls");
  });

  it("strips characters that aren't letters or digits", () => {
    expect(slugifyListKey("PS / BSS!")).toBe("ps_bss");
  });

  it("has no leading or trailing underscore", () => {
    expect(slugifyListKey("-- weird --")).toBe("weird");
  });

  it("an all-punctuation name produces an empty key, caught by the caller", () => {
    expect(slugifyListKey("###")).toBe("");
  });
});

describe("CreateDdOptionSchema", () => {
  it("accepts a normal option", () => {
    const parsed = CreateDdOptionSchema.safeParse({ listKey: "batch_number", label: "111" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty label", () => {
    const parsed = CreateDdOptionSchema.safeParse({ listKey: "batch_number", label: "   " });
    expect(parsed.success).toBe(false);
  });

  it("rejects a listKey that isn't a valid slug", () => {
    const parsed = CreateDdOptionSchema.safeParse({ listKey: "Batch Number", label: "111" });
    expect(parsed.success).toBe(false);
  });
});

describe("CreateDdCategorySchema", () => {
  it("requires both a category name and a first option", () => {
    expect(
      CreateDdCategorySchema.safeParse({ categoryLabel: "", firstOptionLabel: "x" }).success,
    ).toBe(false);
    expect(
      CreateDdCategorySchema.safeParse({ categoryLabel: "New List", firstOptionLabel: "" }).success,
    ).toBe(false);
    expect(
      CreateDdCategorySchema.safeParse({ categoryLabel: "New List", firstOptionLabel: "First" })
        .success,
    ).toBe(true);
  });
});

describe("RetireDdOptionSchema", () => {
  it("requires a real uuid", () => {
    expect(RetireDdOptionSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(
      RetireDdOptionSchema.safeParse({ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }).success,
    ).toBe(true);
  });
});
