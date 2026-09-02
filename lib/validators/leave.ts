import { z } from "zod";
import { LEAVE_KINDS, OFFICE_PHONE_AVAILABILITY } from "@/db/enums";

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const ReasonSchema = z.string().trim().max(1000).optional();

/**
 * The half-day boundaries and reachability answers added in 0208.
 *
 * All OPTIONAL. The form always sends them, but the server actions are also
 * reached by older callers and by the admin mark-leave path, and a required
 * field here would turn "didn't say" into a validation failure rather than the
 * null the column is designed to hold.
 */
const LeaveExtras = {
  categoryId: z.string().uuid().nullable().optional(),
  startHalfDay: z.boolean().optional(),
  endHalfDay: z.boolean().optional(),
  availPersonalPhone: z.boolean().nullable().optional(),
  availOfficePhone: z.enum(OFFICE_PHONE_AVAILABILITY).nullable().optional(),
  availComputer: z.boolean().nullable().optional(),
};

/**
 * A single-day leave cannot be half at BOTH ends — the two flags name the same
 * half, and subtracting both would cancel the day to nothing. Mirrors the DB
 * CHECK `leave_requests_half_day_chk`, so the employee reads a sentence instead
 * of a constraint name.
 */
function refineHalfDays<T extends { startDate: string; endDate: string; startHalfDay?: boolean; endHalfDay?: boolean }>(
  v: T,
): boolean {
  return v.startDate !== v.endDate || !(v.startHalfDay && v.endHalfDay);
}
const HALF_DAY_MESSAGE = {
  message: "A one-day leave is either a half day or a full day, not both halves.",
  path: ["endHalfDay"],
};

/** Employee requests leave for themselves. endDate ≥ startDate enforced. */
export const RequestLeave = z
  .object({
    kind: z.enum(LEAVE_KINDS),
    startDate: DateSchema,
    endDate: DateSchema,
    reason: ReasonSchema,
    ...LeaveExtras,
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  })
  .refine(refineHalfDays, HALF_DAY_MESSAGE);

/** Admin verdict on a pending leave request. */
export const DecideLeave = z
  .object({
    id: z.string().uuid(),
    verdict: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Admin records an already-approved leave directly for an employee. */
export const AdminMarkLeave = z
  .object({
    employeeId: z.string().uuid(),
    kind: z.enum(LEAVE_KINDS),
    startDate: DateSchema,
    endDate: DateSchema,
    reason: ReasonSchema,
    ...LeaveExtras,
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  })
  .refine(refineHalfDays, HALF_DAY_MESSAGE);

/** Cancel a leave request (own pending, or any as admin). */
export const CancelLeave = z.object({ id: z.string().uuid() }).strict();

export type RequestLeaveInput = z.infer<typeof RequestLeave>;
export type DecideLeaveInput = z.infer<typeof DecideLeave>;
export type AdminMarkLeaveInput = z.infer<typeof AdminMarkLeave>;
export type CancelLeaveInput = z.infer<typeof CancelLeave>;
