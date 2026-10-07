import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_GROUPS, ADMIN_TOP_LEVEL } from "@/components/admin/admin-nav-config";
import { adminNavFor } from "@/components/admin/roster-nav";
import { DROP_DOWN_MASTER_MODULES } from "@/lib/admin/drop-down-master";

describe("Dropdown configuration explorer", () => {
  it("lists exactly approved categories and routes", () => {
    expect(DROP_DOWN_MASTER_MODULES).toEqual([
      {
        id: "people",
        label: "People",
        entries: [
          { label: "Functions", href: "/admin/functions" },
          { label: "Designations", href: "/admin/designations" },
          { label: "Temporary Break", href: "/admin/temporary-break" },
        ],
      },
      {
        id: "attendance",
        label: "Attendance",
        entries: [
          { label: "Client Locations", href: "/admin/client-locations" },
          { label: "Leave Categories", href: "/admin/leave-categories" },
        ],
      },
      {
        id: "masters",
        label: "Masters",
        entries: [
          { label: "Clients", href: "/admin/clients" },
          { label: "Subjects", href: "/admin/subjects" },
          { label: "Products", href: "/admin/products" },
          { label: "Payment Modes", href: "/admin/outstanding-payment-modes" },
          { label: "Entities", href: "/admin/outstanding-entities" },
          { label: "Products (Legacy View)", href: "/admin/outstanding-products" },
        ],
      },
      {
        id: "billing",
        label: "Billing",
        entries: [
          { label: "Billing Master", href: "/admin/billing-master" },
          { label: "Paying Entities", href: "/admin/paying-entities" },
          { label: "Billing Profiles", href: "/admin/billing-profiles" },
        ],
      },
      { id: "hr", label: "HR", entries: [{ label: "Holidays", href: "/admin/holidays" }] },
    ]);
  });

  it("uses one Dropdown rail entry and keeps excluded People routes out", () => {
    expect(ADMIN_TOP_LEVEL.some((item) => item.href === "/admin/drop-down-master" && item.label === "Dropdown")).toBe(true);
    const railRoutes = ADMIN_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(railRoutes).toEqual(expect.arrayContaining(["/admin/employees", "/admin/employee-master", "/admin/hierarchy", "/admin/upload-master"]));
    expect(railRoutes).not.toEqual(expect.arrayContaining(["/admin/functions", "/admin/designations", "/admin/holidays"]));
  });

  it("keeps Clients and Subjects visible to roster-only users", () => {
    const restrictedRoutes = adminNavFor(true).groups.flatMap((group) => group.items.map((item) => item.href));
    expect(restrictedRoutes).toEqual(["/admin/clients", "/admin/subjects"]);
  });

  it("shows Module Backups only to master admins", () => {
    const normalAdminRoutes = adminNavFor(false, false, false).groups.flatMap((group) => group.items.map((item) => item.href));
    const masterAdminRoutes = adminNavFor(false, false, true).groups.flatMap((group) => group.items.map((item) => item.href));
    expect(normalAdminRoutes).not.toContain("/admin/module-backups");
    expect(masterAdminRoutes).toContain("/admin/module-backups");
  });

  it("hides title while option rows fill hovered window", () => {
    const source = readFileSync("components/admin/drop-down-master-explorer.tsx", "utf8");
    expect(source).toContain("group-hover:hidden");
    expect(source).toContain("gridTemplateRows: `repeat(${category.entries.length}, minmax(0, 1fr))`");
    expect(source).toContain("href={entry.href}");
  });

  it("keeps static launcher windows beside an independently expandable explorer", () => {
    const source = readFileSync("components/admin/drop-down-master-explorer.tsx", "utf8");
    expect(source).toContain("aria-expanded={expanded}");
    expect(source).toContain("toggleModule(category.id, containsActivePage)");
    expect(source).toContain("aria-current={active ? \"page\" : undefined}");
    expect(source).toContain("style={{ backgroundColor: WINDOW_TINTS[category.id] }}");
    expect(source).toContain("rounded-[24px]");
    expect(source).not.toContain("focusCategory");
  });
});
