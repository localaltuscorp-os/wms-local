import { z } from "zod";
import {
  CONTRACT_BILLING_FREQUENCIES,
  CONTRACT_PAYMENT_TYPES,
} from "@/db/enums";
import { isValidAmount, validateContractPlan } from "@/lib/billing/contracts";

/**
 * BILLING CONTRACTS — pure zod schemas for every write, kept out of the
 * "use server" file so they can be unit-tested (the lib/validators/billing.ts
 * arrangement). Money arrives as a STRING, as everywhere else in billing.
 *
 * The business rules — the contract-value ceiling above all — are not
 * restated here: `superRefine` runs `validateContractPlan`, the same function
 * the form runs, so the server refuses exactly what the form warned about.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const blankToNull = (v: unknown) => {
  if (typeof v !== "string") return v ?? null;
  const t = v.trim();
  return t === "" ? null : t;
};

const optionalText = (max = 500) =>
  z.preprocess(blankToNull, z.string().max(max).nullable().default(null));

const optionalDate = z.preprocess(
  blankToNull,
  z.string().regex(DATE_RE, "Choose a valid date").nullable().default(null),
);

const moneyField = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => v === "" || isValidAmount(v), `${label} must be a positive amount (up to 2 decimals)`)
    .transform((v) => (v === "" ? "0" : v));

export const ContractItemSchema = z.object({
  /** Present for a row already saved; absent for a new one. */
  id: z.string().uuid().nullable().optional(),
  dueDate: optionalDate,
  description: optionalText(1000),
  amount: moneyField("Billing Amount"),
});
export type ContractItemInput = z.input<typeof ContractItemSchema>;

export const ContractPdcSchema = z.object({
  chequeDate: optionalDate,
  chequeNo: optionalText(40),
  bankName: optionalText(200),
  amount: moneyField("PDC Amt"),
  drawerName: optionalText(200),
});
export type ContractPdcInput = z.input<typeof ContractPdcSchema>;

export const ContractSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    entityId: z.string().trim().min(1, "Choose the Billing Entity"),
    customerId: z.string().uuid("Choose the Client Name"),
    totalValue: moneyField("Total Contract Value"),
    startDate: z.string().regex(DATE_RE, "Choose the Start Date"),
    endDate: z.string().regex(DATE_RE, "Choose the End Date"),
    billingDate: z.string().regex(DATE_RE, "Choose the Billing Date"),
    paymentType: z.enum(CONTRACT_PAYMENT_TYPES, { message: "Choose the Payment Type" }),
    billingFrequency: z.preprocess(blankToNull, z.enum(CONTRACT_BILLING_FREQUENCIES).nullable().default(null)),
    retainerAmount: z.preprocess(
      (v) => (v === null || v === undefined ? "" : v),
      moneyField("Retainer Billing Amount"),
    ),
    stopWhenComplete: z.boolean().default(true),
    notes: optionalText(4000),
    items: z.array(ContractItemSchema).max(500).default([]),
    pdcs: z.array(ContractPdcSchema).max(500).default([]),
  })
  .superRefine((v, ctx) => {
    const issues = validateContractPlan({
      totalValue: v.totalValue,
      paymentType: v.paymentType,
      startDate: v.startDate,
      endDate: v.endDate,
      billingDate: v.billingDate,
      billingFrequency: v.billingFrequency,
      retainerAmount: v.retainerAmount,
      // Stopped / billed state lives on the server; the core re-checks the
      // ceiling with it. Here every submitted row counts.
      items: v.paymentType === "retainer" ? [] : v.items,
      pdcs: v.pdcs,
    });
    for (const i of issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: i.message, path: i.field.split(".") });
    }
  });
export type ContractInput = z.input<typeof ContractSchema>;
export type ContractParsed = z.output<typeof ContractSchema>;

export const RaiseContractBillSchema = z.object({
  contractId: z.string().uuid(),
  /** The schedule row to bill. Omitted for a retainer: the next period is billed. */
  itemId: z.string().uuid().nullable().optional(),
});

export const StopContractItemSchema = z.object({
  contractId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const ContractIdSchema = z.object({ id: z.string().uuid() });

export const CancelContractSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why this contract is being cancelled").max(500),
});
