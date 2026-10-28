"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaveRequests, employeeEvents, employees, attendanceLogs, salaryRuns } from "@/db/schema";
import { monthsSpanned } from "@/lib/salary/period";
import type { NotificationKind } from "@/db/schema";
import { LEAVE_KIND_LABELS } from "@/db/enums";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/dispatch";
import { leaveDays } from "@/lib/attendance/leave-cycle";
import { isSelectableLeaveCategory } from "@/lib/attendance/leave-categories";
import { asWorkerType } from "@/lib/attendance/worker-type";
import {
  leaveKindAllowedFor,
  paidLeaveRefusalFor,
} from "@/lib/attendance/leave-eligibility";
import {
  getLeaveBalance,
  leaveReviewScopeFor,
  scopeCovers,
} from "@/lib/queries/leave";
import { localDateString } from "@/lib/format";
import { refreshPayForRange } from "@/lib/salary/refresh-run";
import {
  RequestLeave,
  EditLeave,
  DecideLeave,
  AdminMarkLeave,
  CancelLeave,
} from "@/lib/validators/leave";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/attendance/leave";
const REVIEW_PATH = "/attendance/leave/requests";

/**
 * Every surface an approved leave changes. Attendance is DERIVED from approved
 * leave rows (see lib/queries/attendance-status.ts) rather than materialised, so
 * a decision has to invalidate the attendance pages too — otherwise the day
 * would still read Absent on a cached board until something else revalidated it.
 */
function revalidateLeaveSurfaces(): void {
  revalidatePath(PATH);
  revalidatePath(REVIEW_PATH);
  revalidatePath("/attendance");
  revalidatePath("/attendance/dashboard");
  revalidatePath("/admin/employees");
  // Pay too, and for the same reason: an UNPAID leave is charged by the payroll
  // engine (lib/salary/compute.computeScheduleHourlySalary), so the moment one
  // is approved, withdrawn or marked, My Salary and the Accounts salary module
  // are showing a figure that has just changed.
  revalidatePath("/my-salary");
  revalidatePath("/salary");
}

/**
 * Recompute the employee's pay for EVERY MONTH THE LEAVE TOUCHES.
 *
 * Approving an UNPAID leave is a deduction (spec §3B: "as soon as the unpaid
 * leave is approved"), and revalidating a path only clears a cache — it does not
 * rewrite the stored `salary_runs` row that the payslip and Accounts read. This
 * does, through the same `assembleMonthInputs` + `computeForRow` that Generate
 * Salary uses. Awaited so the redirect that follows a decision lands on fresh
 * figures, and fully fail-soft inside: the decision is already committed.
 *
 * ── THE MONTH IS THE LEAVE'S, NOT TODAY'S (spec §11) ──────────────────────
 * This used to reprice whatever month it happened to be when the button was
 * pressed. A leave approved on 2 October for three days in August then left
 * August untouched — the very month whose pay had just changed — and the
 * deduction landed nowhere. Since closed months are recalculable
 * (lib/salary/refresh-run.ts), the fix is simply to name the right months: the
 * span, so a leave crossing a month boundary reprices both ends.
 */
async function repriceLeaveMonths(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  await refreshPayForRange(employeeId, startDate, endDate);
}

/** Today (YYYY-MM-DD) in IST — the org timezone the leave cycle is reckoned in. */
function todayISO(): string {
  return localDateString("Asia/Kolkata");
}

/** The employee's archetype, for the eligibility gate. */
async function workerTypeOf(employeeId: string) {
  const row = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { workerType: true },
  });
  return asWorkerType(row?.workerType);
}

/**
 * The 0208 form fields, mapped from validated input to columns.
 *
 * ONE function for both the self-request and the admin mark-leave path, because
 * the two used to differ only by accident and every field added to one had to be
 * remembered in the other.
 */
type LeaveExtrasInput = {
  categoryId?: string | null;
  startHalfDay?: boolean;
  endHalfDay?: boolean;
  availPersonalPhone?: boolean | null;
  availOfficePhone?: "yes" | "no" | "na" | null;
  availComputer?: boolean | null;
};

