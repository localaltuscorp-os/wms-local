import { visibleFields, type FormFieldDef } from "@/lib/forms/field-types";

/**
 * Wizard schema for the Candidate Interview Form — restructured into rail
 * sections on top of the existing FormFieldDef renderer. Repeated blocks
 * (Education, Previous Work, Family) become "add another" repeaters so the rail
 * stays short.
 *
 * Runtime values are a flat Record<string,string> keyed:
 *   non-repeat:  `${sectionId}.${fieldKey}`
 *   repeater:    `${sectionId}.${instanceIndex}.${fieldKey}`
 * The Declaration photo/signature are file uploads handled outside FieldInput.
 *
 * Special Personal-section fields (rendered specially by IntakeSectionStep):
 *   position  — managed dropdown fed by the Interview Positions master (add/delete)
 *   department — dropdown fed by the Departments master
 *   aadhaar   — seeds an Aadhaar-based lookup that auto-fills Mobile + Location
 *   age       — auto-computed (whole years) from Date of Birth, read-only
 *   homeLoan/monthlyRent — conditional on "Do you own a house?" (showIf)
 */
export interface IntakeSection {
  id: string;
  title: string;
  subtitle?: string;
  fields: FormFieldDef[];
  /** Repeater config — `fields` repeat per instance. */
  repeat?: { min: number; max: number; seed: number; itemLabel: string };
  /** Section is a file-upload declaration step (special-rendered). */
  declaration?: boolean;
  /** Section is the free-form Notes + Dictate step (special-rendered). */
  notes?: boolean;
}

/**
 * EVERY field in the Candidate Interview Form is mandatory — the only fields we
 * never require are derived/read-only ones (e.g. the auto-computed Age, which
 * fills itself from Date of Birth). This is the single source of truth for
 * "is this field required"; the per-field `required` flags below are now purely
 * cosmetic hints and are no longer what drives the completion gate.
 */
export function isRequiredField(f: FormFieldDef): boolean {
  return !f.readOnly && f.compute == null && !f.optional;
}

const YN: string[] = ["Yes", "No"];

/** Seed list for the Interview Positions master (admins add/remove live). */
export const DEFAULT_POSITIONS: string[] = [
  "First-Year Intern",
  "Second-Year Intern",
  "Executive",
  "Senior Executive",
  "Assistant Manager",
  "Deputy Manager",
  "Senior Manager",
  "Consultant",
  "Senior Consultant",
  "General Manager",
  "Assistant Vice President",
  "Deputy Vice President",
  "Senior Vice President",
];

const EDU_FIELDS: FormFieldDef[] = [
  { key: "degree", label: "Degree / Diploma", type: "text", placeholder: "e.g. 10th / 12th / B.Com" },
  { key: "school", label: "Name of School / College", type: "text" },
  { key: "board", label: "Board / University", type: "text" },
  {
    key: "passingMonth",
    label: "Month of Passing",
    type: "select",
    options: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
  },
  { key: "passingYear", label: "Year of Passing", type: "text", placeholder: "e.g. 2019" },
  { key: "attempts", label: "Number of Attempts", type: "number" },
  { key: "percentage", label: "Percentage / CGPA", type: "text", placeholder: "e.g. 78% / 8.2" },
  // Backlogs / ATKTs now sit UNDER each qualification (was the "Academic Summary"
  // section). Optional — many qualifications have none.
  { key: "backlogs", label: "Backlogs / ATKTs (if any)", type: "text", optional: true, placeholder: "e.g. 0 / None / 2" },
  // Academic gap now sits UNDER each qualification (was a separate section).
  { key: "gap", label: "Academic Gap after this?", type: "buttons", options: YN },
];

const FAMILY_FIELDS: FormFieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true, span: 6 },
  { key: "relationship", label: "Relationship", type: "text", required: true, span: 6 },
  { key: "phone", label: "Phone Number", type: "tel", optional: true, span: 6 },
  { key: "email", label: "Email Address", type: "email", optional: true, span: 6 },
];

