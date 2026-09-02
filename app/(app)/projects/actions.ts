"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  projectNodes,
  projectMembers,
  employees,
  type Employee,
  type ProjectNode,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { notify } from "@/lib/notifications/dispatch";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Centralised tag/route invalidation for project-node writes. All three
 * actions below call this so the cached `listProjectNodeOptions` picker
 * payload drops on every change.
 */
function revalidateProjectSurfaces() {
  revalidatePath("/projects");
  updateTag(CACHE_TAGS.projectNodes);
}

/**
 * Phase 3.1 — load a project node + assert the caller is allowed to mutate
 * it (creator or admin). Prevents any authenticated user from renaming or
 * archiving another team-member's project just by guessing the UUID, which
 * the previous `requireUser()`-only check permitted. The `create` path
 * stays open: anyone can start a new project in a small-team setting.
 *
 * Returns a Result-shaped error so the caller can `return` it directly.
 */
async function authorizeProjectNodeMutation(
  id: string,
  me: Employee,
): Promise<{ ok: true; node: ProjectNode } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }
  const node = await db.query.projectNodes.findFirst({
    where: eq(projectNodes.id, id),
  });
  if (!node) return { ok: false, error: "Project node not found" };
  if (!me.isAdmin && node.createdById !== me.id) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, node };
}

const KIND = z.enum(["project", "milestone", "result", "action", "sub_action"]);
const NameSchema = z.string().trim().min(1, "Name is required").max(160, "Name is too long");

const CreateSchema = z.object({
  name: NameSchema,
  kind: KIND,
  parentId: z.string().uuid().nullable().optional(),
});

// Each kind's required parent kind (null = top-level).
const CHILD_OF: Record<string, string | null> = {
  project: null,
  milestone: "project",
  result: "milestone",
  action: "result",
  sub_action: "action",
};

export async function createProjectNode(
  input: z.input<typeof CreateSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, kind, parentId } = parsed.data;

  // Validate parent kind matches the hierarchy.
  const needsParent = CHILD_OF[kind];
  if (needsParent && !parentId) {
    return { ok: false, error: `A ${kind} needs a parent ${needsParent}.` };
  }
  if (!needsParent && parentId) {
    return { ok: false, error: "A project can't have a parent." };
  }
  if (parentId) {
    const parent = await db.query.projectNodes.findFirst({
      where: eq(projectNodes.id, parentId),
    });
    if (!parent) return { ok: false, error: "Parent not found." };
    if (parent.kind !== needsParent) {
      return { ok: false, error: `A ${kind} must sit under a ${needsParent}.` };
    }
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(projectNodes)
      .values({ name, kind, parentId: parentId ?? null, createdById: me.id })
      .returning({ id: projectNodes.id });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };
  revalidateProjectSurfaces();
  return { ok: true, id: inserted.id };
}

export async function renameProjectNode(
  id: string,
  name: string,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) {
    return { ok: false, error: parsedName.error.issues[0]?.message ?? "Invalid name" };
  }
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  // Belt-and-braces: scope the WHERE to the creator-or-admin so a
  // concurrent ownership transfer between the auth check and this UPDATE
  // can't bypass the gate. `.returning()` then verifies the row was touched.
  const updated = await db
    .update(projectNodes)
    .set({ name: parsedName.data, updatedAt: new Date() })
    .where(
      me.isAdmin
        ? eq(projectNodes.id, id)
        : and(eq(projectNodes.id, id), eq(projectNodes.createdById, me.id)),
    )
    .returning({ id: projectNodes.id });
  if (updated.length === 0) {
    // Should only happen if the row was deleted between auth check and now.
    return { ok: false, error: "Project node not found" };
  }
  revalidateProjectSurfaces();
  return { ok: true };
}

/**
 * #13 — permanently delete a project node AND its whole subtree
 * (milestone → result → action → sub-action). `parent_id` has no FK
 * cascade, so we collect the subtree here; linked tasks auto-unlink via
 * tasks.project_node_id ON DELETE SET NULL (the task itself is kept).
 * Creator-or-admin gated, same as archive.
 */
export async function deleteProjectNode(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;

  try {
    const all = await db
      .select({ id: projectNodes.id, parentId: projectNodes.parentId })
      .from(projectNodes);
    const childrenOf = new Map<string, string[]>();
    for (const n of all) {
      if (!n.parentId) continue;
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentId, arr);
    }
    const toDelete: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      toDelete.push(cur);
      for (const c of childrenOf.get(cur) ?? []) stack.push(c);
    }
    await db.delete(projectNodes).where(inArray(projectNodes.id, toDelete));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidateProjectSurfaces();
  return { ok: true };
}