function extraColumns(input: LeaveExtrasInput) {
  return {
    categoryId: input.categoryId ?? null,
    startHalfDay: input.startHalfDay ?? false,
    endHalfDay: input.endHalfDay ?? false,
    availPersonalPhone: input.availPersonalPhone ?? null,
    availOfficePhone: input.availOfficePhone ?? null,
    availComputer: input.availComputer ?? null,
  };
}

/**
 * A category id off a form is untrusted: a RETIRED category is absent from the
 * picker but its id is still perfectly postable, and nothing in the schema stops
 * a request pointing at one. Checked for both paths.
 */
async function categoryRefusal(categoryId: string | null | undefined): Promise<string | null> {
  if (!categoryId) return null;
  return (await isSelectableLeaveCategory(categoryId))
    ? null
    : "That leave category is no longer available — pick another.";
}

/**
 * File a leave request for yourself.
 *
 * TWO gates, in this order:
 *   1. ELIGIBILITY — a college-shift / part-time / contract employee may only
 *      ask for unpaid leave. The picker already hides paid leave for them, so
 *      reaching this branch means the request was forged; refuse it rather than
 *      quietly downgrading the kind, which would approve a leave nobody asked
 *      for.
 *   2. BALANCE — a paid request is validated against the current half-year's
 *      remaining allowance up front (and again at approval time, below).
 *
 * v1 NOTE: `days` is the inclusive calendar-day count of the range. Weekly-offs
 * and holidays inside the range are NOT auto-excluded here — but note that the
 * GRADER does skip them: a holiday falling inside an approved leave keeps its
 * holiday credit and never burns a paid day (see attendance-status.ts).
 */
