"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  employees,
  kpiAssignments,
  kpiAssignmentHistory,
  type KpiAssignment,
} from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadLetterRoster } from "@/lib/hr/letters/roster";
import {
  KPI_FREQUENCIES,
  KPI_ASSIGNMENT_STATUSES,
  type KpiChangeType,
} from "@/db/enums";
import { dispatchKpiNotification } from "@/lib/hr/kpi/notify";
import { isQuarterLabel, currentQuarter } from "@/lib/hr/kpi/quarter";
import { kpiTargetForName } from "@/lib/performance/kpi-dictionary";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */

export interface KpiRosterOption {
  id: string;
  name: string;
  designation: string;
  department: string;
}

/** Active employees for the KPI Management employee picker. Read-only. */
export async function loadKpiRoster(): Promise<KpiRosterOption[]> {
  await requireHrStaff();
  const rows = await loadLetterRoster().catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    designation: r.designation,
    department: r.department,
  }));
}

/* ------------------------------------------------------------------ */
/* Read — assignments + history                                        */
/* ------------------------------------------------------------------ */

export interface KpiAssignmentDTO {
  id: string;
  employeeId: string;
  kpiKey: string | null;
  kpiName: string;
  category: string;
  frequency: string;
  weightage: number;
  effectiveQuarter: string;
  targetValue: string;
  currentValue: string | null;
  applicable: boolean;
  status: string;
  updatedAt: string;
  /** "assigned" = a real saved KPI; "dictionary" = inherited from the appraisal
   *  KPI dictionary (not yet saved here) — shown read-only until adopted. */
  source: "assigned" | "dictionary";
}

function toDTO(r: KpiAssignment): KpiAssignmentDTO {
  return {
    id: r.id,
    employeeId: r.employeeId,
    kpiKey: r.kpiKey,
    kpiName: r.kpiName,
    category: r.category,
    frequency: r.frequency,
    weightage: r.weightage,
    effectiveQuarter: r.effectiveQuarter,
    targetValue: r.targetValue,
    currentValue: r.currentValue,
    applicable: r.applicable,
    status: r.status,
    updatedAt: r.updatedAt.toISOString(),
    source: "assigned",
  };
}

/** A person's non-archived KPI assignments for a quarter (all quarters when
 *  `quarter` is null/empty). Newest-updated first. */
export async function loadKpiAssignments(
  employeeId: string,
  quarter?: string | null,
): Promise<KpiAssignmentDTO[]> {
  await requireHrStaff();
  if (!z.string().uuid().safeParse(employeeId).success) return [];
  const conds = [
    eq(kpiAssignments.employeeId, employeeId),
    eq(kpiAssignments.archived, false),
  ];
  if (quarter && isQuarterLabel(quarter)) {
    conds.push(eq(kpiAssignments.effectiveQuarter, quarter));
  }
  const rows = await db
    .select()
    .from(kpiAssignments)
    .where(and(...conds))
    .orderBy(desc(kpiAssignments.updatedAt));
  const assigned = rows.map(toDTO);

  // Surface the person's EXISTING appraisal-dictionary KPIs as inherited rows so
  // HR sees what's already set (even before adopting them here). Any dictionary
  // line already represented by a saved KPI (by key or name) is skipped, so
  // partial adoption keeps the rest visible. Adopting one saves it into
  // kpi_assignments, which then drives appraisal scoring.
  const [emp] = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  const target = kpiTargetForName(emp?.name);
  if (target) {
    const coveredKeys = new Set(assigned.map((a) => a.kpiKey).filter(Boolean) as string[]);
    const coveredNames = new Set(assigned.map((a) => a.kpiName.trim().toLowerCase()));
    const q = quarter && isQuarterLabel(quarter) ? quarter : currentQuarter();
    const now = new Date().toISOString();
    for (const line of target.lines) {
      if (coveredKeys.has(line.id) || coveredNames.has(line.label.trim().toLowerCase())) continue;
      assigned.push({
        id: `dict:${line.id}`,
        employeeId,
        kpiKey: line.id,
        kpiName: line.label,
        category: line.unit ?? "",
        frequency: line.period === "week" ? "weekly" : "monthly",
        weightage: Math.round(line.intraWeight),
        effectiveQuarter: q,
        targetValue: String(line.target),
        currentValue: null,
        applicable: true,
        status: "active",
        updatedAt: now,
        source: "dictionary",
      });
    }
  }
  return assigned;
}

