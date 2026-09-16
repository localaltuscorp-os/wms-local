import type { IncentiveType } from "@/db/enums";
import { formatDMonY } from "@/lib/format";
import type { SplitShareInput } from "@/lib/incentive/split";

/**
 * Shared field config for the incentive request shapes — ported from the
 * Altus Ecosystem "Incentive Request" form (2026-06-10). The create dialog
 * renders from this, BOTH server entry points validate against it (the web
 * action and POST /api/mobile/incentive, via lib/incentive/prepare-request.ts),
 * and the detail view labels stored values with it. Client-safe (no
 * server-only).
 *
 * ── ONE VALIDATOR, TWO CALLERS ─────────────────────────────────────────────
 * `incentiveFieldError` is what the dialog shows inline AND what the server
 * refuses with. There is no separate "frontend" rule for a mobile number or an
 * email: the browser runs this function to show the message, and the server
 * runs the same function to enforce it.
 *
 * The dialog submits with `noValidate`, so the browser's own constraint checks
 * (required, type=email, type=url, min=1 on numbers) no longer run. Every one
 * of them is reproduced here, which is why `url` and `number` gained checks —
 * they are the rules the browser used to apply, now applied on the server too.
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
  /**
   * Options come from a live master instead of `options`.
   *
   * "products" = Admin → Products (`outstanding_products`, active rows, via
   * `listActiveProductNames`). The dialog receives the list as a prop and the
   * server re-reads it, so an option is valid exactly when an admin has it
   * active — nothing is hardcoded here.
   */
  optionsFrom?: "products";
  /**
   * Render hint: show a Yes/No choice as radio buttons with NO default. The
   * field is still `type: "select"` with options, so the stored value and the
   * mobile `forms` payload are unchanged in kind.
   */
  control?: "radio";
  placeholder?: string;
  /** Only shown (and only validated) when another field holds this value — or
   *  any of these values. */
  showIf?: { key: string; value: string | readonly string[] };
  /** Dual-screen layout: which column of the New Incentive Request dialog the
   *  field sits in. Presentation only; defaults to the left. */
  pane?: "left" | "right";
  /** Shares a row with the next `half` field (first/last name pairs) on wider
   *  screens. Presentation only. */
  half?: boolean;
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
/** Was "+91 XXXXX XXXXX" — which now fails validation, so it could not stay. */
const MOBILE_PLACEHOLDER = "10-digit mobile number";

export const INCENTIVE_DATE_KEY = "incentive_date";

/**
 * Every request records the date the incentive was earned. Stored in `details`
 * as ISO `YYYY-MM-DD` beside the other answers — the same place and format as
 * Group Introduction's existing Tentative Date — and displayed DD-MMM-YYYY.
 */
const INCENTIVE_DATE: IncentiveField = {
  key: INCENTIVE_DATE_KEY,
  label: "Incentive Date",
  type: "date",
  required: true,
  pane: "right",
};

/** Every form's Notes. Every textarea in this config is a Notes field, and the
 *  dialog gives every textarea voice dictation. */
const NOTES: IncentiveField = { key: "notes", label: "Notes", type: "textarea", pane: "right" };

/** Happiness types whose content is published, so the client must have said
 *  whether that is allowed. */
export const CLIENT_PERMISSION_HAPPINESS_TYPES = ["Case Study", "Video Testimonial"] as const;

