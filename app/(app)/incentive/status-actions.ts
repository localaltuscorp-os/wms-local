"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveEntries, incentiveParticipants, incentiveProjects } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { incentiveStatusUiEnabled, INCENTIVE_STATUS_UI_FLAG } from "@/lib/incentive/status-flag";
import {
  listIncentiveParticipants,
  type ParticipantRow,
} from "@/lib/queries/incentive-status";
import { afterResponse } from "@/lib/after";
import { notifyIncentivePaid } from "@/lib/incentive/notifications/service";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * "Incentive paid" notice. When a save RAISES what has been paid to an
 * employee, tell them, after the response — the save has already committed and
 * the notice can neither block nor fail it. Lowering a paid amount, or saving
 * the same one again, says nothing; the version key (paid total + date) keeps a
 * repeated save from notifying twice. No amounts or statuses are changed here.
 */
function notifyIfPaidIncreased(input: {
  employeeId: string | null;
  subjectId: string;
  leg: string;
  label: string | null;
  previousPaid: number;
  paid: number;
  paidDate: string | null;
  periodMonth: string | null;
  actorId: string;
}) {
  const increase = Math.round((input.paid - input.previousPaid) * 100) / 100;
  const employeeId = input.employeeId;
  if (!employeeId || increase <= 0) return;
  afterResponse(() =>
    notifyIncentivePaid({
      employeeId,
      subjectId: input.subjectId,
      versionKey: `${input.leg}-paid:${input.paid.toFixed(2)}:${input.paidDate ?? ""}`,
      label: input.label,
      amount: increase,
      paidDate: input.paidDate,
      periodMonth: input.periodMonth,
      actorId: input.actorId,
    }),
  );
}

const money = z.number().finite().min(0).max(1_000_000_000);
const money2 = (n: number): string => n.toFixed(2);
const dateStr = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .nullable()
  .optional();

/** Guard: every mutation in this file is INERT until the kill-switch is on. */
function flagGuard(): { ok: false; error: string } | null {
  if (!incentiveStatusUiEnabled()) {
    return {
      ok: false,
      error: `The incentive status tools are turned off (${INCENTIVE_STATUS_UI_FLAG}).`,
    };
  }
  return null;
}

// --- set the three status amounts on a permanent entry ---------------------

const SetEntryStatusSchema = z
  .object({
    id: z.string().uuid(),
    bookedAmt: money.default(0),
    accruedAmt: money.default(0),
    paidAmt: money.default(0),
    paidDate: dateStr,
    /** When true, also flip the derived boolean flags (paid = paidAmt > 0). */
    syncFlags: z.boolean().default(true),
  })
  .strict();

/**
 * Set Booked / Accrued / Paid on one incentive_entries row. Booked = client
 * partial payment, Accrued = client paid in full, Paid = we paid the employee.
 * Admin-only; inert unless INCENTIVE_STATUS_UI is on.
 */
export async function setEntryStatusAmounts(
  input: z.input<typeof SetEntryStatusSchema>,
): Promise<ActionResult> {
  const blocked = flagGuard();
  if (blocked) return blocked;
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetEntryStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const [prev] = await db
    .select({
      employeeId: incentiveEntries.employeeId,
      incentiveName: incentiveEntries.incentiveName,
      paidAmt: incentiveEntries.paidAmt,
      periodMonth: incentiveEntries.periodMonth,
    })
    .from(incentiveEntries)
    .where(eq(incentiveEntries.id, v.id));

  await db
    .update(incentiveEntries)
    .set({
      bookedAmt: money2(v.bookedAmt),
      accruedAmt: money2(v.accruedAmt),
      paidAmt: money2(v.paidAmt),
      paidDate: v.paidDate ?? null,
      ...(v.syncFlags ? { paid: v.paidAmt > 0 } : {}),
      updatedAt: new Date(),
    })
    .where(eq(incentiveEntries.id, v.id));

  if (prev) {
    notifyIfPaidIncreased({
      employeeId: prev.employeeId,
      subjectId: v.id,
      leg: "entry",
      label: prev.incentiveName,
      previousPaid: Number(prev.paidAmt),
      paid: v.paidAmt,
      paidDate: v.paidDate ?? null,
      periodMonth: prev.periodMonth,
      actorId: me.id,
    });
  }

  revalidatePath("/incentive");
  return { ok: true };
}

