// Onboarding form — the exact field set (Sir, 2026-07-10), 7 sections, 51
// fields incl. 8 attachments and one conditional (current = permanent).
// Client-safe: drives the fill form, the read-only view, AND the server
// upload/validation — ONE source of truth. Every field is compulsory; where a
// field can't apply (no sibling, current = permanent), the person types "NA".

export type OnbFieldType = "text" | "tel" | "number" | "select" | "file" | "repeater";

/** Rendered width, sized to the data (keeps the form compact — no full-width
 *  sprawl). sm ≈ short codes/names, md ≈ phones/city, lg ≈ company/refs,
 *  xl ≈ full-row addresses + attachments. */
export type OnbWidth = "sm" | "md" | "lg" | "xl";

/** One column inside a repeater row (e.g. a single emergency contact's name). */
export interface OnbSubField {
  key: string;
  label: string;
  type: "text" | "tel";
  w: OnbWidth;
}

export interface OnbField {
  key: string;
  label: string;
  type: OnbFieldType;
  required?: boolean;
  hint?: string;
  options?: string[]; // select
  w: OnbWidth;
  /** repeater only — the per-row columns; ALL must be filled for a row to count. */
  sub?: OnbSubField[];
  /** repeater only — minimum complete rows required to submit. */
  min?: number;
  /** repeater only — maximum rows allowed. */
  max?: number;
  /** repeater only — how many empty rows to seed a fresh form with. */
  seed?: number;
  /** repeater only — singular noun for a row ("Emergency Contact"). */
  itemLabel?: string;
}

export interface OnbSection {
  key: string;
  title: string;
  hint?: string;
  fields: OnbField[];
}

// Every field compulsory (r = required:true), width sized to its data.
const r = true;

