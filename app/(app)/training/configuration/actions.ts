"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcLearningTargets, tcLookups } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { auditAction } from "@/lib/logs/audit";
import { LEARNING_METRICS, LEARNING_ROLE_GROUPS } from "@/db/enums";
import { LOOKUP_KINDS, type LookupKind } from "@/lib/training/lookups";

const PATH = "/training/configuration";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function requireConfigAdmin() {
  const me = await requireWorkspace("training");
  if (!me.isAdmin && !isSuperAdmin(me.email)) throw new Error("Admins only");
  return me;
}

function fail(parsed: { success: false; error: z.ZodError }): { ok: false; error: string } {
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
}

const TargetSchema = z.object({
  roleGroup: z.enum(LEARNING_ROLE_GROUPS),
  metric: z.enum(LEARNING_METRICS),
  value: z.coerce.number().min(0).max(1000),
  unit: z.enum(["count", "hours"]),
  effectiveFrom: z.string().min(1, "Pick a start date."), // YYYY-MM-DD
});

/**
 * Set a target for a role/metric, closing the previous open row the day before
 * the new one starts — so a future change never rewrites a past month.
 */
export async function upsertLearningTarget(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireConfigAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = TargetSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    // Close any currently-open row for this role/metric as of the day before.
    const dayBefore = new Date(`${d.effectiveFrom}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const closeDate = dayBefore.toISOString().slice(0, 10);

    await db
      .update(tcLearningTargets)
      .set({ effectiveTo: closeDate, updatedAt: new Date() })
      .where(
        and(
          eq(tcLearningTargets.roleGroup, d.roleGroup),
          eq(tcLearningTargets.metric, d.metric),
          isNull(tcLearningTargets.effectiveTo),
          lte(tcLearningTargets.effectiveFrom, closeDate),
        ),
      );

    const [row] = await db
      .insert(tcLearningTargets)
      .values({
        roleGroup: d.roleGroup,
        metric: d.metric,
        value: String(d.value),
        unit: d.unit,
        effectiveFrom: d.effectiveFrom,
        createdById: me.id,
      })
      .returning({ id: tcLearningTargets.id });

    auditAction({
      eventType: "CONFIG_CHANGE",
      employeeId: me.id,
      route: PATH,
      module: "Training",
      resourceType: "learning_target",
      resourceId: row!.id,
      action: "set",
      status: "SUCCESS",
      changes: { roleGroup: d.roleGroup, metric: d.metric, value: d.value, from: d.effectiveFrom },
    });

    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Retire a target now (sets effective_to = today). History is preserved. */
export async function retireLearningTarget(id: string): Promise<Result> {
  const me = await requireConfigAdmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid target." };
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.update(tcLearningTargets).set({ effectiveTo: today, updatedAt: new Date() }).where(eq(tcLearningTargets.id, id));
    auditAction({
      eventType: "UPDATE",
      employeeId: me.id,
      route: PATH,
      module: "Training",
      resourceType: "learning_target",
      resourceId: id,
      action: "retire",
      status: "SUCCESS",
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Writable master data (training types / audience / slots / sources) ───────

const LookupSchema = z.object({
  kind: z.enum(LOOKUP_KINDS),
  value: z.string().trim().min(1, "Add a value.").max(60).regex(/^[a-z0-9_]+$/, "Use lower-case letters, digits and underscores only."),
  label: z.string().trim().min(1, "Add a label.").max(120),
});

/** Add (or re-activate) a master-data option. */
export async function upsertLookup(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireConfigAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = LookupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    const [row] = await db
      .insert(tcLookups)
      .values({ kind: d.kind, value: d.value, label: d.label })
      .onConflictDoUpdate({
        target: [tcLookups.kind, tcLookups.value],
        set: { label: d.label, isActive: true, updatedAt: new Date() },
      })
      .returning({ id: tcLookups.id });

    auditAction({
      eventType: "CONFIG_CHANGE",
      employeeId: me.id,
      route: PATH,
      module: "Training",
      resourceType: "lookup",
      resourceId: row!.id,
      resourceName: `${d.kind}:${d.value}`,
      action: "upsert",
      status: "SUCCESS",
    });

    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Rename an option's label. */
export async function renameLookup(id: string, label: string): Promise<Result> {
  const me = await requireConfigAdmin();
  const parsed = z.object({ id: z.string().uuid(), label: z.string().trim().min(1, "Add a label.").max(120) }).safeParse({ id, label });
  if (!parsed.success) return fail(parsed);
  try {
    await db.update(tcLookups).set({ label: parsed.data.label, updatedAt: new Date() }).where(eq(tcLookups.id, parsed.data.id));
    auditAction({ eventType: "CONFIG_CHANGE", employeeId: me.id, route: PATH, module: "Training", resourceType: "lookup", resourceId: parsed.data.id, action: "rename", status: "SUCCESS" });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Retire (or restore) an option — soft, so historical rows stay joinable. */
export async function setLookupActive(id: string, isActive: boolean): Promise<Result> {
  const me = await requireConfigAdmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid option." };
  try {
    await db.update(tcLookups).set({ isActive, updatedAt: new Date() }).where(eq(tcLookups.id, id));
    auditAction({ eventType: "CONFIG_CHANGE", employeeId: me.id, route: PATH, module: "Training", resourceType: "lookup", resourceId: id, action: isActive ? "restore" : "retire", status: "SUCCESS" });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Nudge an option's sort order by ±10. */
export async function moveLookup(id: string, direction: "up" | "down"): Promise<Result> {
  const me = await requireConfigAdmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid option." };
  try {
    await db
      .update(tcLookups)
      .set({ sortOrder: sql`${tcLookups.sortOrder} ${direction === "up" ? sql`- 10` : sql`+ 10`}`, updatedAt: new Date() })
      .where(eq(tcLookups.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Keep the type import referenced for callers. */
export type { LookupKind };
