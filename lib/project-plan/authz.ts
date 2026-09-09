import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectNodes, tasks } from "@/db/schema";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import type { PlanActor } from "./status";

/**
 * Project Plan — who the caller is RELATIVE TO one plan row.
 *
 * Extracted here so the status action and the attachment actions rule on the
 * same facts. Both need "is this person the owner, the doer, or their
 * supervisor?", and two copies of that question would eventually answer it
 * differently — which is how a doer ends up able to approve their own work.
 *
 * Server-only and db-backed ON PURPOSE. The client sends an id and nothing
 * else: it is never asked who it is, so it cannot claim to be the owner.
 * lib/project-plan/status.ts stays pure and client-safe; this is the half that
 * talks to the database.
 */
export async function actorFor(
  me: { id: string; isAdmin: boolean },
  node: typeof projectNodes.$inferSelect,
): Promise<PlanActor> {
  const isOwner = node.ownerId === me.id;

  // The doer of the row's linked task, if it has one. Oldest-first so a row
  // that somehow carries more than one task resolves deterministically to the
  // same task the rest of the module treats as its own.
  const [linked] = await db
    .select({ doerId: tasks.doerId })
    .from(tasks)
    .where(and(eq(tasks.projectNodeId, node.id), eq(tasks.archived, false)))
    .orderBy(asc(tasks.createdAt))
    .limit(1);
  const isDoer = !!linked && linked.doerId === me.id;

  // Supervisor = the owner or the doer sits somewhere in the caller's downline.
  // One downline lookup, then set membership — not a walk up the tree per row.
  let isSupervisor = false;
  if (!isOwner && !isDoer) {
    const downline = new Set(await getDownlineIds(me.id));
    isSupervisor =
      (!!node.ownerId && downline.has(node.ownerId)) ||
      (!!linked?.doerId && downline.has(linked.doerId));
  }

  return { id: me.id, isAdmin: me.isAdmin, isOwner, isDoer, isSupervisor };
}