export const ONBOARDING_SECTIONS: OnbSection[] = [
  {
    key: "personal",
    title: "Personal Details",
    fields: [
      { key: "firstName", label: "First Name", type: "text", required: r, w: "sm" },
      { key: "middleName", label: "Middle Name", type: "text", required: r, hint: "NA if none", w: "sm" },
      { key: "lastName", label: "Last Name", type: "text", required: r, w: "sm" },
      { key: "phone", label: "Phone No", type: "tel", required: r, w: "md" },
      { key: "selfie", label: "Selfie (FaceCut · Plain BG)", type: "file", required: r, w: "lg" },
    ],
  },
  {
    key: "previous",
    title: "Previous Employment",
    hint: "Write NA everywhere if this is your first job.",
    fields: [
      { key: "lastCtc", label: "Last Drawn CTC (₹/yr)", type: "text", required: r, hint: "NA if first job", w: "md" },
      { key: "lastDesignation", label: "Designation", type: "text", required: r, w: "md" },
      { key: "lastCompanyName", label: "Last Company Name", type: "text", required: r, w: "lg" },
      { key: "lastCompanyAddress", label: "Last Company Address", type: "text", required: r, w: "xl" },
      { key: "lastSalaryCertificate", label: "Last Salary Certificate", type: "file", required: r, w: "lg" },
      { key: "lastSalaryBankProof", label: "Last Salary — bank proof", type: "file", required: r, w: "lg" },
    ],
  },
  {
    key: "verification",
    title: "Background Verification",
    hint: "Family + two references outside the family (friends / neighbours). Type NA where not applicable.",
    fields: [
      { key: "fatherName", label: "Father's Name", type: "text", required: r, w: "md" },
      { key: "fatherPhone", label: "Father's Phone", type: "tel", required: r, w: "md" },
      { key: "motherName", label: "Mother's Name", type: "text", required: r, w: "md" },
      { key: "motherPhone", label: "Mother's Phone", type: "tel", required: r, w: "md" },
      { key: "brotherName", label: "Brother's Name", type: "text", required: r, hint: "NA if none", w: "md" },
      { key: "brotherPhone", label: "Brother's Phone", type: "tel", required: r, hint: "NA if none", w: "md" },
      { key: "sisterName", label: "Sister's Name", type: "text", required: r, hint: "NA if none", w: "md" },
      { key: "sisterPhone", label: "Sister's Phone", type: "tel", required: r, hint: "NA if none", w: "md" },
      { key: "ref1Name", label: "Reference 1 Name", type: "text", required: r, w: "md" },
      { key: "ref1Phone", label: "Reference 1 Phone", type: "tel", required: r, w: "md" },
      { key: "ref2Name", label: "Reference 2 Name", type: "text", required: r, w: "md" },
      { key: "ref2Phone", label: "Reference 2 Phone", type: "tel", required: r, w: "md" },
    ],
  },
  {
    key: "emergency",
    title: "Emergency Contacts",
    hint: "At least TWO direct family members we can reach in an emergency — each with Name, Relation and Mobile Number.",
    fields: [
      {
        key: "emergencyContacts",
        label: "Emergency Contacts",
        type: "repeater",
        required: r,
        w: "xl",
        min: 2,
        max: 4,
        seed: 2,
        itemLabel: "Emergency Contact",
        sub: [
          { key: "name", label: "Name", type: "text", w: "md" },
          { key: "relation", label: "Relation", type: "text", w: "sm" },
          { key: "mobile", label: "Mobile Number", type: "tel", w: "md" },
        ],
      },
    ],
  },
  {
    key: "permanent",
    title: "Permanent Address",
    fields: [
      { key: "permAddr1", label: "Line 1 (House / Building / Society)", type: "text", required: r, w: "xl" },
      { key: "permAddr2", label: "Line 2 (Road / Nagar)", type: "text", required: r, w: "lg" },
      { key: "permAddr3", label: "Line 3 (Area / Suburb)", type: "text", required: r, w: "lg" },
      { key: "permCity", label: "City", type: "text", required: r, w: "sm" },
      { key: "permState", label: "State", type: "text", required: r, w: "sm" },
      { key: "permPincode", label: "Pincode", type: "text", required: r, w: "sm" },
      { key: "permLandmark", label: "Landmark", type: "text", required: r, w: "md" },
    ],
  },
  {
    key: "current",
    title: "Current Address",
    hint: "Choose YES if same as permanent — the fields fill automatically.",
    fields: [
      { key: "sameAsPermanent", label: "Same as Permanent?", type: "select", required: r, options: ["YES", "NO"], w: "sm" },
      { key: "currAddr1", label: "Line 1 (House / Building / Society)", type: "text", required: r, w: "xl" },
      { key: "currAddr2", label: "Line 2 (Road / Nagar)", type: "text", required: r, w: "lg" },
      { key: "currAddr3", label: "Line 3 (Area / Suburb)", type: "text", required: r, w: "lg" },
      { key: "currCity", label: "City", type: "text", required: r, w: "sm" },
      { key: "currState", label: "State", type: "text", required: r, w: "sm" },
      { key: "currPincode", label: "Pincode", type: "text", required: r, w: "sm" },
      { key: "currLandmark", label: "Landmark", type: "text", required: r, w: "md" },
    ],
  },
  {
    key: "native",
    title: "Native Place (if applicable)",
    hint: "Your home town / native place, if different from the addresses above. Optional — leave blank if not applicable.",
    fields: [
      { key: "nativeAddr", label: "Native Place Address (Village / Town / Area)", type: "text", w: "xl" },
      { key: "nativeCity", label: "District / City", type: "text", w: "sm" },
      { key: "nativeState", label: "State", type: "text", w: "sm" },
      { key: "nativePincode", label: "Pincode", type: "text", w: "sm" },
    ],
  },
  {
    key: "identification",
    title: "Identification Details",
    fields: [
      { key: "latestSelfie", label: "Latest Selfie", type: "file", required: r, w: "lg" },
      { key: "addressProof", label: "Address Proof", type: "file", required: r, w: "lg" },
      { key: "aadharNo", label: "Aadhar Card No", type: "text", required: r, w: "md" },
      { key: "aadharCopy", label: "Aadhaar Card", type: "file", required: r, hint: "Mandatory · clear scan/photo of your Aadhaar card", w: "lg" },
      { key: "panNo", label: "PAN Card No", type: "text", required: r, w: "sm" },
      { key: "panCopy", label: "PAN Card", type: "file", required: r, hint: "Mandatory · clear scan/photo of your PAN card", w: "lg" },
    ],
  },
  {
    key: "bank",
    title: "Bank Details",
    hint: "Salary will be credited to this account.",
    fields: [
      { key: "bankAccountName", label: "Account Name", type: "text", required: r, w: "md" },
      { key: "bankAccountNo", label: "Account No", type: "text", required: r, w: "md" },
      { key: "ifsCode", label: "IFSC", type: "text", required: r, w: "sm" },
      { key: "micrCode", label: "MICR", type: "text", required: r, w: "sm" },
      { key: "branchAddress", label: "Branch Address", type: "text", required: r, w: "lg" },
      { key: "branchCity", label: "Branch City", type: "text", required: r, w: "sm" },
      { key: "branchPincode", label: "Branch Pincode", type: "text", required: r, w: "sm" },
      {
        key: "cancelledCheque",
        label: "Cancelled Cheque / Passbook / Online Banking Screenshot",
        type: "file",
        required: r,
        hint: "Any ONE showing your Name & Account No — cancelled cheque, passbook first page, or a mobile/net-banking screenshot",
        w: "xl",
      },
      {
        key: "paymentQr",
        label: "UPI / Bank QR Code",
        type: "file",
        hint: "Optional · image of your payment QR (UPI / bank) to speed up stipend/salary payouts",
        w: "lg",
      },
    ],
  },
];

