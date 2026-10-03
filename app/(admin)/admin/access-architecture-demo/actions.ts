"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  moduleOwnershipAssignments,
  moduleOwnershipEvents,
  moduleOwnershipPolicies,
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

interface AssociateInput { employeeId: string; canEdit: boolean }

function associatesFrom(form: FormData): AssociateInput[] | null {
  try {
    const parsed = JSON.parse(String(form.get("associates") ?? "[]")) as unknown;
    if (!Array.isArray(parsed)) return null;
    const rows = parsed.map((item) => {
      if (!item || typeof item !== "object") throw new Error("invalid");
      const record = item as Record<string, unknown>;
      const employeeId = String(record.employeeId ?? "").trim();
      if (!employeeId || typeof record.canEdit !== "boolean") throw new Error("invalid");
      return { employeeId, canEdit: record.canEdit };
    });
    return [...new Map(rows.map((row) => [row.employeeId, row])).values()];
  } catch {
    return null;
  }
}

export async function saveModuleOwnership(form: FormData): Promise<Result> {
  const auth = await requireOwnershipAdmin();
  if (!auth.ok) return auth;

  const nodeKey = String(form.get("nodeKey") ?? "").trim();
  const head = String(form.get("head") ?? "").trim();
  const associates = associatesFrom(form);
  const developers = values(form, "developers");
  const defaultVisibility = String(form.get("defaultVisibility") ?? "").trim();
  if (!isPermissionNodeKey(nodeKey)) return { ok: false, error: "Unknown module or page." };
  if (!associates) return { ok: false, error: "Associate permissions are invalid." };
  if (defaultVisibility !== "everyone" && defaultVisibility !== "restricted") {
    return { ok: false, error: "Choose a default visibility." };
  }
  const associateIds = associates.map((row) => row.employeeId);
  const selectedIds = [head, ...associateIds, ...developers].filter(Boolean);
  if (new Set(selectedIds).size !== selectedIds.length) {
    return { ok: false, error: "A person can hold only one role on the same item." };
  }

  if (selectedIds.length > 0) {
    const active = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(inArray(employees.id, selectedIds), eq(employees.isActive, true)));
    if (active.length !== selectedIds.length) {
      return { ok: false, error: "One or more selected employees are no longer active." };
    }
  }

  const next = [
    ...(head ? [{ role: "head" as const, employeeId: head, canView: true, canEdit: true }] : []),
    ...associates.map(({ employeeId, canEdit }) => ({
      role: "associate" as const,
      employeeId,
      canView: true,
      canEdit,
    })),
    ...developers.map((employeeId) => ({
      role: "developer" as const,
      employeeId,
      canView: true,
      canEdit: true,
    })),
  ];

  try {
    await db.transaction(async (tx) => {
      const previous = await tx
        .select({ role: moduleOwnershipAssignments.role, employeeId: moduleOwnershipAssignments.employeeId, canView: moduleOwnershipAssignments.canView, canEdit: moduleOwnershipAssignments.canEdit })
        .from(moduleOwnershipAssignments)
        .where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      await tx.delete(moduleOwnershipAssignments).where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      const [previousPolicy] = await tx
        .select({ defaultVisibility: moduleOwnershipPolicies.defaultVisibility })
        .from(moduleOwnershipPolicies)
        .where(eq(moduleOwnershipPolicies.nodeKey, nodeKey))
        .limit(1);
      if (next.length > 0) {
        await tx.insert(moduleOwnershipAssignments).values(
          next.map((row) => ({ ...row, nodeKey, assignedById: auth.actorId })),
        );
      }
      await tx
        .insert(moduleOwnershipPolicies)
        .values({ nodeKey, defaultVisibility, updatedById: auth.actorId })
        .onConflictDoUpdate({
          target: moduleOwnershipPolicies.nodeKey,
          set: { defaultVisibility, updatedById: auth.actorId, updatedAt: new Date() },
        });
      await tx.insert(moduleOwnershipEvents).values({
        nodeKey,
        previousAssignments: previous,
        nextAssignments: next,
        previousDefaultVisibility: previousPolicy?.defaultVisibility ?? null,
        nextDefaultVisibility: defaultVisibility,
        actorEmployeeId: auth.actorId,
      });
    });
  } catch (error) {
    console.error("[module-ownership] save failed", error);
    return { ok: false, error: "Ownership could not be saved. Check that migration 0266 is applied." };
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
        .select({ role: moduleOwnershipAssignments.role, employeeId: moduleOwnershipAssignments.employeeId, canView: moduleOwnershipAssignments.canView, canEdit: moduleOwnershipAssignments.canEdit })
        .from(moduleOwnershipAssignments)
        .where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      await tx.delete(moduleOwnershipAssignments).where(eq(moduleOwnershipAssignments.nodeKey, nodeKey));
      const [previousPolicy] = await tx
        .select({ defaultVisibility: moduleOwnershipPolicies.defaultVisibility })
        .from(moduleOwnershipPolicies)
        .where(eq(moduleOwnershipPolicies.nodeKey, nodeKey))
        .limit(1);
      await tx.delete(moduleOwnershipPolicies).where(eq(moduleOwnershipPolicies.nodeKey, nodeKey));
      await tx.insert(moduleOwnershipEvents).values({
        nodeKey,
        previousAssignments: previous,
        nextAssignments: [],
        previousDefaultVisibility: previousPolicy?.defaultVisibility ?? null,
        nextDefaultVisibility: null,
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
