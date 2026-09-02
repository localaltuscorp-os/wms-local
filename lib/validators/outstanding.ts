import { z } from "zod";
import {
  OUTSTANDING_CYCLES,
  GST_FORM_RATES,
  SUBSCRIPTION_FREQUENCIES,
} from "@/db/enums";

// Pure (DB-free) zod schemas for the v2 Outstanding Tracker write actions.
// Kept here — not in the "use server" action file — so they can be unit
// tested without pulling in the DB/env/server-only chain.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// One explicit installment row for partial_payment / slabs contracts. The
// amount is GST-inclusive (rupees) — the engine writes it verbatim, so the
// rows must sum to the contract's GST-inclusive total (see superRefine below).
const ExplicitInstallmentSchema = z.object({
  dueDate: z.string().regex(DATE_RE, "Invalid installment date"),
  amount: z.number().positive("Installment amount must be greater than zero").max(1_000_000_000),
});

// GST-inclusive total in integer paise, so the partial/slabs sum check is
// float-safe (compare round(total) vs round(Σ rows) in paise).
function totalPaise(baseAmount: number, gstRate: number): number {
  return Math.round(baseAmount * (1 + gstRate / 100) * 100);
}
function rowsPaise(rows: { amount: number }[]): number {
  return rows.reduce((acc, r) => acc + Math.round(r.amount * 100), 0);
}
function inrFromPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// Shared per-cycle requirement check, run from both Create (full data) and
// Update (partial data, only when the relevant fields are present).
type CycleFields = {
  cycle?: (typeof OUTSTANDING_CYCLES)[number];
  startDate?: string | null;
  retainerStart?: string | null;
  retainerEnd?: string | null;
  billDate?: number | null;
  emiCount?: number | null;
  frequency?: (typeof SUBSCRIPTION_FREQUENCIES)[number] | null;
  explicitInstallments?: { dueDate: string; amount: number }[];
  baseAmount?: number;
  gstRate?: number;
};

function requireField(
  ctx: z.RefinementCtx,
  present: boolean,
  path: string,
  message: string,
) {
  if (!present) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
  }
}

