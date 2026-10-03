export type OwnershipRole = "head" | "associate" | "developer";

export interface OwnershipAssignment {
  nodeKey: string;
  role: OwnershipRole;
  employeeId: string;
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
): boolean {
  return rows.some(
    (row) => row.employeeId === employeeId && (row.role === "head" || row.role === "associate"),
  );
}
