/**
 * BILLING MASTER — the entity record, its validation, and its normalisation.
 *
 * PURE. No `server-only`, no database, no React. The workspace (client) shows
 * the same messages the server action refuses with, because both read THIS
 * file — a client-side format check that disagrees with the server is how a
 * user comes to believe a GST number was saved when it was rejected.
 *
 * ── WHY FORMATS ARE VALIDATED AT ALL ───────────────────────────────────────
 * The brief asks for it "if existing application conventions support it". The
 * application has no PAN/GST validation today because nothing printed those
 * numbers on a document before; the dossier collects a PAN as free text for a
 * human to read. These numbers go on a TAX INVOICE, where a transposed digit is
 * a compliance problem for the recipient as well as for Altus, and where nobody
 * re-reads the footer of a generated PDF. So they are checked here.
 *
 * Every check is on SHAPE, never on existence — there is no government lookup
 * in this application and this file does not pretend otherwise. A correctly
 * shaped number that belongs to somebody else still saves.
 */

import { z } from "zod";

/* ════════════════════════════════════════════════════════════════════════════
   NORMALISATION — what gets stored, as opposed to what was typed.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Tax identifiers are stored UPPERCASE with all whitespace removed.
 *
 * People paste these out of PDFs and emails, which is where the stray spaces
 * and the lowercase come from. Two spellings of one GSTIN are not two GSTINs,
 * but they ARE two strings — and an invoice that renders `27aaaaa0000a1z5` is
 * wrong on its face even though the digits are right.
 */
export function normalizeTaxId(v: string): string {
  return v.replace(/\s+/g, "").toUpperCase();
}

/** Trim, collapse inner runs of whitespace, and return null for empty. */
export function cleanText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/* ════════════════════════════════════════════════════════════════════════════
   FORMATS
   ════════════════════════════════════════════════════════════════════════════ */

/** PAN — five letters, four digits, one letter. */
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * GSTIN — 15 characters: a two-digit state code, the holder's ten-character
 * PAN, a one-character entity number, one reserved character, one check
 * character.
 *
 * The reserved 14th character is 'Z' for every ordinary taxpayer, but not for
 * UIN or OIDAR registrations, so it is NOT pinned here. Pinning it would reject
 * a valid registration outright, which is a worse failure than accepting an
 * unusual one — the state code and the embedded PAN already catch the typos
 * this check exists for.
 */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

