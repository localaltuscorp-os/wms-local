import { describe, expect, it } from "vitest";
import {
  assignmentGrantsOperationalAccess,
  configuredPermission,
  nearestOwnership,
  type OwnershipAssignment,
} from "@/lib/permissions/ownership-effective";
import { filterVisibleModules } from "@/lib/permissions/visible-modules-effective";

const rows: OwnershipAssignment[] = [
  { nodeKey: "wms", role: "head", employeeId: "head-module", canView: true, canEdit: true },
  { nodeKey: "wms", role: "associate", employeeId: "associate-module", canView: true, canEdit: false },
  { nodeKey: "wms.tasks", role: "head", employeeId: "head-page", canView: true, canEdit: true },
  { nodeKey: "wms.tasks", role: "associate", employeeId: "associate-page", canView: true, canEdit: false },
  { nodeKey: "wms.tasks", role: "developer", employeeId: "developer-page", canView: true, canEdit: true },
];

describe("module ownership inheritance", () => {
  it("inherits the closest configured ancestor", () => {
    const team = nearestOwnership(["wms", "wms.dashboard"], rows);
    expect(team.map((row) => row.employeeId)).toEqual(["head-module", "associate-module"]);
  });

  it("uses a page assignment as a complete override", () => {
    const team = nearestOwnership(["wms", "wms.tasks"], rows);
    expect(team.map((row) => row.employeeId)).toEqual([
      "head-page",
      "associate-page",
      "developer-page",
    ]);
  });

  it("gives Head and Developer edit, while a view-only Associate cannot edit", () => {
    const team = nearestOwnership(["wms", "wms.tasks"], rows);
    expect(assignmentGrantsOperationalAccess(team, "head-page")).toEqual({ view: true, edit: true });
    expect(assignmentGrantsOperationalAccess(team, "associate-page")).toEqual({ view: true, edit: false });
    expect(assignmentGrantsOperationalAccess(team, "developer-page")).toEqual({ view: true, edit: true });
  });

  it("lets an unassigned person view an everyone-visible node but never edit", () => {
    expect(configuredPermission({ nodeKey: "wms", defaultVisibility: "everyone", assignments: rows }, "other"))
      .toEqual({ show: true, view: true, edit: false });
  });

  it("hides a restricted node from an unassigned person", () => {
    expect(configuredPermission({ nodeKey: "wms", defaultVisibility: "restricted", assignments: rows }, "other"))
      .toEqual({ show: false, view: false, edit: false });
  });
});

describe("ownership-backed global navigation", () => {
  it("shows everyone-visible modules and removes restricted modules", () => {
    const decisions = new Map([
      ["wms", true],
      ["employees", false],
      ["employees.incentive", true],
    ]);
    expect(filterVisibleModules(["wms", "employees", "incentive"], decisions)).toEqual([
      "wms",
      "incentive",
    ]);
  });
});
