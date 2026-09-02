import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { listProjectTree, type ProjectTreeNode } from "@/lib/queries/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Count nodes of one kind across a whole subtree (milestones / results / …). */
function countByKind(node: ProjectTreeNode, kind: ProjectTreeNode["kind"]): number {
  let n = node.kind === kind ? 1 : 0;
  for (const c of node.children) n += countByKind(c, kind);
  return n;
}

/** Every node id in the subtree (incl. the root) — used to roll up task counts. */
function collectIds(node: ProjectTreeNode, out: string[]): void {
  out.push(node.id);
  for (const c of node.children) collectIds(c, out);
}

/**
 * GET /api/mobile/projects — the signed-in user's Projects overview: the same
 * org-wide project tree the web `/projects` page reads (Project → Milestone →
 * Result → Action), collapsed to a flat per-project card with its structure
 * counts AND a real completion meter (linked tasks done / total). Read-only.
 *
 * Additive: reuses `listProjectTree` (the web query) verbatim and adds one
 * grouped task-status roll-up; the web page is untouched.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }

  const tree = await listProjectTree();

  // All node ids across every project, so one query resolves the task roll-up.
  const allNodeIds: string[] = [];
  for (const root of tree) collectIds(root, allNodeIds);

  // Per-node linked-task totals + done counts (non-archived tasks only).
  const taskRows = allNodeIds.length
    ? await db
        .select({
          nodeId: tasks.projectNodeId,
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
        })
        .from(tasks)
        .where(and(inArray(tasks.projectNodeId, allNodeIds), eq(tasks.archived, false)))
        .groupBy(tasks.projectNodeId)
    : [];

  const byNode = new Map<string, { total: number; done: number }>();
  for (const r of taskRows) {
    if (r.nodeId) byNode.set(r.nodeId, { total: r.total ?? 0, done: r.done ?? 0 });
  }

  const projects = tree.map((root) => {
    const ids: string[] = [];
    collectIds(root, ids);
    let linkedTasks = 0;
    let doneTasks = 0;
    for (const id of ids) {
      const t = byNode.get(id);
      if (t) {
        linkedTasks += t.total;
        doneTasks += t.done;
      }
    }
    return {
      id: root.id,
      name: root.name,
      ownerName: root.ownerName ?? null,
      // Wrap the raw column in a Date so a string/Date drift can't leak out.
      targetDate: root.targetDate ? new Date(root.targetDate).toISOString() : null,
      milestones: countByKind(root, "milestone"),
      results: countByKind(root, "result"),
      actions: countByKind(root, "action") + countByKind(root, "sub_action"),
      linkedTasks,
      doneTasks,
      pct: linkedTasks > 0 ? Math.round((doneTasks / linkedTasks) * 100) : 0,
    };
  });

  const totals = {
    projects: projects.length,
    milestones: projects.reduce((s, p) => s + p.milestones, 0),
    results: projects.reduce((s, p) => s + p.results, 0),
    tasks: projects.reduce((s, p) => s + p.linkedTasks, 0),
  };

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      totals,
      projects,
    },
    { headers: MOBILE_CORS },
  );
}