export async function setProjectNodeArchived(
  id: string,
  isArchived: boolean,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  const updated = await db
    .update(projectNodes)
    .set({ isArchived, updatedAt: new Date() })
    .where(
      me.isAdmin
        ? eq(projectNodes.id, id)
        : and(eq(projectNodes.id, id), eq(projectNodes.createdById, me.id)),
    )
    .returning({ id: projectNodes.id });
  if (updated.length === 0) {
    return { ok: false, error: "Project node not found" };
  }
  revalidateProjectSurfaces();
  return { ok: true };
}

/* ─── #13 — project overhaul: details, owner, team, reorder ──────────── */

const DetailsSchema = z
  .object({
    description: z.string().trim().max(8000).nullable().optional(),
    notes: z.string().trim().max(8000).nullable().optional(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-mm-dd")
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No changes." });

/** Set a node's rich fields (description, notes, target date). */
export async function setProjectNodeDetails(
  id: string,
  input: z.input<typeof DetailsSchema>,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  const parsed = DetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description || null;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes || null;
  if (parsed.data.targetDate !== undefined)
    patch.targetDate = parsed.data.targetDate
      ? new Date(`${parsed.data.targetDate}T12:00:00+05:30`)
      : null;
  const updated = await db
    .update(projectNodes)
    .set(patch)
    .where(
      me.isAdmin
        ? eq(projectNodes.id, id)
        : and(eq(projectNodes.id, id), eq(projectNodes.createdById, me.id)),
    )
    .returning({ id: projectNodes.id });
  if (updated.length === 0) return { ok: false, error: "Project node not found" };
  revalidateProjectSurfaces();
  return { ok: true };
}

/** Assign (or clear) the node's owner. Notifies the new owner. */
export async function setProjectNodeOwner(
  id: string,
  ownerId: string | null,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  if (ownerId !== null && !z.string().uuid().safeParse(ownerId).success) {
    return { ok: false, error: "Invalid owner id" };
  }
  if (ownerId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, ownerId) });
    if (!emp) return { ok: false, error: "Owner not found" };
  }
  const updated = await db
    .update(projectNodes)
    .set({ ownerId, updatedAt: new Date() })
    .where(
      me.isAdmin
        ? eq(projectNodes.id, id)
        : and(eq(projectNodes.id, id), eq(projectNodes.createdById, me.id)),
    )
    .returning({ id: projectNodes.id });
  if (updated.length === 0) return { ok: false, error: "Project node not found" };
  if (ownerId && ownerId !== me.id) {
    await notify({
      userId: ownerId,
      kind: "task_assigned",
      title: `You're now the owner of "${auth.node.name}"`,
      body: `${me.name} made you owner of this ${auth.node.kind}.`,
      actorId: me.id,
    });
  }
  revalidateProjectSurfaces();
  return { ok: true };
}

/** Add a team member to a node. Notifies them. */
export async function addProjectMember(
  id: string,
  employeeId: string,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  if (!z.string().uuid().safeParse(employeeId).success) {
    return { ok: false, error: "Invalid member id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Member not found" };
  await db
    .insert(projectMembers)
    .values({ projectNodeId: id, employeeId })
    .onConflictDoNothing();
  if (employeeId !== me.id) {
    await notify({
      userId: employeeId,
      kind: "task_assigned",
      title: `Added to "${auth.node.name}"`,
      body: `${me.name} added you to this ${auth.node.kind}.`,
      actorId: me.id,
    });
  }
  revalidateProjectSurfaces();
  return { ok: true };
}

/** Remove a team member from a node. */
export async function removeProjectMember(
  id: string,
  employeeId: string,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectNodeId, id),
        eq(projectMembers.employeeId, employeeId),
      ),
    );
  revalidateProjectSurfaces();
  return { ok: true };
}

/**
 * Drag-rank: persist a new sibling order. The caller passes the sibling
 * ids top-to-bottom; we stamp sort_order = index*10. Children move with
 * their parent automatically (they render nested under it).
 */
export async function reorderProjectNodes(orderedIds: string[]): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.array(z.string().uuid()).min(1).max(500).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid order list" };
  try {
    for (let i = 0; i < parsed.data.length; i++) {
      await db
        .update(projectNodes)
        .set({ sortOrder: (i + 1) * 10, updatedAt: new Date() })
        .where(
          me.isAdmin
            ? eq(projectNodes.id, parsed.data[i]!)
            : and(eq(projectNodes.id, parsed.data[i]!), eq(projectNodes.createdById, me.id)),
        );
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidateProjectSurfaces();
  return { ok: true };
}