const PREV_WORK_FIELDS: FormFieldDef[] = [
  { key: "org", label: "Organisation Name", type: "text" },
  { key: "designation", label: "Designation", type: "text" },
  { key: "reportedTo", label: "Reported To", type: "text" },
  { key: "reportees", label: "Number of People Reporting to You", type: "number", placeholder: "0" },
  { key: "from", label: "Date of Joining", type: "date" },
  { key: "to", label: "Date of Leaving", type: "date" },
  { key: "totalExp", label: "Total Experience", type: "text", readOnly: true, compute: "expFromRange" },
  { key: "reason", label: "Reason for Leaving", type: "textarea" },
  { key: "gap", label: "Career Gap (if any)", type: "text", optional: true },
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: "personal",
    title: "Personal Details",
    subtitle: "The candidate's core information.",
    fields: [
      // Row 1 — Position · Department · Aadhaar (three across).
      { key: "position", label: "Position Applied For", type: "select", optionsFrom: "positions", required: true, span: 4 },
      { key: "department", label: "Department", type: "select", optionsFrom: "departments", required: true, span: 4 },
      { key: "aadhaar", label: "Aadhaar Card Number", type: "text", placeholder: "12-digit Aadhaar number", aadhaarLookup: true, required: true, span: 4 },
      // Row 2 — Full Name (wide) · Date of Birth · Age.
      { key: "fullName", label: "Full Name", type: "text", required: true, span: 6 },
      { key: "dob", label: "Date of Birth", type: "date", required: true, span: 3 },
      { key: "age", label: "Age", type: "number", readOnly: true, compute: "ageFromDob", span: 3 },
      // Row 3 — Gender (span 5) · Marital Status (span 7) side by side; both force
      // their chips onto ONE line (nowrap).
      { key: "gender", label: "Gender", type: "buttons", options: ["Male", "Female", "Prefer not to say"], required: true, span: 5, nowrap: true },
      { key: "marital", label: "Marital Status", type: "buttons", options: ["Single", "Married", "Divorced", "Separated", "Widowed"], required: true, span: 7, nowrap: true },
      // Hidden for "Single"; shown for every other marital status.
      { key: "children", label: "Number of Children", type: "text", placeholder: "e.g. 0 / 2", showIf: { key: "marital", value: ["Married", "Divorced", "Separated", "Widowed"] } },
      { key: "ownHouse", label: "Do you own a house?", type: "buttons", options: YN, required: true },
      { key: "homeLoan", label: "Outstanding Home Loan, if any", type: "text", showIf: { key: "ownHouse", value: "Yes" }, optional: true },
      { key: "homeLoanEmi", label: "EMI (Monthly)", type: "text", showIf: { key: "ownHouse", value: "Yes" }, optional: true },
      { key: "monthlyRent", label: "Monthly Rent", type: "text", showIf: { key: "ownHouse", value: "No" } },
      { key: "sizeOfHouse", label: "Size of House", type: "select", options: ["1 RK", "1 BHK", "2 BHK", "3 BHK"] },
      { key: "bathroom", label: "Bathroom", type: "select", options: ["Inside", "Outside"] },
      { key: "nativePlace", label: "Native Place", type: "text", required: true },
      { key: "mobile", label: "Mobile Number", type: "tel", required: true },
      { key: "email", label: "Email Address", type: "email", required: true },
      // Structured address (replaces the old single "Location"). Aadhaar auto-fill
      // populates these. Line 1 + City + Pincode + State are mandatory.
      { key: "addressLine1", label: "Address Line 1", type: "text", required: true },
      { key: "addressLine2", label: "Address Line 2", type: "text", optional: true },
      { key: "addressLine3", label: "Address Line 3", type: "text", optional: true },
      { key: "addressLine4", label: "Address Line 4", type: "text", optional: true },
      { key: "landmark", label: "Nearby Landmark", type: "text", optional: true },
      { key: "city", label: "City", type: "text", required: true },
      { key: "pincode", label: "Pincode", type: "text", required: true, placeholder: "6-digit PIN" },
      { key: "state", label: "State", type: "text", required: true },
      { key: "interviewed6mo", label: "Interviewed by us in the last six months?", type: "buttons", options: YN, required: true },
      { key: "differentlyAbled", label: "Differently abled?", type: "buttons", options: YN, required: true },
      // ── Health & Habits — grouped block (contiguous, shared sub-heading) ──
      { key: "smoke", label: "Do you smoke?", type: "buttons", options: YN, required: true, groupLabel: "Health & Habits" },
      { key: "alcohol", label: "Do you consume alcohol?", type: "buttons", options: YN, required: true, groupLabel: "Health & Habits" },
      { key: "policeRecord", label: "Do you have a police record?", type: "buttons", options: YN, required: true, groupLabel: "Health & Habits" },
      { key: "majorIllness", label: "History of any major illness?", type: "buttons", options: YN, required: true },
      { key: "majorIllnessDetails", label: "Please describe the illness", type: "textarea", showIf: { key: "majorIllness", value: "Yes" } },
      { key: "source", label: "How did you learn about the opening?", type: "select", options: ["Company Website", "Friend or Relative", "Job Portal", "HR Agency", "Social Media", "Other"], span: 6 },
      { key: "sourceOther", label: "Please specify", type: "text", showIf: { key: "source", value: "Other" } },
    ],
  },
  {
    id: "education",
    title: "Education",
    subtitle: "Add each qualification — 10th, 12th and beyond.",
    repeat: { min: 1, max: 5, seed: 2, itemLabel: "Qualification" },
    fields: EDU_FIELDS,
  },
  {
    id: "currentWork",
    title: "Latest Work Experience",
    subtitle: "Every field is required — capture the candidate's most recent role in full.",
    fields: [
      { key: "org", label: "Organisation Name", type: "text" },
      { key: "designation", label: "Designation", type: "text" },
      { key: "reportsToName", label: "Reported To (Name)", type: "text" },
      { key: "reportsToDesignation", label: "Reported To (Designation)", type: "text" },
      { key: "reportees", label: "Number of People Reporting to You", type: "number", placeholder: "0" },
      { key: "totalExp", label: "Total Experience", type: "text", placeholder: "e.g. 3 yrs 2 mo" },
      { key: "fixedSalary", label: "Fixed Salary (Per-Annum CTC)", type: "text" },
      { key: "bonus", label: "Bonus / Incentive (Per-Annum CTC)", type: "text" },
      { key: "monthlySalary", label: "Monthly Salary", type: "text", readOnly: true, compute: "monthlyFromCtc" },
      { key: "totalSalary", label: "Total Salary", type: "text" },
      { key: "startTime", label: "Start Time", type: "text", placeholder: "e.g. 10:00 AM" },
      { key: "endTime", label: "End Time", type: "text", placeholder: "e.g. 7:00 PM" },
      { key: "satWorking", label: "Saturday Working", type: "buttons", options: YN },
      { key: "sunWorking", label: "Sunday Working", type: "buttons", options: YN },
      { key: "openSunday", label: "Open to Work on Sunday", type: "buttons", options: YN },
      { key: "sitTill9", label: "Open to working till 9 PM?", type: "buttons", options: YN },
      { key: "languages", label: "Languages Known", type: "text" },
      // Moved to the END of the work-experience block (was mid-section).
      { key: "totalJobs", label: "Total Number of Jobs", type: "number" },
    ],
  },
  {
    id: "prevWork",
    title: "Previous Work Experience",
    subtitle: "Add each past employer — at least one entry is required.",
    repeat: { min: 1, max: 3, seed: 1, itemLabel: "Previous" },
    fields: PREV_WORK_FIELDS,
  },
  {
    id: "family",
    title: "Family Details",
    subtitle: "Add each family member.",
    repeat: { min: 2, max: 6, seed: 2, itemLabel: "Member" },
    fields: FAMILY_FIELDS,
  },
  {
    id: "notes",
    title: "Anything you wish to tell us about yourself",
    subtitle: "Free-form — type it, or use Dictate to capture it by voice.",
    notes: true,
    fields: [
      { key: "notes", label: "Anything you wish to tell us about yourself", type: "textarea", required: true },
    ],
  },
  {
    id: "declaration",
    title: "Declaration & Sign-off",
    subtitle: "Recruiter remarks and confirmation.",
    declaration: true,
    fields: [
      { key: "name", label: "Recruiter's Name", type: "text", required: true },
      { key: "recruiterEmail", label: "Through whom did you come to us? (Recruiter Email)", type: "email", optional: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "declarationAgree", label: "I confirm that the information provided above is true and correct to the best of my knowledge.", type: "buttons", options: ["I Agree"], required: true },
    ],
  },
];

