"use server";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ctcBreakups, employees, designations, payingEntities } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  CTC_REASONS,
  parseFields,
  parseGrowthJourney,
  type CtcVersion,
  type GrowthEntry,
} from "@/lib/hr/ctc/model";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Roster                                                               */
/* ------------------------------------------------------------------ */

export interface CtcRosterOption {
  id: string;
  name: string;
  designation: string;
  department: string;
  /** The employee's FIXED paying entity (payingEntities.name) — the workbench
   *  auto-selects the matching letterhead entity from it. Null when unset. */
  payingEntityName: string | null;
}

/** Active employees for the workbench's employee picker, each with their fixed
 *  paying entity so the entity auto-fills on pick. Read-only, query-light. */
export async function loadCtcRoster(): Promise<CtcRosterOption[]> {
  await requireHrStaff();
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      designation: designations.name,
      department: employees.department,
      payingEntityName: payingEntities.name,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .leftJoin(payingEntities, eq(payingEntities.id, employees.payingEntityId))
    .where(eq(employees.isActive, true))
    .orderBy(sql`lower(${employees.name})`)
    .catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    designation: r.designation ?? "",
    department: r.department ?? "",
    payingEntityName: r.payingEntityName ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Load an employee's CTC history (the Growth Journey)                  */
/* ------------------------------------------------------------------ */

function toVersion(row: typeof ctcBreakups.$inferSelect): CtcVersion {
  const { components, entity } = parseFields(row.fields);
  return {
    id: row.id,
    version: row.version,
    reason: (CTC_REASONS as readonly string[]).includes(row.reason)
      ? (row.reason as CtcVersion["reason"])
      : "initial",
    effectiveDate: row.effectiveDate ?? null,
    components,
    entity,
    growthJourney: parseGrowthJourney(row.growthJourney),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every CTC version for an employee, oldest → newest. */
export async function loadCtcVersions(employeeId: string): Promise<CtcVersion[]> {
  await requireHrStaff();
  if (!z.string().uuid().safeParse(employeeId).success) return [];
  const rows = await db
    .select()
    .from(ctcBreakups)
    .where(eq(ctcBreakups.employeeId, employeeId))
    .orderBy(asc(ctcBreakups.version));
  return rows.map(toVersion);
}

/* ------------------------------------------------------------------ */
/* Save / version / delete                                             */
/* ------------------------------------------------------------------ */

const GrowthSchema = z.object({
  id: z.string().max(80),
  date: z.string().max(40),
  title: z.string().max(160),
  detail: z.string().max(600),
});

const SaveSchema = z.object({
  /** present → update that version in place; absent → create a NEW version. */
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  reason: z.enum(CTC_REASONS),
  effectiveDate: z.string().max(40).nullable().optional(),
  entity: z.string().max(60),
  components: z.record(z.string(), z.number()),
  growthJourney: z.array(GrowthSchema).default([]),
});

export type SaveCtcInput = z.input<typeof SaveSchema>;

/**
 * Create-or-update a CTC breakup. Passing `id` updates that version in place;
 * omitting it appends a NEW version (version = max+1) to the employee's Growth
 * Journey. The numeric components + paying entity are stored together in the
 * `fields` jsonb (no schema change), the reason / effective-date / version in
 * their own columns.
 */
export async function saveCtcVersion(input: SaveCtcInput): Promise<Result<{ id: string; version: number }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid CTC." };
  const v = parsed.data;

  // Keep only non-zero components; store entity alongside.
  const components: Record<string, number> = {};
  for (const [k, val] of Object.entries(v.components)) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) components[k] = Math.round(n * 100) / 100;
  }
  const fields = { components, entity: v.entity };
  const effectiveDate = v.effectiveDate?.trim() ? v.effectiveDate.trim() : null;
  const growthJourney: GrowthEntry[] = v.growthJourney;

  try {
    if (v.id) {
      const [row] = await db
        .update(ctcBreakups)
        .set({
          reason: v.reason,
          effectiveDate,
          fields,
          growthJourney,
          updatedAt: new Date(),
        })
        .where(and(eq(ctcBreakups.id, v.id), eq(ctcBreakups.employeeId, v.employeeId)))
        .returning({ id: ctcBreakups.id, version: ctcBreakups.version });
      if (!row) return { ok: false, error: "That CTC version no longer exists." };
      revalidatePath("/hr/ctc");
      return { ok: true, id: row.id, version: row.version };
    }

    // New version — compute the next version number for this employee.
    const [latest] = await db
      .select({ version: ctcBreakups.version })
      .from(ctcBreakups)
      .where(eq(ctcBreakups.employeeId, v.employeeId))
      .orderBy(desc(ctcBreakups.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    const [row] = await db
      .insert(ctcBreakups)
      .values({
        employeeId: v.employeeId,
        version: nextVersion,
        reason: v.reason,
        effectiveDate,
        fields,
        growthJourney,
        createdById: me.id,
      })
      .returning({ id: ctcBreakups.id, version: ctcBreakups.version });
    if (!row) return { ok: false, error: "Could not save the CTC." };
    revalidatePath("/hr/ctc");
    return { ok: true, id: row.id, version: row.version };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/** Delete a CTC version (a mis-entered draft). Does not renumber siblings. */
export async function deleteCtcVersion(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid version." };
  try {
    await db.delete(ctcBreakups).where(eq(ctcBreakups.id, id));
    revalidatePath("/hr/ctc");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
