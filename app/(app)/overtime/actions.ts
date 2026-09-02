"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { overtimeEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  canApproveOvertime,
  overtimeScopeFor,
} from "@/lib/queries/overtime";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/overtime";
const DASH_PATH = "/overtime/dashboard";

function revalidate() {
  revalidatePath(PATH);
  revalidatePath(DASH_PATH);
}

// A real calendar date, not in the far future (allow today + small slop).
const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Pick a valid date.");

const LogSchema = z
  .object({
    // Optional — when an admin/manager logs on someone else's behalf.
    employeeId: z.string().uuid().optional(),
    workDate: DateSchema,
    hours: z.coerce
      .number()
      .gt(0, "Hours must be more than 0.")
      .max(24, "Hours cannot exceed 24."),
    reason: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

/**
 * Log an overtime entry. By default it's for the signed-in user; an
 * admin/manager may pass `employeeId` to log for someone in their scope.
 * Always lands as `pending`.
 */
export async function logOvertime(input: {
  employeeId?: string;
  workDate: string;
  hours: number;
  reason?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = LogSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Resolve the target employee + authorise.
  let targetId = me.id;
  if (parsed.data.employeeId && parsed.data.employeeId !== me.id) {
    const scope = await overtimeScopeFor(me);
    if (!canApproveOvertime(scope, parsed.data.employeeId)) {
      return { ok: false, error: "You cannot log overtime for this person." };
    }
    targetId = parsed.data.employeeId;
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(overtimeEntries)
      .values({
        employeeId: targetId,
        workDate: parsed.data.workDate,
        hours: parsed.data.hours.toFixed(2),
        reason: parsed.data.reason ? parsed.data.reason : null,
        createdById: me.id,
      })
      .returning({ id: overtimeEntries.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidate();
  return { ok: true, id: inserted.id };
}

const DecideSchema = z
  .object({
    id: z.string().uuid(),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

/** Shared approve/reject path — only an admin or the owner's manager may act. */
async function decide(
  input: { id: string; note?: string | null },
  verdict: "approved" | "rejected",
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.overtimeEntries.findFirst({
    where: eq(overtimeEntries.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Overtime entry not found." };

  const scope = await overtimeScopeFor(me);
  if (!canApproveOvertime(scope, existing.employeeId)) {
    return { ok: false, error: "You are not allowed to review this entry." };
  }

  try {
    await db
      .update(overtimeEntries)
      .set({
        status: verdict,
        approvedById: me.id,
        approvedAt: new Date(),
        note: parsed.data.note ? parsed.data.note : null,
        updatedAt: new Date(),
      })
      .where(eq(overtimeEntries.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidate();
  return { ok: true };
}

/** Approve a pending (or correct an already-decided) overtime entry. */
export async function approveOvertime(input: {
  id: string;
  note?: string | null;
}): Promise<ActionResult> {
  return decide(input, "approved");
}

/** Reject an overtime entry. */
export async function rejectOvertime(input: {
  id: string;
  note?: string | null;
}): Promise<ActionResult> {
  return decide(input, "rejected");
}

/**
 * Delete an overtime entry. The owner may delete their OWN entry while it's
 * still pending; an admin/manager in scope may delete any of their people's.
 */
export async function deleteOvertime(input: {
  id: string;
}): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.overtimeEntries.findFirst({
    where: eq(overtimeEntries.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Overtime entry not found." };

  const scope = await overtimeScopeFor(me);
  const isOwnerPending =
    existing.employeeId === me.id && existing.status === "pending";
  const isApprover = canApproveOvertime(scope, existing.employeeId);
  if (!isOwnerPending && !isApprover) {
    return { ok: false, error: "You cannot delete this entry." };
  }

  try {
    await db.delete(overtimeEntries).where(eq(overtimeEntries.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidate();
  return { ok: true };
}