/** Composite value key. */
export function vkey(sectionId: string, fieldKey: string, instance?: number): string {
  return instance == null ? `${sectionId}.${fieldKey}` : `${sectionId}.${instance}.${fieldKey}`;
}

/** Who is filling the form. "candidate" hides the recruiter-only fields. */
export type IntakeMode = "hr" | "candidate";

/**
 * Fields the RECRUITER fills, never the candidate — the ONE source of truth for
 * both hiding (the wizard renders `sectionsForMode`) and server rejection (the
 * owner-scoped save strips these keys). Composite `sectionId.fieldKey`.
 */
export const RECRUITER_ONLY_KEYS = [
  "declaration.remarks",
  "declaration.name",
  "declaration.recruiterEmail",
] as const;

/** The sections shown for a given mode — candidate mode strips recruiter fields
 *  from the Declaration step (progress + the completion gate auto-follow). */
export function sectionsForMode(mode: IntakeMode): IntakeSection[] {
  if (mode === "hr") return INTAKE_SECTIONS;
  const hidden = new Set<string>(RECRUITER_ONLY_KEYS);
  return INTAKE_SECTIONS.map((s) => ({
    ...s,
    fields: s.fields.filter((f) => !hidden.has(`${s.id}.${f.key}`)),
  }));
}

/** {fieldKey -> current value} view of one flat (non-repeat) section — for showIf. */
function sectionView(s: IntakeSection, values: Record<string, string>): Record<string, string> {
  const view: Record<string, string> = {};
  for (const f of s.fields) view[f.key] = values[vkey(s.id, f.key)] ?? "";
  return view;
}

