"use server";

/**
 * ADMIN PANEL → PEOPLE → FUNCTIONS.
 *
 * The admin-managed list of organisational units an employee belongs to. It was
 * called "Departments" until migration 0234; the rows, the ids and the screen
 * are the same, and `employees.department_id` still points at them. Only the
 * word changed — and the table it lives in, which is now `functions`.
 */

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, functions, settingsEvents } from "@/db/schema";
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
  // CASE-INSENSITIVE, matching the `functions_name_uq` index. The old check
  // compared exactly, so "sales" slipped past it and then failed on the
  // constraint with a raw database error in the UI.
  const [existing] = await db
    .select({ id: functions.id })
    .from(functions)
    .where(sql`lower(${functions.name}) = lower(${parsed.data.name})`)
    .limit(1);
  if (existing) {
    return { ok: false, error: "A Function with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(functions)
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
      scope: "function",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: { name: inserted.name, sortOrder: inserted.sortOrder },
    });
  } catch (err) {
    console.error("[createFunction] audit write failed", err);
  }

  revalidatePath("/admin/functions");
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
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid Function id" };
  }

  const parsed = UpdateDepartmentSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [dept] = await db
    .select()
    .from(functions)
    .where(eq(functions.id, parsedId.data))
    .limit(1);
  if (!dept) return { ok: false, error: "Function not found" };

  const patch: Partial<typeof functions.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(functions).set(patch).where(eq(functions.id, dept.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the unique-constraint violation as a friendly message.
    // The real index is `functions_name_uq` (case-insensitive). The old code
    // looked for `departments_name_unique`, which never matched, so a duplicate
    // reached the user as a raw database error.
    if (/functions_name_uq|duplicate key/i.test(msg)) {
      return { ok: false, error: "A Function with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  // If the name changed, propagate to the legacy text column on every
  // employee linked to this Function. Still worth doing: that column is what
  // migration 0234 used to repair 19 employees whose Function id pointed at
  // nothing, so keeping it accurate keeps that recovery route open.
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
        "[updateFunction] failed to propagate name to employees.department",
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
        scope: "function",
        targetId: dept.id,
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateFunction] audit write failed", err);
  }

  revalidatePath("/admin/functions");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/employees");
  return { ok: true };
}
