import { z } from "zod";

/**
 * People Gives — validation. Required TEXT fields accept literal "NA" naturally
 * (it's a non-empty string), per spec: a user may type "NA" when a value is
 * genuinely unavailable. Dropdowns/dates/optional fields are NOT required.
 */

export const PG_LOOKUP_KINDS = [
  "reference_source",
  "designation",
  "business_category",
  "sales_person",
] as const;
export type PgLookupKind = (typeof PG_LOOKUP_KINDS)[number];

const requiredText = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const optionalUuid = z
  .string()
  .uuid("Pick a valid option.")
  .optional()
  .nullable()
  .transform((v) => v ?? null);

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

export const CreateIntroductionSchema = z.object({
  referenceSourceId: optionalUuid,
  introducerFirstName: requiredText("Introducer first name", 120),
  introducerLastName: requiredText("Introducer last name", 120),
  introducerCell: optionalText(40),
  prospectCompany: requiredText("Prospect company", 200),
  prospectFirstName: requiredText("Prospect first name", 120),
  prospectLastName: requiredText("Prospect last name", 120),
  designationId: optionalUuid,
  businessCategoryId: optionalUuid,
  natureOfBusiness: requiredText("Nature of business", 2000),
  notes: optionalText(5000),
  nextReminderDate: optionalDate,
  salesPersonId: optionalUuid,
});
export type CreateIntroductionInput = z.infer<typeof CreateIntroductionSchema>;

export const AddLookupSchema = z.object({
  kind: z.enum(PG_LOOKUP_KINDS),
  name: z.string().trim().min(1, "Enter a value.").max(120, "Keep it under 120 characters."),
});

export const DeleteLookupSchema = z.object({
  kind: z.enum(PG_LOOKUP_KINDS),
  id: z.string().uuid(),
});
