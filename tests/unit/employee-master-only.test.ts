import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { codeOf } from "../fixtures/source-code";

describe("Employee Master is the single employee admin surface", () => {
  it("absorbs the legacy employee-page features", () => {
    const page = codeOf("app/(admin)/admin/employee-master/page.tsx");
    const table = codeOf("components/admin/employee-master/master-table.tsx");
    expect(page).toContain("LeaveRequestsCallout");
    expect(page).toContain("PreviousEmployees");
    expect(page).toContain("Pending invite");
    expect(table).toContain("attendance/insights/employee");
    expect(table).toContain("Export");
    expect(table).toContain("BulkEditDialog");
  });

  it("removes the duplicate page and navigation destination", () => {
    expect(existsSync("app/(admin)/admin/employees/page.tsx")).toBe(false);
    expect(codeOf("components/admin/admin-nav-config.ts")).not.toContain('href: "/admin/employees"');
    expect(codeOf("app/(admin)/admin/page.tsx")).toContain('redirect("/admin/employee-master")');
  });
});