export interface KpiHistoryDTO {
  id: string;
  changeType: string;
  previous: unknown;
  updated: unknown;
  changedByName: string | null;
  changedOn: string;
  reason: string | null;
}

/** The append-only history for one assignment, newest first. */
export async function loadKpiHistory(assignmentId: string): Promise<KpiHistoryDTO[]> {
  await requireHrStaff();
  if (!z.string().uuid().safeParse(assignmentId).success) return [];
  const rows = await db
    .select({
      id: kpiAssignmentHistory.id,
      changeType: kpiAssignmentHistory.changeType,
      previous: kpiAssignmentHistory.previous,
      updated: kpiAssignmentHistory.updated,
      changedByName: employees.name,
      changedOn: kpiAssignmentHistory.changedOn,
      reason: kpiAssignmentHistory.reason,
    })
    .from(kpiAssignmentHistory)
    .leftJoin(employees, eq(employees.id, kpiAssignmentHistory.changedById))
    .where(eq(kpiAssignmentHistory.assignmentId, assignmentId))
    .orderBy(desc(kpiAssignmentHistory.changedOn));
  return rows.map((r) => ({
    id: r.id,
    changeType: r.changeType,
    previous: r.previous,
    updated: r.updated,
    changedByName: r.changedByName ?? null,
    changedOn: r.changedOn.toISOString(),
    reason: r.reason,
  }));
}

/* ------------------------------------------------------------------ */
/* Internal — snapshots, history + notify                              */
/* ------------------------------------------------------------------ */

/** Compact snapshot stored in the history jsonb columns. */
function snapshot(r: KpiAssignment) {
  return {
    kpiKey: r.kpiKey,
    kpiName: r.kpiName,
    category: r.category,
    frequency: r.frequency,
    weightage: r.weightage,
    effectiveQuarter: r.effectiveQuarter,
    targetValue: r.targetValue,
    currentValue: r.currentValue,
    applicable: r.applicable,
    status: r.status,
  };
}

/**
 * Record an append-only history row AND fan the change out across every
 * notification channel. The history write ALWAYS happens; the fan-out is
 * best-effort and per-channel gated (in-app on by default, push behind
 * PUSH_OFF, email behind KPI_NOTIFICATIONS_ON) — see lib/hr/kpi/notify.ts.
 * Never throws — a dispatch failure must never fail the mutation.
 */
async function recordAndNotify(args: {
  assignment: KpiAssignment;
  changeType: KpiChangeType;
  previous: object | null;
  updated: object | null;
  changedById: string;
  changedByName: string;
  reason?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
}): Promise<void> {
  await db.insert(kpiAssignmentHistory).values({
    assignmentId: args.assignment.id,
    changeType: args.changeType,
    previous: args.previous,
    updated: args.updated,
    changedById: args.changedById,
    reason: args.reason ?? null,
  });

  // Resolve recipient. The employees table has no personal-email column today,
  // so email is office-only (still gated) — see lib/hr/kpi/notify.ts.
  const [emp] = await db
    .select({ name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.id, args.assignment.employeeId))
    .limit(1);
  if (!emp) return;

  // Fan out across in-app + push + email. Best-effort + independently gated;
  // dispatchKpiNotification never throws.
  await dispatchKpiNotification({
    changeType: args.changeType,
    recipient: {
      employeeId: args.assignment.employeeId,
      name: emp.name,
      officeEmail: emp.email,
      personalEmail: null,
    },
    kpiName: args.assignment.kpiName,
    effectiveQuarter: args.assignment.effectiveQuarter,
    weightage: args.assignment.weightage,
    target: args.assignment.targetValue,
    previousValue: args.previousValue,
    newValue: args.newValue,
    changedByName: args.changedByName,
    changedById: args.changedById,
    reason: args.reason,
    changedAt: new Date(),
  }).catch(() => {
    /* best-effort — a dispatch failure must never fail the mutation */
  });
}