/** IFSC — four bank letters, a reserved '0', six branch characters. */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * SAC / HSN — four, six or eight digits.
 *
 * A service accounting code is six digits (and Altus's all begin 99), but the
 * same field carries four- and eight-digit HSN codes on goods lines, and the
 * brief says only "SAC Code(s)". Accepting the three real widths is right;
 * demanding six would reject a legitimate code and teach people to put it in
 * the address field instead.
 */
export const SAC_RE = /^[0-9]{4}(?:[0-9]{2}(?:[0-9]{2})?)?$/;

/**
 * Valid GST state codes: 01–38 (the states and union territories), 97 (Other
 * Territory) and 99 (Centre Jurisdiction).
 *
 * Worth checking because a wrong leading pair is the single most common GSTIN
 * typo and the only part of the number a human can sanity-check by eye.
 */
export function isGstStateCode(code: string): boolean {
  if (!/^[0-9]{2}$/.test(code)) return false;
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

/** The PAN a GSTIN carries in characters 3–12. */
export function panFromGstin(gstin: string): string | null {
  const g = normalizeTaxId(gstin);
  return GSTIN_RE.test(g) ? g.slice(2, 12) : null;
}

/* ════════════════════════════════════════════════════════════════════════════
   THE SCHEMA
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * An optional text field: blank, absent and null all mean "not recorded".
 *
 * The union with `""` follows lib/validators/employee.ts — the workspace sends
 * a cleared input as an empty string, and treating that as a validation failure
 * would make a field impossible to un-set once filled.
 */
const optionalText = (max: number, label: string) =>
  z
    .union([z.string().trim().max(max, `${label} is too long.`), z.literal(""), z.null()])
    .optional();

/** Entity Name — the one required field (§10), and the identity of the record. */
export const EntityNameSchema = z
  .string()
  .trim()
  .min(1, "Entity name is required.")
  .max(120, "Entity name is too long.");

const PanSchema = z
  .union([
    z
      .string()
      .transform(normalizeTaxId)
      .refine((v) => v === "" || PAN_RE.test(v), "PAN must look like ABCDE1234F."),
    z.null(),
  ])
  .optional();

const GstSchema = z
  .union([
    z
      .string()
      .transform(normalizeTaxId)
      .refine(
        (v) => v === "" || GSTIN_RE.test(v),
        "GST No. must be 15 characters, like 27ABCDE1234F1Z5.",
      )
      .refine(
        (v) => v === "" || isGstStateCode(v.slice(0, 2)),
        "The first two digits of a GST No. are a state code (01–38, 97 or 99).",
      ),
    z.null(),
  ])
  .optional();

const IfscSchema = z
  .union([
    z
      .string()
      .transform(normalizeTaxId)
      .refine((v) => v === "" || IFSC_RE.test(v), "IFSC must look like HDFC0001234."),
    z.null(),
  ])
  .optional();

/**
 * SAC codes — multiple, de-duplicated, order preserved.
 *
 * De-duplication is silent rather than an error: the same code twice is a slip,
 * not a decision, and there is nothing for the user to choose between.
 */
export const SacCodesSchema = z
  .array(z.string())
  .max(30, "That is more SAC codes than an invoice can use.")
  .transform((arr) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      const v = raw.replace(/\s+/g, "");
      if (v === "" || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  })
  .refine(
    (arr) => arr.every((v) => SAC_RE.test(v)),
    "A SAC code is 4, 6 or 8 digits — for example 998313.",
  )
  .optional();

/**
 * The editable shape of a billing entity.
 *
 * `.partial()`-friendly by construction: the workspace sends a SPARSE patch of
 * only what changed (the Employee Master's dirty-set convention), so every
 * field bar the name is optional and an absent key means "leave it alone". A
 * field this form fails to render must not arrive as null and blank a column.
 *
 * NO ENTITY CODE. The brief removes it, and there is no key here for one.
 */
export const BillingEntityFieldsSchema = z
  .object({
    name: EntityNameSchema.optional(),
    isActive: z.boolean().optional(),

    // Basic
    proprietorName: optionalText(120, "Proprietor name"),
    proprietorDesignation: optionalText(120, "Proprietor designation"),

    // Contact
    address: optionalText(500, "Address"),
    cellNo: optionalText(40, "Cell no."),
    email: z
      .union([z.string().trim().email("That email address is not valid.").max(160), z.literal(""), z.null()])
      .optional(),
    website: optionalText(200, "Website"),

    // Tax / billing
    panNo: PanSchema,
    gstNo: GstSchema,
    sacCodes: SacCodesSchema,

    // Banking — named for the fields the application already uses.
    bankName: optionalText(160, "Bank name"),
    accountName: optionalText(160, "Account name"),
    accountNumber: optionalText(40, "Account number"),
    ifsc: IfscSchema,
    branch: optionalText(200, "Branch"),
  })
  .strict()
  /**
   * CROSS-CHECK: a GSTIN contains its holder's PAN. If both are given and they
   * disagree, one of them is a typo — and this is the only check in the file
   * that can tell, because each number is individually well-formed.
   */
  .superRefine((v, ctx) => {
    const gst = typeof v.gstNo === "string" ? normalizeTaxId(v.gstNo) : "";
    const pan = typeof v.panNo === "string" ? normalizeTaxId(v.panNo) : "";
    if (!gst || !pan) return;
    const embedded = panFromGstin(gst);
    if (embedded && embedded !== pan) {
      ctx.addIssue({
        code: "custom",
        path: ["gstNo"],
        message: `This GST No. belongs to PAN ${embedded}, but the PAN No. is ${pan}. One of the two is wrong.`,
      });
    }
  });

export type BillingEntityFields = z.infer<typeof BillingEntityFieldsSchema>;

/** Creating requires a name; everything else may be filled in later. */
export const CreateBillingEntitySchema = z.object({
  name: EntityNameSchema,
});

/* ════════════════════════════════════════════════════════════════════════════
   FILES
   ════════════════════════════════════════════════════════════════════════════ */

/** The three roles a stored file can play, matching the DB check constraint. */
export const ENTITY_FILE_KINDS = ["logo", "signature", "document"] as const;
export type EntityFileKind = (typeof ENTITY_FILE_KINDS)[number];

export function isEntityFileKind(v: unknown): v is EntityFileKind {
  return typeof v === "string" && (ENTITY_FILE_KINDS as readonly string[]).includes(v);
}

export const ENTITY_FILE_KIND_LABELS: Record<EntityFileKind, string> = {
  logo: "Entity Logo",
  signature: "Proprietor Signature",
  document: "Billing Document",
};

/** Exactly one logo and one signature per entity; documents are unlimited. */
export function isSingletonFileKind(kind: EntityFileKind): boolean {
  return kind === "logo" || kind === "signature";
}

/**
 * The logo and the signature are IMAGES, and are rejected here when they are
 * not.
 *
 * Not fussiness: both are drawn into a generated invoice. A PDF accepted as a
 * "logo" fails at render time, long after the upload succeeded and with an
 * error that points at the renderer rather than at the file.
 *
 * SVG is deliberately absent. It is script-capable, which is exactly why
 * lib/hr/upload.ts already blocks it across every HR surface — an uploaded SVG
 * served from the storage domain is a stored-XSS vector, and no invoice needs
 * a vector logo badly enough to reopen that.
 */
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export function imageKindError(kind: EntityFileKind, mimeType: string | null): string | null {
  if (kind === "document") return null;
  const ok = mimeType != null && (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
  return ok
    ? null
    : `The ${ENTITY_FILE_KIND_LABELS[kind].toLowerCase()} must be a PNG, JPEG or WebP image.`;
}

/* ════════════════════════════════════════════════════════════════════════════
   DISPLAY
   ════════════════════════════════════════════════════════════════════════════ */

/** What the list's Contact column shows — the first contact that exists. */
export function primaryContact(e: {
  cellNo?: string | null;
  email?: string | null;
}): string | null {
  return cleanText(e.cellNo) ?? cleanText(e.email) ?? null;
}
