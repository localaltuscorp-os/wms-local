import "server-only";
import type { WorkspaceId } from "@/lib/workspaces";
import { canShowModule } from "./resolve";
import {
  filterVisibleModules,
  WORKSPACE_PERMISSION_NODE,
} from "./visible-modules-effective";

/** Filter global module navigation with the same server-side show decision as routes. */
export async function visibleModules(modules: readonly WorkspaceId[]): Promise<WorkspaceId[]> {
  const nodeKeys = [...new Set(modules.flatMap((id) => {
    const nodeKey = WORKSPACE_PERMISSION_NODE[id];
    return nodeKey ? [nodeKey] : [];
  }))];
  const decisions = await Promise.all(
    nodeKeys.map(async (nodeKey) => [nodeKey, await canShowModule(nodeKey)] as const),
  );
  return filterVisibleModules(modules, new Map(decisions));
}
