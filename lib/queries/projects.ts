import "server-only";
import { asc, desc, eq, sql, and, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { projectNodes, tasks, employees, projectMembers } from "@/db/schema";
import type { TaskStatus } from "@/db/enums";
import { CACHE_TAGS } from "@/lib/cache-tags";

export interface ProjectMemberRef {
  id: string;
  name: string | null;
}

export interface ProjectTreeNode {
  id: string;
  name: string;
  kind: "project" | "milestone" | "result" | "action" | "sub_action";
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

/** A node, its ancestor path labels, and the descendant ids (incl. itself). */
export async function getNodeContext(
  nodeId: string,
): Promise<{ node: ProjectTreeNode; path: string[]; descendantIds: string[] } | null> {
  const tree = await listProjectTree();
  let found: ProjectTreeNode | null = null;
  let path: string[] = [];
  function search(node: ProjectTreeNode, trail: string[]): boolean {
    const next = [...trail, node.name];
    if (node.id === nodeId) {
      found = node;
      path = trail;
      return true;
    }
    return node.children.some((c) => search(c, next));
  }
  for (const r of tree) if (search(r, [])) break;
  if (!found) return null;
  const ids: string[] = [];
  function collect(n: ProjectTreeNode) {
    ids.push(n.id);
    n.children.forEach(collect);
  }
  collect(found);
  return { node: found, path, descendantIds: ids };
}

export interface NodeAction {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  status: TaskStatus;
  dueAt: Date;
  doerName: string | null;
}

/** Tasks ("actions") linked to any of the given nodes, soonest due first. */
export async function listNodeActions(nodeIds: string[]): Promise<NodeAction[]> {
  if (nodeIds.length === 0) return [];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      subject: tasks.subject,
      status: tasks.status,
      dueAt: tasks.dueAt,
      doerName: employees.name,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(and(inArray(tasks.projectNodeId, nodeIds), eq(tasks.archived, false)))
    .orderBy(desc(tasks.createdAt));
  return rows.map((r) => ({ ...r, doerName: r.doerName ?? null }));
}

/**
 * Flat, path-labelled list of active nodes for the task → project picker.
 * Cached under the `projectNodes` tag — re-fetches only when a node is
 * created/renamed/archived (writers in `app/(app)/projects/actions.ts`
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
