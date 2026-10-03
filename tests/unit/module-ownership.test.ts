import { describe, expect, it } from "vitest";
import {
  assignmentGrantsOperationalAccess,
  nearestOwnership,
  type OwnershipAssignment,
} from "@/lib/permissions/ownership-effective";

const rows: OwnershipAssignment[] = [
  { nodeKey: "wms", role: "head", employeeId: "head-module" },
  { nodeKey: "wms", role: "associate", employeeId: "associate-module" },
  { nodeKey: "wms.tasks", role: "head", employeeId: "head-page" },
  { nodeKey: "wms.tasks", role: "associate", employeeId: "associate-page" },
  { nodeKey: "wms.tasks", role: "developer", employeeId: "developer-page" },
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

  it("grants operational access equally to Head and Associate, never Developer", () => {
    const team = nearestOwnership(["wms", "wms.tasks"], rows);
    expect(assignmentGrantsOperationalAccess(team, "head-page")).toBe(true);
    expect(assignmentGrantsOperationalAccess(team, "associate-page")).toBe(true);
    expect(assignmentGrantsOperationalAccess(team, "developer-page")).toBe(false);
  });
});
