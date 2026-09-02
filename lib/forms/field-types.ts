/**
 * Shared form-field model for the dynamic modules (Reimbursements,
 * Record Reference, Participant Breakthrough) and — going forward — the
 * incentive request forms. Client-safe: no server-only imports, so both the
 * render dialog and the server validator can share it.
 *
 * The same shape is what an admin edits when customising a form: every field
 * here can be added / relabelled / reordered / made (non-)required, and select
 * options extended, via the form editor. Stored overrides (db `form_configs`)
 * replace the code defaults below when present.
 */

export type FormFieldType =
  | "text"
  | "textarea"
  | "select"
  | "buttons" // single-select MCQ buttons, options defined on the field itself
  | "product" // single-select MCQ buttons, options come from the global product list
  | "date"
  | "number"
  | "email"
  | "tel"
  | "url";

/** Field types whose options the admin edits inline in the form editor. */
export const OPTION_FIELD_TYPES: FormFieldType[] = ["select", "buttons"];

export interface FormFieldDef {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  /**
   * Only shown + validated when another field currently holds this value.
   * `value` may be a single string (equality) OR a list (show when the current
   * value is any one of them) — e.g. "Number of Children" shows for every
   * marital status except "Single".
   */
  showIf?: { key: string; value: string | string[] };
  /** Read-only display (e.g. an auto-computed value the user can't type). */
  readOnly?: boolean;
  /**
   * Value is derived, not typed:
   *   ageFromDob     — whole years from the section's DOB field
   *   expFromRange   — "X yrs Y mo" from the entry's from→to dates
   *   monthlyFromCtc — round((fixedSalary + bonus) / 12)
   */
  compute?: "ageFromDob" | "expFromRange" | "monthlyFromCtc";
  /** Options come from a live app master (Candidate Intake wizard only). */
  optionsFrom?: "departments" | "positions";
  /** Text field that seeds an Aadhaar-based lookup (auto-fills mobile/location). */
  aadhaarLookup?: boolean;
  /**
   * Explicit grid width out of 12 columns (Candidate Intake layout). Lets fields
   * pack tightly onto one line — e.g. three span-4 fields fill a row. Omitted →
   * a sensible default (4 for most, 12 for textareas/Aadhaar, 8 for big chip sets).
   */
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  /** Force this field's chip options onto ONE line (never wrap). */
  nowrap?: boolean;
  /**
   * Explicitly OPTIONAL — exempt from the Candidate Intake "everything is
   * mandatory" gate (see isRequiredField). Used for supplementary address lines,
   * the recruiter email, etc.
   */
  optional?: boolean;
  /**
   * Renders a full-width sub-heading immediately before this field when it is the
   * first in a contiguous run sharing the same label (e.g. "Health & Habits").
   */
  groupLabel?: string;
}

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  textarea: "Paragraph",
  select: "Dropdown",
  buttons: "Buttons (MCQ)",
  product: "Product name (buttons)",
  date: "Date",
  number: "Number",
  email: "Email",
  tel: "Phone",
  url: "Link / URL",
};

/** Default product-name MCQ options. Admins can extend the live list. */
export const DEFAULT_PRODUCT_OPTIONS = [
  "Don't Know",
  "PSO",
  "BSS",
  "Consulting",
  "Collaboration",
  "Key Note",
  "Inhouse PSO",
  "Being Arjun",
  "2 Days",
] as const;

/** Which fields are visible given the values entered so far (showIf gating). */
export function visibleFields(
  fields: FormFieldDef[],
  values: Record<string, string>,
): FormFieldDef[] {
  return fields.filter((f) => {
    if (!f.showIf) return true;
    const cur = values[f.showIf.key] ?? "";
    const want = f.showIf.value;
    return Array.isArray(want) ? want.includes(cur) : cur === want;
  });
}

/**
 * Validate + normalise submitted values against a resolved field list.
 * `productOptions` is the live global list — `product` fields accept any of
 * those (admins keep that list current). Returns the clean payload or the
 * first error message.
 */
export function validateFields(
  fields: FormFieldDef[],
  raw: Record<string, string>,
  productOptions: string[] = [],
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const trimmed: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") trimmed[k] = v.trim().slice(0, 2000);
  }
  const visible = visibleFields(fields, trimmed);
  const clean: Record<string, string> = {};
  for (const f of visible) {
    const v = trimmed[f.key] ?? "";
    if (f.required && !v) return { ok: false, error: `${f.label} is required.` };
    if (v && (f.type === "select" || f.type === "buttons") && f.options && !f.options.includes(v)) {
      return { ok: false, error: `${f.label}: invalid option.` };
    }
    if (v && f.type === "product" && productOptions.length && !productOptions.includes(v)) {
      return { ok: false, error: `${f.label}: invalid product.` };
    }
    if (v) clean[f.key] = v;
  }
  return { ok: true, values: clean };
}

/** Stored values → ordered [label, value] pairs for read-only display. */
export function fieldPairs(
  fields: FormFieldDef[],
  values: Record<string, string>,
): [string, string][] {
  return fields
    .filter((f) => (values[f.key] ?? "") !== "")
    .map((f) => [f.label, values[f.key] as string]);
}
