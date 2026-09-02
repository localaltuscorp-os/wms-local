import { z } from "zod";
import { LEAVE_KINDS } from "@/db/enums";

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const ReasonSchema = z.string().trim().max(1000).optional();

/** Employee requests leave for themselves. endDate ≥ startDate enforced. */
export const RequestLeave = z
  .object({
    kind: z.enum(LEAVE_KINDS),
    startDate: DateSchema,
    endDate: DateSchema,
    reason: ReasonSchema,
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  });

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
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date can't be before the start date.",
    path: ["endDate"],
  });

/** Cancel a leave request (own pending, or any as admin). */
export const CancelLeave = z.object({ id: z.string().uuid() }).strict();

export type RequestLeaveInput = z.infer<typeof RequestLeave>;
export type DecideLeaveInput = z.infer<typeof DecideLeave>;
export type AdminMarkLeaveInput = z.infer<typeof AdminMarkLeave>;
export type CancelLeaveInput = z.infer<typeof CancelLeave>;