export const INCENTIVE_FIELDS: Record<IncentiveType, readonly IncentiveField[]> = {
  // Labelled "Conversion" (was "BSS Conversion"). The key stays
  // `bss_conversion`: it is what stored rows carry, and renaming a stored enum
  // value would strand them.
  bss_conversion: [
    { key: "participant_first_name", label: "Participant First Name", type: "text", required: true, half: true },
    { key: "participant_last_name", label: "Participant Last Name", type: "text", required: true, half: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    {
      key: "conversion",
      label: "Conversion",
      type: "select",
      required: true,
      options: ["1st Attempt", "2nd Attempt", "Direct"],
    },
    { key: "product", label: "Product", type: "select", required: true, optionsFrom: "products" },
    // Prospect block — Direct conversions only.
    { key: "prospect_first_name", label: "Prospect First Name", type: "text", showIf: { key: "conversion", value: "Direct" }, pane: "right", half: true },
    { key: "prospect_last_name", label: "Prospect Last Name", type: "text", showIf: { key: "conversion", value: "Direct" }, pane: "right", half: true },
    { key: "prospect_cell", label: "Prospect Cell No", type: "tel", placeholder: MOBILE_PLACEHOLDER, showIf: { key: "conversion", value: "Direct" }, pane: "right" },
    { key: "prospect_email", label: "Prospect Email", type: "email", showIf: { key: "conversion", value: "Direct" }, pane: "right" },
    { key: "prospect_organisation", label: "Prospect Organisation", type: "text", showIf: { key: "conversion", value: "Direct" }, pane: "right" },
    // New: this was the one form without Notes, and every form's Notes now
    // takes dictation. Optional, like the others.
    NOTES,
    INCENTIVE_DATE,
  ],
  sales_pitch: [
    { key: "introducer_first_name", label: "Introducer First Name", type: "text", required: true, half: true },
    { key: "introducer_last_name", label: "Introducer Last Name", type: "text", required: true, half: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    { key: "prospect_first_name", label: "Prospect First Name", type: "text", required: true, half: true },
    { key: "prospect_last_name", label: "Prospect Last Name", type: "text", required: true, half: true },
    { key: "organisation", label: "Organisation Name", type: "text", required: true },
    { key: "cell", label: "Cell No", type: "tel", required: true, placeholder: MOBILE_PLACEHOLDER, pane: "right" },
    { key: "email", label: "Email", type: "email", required: true, pane: "right" },
    { key: "products", label: "Product Name(s)", type: "text", required: true, pane: "right" },
    {
      key: "opportunity_type",
      label: "Opportunity Type",
      type: "select",
      required: true,
      options: ["BSS Potential", "Inhouse Consulting", "Inhouse Training", "PS Potential", "Sales Consulting"],
      pane: "right",
    },
    NOTES,
    INCENTIVE_DATE,
  ],
  client_happiness: [
    {
      key: "happiness_type",
      label: "Happiness Type",
      type: "select",
      required: true,
      // "Video Testimonial" is new — the brief asks for a publish-permission
      // question on it, and it was not an option before.
      options: ["Case Study", "Google Review", "Interview", "LinkedIn Testimonial", "Video Testimonial"],
    },
    {
      key: "client_permission",
      label: "Client Permission to Publish",
      type: "select",
      control: "radio",
      required: true,
      options: ["Yes", "No"],
      showIf: { key: "happiness_type", value: CLIENT_PERMISSION_HAPPINESS_TYPES },
    },
    { key: "participant_first_name", label: "Participant First Name", type: "text", required: true, half: true },
    { key: "participant_last_name", label: "Participant Last Name", type: "text", required: true, half: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    { key: "link", label: "Link / File URL", type: "url", pane: "right" },
    {
      key: "content_quality",
      label: "Content Quality",
      type: "select",
      required: true,
      options: ["2-3 Sentences", "Do Not Use", "Good to Use", "Must Use"],
      pane: "right",
    },
    {
      key: "no_gyan_only_gain",
      label: "No Gyan Only Gain Said",
      type: "select",
      required: true,
      options: ["Yes", "No"],
      pane: "right",
    },
    NOTES,
    INCENTIVE_DATE,
  ],
  group_intro: [
    { key: "introducer_first_name", label: "Introducer First Name", type: "text", required: true, half: true },
    { key: "introducer_last_name", label: "Introducer Last Name", type: "text", required: true, half: true },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    { key: "prospect_first_name", label: "Prospect First Name", type: "text", required: true, half: true },
    { key: "prospect_last_name", label: "Prospect Last Name", type: "text", required: true, half: true },
    {
      key: "event_type",
      label: "Event Type",
      type: "select",
      required: true,
      options: ["Ascent Intro", "BNI Intro", "Jito Intro", "Key Note", "Paid Event", "Sales Event"],
    },
    { key: "institution", label: "Institution / Group Name", type: "text", required: true },
    { key: "cell", label: "Cell No", type: "tel", required: true, placeholder: MOBILE_PLACEHOLDER, pane: "right" },
    { key: "email", label: "Email", type: "email", required: true, pane: "right" },
    { key: "products", label: "Product Name(s)", type: "text", pane: "right" },
    { key: "tentative_date", label: "Tentative Date", type: "date", required: true, pane: "right" },
    { key: "approx_people", label: "Approx People", type: "number", required: true, placeholder: "e.g. 50", pane: "right" },
    NOTES,
    INCENTIVE_DATE,
  ],
  // New type. Order follows the brief; the pane hints place the link and notes
  // on the right.
  leads_referrals: [
    { key: "participant_first_name", label: "Participant First Name", type: "text", required: true, half: true },
    { key: "participant_last_name", label: "Participant Last Name", type: "text", required: true, half: true },
    { key: "link", label: "Link / Attachments", type: "url", placeholder: "https://…", pane: "right" },
    { key: "workshop", label: "Workshop Name", type: "select", required: true, options: WORKSHOPS },
    { key: "batch_no", label: "Batch No", type: "text", required: true, placeholder: BATCH_PLACEHOLDER },
    NOTES,
    INCENTIVE_DATE,
  ],
};

/** What a New Incentive Request submits — the web action and the mobile POST
 *  take the same body. `split` absent or null = not split. */
export interface IncentiveRequestInput {
  type: IncentiveType;
  details: Record<string, string>;
  split?: SplitShareInput[] | null;
}

/** Context the field rules need that cannot live in this static config. */
export interface IncentiveValidationContext {
  /** Active product names from Admin → Products. */
  productNames: readonly string[];
}

function showIfMatches(showIf: NonNullable<IncentiveField["showIf"]>, details: Record<string, string>): boolean {
  const current = details[showIf.key] ?? "";
  return typeof showIf.value === "string" ? current === showIf.value : showIf.value.includes(current);
}

/** Fields visible for `type` given the values entered so far (showIf). */
export function visibleIncentiveFields(
  type: IncentiveType,
  details: Record<string, string>,
): IncentiveField[] {
  return (INCENTIVE_FIELDS[type] ?? []).filter((f) => !f.showIf || showIfMatches(f.showIf, details));
}

/** The options a field offers, static or from a master. */
export function optionsFor(
  field: IncentiveField,
  ctx: IncentiveValidationContext,
): readonly string[] | undefined {
  return field.optionsFrom === "products" ? ctx.productNames : field.options;
}

// ── Format rules ────────────────────────────────────────────────────────────

export const MOBILE_ERROR = "Enter a valid 10-digit mobile number.";
export const EMAIL_ERROR = "Enter a valid email address.";
export const URL_ERROR = "Enter a valid link starting with http:// or https://.";

/**
 * A proper Indian mobile number: exactly ten digits, the first 6–9 (the
 * mobile number series). Numbers only — no +91, no spaces, no dashes. The
 * brief asks for rejection with a message, not silent clean-up, so nothing is
 * stripped before testing.
 */
export function isValidIndianMobile(v: string): boolean {
  return /^[6-9]\d{9}$/.test(v);
}

/**
 * An email with a real structure: a local part, one @, and a domain of
 * dot-separated labels ending in an alphabetic TLD of 2+ letters. Rejects what
 * the old `[^\s@]+@[^\s@]+\.[^\s@]+` let through — `a@b..com`, `a@-b.com`,
 * `a..b@c.com` — and what a browser's type=email allows, `a@b` with no TLD.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function isValidEmail(v: string): boolean {
  if (v.length > 254) return false;
  const at = v.lastIndexOf("@");
  if (at < 1 || at > 64) return false;
  return EMAIL_RE.test(v);
}

/** ISO `YYYY-MM-DD` that is a real calendar day (no 30-Feb) in 2000–2099. */
export function isValidIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2099) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** An http(s) link with a dotted host — what `<input type="url">` used to
 *  demand in the browser, now also held on the server. */
export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * The message for one field's value, or null when it is acceptable.
 *
 * The single rule the dialog shows and the server enforces. `value` is trimmed
 * here, so a trailing space never turns a valid number invalid.
 */
export function incentiveFieldError(
  field: IncentiveField,
  value: string,
  ctx: IncentiveValidationContext,
): string | null {
  const v = value.trim();
  if (!v) {
    if (!field.required) return null;
    if (field.control === "radio") return `Select Yes or No for ${field.label}.`;
    if (field.optionsFrom === "products" && ctx.productNames.length === 0) {
      return "No products are set up yet — add them in Admin → Products.";
    }
    return `${field.label} is required.`;
  }
  const options = optionsFor(field, ctx);
  if (options && !options.includes(v)) return `${field.label}: invalid option.`;
  switch (field.type) {
    case "tel":
      return isValidIndianMobile(v) ? null : MOBILE_ERROR;
    case "email":
      return isValidEmail(v) ? null : EMAIL_ERROR;
    case "url":
      return isValidHttpUrl(v) ? null : URL_ERROR;
    case "date":
      return isValidIsoDate(v) ? null : `Enter a valid ${field.label} (DD-MMM-YYYY).`;
    case "number":
      return /^[1-9]\d{0,6}$/.test(v) ? null : `${field.label} must be a whole number greater than 0.`;
    default:
      return null;
  }
}

/** Every visible field's error, keyed by field key, in form order. */
export function incentiveFieldErrors(
  type: IncentiveType,
  details: Record<string, string>,
  ctx: IncentiveValidationContext,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of visibleIncentiveFields(type, details)) {
    const message = incentiveFieldError(f, details[f.key] ?? "", ctx);
    if (message) errors[f.key] = message;
  }
  return errors;
}

/**
 * Validate + normalise submitted details for `type`. Strips unknown / hidden
 * keys, trims values, enforces every field rule. Returns the clean payload or
 * the first error message.
 */
export function validateIncentiveDetails(
  type: IncentiveType,
  raw: Record<string, string>,
  ctx: IncentiveValidationContext,
): { ok: true; details: Record<string, string> } | { ok: false; error: string } {
  const trimmed: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") trimmed[k] = v.trim().slice(0, 1000);
  }
  const fields = visibleIncentiveFields(type, trimmed);
  const clean: Record<string, string> = {};
  for (const f of fields) {
    const v = trimmed[f.key] ?? "";
    const error = incentiveFieldError(f, v, ctx);
    if (error) return { ok: false, error };
    if (v) clean[f.key] = v;
  }
  return { ok: true, details: clean };
}

/** Stored details → ordered [label, value] pairs for display. Date answers
 *  read DD-MMM-YYYY.
 *
 * Defensive: an UNKNOWN `type` (legacy / imported request whose type isn't one of
 * the current forms) or a null/non-object `details` must NOT throw — otherwise a
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
    .map((f) => [f.label, f.type === "date" ? formatDMonY(String(d[f.key])) : String(d[f.key])]);
}
