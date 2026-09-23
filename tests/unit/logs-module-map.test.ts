import { describe, expect, it } from "vitest";
import { classifyRoute, logModuleTree } from "@/lib/logs/module-map";
import { nodesToMatches } from "@/lib/logs/filters";

/**
 * The route → (module, page) mapping must come from the permission catalogue,
 * not a second definition. These pin the labels a log row carries.
 */
describe("classifyRoute", () => {
  it("classifies an admin sub-page to its module and page", () => {
    expect(classifyRoute("/admin/employees")).toEqual({
      module: "Admin Panel",
      page: "Employees",
      key: "admin.people.employees",
    });
  });

  it("classifies a WMS dashboard route to the WMS module", () => {
    const cls = classifyRoute("/dashboard");
    expect(cls.module).toBe("WMS");
    expect(cls.key).toBe("wms.dashboard");
  });

  it("classifies a task page to WMS / Tasks", () => {
    const cls = classifyRoute("/tasks/kanban");
    expect(cls.module).toBe("WMS");
    expect(cls.key).toBe("wms.tasks.kanban");
  });

  it("returns empty fields for an ungoverned route", () => {
    expect(classifyRoute("/no-such-route-xyz")).toEqual({ module: "", page: "", key: "" });
  });

  it("strips query strings before classifying", () => {
    expect(classifyRoute("/admin/employees?foo=1").key).toBe("admin.people.employees");
  });
});

describe("nodesToMatches", () => {
  it("a module node matches on the module only", () => {
    expect(nodesToMatches(["wms"])).toEqual([{ module: "WMS", page: null }]);
  });

  it("a page node matches on module AND page", () => {
    expect(nodesToMatches(["wms.tasks.kanban"])).toEqual([{ module: "WMS", page: "Kanban" }]);
  });

  it("returns nothing for empty input", () => {
    expect(nodesToMatches([])).toEqual([]);
  });
});

describe("logModuleTree", () => {
  it("includes the admin module and excludes platform/master-admin", () => {
    const tree = logModuleTree();
    const keys = tree.map((m) => m.key);
    expect(keys).toContain("admin");
    expect(keys).toContain("wms");
    expect(keys).not.toContain("platform");
    expect(keys).not.toContain("master-admin");
  });
});
