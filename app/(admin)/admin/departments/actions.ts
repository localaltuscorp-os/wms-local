"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { departments, employees, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  DepartmentIdSchema,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
} from "@/lib/validators/department";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function createDepartment(
  input: CreateDepartmentInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateDepartmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Reject case-insensitive duplicates so the unique constraint never
  // fires with a raw DB error in the UI.
  const existing = await db.query.departments.findFirst({
    where: eq(departments.name, parsed.data.name),
  });
  if (existing) {
    return { ok: false, error: "A department with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(departments)
      .values({
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 100,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) {
    return { ok: false, error: "DB: insert returned no row" };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "department",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: { name: inserted.name, sortOrder: inserted.sortOrder },
    });
  } catch (err) {
    console.error("[createDepartment] audit write failed", err);
  }

  revalidatePath("/admin/departments");
  revalidatePath("/admin/employees");
  return { ok: true, id: inserted.id };
}

export async function updateDepartment(
  departmentId: string,
  fields: UpdateDepartmentInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = DepartmentIdSchema.safeParse(departmentId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid department id" };
  }

  const parsed = UpdateDepartmentSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, parsedId.data),
  });
  if (!dept) return { ok: false, error: "Department not found" };

  const patch: Partial<typeof departments.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(departments).set(patch).where(eq(departments.id, dept.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the unique-constraint violation as a friendly message.
    if (msg.includes("departments_name_unique")) {
      return { ok: false, error: "A department with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  // If the name changed, propagate to the legacy text column on every
  // employee linked to this department.  Soft migration: keep
  // employees.department in sync with the FK name during the
  // transition period.
  if (parsed.data.name !== undefined && parsed.data.name !== dept.name) {
    try {
      await db
        .update(employees)
        .set({ department: parsed.data.name })
        .where(eq(employees.departmentId, dept.id));
    } catch (err: unknown) {
      // Non-fatal: the FK is still correct; only the legacy text column
      // is stale.  Log + continue.
      console.error(
        "[updateDepartment] failed to propagate name to employees.department",
        err,
      );
    }
  }

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== dept.name) {
      fromValue.name = dept.name;
      toValue.name = parsed.data.name;
    }
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== dept.isActive) {
      fromValue.isActive = dept.isActive;
      toValue.isActive = parsed.data.isActive;
    }
    if (parsed.data.sortOrder !== undefined && parsed.data.sortOrder !== dept.sortOrder) {
      fromValue.sortOrder = dept.sortOrder;
      toValue.sortOrder = parsed.data.sortOrder;
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(settingsEvents).values({
        scope: "department",
        targetId: dept.id,
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateDepartment] audit write failed", err);
  }

  revalidatePath("/admin/departments");
  revalidatePath("/admin/employees");
  return { ok: true };
}
