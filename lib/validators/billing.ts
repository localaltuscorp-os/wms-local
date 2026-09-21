import { z } from "zod";
import { BILLING_DOC_TYPES, BILLING_DOC_STATUSES } from "@/db/enums";

/**
 * BILLING — pure (DB-free) zod schemas for every write action in the module.
 *
 * Kept out of the "use server" files so they can be unit-tested without
 * dragging in the DB / env / server-only chain, exactly as
 * lib/validators/outstanding.ts is.
 *
 * Two rules run through all of it:
 *   · Money arrives as a STRING and is parsed to 2dp. A client float is never
 *     trusted, and the server recomputes every total from the lines anyway.
 *   · An optional identifier is validated only WHEN PRESENT. A customer with no
 *     GSTIN is a first-class case, not a validation failure.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const E164_RE = /^\+?[1-9]\d{7,14}$/;

/** "" → null. Forms post empty strings; the database wants absence. */
const blankToNull = (v: unknown) => {
  if (typeof v !== "string") return v ?? null;
  const t = v.trim();
  return t === "" ? null : t;
};

const optionalText = (max = 500) =>
  z.preprocess(blankToNull, z.string().max(max).nullable().default(null));

const optionalUpper = (max = 40) =>
  z.preprocess(
    (v) => {
      const t = blankToNull(v);
      return typeof t === "string" ? t.toUpperCase() : t;
    },
    z.string().max(max).nullable().default(null),
  );

export const optionalPan = z.preprocess(
  (v) => {
    const t = blankToNull(v);
    return typeof t === "string" ? t.toUpperCase() : t;
  },
  z.string().regex(PAN_RE, "PAN looks like ABCDE1234F").nullable().default(null),
);

export const optionalGstin = z.preprocess(
  (v) => {
    const t = blankToNull(v);
    return typeof t === "string" ? t.toUpperCase() : t;
  },
  z.string().regex(GSTIN_RE, "GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5").nullable().default(null),
);

export const optionalIfsc = z.preprocess(
  (v) => {
    const t = blankToNull(v);
    return typeof t === "string" ? t.toUpperCase() : t;
  },
  z.string().regex(IFSC_RE, "IFSC looks like KKBK0000646").nullable().default(null),
);

export const optionalEmail = z.preprocess(
  blankToNull,
  z.string().email("Enter a valid email address").max(200).nullable().default(null),
);

export const optionalPhone = z.preprocess(
  (v) => {
    const t = blankToNull(v);
    return typeof t === "string" ? t.replace(/[\s-()]/g, "") : t;
  },
  z.string().regex(E164_RE, "Use an international number, e.g. +919876543210").nullable().default(null),
);

/** A money field that arrives as a string and must parse to a finite number. */
const moneyString = (label: string) =>
  z
    .string()
    .trim()
    .default("0")
    .refine((v) => v === "" || Number.isFinite(Number(v.replace(/,/g, ""))), `${label} must be a number`);

export const BillingLineSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  code: optionalText(40),
  name: z.string().trim().min(1, "Every line needs a product or service name").max(300),
  description: optionalText(2000),
  sacCode: optionalText(20),
  hsnCode: optionalText(20),
  quantity: moneyString("Quantity").refine(
    (v) => Number(v.replace(/,/g, "")) > 0,
    "Quantity must be greater than zero",
  ),
  unit: optionalText(20),
  rate: moneyString("Rate").refine(
    (v) => Number(v.replace(/,/g, "")) >= 0,
    "Rate cannot be negative",
  ),
  discountPct: z.preprocess(blankToNull, z.string().nullable().default(null)),
  discountAmount: moneyString("Discount"),
  gstRate: moneyString("GST rate").refine((v) => {
    const n = Number(v.replace(/,/g, ""));
    return n >= 0 && n <= 28;
  }, "GST rate must be between 0 and 28"),
});
export type BillingLineInput = z.infer<typeof BillingLineSchema>;

/**
 * The document form. Note what is NOT here: doc_no, any total, any tax amount.
 * The number is allocated on generate and the money is recomputed server-side,
 * so neither is something a client can post.
 */
