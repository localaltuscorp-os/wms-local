import "server-only";
import { asc, eq, sql, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { projectNodes, tasks, employees, projectMembers } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

export interface ProjectMemberRef {
  id: string;
  name: string | null;
}

/**
 * Just the top-level PROJECTS as `{id,name}` — what the goal forms' "Part of
 * Project?" picker offers (migration 0184). Deliberately NOT `listProjectTree`:
 * the picker needs a dozen names, not the whole milestone/result/action tree, and
 * this runs on every goal board load.
 */
export async function listProjectOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projectNodes.id, name: projectNodes.name })
    .from(projectNodes)
    .where(and(eq(projectNodes.kind, "project"), eq(projectNodes.isArchived, false)))
    .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name));
}

export interface ProjectTreeNode {
  id: string;
  name: string;
  // 'sub_sub_action' is the sixth level added by the Project Plan screen
  // (migration 0203). This board never creates one, but it must be able to
  // TYPE one, because both screens read the same project_nodes rows.
  kind: "project" | "milestone" | "result" | "action" | "sub_action" | "sub_sub_action";
  parentId: string | null;
  sortOrder: number;
  actionCount: number;
  description: string | null;
  notes: string | null;
  targetDate: Date | null;
  ownerId: string | null;
  ownerName: string | null;
  members: ProjectMemberRef[];
  children: ProjectTreeNode[];
}

/**
 * Full active project tree (Project → Milestone → Result) with the number
 * of tasks ("actions") linked to each node.
 */
export async function listProjectTree(): Promise<ProjectTreeNode[]> {
  const owner = alias(employees, "owner");
  const [rows, memberRows] = await Promise.all([
    db
      .select({
        id: projectNodes.id,
        name: projectNodes.name,
        kind: projectNodes.kind,
        parentId: projectNodes.parentId,
        sortOrder: projectNodes.sortOrder,
        description: projectNodes.description,
        notes: projectNodes.notes,
        targetDate: projectNodes.targetDate,
        ownerId: projectNodes.ownerId,
        ownerName: owner.name,
        actionCount: sql<number>`count(${tasks.id})::int`,
      })
      .from(projectNodes)
      .leftJoin(
        tasks,
        and(eq(tasks.projectNodeId, projectNodes.id), eq(tasks.archived, false)),
      )
      .leftJoin(owner, eq(owner.id, projectNodes.ownerId))
      .where(eq(projectNodes.isArchived, false))
      .groupBy(projectNodes.id, owner.name)
      .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name)),
    db
      .select({
        nodeId: projectMembers.projectNodeId,
        employeeId: projectMembers.employeeId,
        name: employees.name,
      })
      .from(projectMembers)
      .innerJoin(employees, eq(employees.id, projectMembers.employeeId))
      .orderBy(asc(employees.name)),
  ]);

  const membersByNode = new Map<string, ProjectMemberRef[]>();
  for (const m of memberRows) {
    const list = membersByNode.get(m.nodeId) ?? [];
    list.push({ id: m.employeeId, name: m.name });
    membersByNode.set(m.nodeId, list);
  }

  const byId = new Map<string, ProjectTreeNode>();
  for (const r of rows) {
    byId.set(r.id, {
      ...r,
      members: membersByNode.get(r.id) ?? [],
      children: [],
    });
  }
  const roots: ProjectTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else if (!node.parentId) {
      roots.push(node);
    }
  }
  return roots;
}

export interface ProjectNodeOption {
  id: string;
  /** "Project / Milestone / Result" path label for the task picker. */
  label: string;
}

/**
 * Flat, path-labelled list of active nodes for the task → project picker.
 * Cached under the `projectNodes` tag — re-fetches only when a node is
 * created/renamed/archived (writers in `app/(app)/project-plan/actions.ts`
 * call `updateTag(CACHE_TAGS.projectNodes)`).
 */
export const listProjectNodeOptions = unstable_cache(
  async (): Promise<ProjectNodeOption[]> => {
    const tree = await listProjectTree();
    const out: ProjectNodeOption[] = [];
    function walk(node: ProjectTreeNode, prefix: string) {
      const label = prefix ? `${prefix} / ${node.name}` : node.name;
      out.push({ id: node.id, label });
      for (const c of node.children) walk(c, label);
    }
    for (const r of tree) walk(r, "");
    return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  },
  ["list-project-node-options"],
  { tags: [CACHE_TAGS.projectNodes], revalidate: 600 },
);
