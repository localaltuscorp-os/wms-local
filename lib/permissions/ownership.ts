import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { moduleOwnershipAssignments, moduleOwnershipPolicies } from "@/db/schema";
import { nodeChain } from "./catalog";
import {
  configuredPermission,
  nearestOwnership,
  type OwnershipAssignment,
  type OwnershipConfiguration,
  type OwnershipDefaultVisibility,
} from "./ownership-effective";

/** Load only the nodes needed by this permission decision, once per request. */
const loadChainOwnership = cache(async (nodeKey: string): Promise<{
  assignments: OwnershipAssignment[];
  policies: { nodeKey: string; defaultVisibility: OwnershipDefaultVisibility }[];
}> => {
  const chain = nodeChain(nodeKey);
  if (chain.length === 0) return { assignments: [], policies: [] };
  try {
    const [assignments, policies] = await Promise.all([
      db
        .select({
          nodeKey: moduleOwnershipAssignments.nodeKey,
          role: moduleOwnershipAssignments.role,
          employeeId: moduleOwnershipAssignments.employeeId,
          canView: moduleOwnershipAssignments.canView,
          canEdit: moduleOwnershipAssignments.canEdit,
        })
        .from(moduleOwnershipAssignments)
        .where(inArray(moduleOwnershipAssignments.nodeKey, [...chain])),
      db
        .select({
          nodeKey: moduleOwnershipPolicies.nodeKey,
          defaultVisibility: moduleOwnershipPolicies.defaultVisibility,
        })
        .from(moduleOwnershipPolicies)
        .where(inArray(moduleOwnershipPolicies.nodeKey, [...chain])),
    ]);
    return {
      assignments: assignments as OwnershipAssignment[],
      policies: policies as { nodeKey: string; defaultVisibility: OwnershipDefaultVisibility }[],
    };
  } catch (error) {
    // Ownership widens module access. A failed read must therefore fail closed:
    // existing authorization continues unchanged and no ownership is invented.
    console.error("[module-ownership] could not load assignments", error);
    return { assignments: [], policies: [] };
  }
});

export async function effectiveOwnershipConfiguration(
  nodeKey: string,
): Promise<OwnershipConfiguration | null> {
  const chain = nodeChain(nodeKey);
  const { assignments, policies } = await loadChainOwnership(nodeKey);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const key = chain[i]!;
    const atNode = assignments.filter((row) => row.nodeKey === key);
    const policy = policies.find((row) => row.nodeKey === key);
    if (policy || atNode.length > 0) {
      return {
        nodeKey: key,
        defaultVisibility: policy?.defaultVisibility ?? "restricted",
        assignments: atNode,
      };
    }
  }
  return null;
}

/**
 * Nearest configured team wins. A page with any assignment is a complete page
 * override; otherwise it inherits the closest configured ancestor.
 */
export async function effectiveOwnership(nodeKey: string): Promise<OwnershipAssignment[]> {
  const chain = nodeChain(nodeKey);
  const { assignments } = await loadChainOwnership(nodeKey);
  return nearestOwnership(chain, assignments);
}

export async function ownershipPermission(nodeKey: string, employeeId: string) {
  const configuration = await effectiveOwnershipConfiguration(nodeKey);
  return configuration ? configuredPermission(configuration, employeeId) : null;
}
