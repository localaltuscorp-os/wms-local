import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { moduleOwnershipAssignments } from "@/db/schema";
import { nodeChain } from "./catalog";
import {
  assignmentGrantsOperationalAccess,
  nearestOwnership,
  type OwnershipAssignment,
} from "./ownership-effective";

/** Load only the nodes needed by this permission decision, once per request. */
const loadChainAssignments = cache(async (nodeKey: string): Promise<OwnershipAssignment[]> => {
  const chain = nodeChain(nodeKey);
  if (chain.length === 0) return [];
  try {
    return await db
      .select({
        nodeKey: moduleOwnershipAssignments.nodeKey,
        role: moduleOwnershipAssignments.role,
        employeeId: moduleOwnershipAssignments.employeeId,
      })
      .from(moduleOwnershipAssignments)
      .where(inArray(moduleOwnershipAssignments.nodeKey, [...chain])) as OwnershipAssignment[];
  } catch (error) {
    // Ownership widens module access. A failed read must therefore fail closed:
    // existing authorization continues unchanged and no ownership is invented.
    console.error("[module-ownership] could not load assignments", error);
    return [];
  }
});

/**
 * Nearest configured team wins. A page with any assignment is a complete page
 * override; otherwise it inherits the closest configured ancestor.
 */
export async function effectiveOwnership(nodeKey: string): Promise<OwnershipAssignment[]> {
  const chain = nodeChain(nodeKey);
  const rows = await loadChainAssignments(nodeKey);
  return nearestOwnership(chain, rows);
}

export async function isOperationalOwner(nodeKey: string, employeeId: string): Promise<boolean> {
  const team = await effectiveOwnership(nodeKey);
  return assignmentGrantsOperationalAccess(team, employeeId);
}