/** {fieldKey -> current value} view of one repeater instance — for showIf. */
function instanceView(s: IntakeSection, uid: string, values: Record<string, string>): Record<string, string> {
  const view: Record<string, string> = {};
  for (const f of s.fields) view[f.key] = values[`${s.id}.${uid}.${f.key}`] ?? "";
  return view;
}

/**
 * Required VALUE keys for one section. EVERY visible field is mandatory (see
 * isRequiredField); showIf-hidden fields (e.g. Home Loan vs Monthly Rent) and
 * derived fields (Age) are excluded, and repeaters require ALL of their current
 * instances — not just the first. Depends on `values` because visibility (and
 * therefore which keys count) changes as the form is filled.
 */
export function sectionRequiredKeys(
  s: IntakeSection,
  values: Record<string, string>,
  instances: Record<string, string[]>,
): string[] {
  if (s.repeat) {
    const ids = instances[s.id] ?? [];
    const out: string[] = [];
    for (const uid of ids) {
      for (const f of visibleFields(s.fields, instanceView(s, uid, values))) {
        if (isRequiredField(f)) out.push(`${s.id}.${uid}.${f.key}`);
      }
    }
    return out;
  }
  return visibleFields(s.fields, sectionView(s, values))
    .filter(isRequiredField)
    .map((f) => vkey(s.id, f.key));
}

/** All required value keys across the whole form. */
export function intakeRequiredKeys(
  values: Record<string, string>,
  instances: Record<string, string[]>,
): string[] {
  return INTAKE_SECTIONS.flatMap((s) => sectionRequiredKeys(s, values, instances));
}

/**
 * 0-100 completion %, counting the required value keys.
 *
 * The Declaration photograph + signature uploads USED to count as two extra
 * required units here (Sir: both removed 2026-08-20). They are gone from the
 * form entirely, so counting them would have pinned every completed record at
 * roughly 95% forever — and the same number drives the wizard progress bar and
 * the draft/Records "X% done" label, so both would have been wrong together.
 */
export function intakeProgress(
  values: Record<string, string>,
  instances: Record<string, string[]>,
): number {
  const keys = intakeRequiredKeys(values, instances);
  const filled = keys.filter((k) => (values[k] ?? "").trim() !== "").length;
  return Math.round((filled / Math.max(keys.length, 1)) * 100);
}

/** True once the form has ANY real content — the trigger to create the draft row. */
export function hasAnyContent(values: Record<string, string>): boolean {
  return Object.values(values).some((v) => (v ?? "").trim() !== "");
}

/** Whole years between a yyyy-mm-dd date string and today; "" if unparseable. */
export function ageFromDob(dob: string): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : "";
}

/**
 * Human "X yrs Y mo" span between two yyyy-mm-dd dates (joining → leaving).
 * "" when either date is missing/unparseable or leaving precedes joining — used
 * for the read-only "Total Experience" per previous job.
 */
export function expFromRange(from: string, to: string): string {
  if (!from || !to) return "";
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return "";
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} Year${y === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} Month${m === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" ") : "0 Months";
}

/**
 * Round((fixedSalary + bonus) / 12) — the read-only "Monthly Salary" derived from
 * the two per-annum CTC amounts. Tolerates ₹ / commas / spaces in the inputs;
 * "" when the annual total is zero.
 */
export function monthlyFromCtc(fixed: string, bonus: string): string {
  const num = (s: string): number => {
    const n = Number((s ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const annual = num(fixed) + num(bonus);
  if (annual <= 0) return "";
  return String(Math.round(annual / 12));
}

/**
 * Auto-pick the family member's Gender from their Relationship — e.g. "Brother"
 * → Male, "Younger Sister" → Female, "Father-in-law" → Male. Returns null for
 * gender-neutral / unknown relationships (Cousin, Spouse, Guardian, Sibling,
 * Friend…) so those stay manual. Substring match handles qualifiers like
 * "Elder", "Step", "Real", "In-law".
 */
export function genderForRelationship(rel: string): "Male" | "Female" | null {
  const r = rel.trim().toLowerCase();
  if (!r) return null;
  const MALE = ["father", "dad", "papa", "brother", "bro", "son", "husband", "hubby", "grandfather", "grandpa", "uncle", "nephew", "grandson"];
  const FEMALE = ["mother", "mom", "mum", "sister", "sis", "daughter", "wife", "grandmother", "grandma", "aunt", "niece", "granddaughter"];
  // Check MALE first — no female term is a substring of a male relationship.
  if (MALE.some((m) => r.includes(m))) return "Male";
  if (FEMALE.some((f) => r.includes(f))) return "Female";
  return null;
}
