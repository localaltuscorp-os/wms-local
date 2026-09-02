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

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

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

  await db
    .update(incentiveProjects)
    .set({
      ...set,
      paidDate: v.paidDate ?? null,
      ...(v.syncFlags ? { paid: v.paidAmt > 0 } : {}),
      updatedAt: new Date(),
    })
    .where(eq(incentiveProjects.id, v.id));

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
  if (v.parentKind === "entry") {
    const [row] = await db
      .select({ id: incentiveEntries.id, period: incentiveEntries.periodMonth })
      .from(incentiveEntries)
      .where(eq(incentiveEntries.id, v.parentId));
    if (!row) return { ok: false, error: "Incentive entry not found." };
  } else {
    const [row] = await db
      .select({ id: incentiveProjects.id, period: incentiveProjects.periodMonth })
      .from(incentiveProjects)
      .where(eq(incentiveProjects.id, v.parentId));
    if (!row) return { ok: false, error: "Incentive project not found." };
  }

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
