import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("obsolete Admin Activity removal", () => {
  it("removes Activity routes and permission references", () => {
    expect(existsSync("app/(admin)/admin/activity")).toBe(false);
    expect(existsSync("app/(admin)/admin/activity/export")).toBe(false);
    expect(existsSync("lib/queries/activity.ts")).toBe(false);
    expect(existsSync("lib/transforms/activity.ts")).toBe(false);
    expect(readFileSync("lib/permissions/catalog.ts", "utf8")).not.toContain("admin.activity");
    expect(readFileSync("lib/permissions/catalog.ts", "utf8")).not.toContain("/admin/activity");
  });

  it("removes obsolete Outstanding Responsibles route", () => {
    expect(existsSync("app/(admin)/admin/outstanding-responsibles")).toBe(false);
  });
});