// --- set the three status amounts on a project leg -------------------------

const SetProjectLegStatusSchema = z
  .object({
    id: z.string().uuid(),
    leg: z.enum(["supervisor", "intern"]),
    bookedAmt: money.default(0),
    accruedAmt: money.default(0),
    paidAmt: money.default(0),
    paidDate: dateStr,
    syncFlags: z.boolean().default(true),
  })
  .strict();

/**
 * Set Booked / Accrued / Paid on ONE leg (supervisor XOR intern) of a
 * project-based incentive. Admin-only; inert unless the flag is on.
 */
export async function setProjectLegStatusAmounts(
  input: z.input<typeof SetProjectLegStatusSchema>,
): Promise<ActionResult> {
  const blocked = flagGuard();
  if (blocked) return blocked;
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetProjectLegStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const set =
    v.leg === "supervisor"
      ? {
          empBookedAmt: money2(v.bookedAmt),
          empAccruedAmt: money2(v.accruedAmt),
          empPaidAmt: money2(v.paidAmt),
        }
      : {
          internBookedAmt: money2(v.bookedAmt),
          internAccruedAmt: money2(v.accruedAmt),
          internPaidAmt: money2(v.paidAmt),
        };

  const [prev] = await db
    .select({
      supervisorId: incentiveProjects.supervisorId,
      internId: incentiveProjects.internId,
      projectName: incentiveProjects.projectName,
      subject: incentiveProjects.subject,
      empPaidAmt: incentiveProjects.empPaidAmt,
      internPaidAmt: incentiveProjects.internPaidAmt,
      periodMonth: incentiveProjects.periodMonth,
    })
    .from(incentiveProjects)
    .where(eq(incentiveProjects.id, v.id));

  await db
    .update(incentiveProjects)
    .set({
      ...set,
      paidDate: v.paidDate ?? null,
      ...(v.syncFlags ? { paid: v.paidAmt > 0 } : {}),
      updatedAt: new Date(),
    })
    .where(eq(incentiveProjects.id, v.id));

  if (prev) {
    notifyIfPaidIncreased({
      employeeId: v.leg === "supervisor" ? prev.supervisorId : prev.internId,
      subjectId: v.id,
      leg: `project-${v.leg}`,
      label: prev.projectName ?? prev.subject ?? "Project incentive",
      previousPaid: Number(v.leg === "supervisor" ? prev.empPaidAmt : prev.internPaidAmt),
      paid: v.paidAmt,
      paidDate: v.paidDate ?? null,
      periodMonth: prev.periodMonth,
      actorId: me.id,
    });
  }

  revalidatePath("/incentive");
  return { ok: true };
}

// --- team split: replace participants for one entry/project ----------------

const ShareSchema = z.object({
  empName: z.string().trim().min(1, "Name is required").max(160),
  employeeId: z.string().uuid().nullable().optional(),
  bookedAmt: money.default(0),
  accruedAmt: money.default(0),
  paidAmt: money.default(0),
  paidDate: dateStr,
  note: z.string().trim().max(2000).nullable().optional(),
});

const SaveSplitSchema = z
  .object({
    parentKind: z.enum(["entry", "project"]),
    parentId: z.string().uuid(),
    /** The parent's period month (YYYY-MM-DD, first-of-month) copied onto each
     *  participant so the PAID producer's month-range query picks them up. */
    periodMonth: dateStr,
    shares: z.array(ShareSchema).max(40),
  })
  .strict();

/**
 * Divide one incentive among N participants. This REPLACES the whole
 * participant set for the parent (delete-all + re-insert) so the split always
 * reflects exactly what the editor shows. When any participants exist, the
 * canonical PAID producer (getIncentivePaidByPerson) folds them in place of the
 * parent's own leg amounts — no double count — so we do not need to touch the
 * parent row. Admin-only; inert unless the flag is on.
 */