export const ONB_ALL_FIELDS: OnbField[] = ONBOARDING_SECTIONS.flatMap((s) => s.fields);
export const ONB_FILE_KEYS: string[] = ONB_ALL_FIELDS.filter((f) => f.type === "file").map((f) => f.key);
export const ONB_TEXT_FIELDS: OnbField[] = ONB_ALL_FIELDS.filter((f) => f.type !== "file");
export const ONB_FIELD_BY_KEY = new Map<string, OnbField>(ONB_ALL_FIELDS.map((f) => [f.key, f]));

/** Parse a repeater field's stored JSON string into rows (safe — never throws). */
export function parseRepeaterRows(raw: string | null | undefined): Record<string, string>[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is Record<string, string> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
  } catch {
    return [];
  }
}

/** A repeater row is "complete" only when every sub-column is filled. */
export function isRepeaterRowComplete(field: OnbField, row: Record<string, string>): boolean {
  return (field.sub ?? []).every((s) => String(row?.[s.key] ?? "").trim().length > 0);
}

/** Count how many complete rows a repeater's raw value holds (drives the min gate). */
export function countCompleteRepeaterRows(field: OnbField, raw: string | null | undefined): number {
  return parseRepeaterRows(raw).filter((row) => isRepeaterRowComplete(field, row)).length;
}

/** Normalise a repeater's raw value → trimmed, capped rows re-serialised to JSON. */
export function normaliseRepeaterValue(field: OnbField, raw: string | null | undefined): string {
  const rows = parseRepeaterRows(raw)
    .slice(0, field.max ?? 20)
    .map((row) => {
      const o: Record<string, string> = {};
      for (const s of field.sub ?? []) o[s.key] = String(row?.[s.key] ?? "").trim().slice(0, 200);
      return o;
    });
  return JSON.stringify(rows);
}

/** Permanent → current field pairs, used when "Same as Permanent" = YES. */
export const PERM_TO_CURR: [permKey: string, currKey: string][] = [
  ["permAddr1", "currAddr1"],
  ["permAddr2", "currAddr2"],
  ["permAddr3", "currAddr3"],
  ["permCity", "currCity"],
  ["permState", "currState"],
  ["permPincode", "currPincode"],
  ["permLandmark", "currLandmark"],
];

/** An attachment: either an uploaded file (path) OR a pasted link (Drive/URL). */
export interface OnboardingFileRef {
  path?: string; // storage key in the documents bucket (uploaded file)
  link?: string; // external URL (Google Drive / any link)
  fileName?: string;
  mime?: string | null;
  size?: number | null;
}

/** Accept list for the file picker — image / PDF / Word / Excel. */
export const ONB_ACCEPT = ".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv";

/** Flex sizing (basis / max px) per width bucket — keeps fields content-sized. */
export const ONB_WIDTH_PX: Record<OnbWidth, { basis: number; max: number | null }> = {
  sm: { basis: 130, max: 190 },
  md: { basis: 210, max: 300 },
  lg: { basis: 320, max: 480 },
  xl: { basis: 640, max: null },
};