/* ------------------------------------------------------------------ */
/* Create / update                                                     */
/* ------------------------------------------------------------------ */

const SaveSchema = z.object({
  /** present → update in place; absent → create. */
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  kpiKey: z.string().max(120).nullable().optional(),
  kpiName: z.string().trim().min(1, "KPI name is required.").max(240),
  category: z.string().max(120).default(""),
  frequency: z.enum(KPI_FREQUENCIES),
  weightage: z.coerce.number().int().min(0).max(100),
  effectiveQuarter: z.string().refine(isQuarterLabel, "Quarter must look like 2026-Q2."),
  targetValue: z.string().max(200).default(""),
  currentValue: z.string().max(200).nullable().optional(),
  reason: z.string().max(600).nullable().optional(),
});

export type SaveKpiInput = z.input<typeof SaveSchema>;

/**
 * Create-or-update a KPI assignment. Create logs an `assigned` history row;
 * update diffs the changed fields and logs the most-specific change type
 * (`weightage_changed` / `target_changed` / `updated`). Historical rows are
 * NEVER overwritten — every change appends a new one.
 */
export async function saveKpiAssignment(
  input: SaveKpiInput,
): Promise<Result<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid KPI." };
  }
  const v = parsed.data;

  try {
    if (v.id) {
      const [before] = await db
        .select()
        .from(kpiAssignments)
        .where(and(eq(kpiAssignments.id, v.id), eq(kpiAssignments.employeeId, v.employeeId)))
        .limit(1);
      if (!before) return { ok: false, error: "That KPI assignment no longer exists." };

      const [after] = await db
        .update(kpiAssignments)
        .set({
          kpiKey: v.kpiKey ?? null,
          kpiName: v.kpiName,
          category: v.category,
          frequency: v.frequency,
          weightage: v.weightage,
          effectiveQuarter: v.effectiveQuarter,
          targetValue: v.targetValue,
          currentValue: v.currentValue ?? null,
          updatedById: me.id,
          updatedAt: new Date(),
        })
        .where(eq(kpiAssignments.id, v.id))
        .returning();
      if (!after) return { ok: false, error: "Could not update the KPI." };

      // Pick the most-specific change type + value pair for the notification.
      const weightageChanged = before.weightage !== after.weightage;
      const targetChanged = before.targetValue !== after.targetValue;
      let changeType: KpiChangeType = "updated";
      let previousValue: string | null | undefined;
      let newValue: string | null | undefined;
      if (targetChanged && !weightageChanged) {
        changeType = "target_changed";
        previousValue = before.targetValue;
        newValue = after.targetValue;
      } else if (weightageChanged && !targetChanged) {
        changeType = "weightage_changed";
        previousValue = String(before.weightage);
        newValue = String(after.weightage);
      }

      await recordAndNotify({
        assignment: after,
        changeType,
        previous: snapshot(before),
        updated: snapshot(after),
        changedById: me.id,
        changedByName: me.name,
        reason: v.reason,
        previousValue,
        newValue,
      });

      revalidatePath("/hr/kpi");
      return { ok: true, id: after.id };
    }

    // Create.
    const [row] = await db
      .insert(kpiAssignments)
      .values({
        employeeId: v.employeeId,
        kpiKey: v.kpiKey ?? null,
        kpiName: v.kpiName,
        category: v.category,
        frequency: v.frequency,
        weightage: v.weightage,
        effectiveQuarter: v.effectiveQuarter,
        targetValue: v.targetValue,
        currentValue: v.currentValue ?? null,
        applicable: true,
        status: "active",
        createdById: me.id,
        updatedById: me.id,
      })
      .returning();
    if (!row) return { ok: false, error: "Could not create the KPI." };

    await recordAndNotify({
      assignment: row,
      changeType: "assigned",
      previous: null,
      updated: snapshot(row),
      changedById: me.id,
      changedByName: me.name,
      reason: v.reason,
    });

    revalidatePath("/hr/kpi");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/* ------------------------------------------------------------------ */
/* Toggle applicable                                                   */
/* ------------------------------------------------------------------ */

const ApplicableSchema = z.object({
  id: z.string().uuid(),
  applicable: z.boolean(),
  reason: z.string().max(600).nullable().optional(),
});

/** Flip the "Applicable this quarter" toggle → append-only `updated` history. */
export async function setKpiApplicable(
  input: z.input<typeof ApplicableSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ApplicableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const v = parsed.data;

  try {
    const [before] = await db
      .select()
      .from(kpiAssignments)
      .where(eq(kpiAssignments.id, v.id))
      .limit(1);
    if (!before) return { ok: false, error: "That KPI assignment no longer exists." };
    if (before.applicable === v.applicable) return { ok: true, id: before.id };

    const [after] = await db
      .update(kpiAssignments)
      .set({ applicable: v.applicable, updatedById: me.id, updatedAt: new Date() })
      .where(eq(kpiAssignments.id, v.id))
      .returning();
    if (!after) return { ok: false, error: "Could not update the KPI." };

    await recordAndNotify({
      assignment: after,
      changeType: "updated",
      previous: snapshot(before),
      updated: snapshot(after),
      changedById: me.id,
      changedByName: me.name,
      reason: v.reason,
      previousValue: before.applicable ? "Applicable" : "Not applicable",
      newValue: after.applicable ? "Applicable" : "Not applicable",
    });

    revalidatePath("/hr/kpi");
    return { ok: true, id: after.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

/* ------------------------------------------------------------------ */
/* Activate / deactivate                                               */
/* ------------------------------------------------------------------ */

const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(KPI_ASSIGNMENT_STATUSES),
  reason: z.string().max(600).nullable().optional(),
});

/** Activate / deactivate → append-only `activated` / `deactivated` history. */
export async function setKpiStatus(
  input: z.input<typeof StatusSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const v = parsed.data;

  try {
    const [before] = await db
      .select()
      .from(kpiAssignments)
      .where(eq(kpiAssignments.id, v.id))
      .limit(1);
    if (!before) return { ok: false, error: "That KPI assignment no longer exists." };
    if (before.status === v.status) return { ok: true, id: before.id };

    const [after] = await db
      .update(kpiAssignments)
      .set({ status: v.status, updatedById: me.id, updatedAt: new Date() })
      .where(eq(kpiAssignments.id, v.id))
      .returning();
    if (!after) return { ok: false, error: "Could not update the KPI." };

    await recordAndNotify({
      assignment: after,
      changeType: v.status === "active" ? "activated" : "deactivated",
      previous: snapshot(before),
      updated: snapshot(after),
      changedById: me.id,
      changedByName: me.name,
      reason: v.reason,
      previousValue: before.status,
      newValue: after.status,
    });

    revalidatePath("/hr/kpi");
    return { ok: true, id: after.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

/* ------------------------------------------------------------------ */
/* Remove (archive)                                                    */
/* ------------------------------------------------------------------ */

const RemoveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(600).nullable().optional(),
});

/** Soft-remove (archive) a KPI assignment → append-only `removed` history. The
 *  row is retained (archived=true) so its history is never orphaned. */
export async function removeKpiAssignment(
  input: z.input<typeof RemoveSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const v = parsed.data;

  try {
    const [before] = await db
      .select()
      .from(kpiAssignments)
      .where(eq(kpiAssignments.id, v.id))
      .limit(1);
    if (!before) return { ok: false, error: "That KPI assignment no longer exists." };

    const [after] = await db
      .update(kpiAssignments)
      .set({ archived: true, status: "inactive", updatedById: me.id, updatedAt: new Date() })
      .where(eq(kpiAssignments.id, v.id))
      .returning();
    if (!after) return { ok: false, error: "Could not remove the KPI." };

    await recordAndNotify({
      assignment: after,
      changeType: "removed",
      previous: snapshot(before),
      updated: snapshot(after),
      changedById: me.id,
      changedByName: me.name,
      reason: v.reason,
    });

    revalidatePath("/hr/kpi");
    return { ok: true, id: after.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Remove failed." };
  }
}
