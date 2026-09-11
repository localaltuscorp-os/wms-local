"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaveRequests, employeeEvents, employees } from "@/db/schema";
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

  // Concurrency guard: re-check paid balance at approval time.
  if (parsed.data.verdict === "approved" && existing.kind === "paid") {
    const bal = await getLeaveBalance(existing.employeeId, todayISO());
    const reqDays = Number(existing.days);
    if (bal.remaining < reqDays) {
      return {
        ok: false,
        error: `Approving would exceed the employee's paid balance for ${bal.cycleLabel} (${bal.remaining} left, request is ${reqDays}).`,
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

  await repriceLeaveMonths(existing.employeeId, existing.startDate, existing.endDate);
  revalidateLeaveSurfaces();
  return { ok: true };
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

  if (parsed.data.kind === "paid") {
    const bal = await getLeaveBalance(parsed.data.employeeId, todayISO());
    if (bal.remaining < days) {
      return {
        ok: false,
        error: `Exceeds the employee's ${bal.allowance} paid leaves for ${bal.cycleLabel} (${bal.remaining} left).`,
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
        ...extraColumns(parsed.data),
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
 * Cancel a leave request. An employee may cancel their OWN PENDING request; an
 * admin may cancel any request in any state (including walking back an approval,
 * which releases the attendance days again on the next read).
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

  // A cancelled leave that had been APPROVED gives the day back — including,
  // for an unpaid one, the deduction it carried.
  await repriceLeaveMonths(existing.employeeId, existing.startDate, existing.endDate);
  revalidateLeaveSurfaces();
  return { ok: true };
}
