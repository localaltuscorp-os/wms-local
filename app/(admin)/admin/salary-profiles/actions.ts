"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, employeeEvents, salaryAdvances, salaryProfiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { fyForMonth } from "@/lib/salary/period";
import { listAdvances, type SalaryAdvanceRow } from "@/lib/queries/salary";
import { SalaryProfileSchema, SalaryAdvanceSchema } from "@/lib/validators/salary";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/admin/salary-profiles";

/**
 * Create or update an employee's salary profile (CTC / monthly TDS /
 * PT-exempt) AND the designation / paying-entity / probation-end fields that
 * live on the `employees` row. Money is written as `.toFixed(2)` numeric
 * strings (house style). Audited to `employee_events`. Admin-only.
 *
 * The att_* time overrides + weekly-off have their own admin (the employees
 * attendance-schedule action), so they are intentionally NOT touched here.
 */
export async function upsertSalaryProfile(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SalaryProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, data.employeeId),
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  const annualCtc = data.annualCtc.toFixed(2);
  const tdsMonthly = data.tdsMonthly.toFixed(2);

  // Only update employee columns that were explicitly supplied.
  const empPatch: Partial<typeof employees.$inferInsert> = {};
  if (data.designationId !== undefined) empPatch.designationId = data.designationId;
  if (data.payingEntityId !== undefined) empPatch.payingEntityId = data.payingEntityId;
  if (data.probationEnd !== undefined) empPatch.probationEnd = data.probationEnd;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(salaryProfiles)
        .values({
          employeeId: data.employeeId,
          annualCtc,
          tdsMonthly,
          ptExempt: data.ptExempt,
        })
        .onConflictDoUpdate({
          target: salaryProfiles.employeeId,
          set: { annualCtc, tdsMonthly, ptExempt: data.ptExempt, updatedAt: new Date() },
        });

      if (Object.keys(empPatch).length > 0) {
        await tx.update(employees).set(empPatch).where(eq(employees.id, data.employeeId));
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  // Audit — non-fatal.
  try {
    await db.insert(employeeEvents).values({
      employeeId: data.employeeId,
      actorId: me.id,
      eventType: "salary_profile_set",
      toValue: {
        annualCtc,
        tdsMonthly,
        ptExempt: data.ptExempt,
        designationId: data.designationId ?? null,
        payingEntityId: data.payingEntityId ?? null,
        probationEnd: data.probationEnd ?? null,
      },
    });
  } catch (err) {
    console.error("[upsertSalaryProfile] audit write failed", err);
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Record a salary advance taken by an employee for a given salary month.
 * Amount stored as `.toFixed(2)`, FY derived from the month, advance_date =
 * today, created_by = the acting admin. Admin-only. Audited.
 */
export async function addAdvance(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SalaryAdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, data.employeeId),
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  const amount = data.amount.toFixed(2);
  const today = new Date().toISOString().slice(0, 10);

  try {
    await db.insert(salaryAdvances).values({
      employeeId: data.employeeId,
      advanceDate: today,
      fy: fyForMonth(data.month),
      month: data.month,
      amount,
      note: data.note ?? null,
      createdById: me.id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: data.employeeId,
      actorId: me.id,
      eventType: "salary_advance_added",
      toValue: { month: data.month, amount, note: data.note ?? null },
    });
  } catch (err) {
    console.error("[addAdvance] audit write failed", err);
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Read an employee's advances for a month. Admin-only server-action wrapper
 * over the read query so the client advances panel can fetch lazily when the
 * month picker changes. Returns `[]` on bad input rather than throwing.
 */
export async function fetchAdvances(
  employeeId: string,
  month: string,
): Promise<SalaryAdvanceRow[]> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !/^\d{4}-\d{2}$/.test(month)) {
    return [];
  }
  return listAdvances(employeeId, month);
}

/** Delete a salary advance by id. Admin-only. */
export async function deleteAdvance(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: "Invalid id" };
  }

  let deleted;
  try {
    [deleted] = await db
      .delete(salaryAdvances)
      .where(eq(salaryAdvances.id, id))
      .returning({ employeeId: salaryAdvances.employeeId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!deleted) return { ok: false, error: "Advance not found." };

  try {
    await db.insert(employeeEvents).values({
      employeeId: deleted.employeeId,
      actorId: me.id,
      eventType: "salary_advance_deleted",
      fromValue: { advanceId: id },
    });
  } catch (err) {
    console.error("[deleteAdvance] audit write failed", err);
  }

  revalidatePath(PATH);
  return { ok: true };
}
