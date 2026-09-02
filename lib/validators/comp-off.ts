import { z } from "zod";

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/**
 * Admin elects to convert a worked holiday / weekly-off into a redeemable
 * comp-off credit. `earnedDate` is the day that was actually worked; converting
 * it suppresses that day's holiday-pay (HP) — it reverts to a plain H / W/O —
 * and creates an `open` credit the employee can later redeem.
 */
export const ConvertToCompOff = z
  .object({
    employeeId: z.string().uuid(),
    earnedDate: DateSchema,
  })
  .strict();

/** Admin redeems an open credit onto a future (or any) calendar date. The
 *  redeemed weekday is graded as CO (full-day credit, no work expected). */
export const RedeemCompOff = z
  .object({
    creditId: z.string().uuid(),
    redeemedDate: DateSchema,
  })
  .strict();

/** Admin deletes a comp-off credit, reverting its effect (the earnedDate's HP
 *  comes back, and any redeemedDate stops grading as CO). */
export const DeleteCompOff = z
  .object({ creditId: z.string().uuid() })
  .strict();

export type ConvertToCompOffInput = z.infer<typeof ConvertToCompOff>;
export type RedeemCompOffInput = z.infer<typeof RedeemCompOff>;
export type DeleteCompOffInput = z.infer<typeof DeleteCompOff>;