export async function requestLeave(
  input: {
    kind: "paid" | "unpaid";
    startDate: string;
    endDate: string;
    reason?: string;
  } & LeaveExtrasInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RequestLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const workerType = asWorkerType(me.workerType);
  if (!leaveKindAllowedFor(workerType, parsed.data.kind)) {
    return { ok: false, error: paidLeaveRefusalFor(workerType) };
  }

  const refusal = await categoryRefusal(parsed.data.categoryId);
  if (refusal) return { ok: false, error: refusal };

  // Halves included — a leave that starts after lunch costs 0.5, not 1.
  const days = leaveDays(parsed.data);

  if (parsed.data.kind === "paid") {
    const bal = await getLeaveBalance(me.id, todayISO());
    if (bal.remaining < days) {
      return {
        ok: false,
        error: `Exceeds your ${bal.allowance} paid leaves for ${bal.cycleLabel} (${bal.remaining} left).`,
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
        ...extraColumns(parsed.data),
      })
      .returning({ id: leaveRequests.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidateLeaveSurfaces();
  return { ok: true, id: inserted.id };
}

/**
 * Verdict on a pending leave request.
 *
 * WHO may decide: an admin (anyone) or a MANAGER, for someone in their downline
 * — the same scope the Leave Requests queue lists, so nobody can act on a row
 * the queue would never have shown them. Approving your own request is not
 * possible: the scope excludes the reviewer.
 *
 * On approving a PAID leave we re-validate the balance — two requests both
 * fitting the allowance individually must not both be approved past it.
 *
 * Approval needs NO follow-up attendance edit. The grader reads approved leave
 * rows directly, so the covered days become PL (full credit, no deduction) or
 * LWP (zero value → the existing payroll maths deducts) the moment this commits.
 */
export async function decideLeave(input: {
  id: string;
  verdict: "approved" | "rejected";
  note?: string;
}): Promise<ActionResult> {
  const me = await requireUser();
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

  const scope = await leaveReviewScopeFor(me);
  if (!scopeCovers(scope, existing.employeeId)) {
    return { ok: false, error: "You can't review this employee's leave." };
  }

  if (existing.status !== "pending") {
    return { ok: false, error: "This request has already been decided." };
  }

  try {
    const decided = await db.transaction(async (tx) => {
      // Serialize every paid-leave decision for one employee. Balance read and
      // status transition then commit as one operation.
      if (parsed.data.verdict === "approved" && existing.kind === "paid") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${existing.employeeId}::text, 0))`);
      }

      const [current] = await tx
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, parsed.data.id))
        .limit(1);
      if (!current) throw new Error("Leave request not found");
      if (current.status !== "pending") throw new Error("This request has already been decided.");

      if (parsed.data.verdict === "approved" && current.kind === "paid") {
        const bal = await getLeaveBalance(current.employeeId, todayISO(), tx);
        const reqDays = Number(current.days);
        if (bal.remaining < reqDays) {
          throw new Error(
            `Approving would exceed the employee's paid balance for ${bal.cycleLabel} (${bal.remaining} left, request is ${reqDays}).`,
          );
        }
      }

      const [updated] = await tx
        .update(leaveRequests)
        .set({
          status: parsed.data.verdict,
          decidedById: me.id,
          decidedAt: new Date(),
          decisionNote: parsed.data.note ? parsed.data.note : null,
        })
        .where(and(eq(leaveRequests.id, parsed.data.id), eq(leaveRequests.status, "pending")))
        .returning();
      if (!updated) throw new Error("This request has already been decided.");
      return updated;
    });

    await db.insert(employeeEvents).values({
      employeeId: decided.employeeId,
      actorId: me.id,
      eventType: `leave_${parsed.data.verdict}`,
      fromValue: { status: existing.status },
      toValue: {
        status: parsed.data.verdict,
        kind: decided.kind,
        startDate: decided.startDate,
        endDate: decided.endDate,
      },
      note: parsed.data.note ?? null,
    });

    await notify({
      userId: decided.employeeId,
      kind: "attendance_device" as NotificationKind,
      title:
        parsed.data.verdict === "approved"
          ? `${LEAVE_KIND_LABELS[decided.kind]} approved`
          : `${LEAVE_KIND_LABELS[decided.kind]} rejected`,
      body: `${decided.startDate} → ${decided.endDate} (${Number(decided.days)} day${Number(decided.days) === 1 ? "" : "s"})${parsed.data.note ? ` · ${parsed.data.note}` : ""}`,
      actorId: me.id,
    });

    await repriceLeaveMonths(decided.employeeId, decided.startDate, decided.endDate);
    revalidateLeaveSurfaces();
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * Admin records an already-approved leave directly for an employee. Same
 * eligibility gate as a self-request — an admin marking "paid leave" on a
 * part-timer would put a day the payroll can't fund onto their sheet — and paid
 * leaves still validate against the employee's remaining balance.
 */
export async function adminMarkLeave(
  input: {
    employeeId: string;
    kind: "paid" | "unpaid";
    startDate: string;
    endDate: string;
    reason?: string;
  } & LeaveExtrasInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminMarkLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const workerType = await workerTypeOf(parsed.data.employeeId);
  if (!leaveKindAllowedFor(workerType, parsed.data.kind)) {
    return { ok: false, error: paidLeaveRefusalFor(workerType) };
  }

  const refusal = await categoryRefusal(parsed.data.categoryId);
  if (refusal) return { ok: false, error: refusal };

  const days = leaveDays(parsed.data);

  let inserted;
  try {
    [inserted] = await db.transaction(async (tx) => {
      if (parsed.data.kind === "paid") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${parsed.data.employeeId}::text, 0))`);
        const bal = await getLeaveBalance(parsed.data.employeeId, todayISO(), tx);
        if (bal.remaining < days) {
          throw new Error(
            `Exceeds the employee's ${bal.allowance} paid leaves for ${bal.cycleLabel} (${bal.remaining} left).`,
          );
        }
      }
      return tx
        .insert(leaveRequests)
        .values({
          employeeId: parsed.data.employeeId,
          kind: parsed.data.kind,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          days: String(days),
          reason: parsed.data.reason ? parsed.data.reason : null,
          ...extraColumns(parsed.data),
          status: "approved",
          decidedById: me.id,
          decidedAt: new Date(),
        })
        .returning({ id: leaveRequests.id });
    });
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

  // An admin-marked leave is APPROVED on arrival — so if it is unpaid, it is a
  // deduction the moment this returns.
  await repriceLeaveMonths(
    parsed.data.employeeId,
    parsed.data.startDate,
    parsed.data.endDate,
  );
  revalidateLeaveSurfaces();
  return { ok: true, id: inserted.id };
}

