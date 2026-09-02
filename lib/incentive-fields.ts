import type { IncentiveType } from "@/db/enums";

/**
 * Shared field config for the four incentive request shapes — ported from
 * the Altus Ecosystem "Incentive Request" form (2026-06-10). The create
 * dialog renders from this, the server action validates against it, and the
 * detail view labels stored values with it. Client-safe (no server-only).
 */

export type IncentiveFieldType =
  | "text"
  | "select"
  | "date"
  | "number"
  | "textarea"
  | "email"
  | "tel"
  | "url";

export interface IncentiveField {
  key: string;
  label: string;
  type: IncentiveFieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  /** Only shown (and only validated) when another field holds this value. */
  showIf?: { key: string; value: string };
}

export const WORKSHOPS = [
  "NA",
  "Don't Know",
  "Altus Network Event",
  "Business Scale Up Shastra",
  "Colloquium",
  "Completing the Year",
  "Productivity Shastra",
  "Productivity Shastra Orientation",
] as const;

const BATCH_PLACEHOLDER = "NA if not applicable, Don't Know if unknown";

export const INCENTIVE_FIELDS: Record<IncentiveType, readonly IncentiveField[]> = {
  bss_conversion: [
    { key: "participant_first_name", label: "Participant First Name", type: "text", required: true },
    { key: "participant_last_name", label: "Participant Last Name", type: "text", required: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    {
      key: "conversion",
      label: "BSS Conversion",
      type: "select",
      required: true,
      options: ["1st Attempt", "2nd Attempt", "Direct"],
    },
    // Prospect block — Direct conversions only.
    { key: "prospect_first_name", label: "Prospect First Name", type: "text", showIf: { key: "conversion", value: "Direct" } },
    { key: "prospect_last_name", label: "Prospect Last Name", type: "text", showIf: { key: "conversion", value: "Direct" } },
    { key: "prospect_cell", label: "Prospect Cell No", type: "tel", showIf: { key: "conversion", value: "Direct" } },
    { key: "prospect_email", label: "Prospect Email", type: "email", showIf: { key: "conversion", value: "Direct" } },
    { key: "prospect_organisation", label: "Prospect Organisation", type: "text", showIf: { key: "conversion", value: "Direct" } },
  ],
  sales_pitch: [
    { key: "introducer_first_name", label: "Introducer First Name", type: "text", required: true },
    { key: "introducer_last_name", label: "Introducer Last Name", type: "text", required: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    { key: "prospect_first_name", label: "Prospect First Name", type: "text", required: true },
    { key: "prospect_last_name", label: "Prospect Last Name", type: "text", required: true },
    { key: "organisation", label: "Organisation Name", type: "text", required: true },
    { key: "cell", label: "Cell No", type: "tel", required: true, placeholder: "+91 XXXXX XXXXX" },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "products", label: "Product Name(s)", type: "text", required: true },
    {
      key: "opportunity_type",
      label: "Opportunity Type",
      type: "select",
      required: true,
      options: ["BSS Potential", "Inhouse Consulting", "Inhouse Training", "PS Potential", "Sales Consulting"],
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  client_happiness: [
    {
      key: "happiness_type",
      label: "Happiness Type",
      type: "select",
      required: true,
      options: ["Case Study", "Google Review", "Interview", "LinkedIn Testimonial"],
    },
    { key: "participant_first_name", label: "Participant First Name", type: "text", required: true },
    { key: "participant_last_name", label: "Participant Last Name", type: "text", required: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    { key: "link", label: "Link / File URL", type: "url" },
    {
      key: "content_quality",
      label: "Content Quality",
      type: "select",
      required: true,
      options: ["2-3 Sentences", "Do Not Use", "Good to Use", "Must Use"],
    },
    {
      key: "no_gyan_only_gain",
      label: "No Gyan Only Gain Said",
      type: "select",
      required: true,
      options: ["Yes", "No"],
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  group_intro: [
    { key: "introducer_first_name", label: "Introducer First Name", type: "text", required: true },
    { key: "introducer_last_name", label: "Introducer Last Name", type: "text", required: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    { key: "prospect_first_name", label: "Prospect First Name", type: "text", required: true },
    { key: "prospect_last_name", label: "Prospect Last Name", type: "text", required: true },
    {
      key: "event_type",
      label: "Event Type",
      type: "select",
      required: true,
      options: ["Ascent Intro", "BNI Intro", "Jito Intro", "Key Note", "Paid Event", "Sales Event"],
    },
    { key: "institution", label: "Institution / Group Name", type: "text", required: true },
    { key: "cell", label: "Cell No", type: "tel", required: true, placeholder: "+91 XXXXX XXXXX" },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "products", label: "Product Name(s)", type: "text" },
    { key: "tentative_date", label: "Tentative Date", type: "date", required: true },
    { key: "approx_people", label: "Approx People", type: "number", required: true, placeholder: "e.g. 50" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

/** Fields visible for `type` given the values entered so far (showIf). */
export function visibleIncentiveFields(
  type: IncentiveType,
  details: Record<string, string>,
): IncentiveField[] {
  return INCENTIVE_FIELDS[type].filter(
    (f) => !f.showIf || (details[f.showIf.key] ?? "") === f.showIf.value,
  );
}

/**
 * Validate + normalise submitted details for `type`. Strips unknown / hidden
 * keys, trims values, enforces required-ness. Returns the clean payload or
 * the first error message.
 */
export function validateIncentiveDetails(
  type: IncentiveType,
  raw: Record<string, string>,
): { ok: true; details: Record<string, string> } | { ok: false; error: string } {
  const trimmed: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") trimmed[k] = v.trim().slice(0, 1000);
  }
  const fields = visibleIncentiveFields(type, trimmed);
  const clean: Record<string, string> = {};
  for (const f of fields) {
    const v = trimmed[f.key] ?? "";
    if (f.required && !v) {
      return { ok: false, error: `${f.label} is required.` };
    }
    if (v && f.options && !f.options.includes(v)) {
      return { ok: false, error: `${f.label}: invalid option.` };
    }
    if (v) clean[f.key] = v;
  }
  return { ok: true, details: clean };
}

/** Stored details → ordered [label, value] pairs for display.
 *
 * Defensive: an UNKNOWN `type` (legacy / imported request whose type isn't one of
 * the 4 current forms) or a null/non-object `details` must NOT throw — otherwise a
 * single bad row crashes the whole requests list for ADMINS (who see everyone's
 * requests, so they hit the bad row; a normal user seeing only their own valid
 * requests never does). Unknown type → no field config → empty pairs. */
export function incentiveDetailPairs(
  type: IncentiveType,
  details: Record<string, string> | null | undefined,
): [string, string][] {
  const fields = INCENTIVE_FIELDS[type] ?? [];
  const d = details && typeof details === "object" ? details : {};
  return fields
    .filter((f) => (d[f.key] ?? "") !== "")
    .map((f) => [f.label, String(d[f.key])]);
}
