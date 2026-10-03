"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  moduleOwnershipAssignments,
  moduleOwnershipEvents,
} from "@/db/schema";
import { getSignedInEmployee, requireUser } from "@/lib/auth/current";
import { hasDatabaseSuperAdminGrant } from "@/lib/security/super-admin-grants";
import { isPermissionNodeKey } from "@/lib/permissions/catalog";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/admin/access-architecture-demo";
type Result = { ok: true } | { ok: false; error: string };

async function requireOwnershipAdmin(): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  await requireUser();
  const actor = await getSignedInEmployee();
  if (!actor || !(await hasDatabaseSuperAdminGrant(actor.id))) {
    return { ok: false, error: "Only a database-backed Super Admin can change ownership." };
  }
  const limited = rateLimitOrError(actor.id, "write");
  if (limited) return limited;
  return { ok: true, actorId: actor.id };
}

function values(form: FormData, key: string): string[] {
  return [...new Set(form.getAll(key).map(String).map((v) => v.trim()).filter(Boolean))];
}

export async function saveModuleOwnership(form: FormData): Promise<Result> {
  const auth = await requireOwnershipAdmin();
  if (!auth.ok) return auth;

  const nodeKey = String(form.get("nodeKey") ?? "").trim();
  const head = String(form.get("head") ?? "").trim();
  const associate = String(form.get("associate") ?? "").trim();
  const developers = values(form, "developers");
  if (!isPermissionNodeKey(nodeKey)) return { ok: false, error: "Unknown module or page." };
  if (!head || !associate) return { ok: false, error: "Choose both a Head and an Associate." };
  if (head === associate) return { ok: false, error: "Head and Associate must be different people." };
  if (developers.includes(head) || developers.includes(associate)) {
    return { ok: false, error: "A Head or Associate cannot also be a Developer on the same item." };
  }

  const employeeIds = [head, associate, ...developers];
  const active = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(inArray(employees.id, employeeIds), eq(employees.isActive, true)));
  if (active.length !== new Set(employeeIds).size) {
    return { ok: false, error: "One or more selected employees are no longer active." };
  }

  const next = [
    { role: "head" as const, employeeId: head },
    { role: "associate" as const, employeeId: associate },
    ...developers.map((employeeId) => ({ role: "developer" as const, employeeId })),
  ];

  try {
    await db.transaction(async (tx) => {
      const previous = await tx
        .select({ role: moduleOwnershipAssignments.role, employeeId: moduleOwnershipAssignments.employeeId })
        .from(moduleOwnershipAssignments)
        .where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      await tx.delete(moduleOwnershipAssignments).where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      await tx.insert(moduleOwnershipAssignments).values(
        next.map((row) => ({ ...row, nodeKey, assignedById: auth.actorId })),
      );
      await tx.insert(moduleOwnershipEvents).values({
        nodeKey,
        previousAssignments: previous,
        nextAssignments: next,
        actorEmployeeId: auth.actorId,
      });
    });
  } catch (error) {
    console.error("[module-ownership] save failed", error);
    return { ok: false, error: "Ownership could not be saved. Check that migration 0265 is applied." };
  }

  revalidatePath(PATH);
  return { ok: true };
}

export async function clearModuleOwnership(nodeKey: string): Promise<Result> {
  const auth = await requireOwnershipAdmin();
  if (!auth.ok) return auth;
  if (!isPermissionNodeKey(nodeKey)) return { ok: false, error: "Unknown module or page." };

  try {
    await db.transaction(async (tx) => {
      const previous = await tx
        .select({ role: moduleOwnershipAssignments.role, employeeId: moduleOwnershipAssignments.employeeId })
        .from(moduleOwnershipAssignments)
        .where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      await tx.delete(moduleOwnershipAssignments).where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      await tx.insert(moduleOwnershipEvents).values({
        nodeKey,
        previousAssignments: previous,
        nextAssignments: [],
        actorEmployeeId: auth.actorId,
      });
    });
  } catch (error) {
    console.error("[module-ownership] clear failed", error);
    return { ok: false, error: "The override could not be removed." };
  }
  revalidatePath(PATH);
  return { ok: true };
}
