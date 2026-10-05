export type OwnershipRole = "head" | "associate" | "developer";

export interface OwnershipAssignment {
  nodeKey: string;
  role: OwnershipRole;
  employeeId: string;
  canView: boolean;
  canEdit: boolean;
}

export type OwnershipDefaultVisibility = "everyone" | "restricted";

export interface OwnershipConfiguration {
  nodeKey: string;
  defaultVisibility: OwnershipDefaultVisibility;
  assignments: OwnershipAssignment[];
}

/** The nearest configured node replaces (rather than merges with) its parent. */
export function nearestOwnership(
  chain: readonly string[],
  rows: readonly OwnershipAssignment[],
): OwnershipAssignment[] {
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const atNode = rows.filter((row) => row.nodeKey === chain[i]);
    if (atNode.length > 0) return atNode;
  }
  return [];
}

export function assignmentGrantsOperationalAccess(
  rows: readonly OwnershipAssignment[],
  employeeId: string,
): { view: boolean; edit: boolean } | null {
  const row = rows.find((assignment) => assignment.employeeId === employeeId);
  return row ? { view: row.canView, edit: row.canEdit } : null;
}

export function configuredPermission(
  configuration: OwnershipConfiguration,
  employeeId: string,
): { show: boolean; view: boolean; edit: boolean } {
  const assigned = assignmentGrantsOperationalAccess(configuration.assignments, employeeId);
  if (assigned) return { show: assigned.view, view: assigned.view, edit: assigned.edit };
  const visible = configuration.defaultVisibility === "everyone";
  return { show: visible, view: visible, edit: false };
}