// `strict` controls whether cycle-required fields are enforced. Create always
// passes strict=true; Update only enforces when `cycle` itself is supplied
// (a partial edit that doesn't touch cycle shouldn't re-demand every field).
function checkCycleRules(d: CycleFields, ctx: z.RefinementCtx, strict: boolean) {
  if (!d.cycle) return;
  switch (d.cycle) {
    case "full_payment":
      if (strict) requireField(ctx, !!d.startDate, "startDate", "Start date is required");
      break;
    case "monthly_bill":
      if (strict) {
        requireField(ctx, !!d.retainerStart, "retainerStart", "Retainer start is required");
        requireField(ctx, !!d.retainerEnd, "retainerEnd", "Retainer end is required");
        requireField(ctx, d.billDate != null, "billDate", "Bill date is required");
      }
      break;
    case "subscription":
      if (strict) {
        requireField(ctx, !!d.startDate, "startDate", "EMI start date is required");
        requireField(ctx, d.emiCount != null, "emiCount", "Number of EMIs is required");
        requireField(ctx, !!d.frequency, "frequency", "Billing frequency is required");
      }
      break;
    case "partial_payment":
    case "slabs": {
      const rows = d.explicitInstallments ?? [];
      if (rows.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add at least one installment row.",
          path: ["explicitInstallments"],
        });
        break;
      }
      // Sum check only when we know the contract total (base + gst present).
      if (d.baseAmount != null && d.gstRate != null) {
        const total = totalPaise(d.baseAmount, d.gstRate);
        if (rowsPaise(rows) !== total) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Partial rows must sum to the total (₹${inrFromPaise(total)}).`,
            path: ["explicitInstallments"],
          });
        }
      }
      break;
    }
  }
}

export const CreateContractSchema = z
  .object({
    // iter-2 — client name is split into first/last; clientName is derived by
    // the action. Kept optional for iter-1 back-compat (old form still sends it).
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    clientName: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    productId: z.string().uuid().optional(),
    entityId: z.string().uuid().optional(),
    responsibleId: z.string().uuid().optional(),
    expectedModeId: z.string().uuid().optional(),
    cycle: z.enum(OUTSTANDING_CYCLES),
    baseAmount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
    gstRate: z
      .number()
      .refine((v) => (GST_FORM_RATES as readonly number[]).includes(v), "Invalid GST rate"),
    startDate: z.string().regex(DATE_RE, "Invalid start date"),
    retainerStart: z.string().regex(DATE_RE, "Invalid retainer start").nullable().optional(),
    retainerEnd: z.string().regex(DATE_RE, "Invalid retainer end").nullable().optional(),
    billDate: z.number().int().min(1).max(31).nullable().optional(),
    emiCount: z.number().int().min(1).max(600).nullable().optional(),
    frequency: z.enum(SUBSCRIPTION_FREQUENCIES).nullable().optional(),
    explicitInstallments: z.array(ExplicitInstallmentSchema).optional(),
    periods: z.number().int().min(1).max(600).nullable().optional(),
    endDate: z.string().regex(DATE_RE, "Invalid end date").nullable().optional(),
    pdcReceived: z.boolean(),
    comments: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    // Must be able to resolve a client name (first+last, or legacy clientName).
    if (!((d.firstName && d.lastName) || d.clientName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Client name is required",
        path: ["firstName"],
      });
    }
    checkCycleRules(d, ctx, true);
  });
export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    clientName: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().trim().max(40).nullable().optional(),
    productId: z.string().uuid().nullable().optional(),
    entityId: z.string().uuid().nullable().optional(),
    responsibleId: z.string().uuid().nullable().optional(),
    expectedModeId: z.string().uuid().nullable().optional(),
    cycle: z.enum(OUTSTANDING_CYCLES).optional(),
    baseAmount: z.number().positive().max(1_000_000_000).optional(),
    gstRate: z
      .number()
      .refine((v) => (GST_FORM_RATES as readonly number[]).includes(v), "Invalid GST rate")
      .optional(),
    startDate: z.string().regex(DATE_RE, "Invalid start date").optional(),
    retainerStart: z.string().regex(DATE_RE, "Invalid retainer start").nullable().optional(),
    retainerEnd: z.string().regex(DATE_RE, "Invalid retainer end").nullable().optional(),
    billDate: z.number().int().min(1).max(31).nullable().optional(),
    emiCount: z.number().int().min(1).max(600).nullable().optional(),
    frequency: z.enum(SUBSCRIPTION_FREQUENCIES).nullable().optional(),
    explicitInstallments: z.array(ExplicitInstallmentSchema).optional(),
    periods: z.number().int().min(1).max(600).nullable().optional(),
    endDate: z.string().regex(DATE_RE, "Invalid end date").nullable().optional(),
    pdcReceived: z.boolean().optional(),
    comments: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (Object.keys(d).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No changes to save." });
      return;
    }
    // Only enforce cycle-required fields when the cycle is part of the edit;
    // a partial edit that leaves cycle untouched re-uses the stored values
    // (the action re-materializes from the DB row).
    checkCycleRules(d, ctx, d.cycle !== undefined);
  });
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;

export const EditInstallmentSchema = z
  .object({
    dueDate: z.string().regex(DATE_RE, "Invalid date").optional(),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

export const AdhocInstallmentSchema = z
  .object({
    dueDate: z.string().regex(DATE_RE, "Invalid date"),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
  })
  .strict();

export const CreateCollectionSchema = z
  .object({
    clientName: z.string().trim().min(1, "Client is required").max(200),
    contractId: z.string().uuid().nullable().optional(),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
    paymentModeId: z.string().uuid(),
    responsibleId: z.string().uuid(),
    collectedAt: z.string().regex(DATE_RE, "Invalid date").optional(),
    comments: z.string().trim().max(1000).optional(),
  })
  .strict();
export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;