export async function saveIncentiveSplit(
  input: z.input<typeof SaveSplitSchema>,
): Promise<ActionResult<{ count: number }>> {
  const blocked = flagGuard();
  if (blocked) return blocked;
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSplitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const period = v.periodMonth ? `${v.periodMonth.slice(0, 7)}-01` : null;

  // Verify the parent exists (and read its period as a fallback).
  let parentLabel: string | null = null;
  if (v.parentKind === "entry") {
    const [row] = await db
      .select({ id: incentiveEntries.id, period: incentiveEntries.periodMonth, name: incentiveEntries.incentiveName })
      .from(incentiveEntries)
      .where(eq(incentiveEntries.id, v.parentId));
    if (!row) return { ok: false, error: "Incentive entry not found." };
    parentLabel = row.name;
  } else {
    const [row] = await db
      .select({
        id: incentiveProjects.id,
        period: incentiveProjects.periodMonth,
        projectName: incentiveProjects.projectName,
        subject: incentiveProjects.subject,
      })
      .from(incentiveProjects)
      .where(eq(incentiveProjects.id, v.parentId));
    if (!row) return { ok: false, error: "Incentive project not found." };
    parentLabel = row.projectName ?? row.subject ?? "Project incentive";
  }

  // What each linked employee had been paid under the split before this save —
  // read only to tell them if it goes up.
  const previousShares = await db
    .select({ employeeId: incentiveParticipants.employeeId, paidAmt: incentiveParticipants.paidAmt })
    .from(incentiveParticipants)
    .where(
      v.parentKind === "entry"
        ? eq(incentiveParticipants.entryId, v.parentId)
        : eq(incentiveParticipants.projectId, v.parentId),
    );

  const rows = v.shares
    .filter((s) => s.empName.trim().length > 0)
    .map((s) => ({
      entryId: v.parentKind === "entry" ? v.parentId : null,
      projectId: v.parentKind === "project" ? v.parentId : null,
      periodMonth: period,
      empName: s.empName.trim(),
      employeeId: s.employeeId ?? null,
      bookedAmt: money2(s.bookedAmt),
      accruedAmt: money2(s.accruedAmt),
      paidAmt: money2(s.paidAmt),
      paidDate: s.paidDate ?? null,
      note: s.note ?? null,
    }));

  await db.transaction(async (tx) => {
    await tx
      .delete(incentiveParticipants)
      .where(
        v.parentKind === "entry"
          ? eq(incentiveParticipants.entryId, v.parentId)
          : eq(incentiveParticipants.projectId, v.parentId),
      );
    if (rows.length) await tx.insert(incentiveParticipants).values(rows);
  });

  const paidBefore = new Map<string, number>();
  for (const s of previousShares) {
    if (s.employeeId) paidBefore.set(s.employeeId, (paidBefore.get(s.employeeId) ?? 0) + Number(s.paidAmt));
  }
  const paidAfter = new Map<string, { paid: number; paidDate: string | null }>();
  for (const r of rows) {
    if (!r.employeeId) continue;
    const cur = paidAfter.get(r.employeeId) ?? { paid: 0, paidDate: null };
    paidAfter.set(r.employeeId, {
      paid: cur.paid + Number(r.paidAmt),
      paidDate: r.paidDate && (!cur.paidDate || r.paidDate > cur.paidDate) ? r.paidDate : cur.paidDate,
    });
  }
  for (const [employeeId, after] of paidAfter) {
    notifyIfPaidIncreased({
      employeeId,
      subjectId: v.parentId,
      leg: `split-${v.parentKind}`,
      label: parentLabel,
      previousPaid: paidBefore.get(employeeId) ?? 0,
      paid: after.paid,
      paidDate: after.paidDate,
      periodMonth: period,
      actorId: me.id,
    });
  }

  revalidatePath("/incentive");
  return { ok: true, count: rows.length };
}

/** Read the current participant split for an entry/project (admin-only read). */
export async function getIncentiveSplit(
  parentKind: "entry" | "project",
  parentId: string,
): Promise<ActionResult<{ rows: ParticipantRow[] }>> {
  await requireAdmin();
  const id = z.string().uuid().safeParse(parentId);
  const kind = z.enum(["entry", "project"]).safeParse(parentKind);
  if (!id.success || !kind.success) return { ok: false, error: "Invalid input" };
  const rows = await listIncentiveParticipants(kind.data, id.data);
  return { ok: true, rows };
}
