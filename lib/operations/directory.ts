/**
 * OPERATIONS → DIRECTORY — every outside vendor Altus Corp works with.
 *
 * PURE + CLIENT-SAFE (no DB, no server-only), same shape as lib/hr/registers.ts.
 * Two consumers must agree on what a valid row is: the bulk-upload review (so a
 * row it calls "OK" is never refused on Create) and the server actions in
 * app/(app)/operations/directory/actions.ts (which are the rule). Both call
 * `vendorErrors` below rather than keeping two copies of the checks.
 */

/**
 * WHO MAY ADD, EDIT, DELETE OR BULK-UPLOAD — `isHrStaff` (lib/hr/access.ts):
 * HR staff, or a super-admin. Asked by the actions file and the page directly,
 * because it reads the person's departments and this module must stay pure.
 * Everyone who can open Operations can view.
 */

/** Suggested categories. The field stays free text — the list only speeds typing. */
/** One vendor as the form and the bulk grid hold it: every text field a string. */
export interface VendorFields {
  category: string;
  firstName: string;
  lastName: string;
  companyName: string;
  cellNo: string;
  whatsappCellNo: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  addressLine4: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  website: string;
  amc: boolean;
  officeOpenTime: string;
  officeEndTime: string;
  businessCardFrontPath: string;
  businessCardBackPath: string;
  cataloguePath: string;
  additionalLinks: string;
  notes: string;
}

export type VendorTextKey = Exclude<keyof VendorFields, "amc">;

export const EMPTY_VENDOR: VendorFields = {
  category: "",
  firstName: "",
  lastName: "",
  companyName: "",
  cellNo: "",
  whatsappCellNo: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  addressLine3: "",
  addressLine4: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  website: "",
  amc: false,
  officeOpenTime: "",
  officeEndTime: "",
  businessCardFrontPath: "",
  businessCardBackPath: "",
  cataloguePath: "",
  additionalLinks: "",
  notes: "",
};

/**
 * The columns, in the order the template, the grid and a header-less paste use.
 * `aliases` let a spreadsheet with its own header wording ("Mobile", "PIN",
 * "E-mail") still land in the right field — matched with punctuation and case
 * stripped, so "Address Line 1" and "address_line1" are the same header.
 */
export const VENDOR_COLUMNS: { key: keyof VendorFields; label: string; aliases: string[] }[] = [
  { key: "category", label: "Category", aliases: ["category", "type", "service", "vendor type"] },
  { key: "firstName", label: "First Name", aliases: ["first name", "firstname", "first", "name"] },
  { key: "lastName", label: "Last Name", aliases: ["last name", "lastname", "surname", "last"] },
  { key: "companyName", label: "Company Name", aliases: ["company name", "company", "organisation", "organization"] },
  { key: "cellNo", label: "Cell No", aliases: ["cell no", "cell", "cell number", "mobile", "mobile no", "phone", "phone no", "contact no"] },
  { key: "whatsappCellNo", label: "WhatsApp Cell No", aliases: ["whatsapp cell no", "whatsapp number", "whatsapp", "whatsapp no"] },
  { key: "email", label: "Email Address", aliases: ["email address", "email", "e-mail", "mail"] },
  { key: "addressLine1", label: "Address Line 1", aliases: ["address line 1", "address 1", "line 1", "address"] },
  { key: "addressLine2", label: "Address Line 2", aliases: ["address line 2", "address 2", "line 2"] },
  { key: "addressLine3", label: "Address Line 3", aliases: ["address line 3", "address 3", "line 3"] },
  { key: "addressLine4", label: "Address Line 4", aliases: ["address line 4", "address 4", "line 4"] },
  { key: "landmark", label: "Nearby Landmark", aliases: ["nearby landmark", "landmark"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "state", label: "State", aliases: ["state"] },
  { key: "pincode", label: "Pincode", aliases: ["pincode", "pin code", "pin", "zip", "postal code"] },
  { key: "website", label: "Website", aliases: ["website", "web", "url", "site"] },
  { key: "amc", label: "AMC", aliases: ["amc", "amc yes no", "under amc"] },
  { key: "officeOpenTime", label: "Vendor Office Open Time", aliases: ["vendor office open time", "office open time", "open time"] },
  { key: "officeEndTime", label: "Vendor Office End Time", aliases: ["vendor office end time", "office end time", "close time", "end time"] },
  { key: "additionalLinks", label: "Additional Links", aliases: ["additional links", "links", "other links"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "remarks", "comments"] },
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A spreadsheet header → the field it fills, or null when it matches none. */
export function vendorColumnForHeader(header: string): keyof VendorFields | null {
  const h = squash(header);
  if (!h) return null;
  return VENDOR_COLUMNS.find((c) => c.aliases.some((a) => squash(a) === h))?.key ?? null;
}

/** "Yes/No/Y/N/true/1" → boolean. Blank means no AMC; anything else is null (unreadable). */
export function parseAmc(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (!s || ["no", "n", "false", "0", "none", "-"].includes(s)) return false;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  return null;
}

export function normalizePincode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** "altuscorp.com" → "https://altuscorp.com", so the saved link actually opens. */
export function normalizeWebsite(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Every problem with a row, in words a person can act on. Empty = valid. */
export function vendorErrors(v: VendorFields): string[] {
  const errors: string[] = [];
  if (!v.firstName.trim()) errors.push("First Name is required");
  if (!v.lastName.trim()) errors.push("Last Name is required");
  if (!v.companyName.trim()) errors.push("Company Name is required");
  if (!v.cellNo.trim()) errors.push("Cell No is required");
  if (!v.whatsappCellNo.trim()) errors.push("WhatsApp Cell No is required");
  if (!v.category.trim()) errors.push("Category is required");
  if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) errors.push("Email is not valid");
  const pin = normalizePincode(v.pincode);
  if (pin && !/^\d{6}$/.test(pin)) errors.push("Pincode must be 6 digits");
  if (v.officeOpenTime && !TIME_RE.test(v.officeOpenTime)) errors.push("Vendor Office Open Time must be HH:MM");
  if (v.officeEndTime && !TIME_RE.test(v.officeEndTime)) errors.push("Vendor Office End Time must be HH:MM");
  return errors;
}

export function vendorFullName(v: { firstName: string; lastName: string | null }): string {
  return [v.firstName, v.lastName].filter(Boolean).join(" ");
}

/**
 * Two rows are the same vendor when the name AND the cell number match. The cell
 * is part of the key because a common first name ("Ramesh, Electrician" and
 * "Ramesh, Plumber") is not a duplicate; a blank cell falls back to name alone.
 */
export function vendorDupKey(v: { firstName: string; lastName: string | null; cellNo: string | null }): string {
  const digits = (v.cellNo ?? "").replace(/\D/g, "").slice(-10);
  return `${squash(v.firstName)}|${squash(v.lastName ?? "")}|${digits}`;
}