export const BillingDocumentSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    docType: z.enum(BILLING_DOC_TYPES),
    entityId: z.string().trim().min(1, "Choose the entity issuing this document"),
    docDate: z.string().regex(DATE_RE, "Choose a document date"),
    dueDate: z.preprocess(blankToNull, z.string().regex(DATE_RE).nullable().default(null)),

    customerId: z.preprocess(blankToNull, z.string().uuid().nullable().default(null)),
    customerName: z.string().trim().min(1, "Choose or name the customer").max(300),
    customerContactName: optionalText(200),
    customerEmail: optionalEmail,
    customerWhatsapp: optionalPhone,
    customerGstin: optionalGstin,
    placeOfSupplyState: optionalText(100),
    placeOfSupplyCode: optionalUpper(2),

    serviceDescription: optionalText(2000),
    sacCode: optionalText(20),
    paymentTermsId: z.preprocess(blankToNull, z.string().uuid().nullable().default(null)),
    paymentTermsLabel: optionalText(120),
    remarks: optionalText(4000),

    gstApplicable: z.boolean().default(true),
    isReverseCharge: z.boolean().default(false),
    isExempt: z.boolean().default(false),

    lines: z.array(BillingLineSchema).min(1, "Add at least one product or service"),

    /** Set when the form was opened from a source document (§ conversion). */
    sourceDocumentId: z.preprocess(blankToNull, z.string().uuid().nullable().default(null)),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate && v.dueDate < v.docDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The due date cannot be before the document date",
        path: ["dueDate"],
      });
    }
    // A GSTIN carries its state in its first two characters. If both are given
    // and they disagree, one of them is wrong and the invoice would be too.
    if (v.customerGstin && v.placeOfSupplyCode && v.customerGstin.slice(0, 2) !== v.placeOfSupplyCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `This GSTIN belongs to state ${v.customerGstin.slice(0, 2)}, not ${v.placeOfSupplyCode}`,
        path: ["placeOfSupplyCode"],
      });
    }
  });
export type BillingDocumentInput = z.input<typeof BillingDocumentSchema>;
export type BillingDocumentParsed = z.output<typeof BillingDocumentSchema>;

export const GenerateBillingDocumentSchema = z.object({
  id: z.string().uuid(),
});

export const ConvertBillingDocumentSchema = z.object({
  sourceId: z.string().uuid(),
  toType: z.enum(BILLING_DOC_TYPES),
});

export const CancelBillingDocumentSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why this is being cancelled").max(500),
});

/** Archive or restore one document (migration 0231). */
export const ArchiveBillingDocumentSchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean(),
});

export const MarkPaidSchema = z.object({
  id: z.string().uuid(),
  paidAmount: moneyString("Amount"),
  paidAt: z.string().regex(DATE_RE, "Choose the payment date"),
});

/** The Email Composer's payload. Everything the user can edit before sending. */
export const EmailBillingDocumentSchema = z.object({
  id: z.string().uuid(),
  to: z.string().trim().email("Enter a valid recipient email address"),
  cc: z.preprocess(blankToNull, z.string().max(500).nullable().default(null)),
  bcc: z.preprocess(blankToNull, z.string().max(500).nullable().default(null)),
  subject: z.string().trim().min(1, "The email needs a subject").max(200),
  body: z.string().trim().min(1, "The email needs a message"),
});

/** Comma/semicolon separated addresses → a validated list. Empty is fine. */
export function parseAddressList(raw: string | null | undefined): {
  ok: true;
  list: string[];
} | { ok: false; bad: string } {
  if (!raw?.trim()) return { ok: true, list: [] };
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!z.string().email().safeParse(p).success) return { ok: false, bad: p };
  }
  return { ok: true, list: parts };
}

export const BillingCustomerSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "The customer needs a name").max(300),
  legalName: optionalText(300),
  contactName: optionalText(200),
  email: optionalEmail,
  whatsapp: optionalPhone,
  phone: optionalPhone,
  pan: optionalPan,
  gstin: optionalGstin,
  addressLine1: optionalText(300),
  addressLine2: optionalText(300),
  city: optionalText(120),
  stateName: optionalText(120),
  stateCode: optionalUpper(2),
  pincode: optionalText(12),
  country: z.string().trim().max(80).default("India"),
  clientId: z.preprocess(blankToNull, z.string().uuid().nullable().default(null)),
  outstandingEntityId: z.preprocess(blankToNull, z.string().uuid().nullable().default(null)),
  notes: optionalText(2000),
  isActive: z.boolean().default(true),
});
export type BillingCustomerInput = z.input<typeof BillingCustomerSchema>;

