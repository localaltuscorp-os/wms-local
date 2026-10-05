import type { WorkspaceId } from "@/lib/workspaces";

/** The catalogue node that governs whether each workspace appears globally. */
export const WORKSPACE_PERMISSION_NODE: Partial<Record<WorkspaceId, string>> = {
  wms: "wms",
  admin: "accounts",
  employees: "employees",
  hr: "hr",
  sales: "sales",
  training: "training",
  accounts: "accounts",
  events: "events",
  goals: "goals",
  productivity: "productivity",
  billing: "billing",
  "people-allocation": "people-allocation",
  "project-plan": "project-plan",
  operations: "operations",
  incentive: "employees.incentive",
  "control-panel": "control-panel",
};

export function filterVisibleModules(
  modules: readonly WorkspaceId[],
  canShow: ReadonlyMap<string, boolean>,
): WorkspaceId[] {
  return modules.filter((moduleId) => {
    const nodeKey = WORKSPACE_PERMISSION_NODE[moduleId];
    return nodeKey ? canShow.get(nodeKey) !== false : true;
  });
}
