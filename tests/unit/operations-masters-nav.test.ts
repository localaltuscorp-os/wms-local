import { describe, it, expect } from "vitest";
import { OPERATIONS_MASTERS, isOperationsItemActive, operationsAreaForPath } from "@/lib/operations/nav";
import { workspaceForPath } from "@/lib/workspaces";
import { nodeKeyForPath } from "@/lib/permissions/catalog";

/**
 * OPERATIONS → MASTERS (account holder, 2026-09-15): every master in a rail
 * section of its own, each topic — Checklist, Events, Job Description — separate.
 */
describe("Operations Masters section", () => {
  it("lists the overview, then each master under its own topic", () => {
    expect(OPERATIONS_MASTERS.map((m) => [m.topic, m.href])).toEqual([
      ["Overview", "/operations/masters"],
      ["Checklist", "/operations/masters/checklist"],
      ["Events", "/operations/masters/events"],
      ["Job Description", "/operations/masters/jd"],
      ["Job Description", "/operations/masters/person-jd"],
    ]);
  });

  it("lights exactly one entry on each master's page", () => {
    for (const m of OPERATIONS_MASTERS) {
      const lit = OPERATIONS_MASTERS.filter((x) => isOperationsItemActive(x, m.href));
      expect(lit.map((x) => x.href), m.href).toEqual([m.href]);
    }
    // A master opened by id keeps its own entry lit, not the overview.
    const deep = OPERATIONS_MASTERS.filter((x) => isOperationsItemActive(x, "/operations/masters/checklist/x"));
    expect(deep.map((x) => x.href)).toEqual(["/operations/masters/checklist"]);
  });

  it("stays in the Operations room, under its own permission node, with no area quick-nav", () => {
    for (const m of OPERATIONS_MASTERS) {
      expect(workspaceForPath(m.href)).toBe("operations");
      expect(nodeKeyForPath(m.href)).toBe("operations.masters");
      expect(operationsAreaForPath(m.href)).toBeNull();
    }
  });
});