/**
 * Edit an existing leave request. Employees may edit their own pending or approved requests.
 * Core changes (dates, half-days, kind) on an approved request reset status to pending for re-approval.
 */
export async function editLeave(
  input: {
    id: string;
    kind: "paid" | "unpaid";
    startDate: string;
    endDate: string;
    reason?: string;
  } & LeaveExtrasInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EditLeave.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Leave request not found" };

  if (existing.employeeId !== me.id && !me.isAdmin) {
    return { ok: false, error: "You can only edit your own requests." };
  }

  if (existing.status === "cancelled" || existing.status === "rejected") {
    return { ok: false, error: `Cannot edit a ${existing.status} request.` };
  }

  const workerType = asWorkerType(me.workerType);
  if (!leaveKindAllowedFor(workerType, parsed.data.kind)) {
    return { ok: false, error: paidLeaveRefusalFor(workerType) };
  }

  const refusal = await categoryRefusal(parsed.data.categoryId);
  if (refusal) return { ok: false, error: refusal };

  const minD = existing.startDate < parsed.data.startDate ? existing.startDate : parsed.data.startDate;
  const maxD = existing.endDate > parsed.data.endDate ? existing.endDate : parsed.data.endDate;

  // Prevent edits that conflict with existing attendance logs or disbursed payroll
  if (existing.status === "approved") {
    const [punch] = await db
      .select({ id: attendanceLogs.id, logDate: attendanceLogs.logDate })
      .from(attendanceLogs)
      .where(
        and(
          eq(attendanceLogs.employeeId, existing.employeeId),
          gte(attendanceLogs.logDate, minD),
          lte(attendanceLogs.logDate, maxD),
        ),
      )
      .limit(1);
    if (punch) {
      return {
        ok: false,
        error: `Attendance is already recorded on ${punch.logDate}. Correct or remove attendance before editing this leave.`,
      };
    }

    const months = monthsSpanned(minD, maxD);
    if (months.length > 0) {
      const [disbursed] = await db
        .select({ month: salaryRuns.month })
        .from(salaryRuns)
        .where(
          and(
            eq(salaryRuns.employeeId, existing.employeeId),
            inArray(salaryRuns.month, months),
            eq(salaryRuns.disbursed, true),
          ),
        )
        .limit(1);
      if (disbursed) {
        return {
          ok: false,
          error: `Payroll for ${disbursed.month} has already been disbursed. Contact HR or Accounts.`,
        };
      }
    }
  }

  const days = leaveDays(parsed.data);

  if (parsed.data.kind === "paid") {
    const bal = await getLeaveBalance(existing.employeeId, todayISO());
    const available =
      existing.status === "approved" && existing.kind === "paid"
        ? bal.remaining + Number(existing.days)
        : bal.remaining;

    if (available < days) {
      return {
        ok: false,
        error: `Exceeds your ${bal.allowance} paid leaves for ${bal.cycleLabel} (${available} left).`,
      };
    }
  }

  const coreChanged =
    existing.startDate !== parsed.data.startDate ||
    existing.endDate !== parsed.data.endDate ||
    existing.kind !== parsed.data.kind ||
    existing.startHalfDay !== (parsed.data.startHalfDay ?? false) ||
    existing.endHalfDay !== (parsed.data.endHalfDay ?? false);

  const newStatus = existing.status === "approved" && coreChanged ? "pending" : existing.status;

  try {
    await db
      .update(leaveRequests)
      .set({
        kind: parsed.data.kind,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        days: String(days),
        reason: parsed.data.reason ? parsed.data.reason : null,
        ...extraColumns(parsed.data),
        status: newStatus,
        ...(newStatus === "pending" && existing.status === "approved"
          ? { decidedById: null, decidedAt: null, decisionNote: null }
          : {}),
      })
      .where(eq(leaveRequests.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await db.insert(employeeEvents).values({
    employeeId: existing.employeeId,
    actorId: me.id,
    eventType: "leave_edited",
    fromValue: {
      status: existing.status,
      kind: existing.kind,
      startDate: existing.startDate,
      endDate: existing.endDate,
      days: existing.days,
    },
    toValue: {
      status: newStatus,
      kind: parsed.data.kind,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      days,
    },
  });

  await repriceLeaveMonths(existing.employeeId, minD, maxD);
  revalidateLeaveSurfaces();
  return { ok: true };
}

/**
 * Cancel a leave request. Employees may cancel their own pending or approved requests
 * from their existing history, provided attendance is not already punched and payroll is not disbursed.
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

  if (existing.employeeId !== me.id && !me.isAdmin) {
    return { ok: false, error: "You can only cancel your own requests." };
  }

  if (existing.status === "cancelled") {
    return { ok: false, error: "This request is already cancelled." };
  }

  if (existing.status === "rejected") {
    return { ok: false, error: "Rejected requests cannot be cancelled." };
  }

  // Guard approved requests against conflicting attendance records or disbursed payroll
  if (existing.status === "approved") {
    const [punch] = await db
      .select({ id: attendanceLogs.id, logDate: attendanceLogs.logDate })
      .from(attendanceLogs)
      .where(
        and(
          eq(attendanceLogs.employeeId, existing.employeeId),
          gte(attendanceLogs.logDate, existing.startDate),
          lte(attendanceLogs.logDate, existing.endDate),
        ),
      )
      .limit(1);
    if (punch) {
      return {
        ok: false,
        error: `Attendance is already recorded on ${punch.logDate}. Correct or remove attendance before cancelling this leave.`,
      };
    }

    const months = monthsSpanned(existing.startDate, existing.endDate);
    if (months.length > 0) {
      const [disbursed] = await db
        .select({ month: salaryRuns.month })
        .from(salaryRuns)
        .where(
          and(
            eq(salaryRuns.employeeId, existing.employeeId),
            inArray(salaryRuns.month, months),
            eq(salaryRuns.disbursed, true),
          ),
        )
        .limit(1);
      if (disbursed) {
        return {
          ok: false,
          error: `Payroll for ${disbursed.month} has already been disbursed. Contact HR or Accounts.`,
        };
      }
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
    toValue: { status: "cancelled" },
  });

  await repriceLeaveMonths(existing.employeeId, existing.startDate, existing.endDate);
  revalidateLeaveSurfaces();
  return { ok: true };
}

/** Explicit admin reversal for an approved leave. Never changes approved to rejected. */
export async function revokeLeave(input: { id: string; note?: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const existing = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, input.id),
  });
  if (!existing) return { ok: false, error: "Leave request not found" };
  if (existing.status !== "approved") {
    return { ok: false, error: "Only approved leave can be revoked." };
  }

  let revoked;
  try {
    [revoked] = await db
      .update(leaveRequests)
      .set({
        status: "cancelled",
        decidedById: me.id,
        decidedAt: new Date(),
        decisionNote: input.note?.trim() || "Leave revoked",
      })
      .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, "approved")))
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!revoked) return { ok: false, error: "Leave was already decided or revoked." };

  await db.insert(employeeEvents).values({
    employeeId: revoked.employeeId,
    actorId: me.id,
    eventType: "leave_revoked",
    fromValue: {
      status: "approved",
      decidedById: existing.decidedById,
      decidedAt: existing.decidedAt,
      decisionNote: existing.decisionNote,
    },
    toValue: { status: "cancelled", note: input.note?.trim() || "Leave revoked" },
  });
  await repriceLeaveMonths(revoked.employeeId, revoked.startDate, revoked.endDate);
  revalidateLeaveSurfaces();
  return { ok: true };
}
