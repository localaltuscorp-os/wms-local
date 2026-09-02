import { z } from "zod";

const money = z.number().min(0).max(99_999_999);

export const SalaryProfileSchema = z
  .object({
    employeeId: z.string().uuid(),
    annualCtc: money,
    tdsMonthly: money,
    ptExempt: z.boolean(),
    designationId: z.string().uuid().nullable().optional(),
    payingEntityId: z.string().uuid().nullable().optional(),
    probationEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

export const SalaryAdvanceSchema = z
  .object({
    employeeId: z.string().uuid(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    amount: z.number().positive().max(99_999_999),
    note: z.string().max(300).optional(),
  })
  .strict();

export const RunEditSchema = z
  .object({
    runId: z.string().uuid(),
    advances: money.optional(),
    pendingBalanceIn: money.optional(),
  })
  .strict();

export const GenerateSalarySchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strict();

export type SalaryProfileInput = z.infer<typeof SalaryProfileSchema>;
export type SalaryAdvanceInput = z.infer<typeof SalaryAdvanceSchema>;
