import { z } from "zod";

// WS-5 Salary core — validators for the CTC breakup form, retention bonus, and
// accountant adjustments. Reasons on adjustments are MANDATORY (min length 3)
// per the spec — enforced here so the server action can never persist a blank.

const money = z.number().min(0).max(99_999_999);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthStr = z.string().regex(/^\d{4}-\d{2}$/);

export const CtcComponentSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    annualAmount: money,
  })
  .strict();

export const CtcBreakupSchema = z
  .object({
    employeeId: z.string().uuid(),
    payingEntityId: z.string().uuid().nullable().optional(),
    annualCtc: money,
    components: z.array(CtcComponentSchema).max(40),
  })
  .strict();

export const RetentionBonusSchema = z
  .object({
    employeeId: z.string().uuid(),
    amount: money,
    payableDate: dateStr.nullable().optional(),
    paid: z.boolean(),
    paidDate: dateStr.nullable().optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  // If marked paid, a paid date is expected (payslip visibility depends on it).
  .refine((v) => !v.paid || !!v.paidDate, {
    message: "A paid retention bonus needs a paid date.",
    path: ["paidDate"],
  });

export const AdjustmentSchema = z
  .object({
    employeeId: z.string().uuid(),
    month: monthStr,
    kind: z.enum(["deduct", "ex_gratia"]),
    days: z.number().positive().max(31),
    // MANDATORY reason — the whole point of the disciplinary / ex-gratia trail.
    reason: z.string().trim().min(3, "Reason is required.").max(300),
  })
  .strict();

export const DeleteAdjustmentSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export type CtcBreakupInputZ = z.infer<typeof CtcBreakupSchema>;
export type RetentionBonusInputZ = z.infer<typeof RetentionBonusSchema>;
export type AdjustmentInputZ = z.infer<typeof AdjustmentSchema>;
