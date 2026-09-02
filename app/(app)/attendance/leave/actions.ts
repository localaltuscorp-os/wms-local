"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaveRequests, employeeEvents } from "@/db/schema";
import type { NotificationKind } from "@/db/schema";
import { LEAVE_KIND_LABELS } from "@/db/enums";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/dispatch";
import { daysInDateRange } from "@/lib/attendance/leave-cycle";
import { getLeaveBalance } from "@/lib/queries/leave";
import { localDateString } from "@/lib/format";
import {
  RequestLeave,
  DecideLeave,
  AdminMarkLeave,
  CancelLeave,
} from "@/lib/validators/leave";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/attendance/leave";

/** Today (YYYY-MM-DD) in IST — the org timezone the leave cycle is reckoned in. */
function todayISO(): string {
  return localDateString("Asia/Kolkata");
}

/**
 * File a leave request for yourself.
 *
 * v1 NOTE: `days` is the inclusive calendar-day count of the range. Weekly-offs
 * and holidays that fall inside the range are NOT auto-excluded for v1 — an
 * admin can adjust the effective day count later. Paid requests are validated
 * against the current cycle's remaining balance up front.
 */
export async function requestLeave(input: {
  kind: "paid" | "unpaid";
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RequestLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const days = daysInDateRange(parsed.data.startDate, parsed.data.endDate);

  if (parsed.data.kind === "paid") {
    const bal = await getLeaveBalance(me.id, todayISO());
    if (bal.remaining < days) {
      return {
        ok: false,
        error: `Exceeds your ${bal.allowance} paid leaves for this cycle (${bal.remaining} left).`,
      };
    }
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(leaveRequests)
      .values({
        employeeId: me.id,
        kind: parsed.data.kind,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        days: String(days),
        reason: parsed.data.reason ? parsed.data.reason : null,
      })
      .returning({ id: leaveRequests.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath(PATH);
  return { ok: true, id: inserted.id };
}

/**
 * Admin verdict on a pending leave request. On approving a PAID leave we
 * re-validate the balance (guards against two pending requests being approved
 * past the allowance) — if it would exceed, the approval is refused.
 */
export async function decideLeave(input: {
  id: string;
  verdict: "approved" | "rejected";
  note?: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecideLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Leave request not found" };

  // Concurrency guard: re-check paid balance at approval time.
  if (parsed.data.verdict === "approved" && existing.kind === "paid") {
    const bal = await getLeaveBalance(existing.employeeId, todayISO());
    const reqDays = Number(existing.days);
    if (bal.remaining < reqDays) {
      return {
        ok: false,
        error: `Approving would exceed the employee's paid balance (${bal.remaining} left, request is ${reqDays}).`,
      };
    }
  }

  try {
    await db
      .update(leaveRequests)
      .set({
        status: parsed.data.verdict,
        decidedById: me.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.note ? parsed.data.note : null,
      })
      .where(eq(leaveRequests.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await db.insert(employeeEvents).values({
    employeeId: existing.employeeId,
    actorId: me.id,
    eventType: `leave_${parsed.data.verdict}`,
    fromValue: { status: existing.status },
    toValue: {
      status: parsed.data.verdict,
      kind: existing.kind,
      startDate: existing.startDate,
      endDate: existing.endDate,
    },
    note: parsed.data.note ?? null,
  });

  // Inbox-only notification to the employee. `attendance_device` routes to the
  // inbox-only arm (no email template), keeping leave decisions noise-free.
  await notify({
    userId: existing.employeeId,
    kind: "attendance_device" as NotificationKind,
    title:
      parsed.data.verdict === "approved"
        ? `${LEAVE_KIND_LABELS[existing.kind]} approved`
        : `${LEAVE_KIND_LABELS[existing.kind]} rejected`,
    body: `${existing.startDate} → ${existing.endDate} (${Number(existing.days)} day${Number(existing.days) === 1 ? "" : "s"})${parsed.data.note ? ` · ${parsed.data.note}` : ""}`,
    actorId: me.id,
  });

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Admin records an already-approved leave directly for an employee. Paid
 * leaves still validate against the employee's remaining balance.
 */
export async function adminMarkLeave(input: {
  employeeId: string;
  kind: "paid" | "unpaid";
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminMarkLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const days = daysInDateRange(parsed.data.startDate, parsed.data.endDate);

  if (parsed.data.kind === "paid") {
    const bal = await getLeaveBalance(parsed.data.employeeId, todayISO());
    if (bal.remaining < days) {
      return {
        ok: false,
        error: `Exceeds the employee's ${bal.allowance} paid leaves for this cycle (${bal.remaining} left).`,
      };
    }
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(leaveRequests)
      .values({
        employeeId: parsed.data.employeeId,
        kind: parsed.data.kind,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        days: String(days),
        reason: parsed.data.reason ? parsed.data.reason : null,
        status: "approved",
        decidedById: me.id,
        decidedAt: new Date(),
      })
      .returning({ id: leaveRequests.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await db.insert(employeeEvents).values({
    employeeId: parsed.data.employeeId,
    actorId: me.id,
    eventType: "leave_admin_marked",
    toValue: {
      kind: parsed.data.kind,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      days,
    },
  });

  revalidatePath(PATH);
  return { ok: true, id: inserted.id };
}

/**
 * Cancel a leave request. An employee may cancel their OWN PENDING request;
 * an admin may cancel any request in any state.
 */
export async function cancelLeave(input: {
  id: string;
}): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CancelLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Leave request not found" };

  if (!me.isAdmin) {
    if (existing.employeeId !== me.id) {
      return { ok: false, error: "You can only cancel your own requests." };
    }
    if (existing.status !== "pending") {
      return { ok: false, error: "Only pending requests can be cancelled." };
    }
  }

  try {
    await db
      .update(leaveRequests)
      .set({ status: "cancelled", decidedById: me.id, decidedAt: new Date() })
      .where(eq(leaveRequests.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await db.insert(employeeEvents).values({
    employeeId: existing.employeeId,
    actorId: me.id,
    eventType: "leave_cancelled",
    fromValue: { status: existing.status },
  });

  revalidatePath(PATH);
  return { ok: true };
}