export const BillingEntityProfileSchema = z.object({
  entityId: z.string().trim().min(1),
  legalName: optionalText(300),
  pan: optionalPan,
  gstin: optionalGstin,
  stateName: optionalText(120),
  stateCode: optionalUpper(2),
  addressLine: optionalText(400),
  email: optionalEmail,
  whatsapp: optionalPhone,
  phone: optionalText(40),
  website: optionalText(200),
  logoUrl: optionalText(500),
  bankName: optionalText(200),
  bankAccountName: optionalText(200),
  bankAccountNo: optionalText(60),
  bankIfsc: optionalIfsc,
  bankBranch: optionalText(200),
  upiId: optionalText(120),
  defaultSacCode: optionalText(20),
  signatoryName: optionalText(200),
  signatoryDesignation: optionalText(120),
  signatureImageUrl: optionalText(500),
  defaultPaymentTermsId: z.preprocess(blankToNull, z.string().uuid().nullable().default(null)),
  interestClause: optionalText(1000),
  invoiceFooterNote: optionalText(500),
}).superRefine((v, ctx) => {
  if (v.gstin && v.stateCode && v.gstin.slice(0, 2) !== v.stateCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `This GSTIN belongs to state ${v.gstin.slice(0, 2)}, not ${v.stateCode}`,
      path: ["stateCode"],
    });
  }
});

export const BillingPaymentTermSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1, "The term needs a label").max(120),
  dueDays: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(3650).nullable().default(null),
  ),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
});

export const BillingSacCodeSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: z.string().trim().min(4, "A SAC code is at least 4 digits").max(20),
  description: z.string().trim().min(1, "Describe what this SAC covers").max(300),
  defaultGstRate: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().min(0).max(28).nullable().default(null),
  ),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
});

export const BillingSeriesDefaultSchema = z.object({
  entityId: z.string().trim().min(1),
  docType: z.enum(BILLING_DOC_TYPES),
  prefix: z.string().trim().max(12).default(""),
  startSeq: z.coerce.number().int().min(1).max(9_999_999),
  padWidth: z.coerce.number().int().min(0).max(10).default(0),
});

export const BillingListFilterSchema = z.object({
  type: z.enum(BILLING_DOC_TYPES).nullable().default(null),
  status: z.enum(BILLING_DOC_STATUSES).nullable().default(null),
  customerId: z.string().uuid().nullable().default(null),
  entityId: z.string().nullable().default(null),
  finYear: z.string().nullable().default(null),
  from: z.string().regex(DATE_RE).nullable().default(null),
  to: z.string().regex(DATE_RE).nullable().default(null),
  q: z.string().trim().max(200).nullable().default(null),
  /** Show the ARCHIVED documents instead of the live ones (migration 0231).
   *  A swap, not a widening — see `whereFromFilters`. */
  archived: z.coerce.boolean().nullable().default(null),
});
export type BillingListFilters = z.output<typeof BillingListFilterSchema>;

/**
 * The extra bar a document must clear to be GENERATED, over and above being a
 * valid draft. Returned as a list so the UI can name the first offending field
 * rather than saying "invalid".
 */
export function generateBlockers(doc: {
  docType: string;
  customerName: string | null;
  lines: unknown[];
  total: number;
  sellerGstin: string | null;
  placeOfSupplyCode: string | null;
}): string[] {
  const out: string[] = [];
  if (!doc.customerName?.trim()) out.push("Choose the customer this is billed to");
  if (doc.lines.length === 0) out.push("Add at least one product or service");
  if (!(doc.total > 0)) out.push("The document total must be greater than zero");
  if (doc.docType === "tax_invoice") {
    // A tax invoice without a seller GSTIN is not a tax invoice.
    if (!doc.sellerGstin?.trim()) {
      out.push("This entity has no GSTIN yet — add one in Admin › Billing Profiles");
    }
    if (!doc.placeOfSupplyCode?.trim()) out.push("Set the place of supply (state) for the customer");
  }
  return out;
}
