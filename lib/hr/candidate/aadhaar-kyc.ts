/**
 * Aadhaar KYC — provider-agnostic response-mapping layer for the Candidate
 * Interview Form's Aadhaar auto-fill.
 *
 * This module is PURE (no db / env / server-only / node imports) so it stays
 * cheap to test and safe to import from the route handler. It takes whatever
 * JSON a licensed Indian KYC/DigiLocker-data provider returns and normalises it
 * to the five fields the intake form can auto-fill:
 *
 *     { name, dob, gender, address, mobile }
 *
 * ⚠ AADHAAR ACT: this layer only ever reads back DEMOGRAPHIC fields the provider
 * chose to return for a consented lookup. It never echoes, stores, or logs the
 * 12-digit Aadhaar number itself — the number is only ever sent OUT to the
 * provider by the route, never round-tripped through here.
 *
 * Providers differ mainly in (a) which envelope key wraps the payload
 * (`data` / `result` / `response` / `kyc` / none) and (b) whether the address
 * is a flat string or a structured object. We support both via a small set of
 * named adapters, all of which fall back to a robust generic extractor.
 */

/** The normalized fields the intake form consumes. Empty string = "not found". */
export interface KycFields {
  name: string;
  dob: string;
  gender: string;
  address: string;
  mobile: string;
}

type Json = Record<string, unknown>;

const EMPTY: KycFields = { name: "", dob: "", gender: "", address: "", mobile: "" };

/** Known provider adapter keys (AADHAAR_LOOKUP_PROVIDER). */
export type KycProvider =
  | "generic"
  | "surepass"
  | "cashfree"
  | "sandbox"
  | "signzy"
  | "karza"
  | "zoop"
  | "gridlines";

const KNOWN_PROVIDERS: readonly KycProvider[] = [
  "generic",
  "surepass",
  "cashfree",
  "sandbox",
  "signzy",
  "karza",
  "zoop",
  "gridlines",
];

/** Normalise an arbitrary env string to a known adapter key (defaults to generic). */
export function resolveProvider(value: string | undefined | null): KycProvider {
  const v = (value ?? "").trim().toLowerCase();
  return (KNOWN_PROVIDERS as readonly string[]).includes(v)
    ? (v as KycProvider)
    : "generic";
}

function isJson(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/**
 * Descend through common envelope keys to reach the object that actually holds
 * the demographic fields. Providers wrap the useful payload one or two levels
 * deep under keys like `data`, `result`, `response`, `kyc`, `kycData`.
 */
function unwrap(raw: Json, provider: KycProvider): Json {
  // Provider-specific primary envelope first.
  const primaryByProvider: Partial<Record<KycProvider, string[]>> = {
    surepass: ["data"],
    cashfree: ["data"],
    sandbox: ["data", "result"],
    signzy: ["result", "response"],
    karza: ["result"],
    zoop: ["result"],
    gridlines: ["data", "aadhaar_data"],
  };
  const order = [
    ...(primaryByProvider[provider] ?? []),
    "data",
    "result",
    "response",
    "kyc",
    "kycData",
    "aadhaar_data",
  ];
  let node: Json = raw;
  // Follow up to 3 nested envelopes as long as they wrap a single object.
  for (let depth = 0; depth < 3; depth++) {
    let advanced = false;
    for (const key of order) {
      const child = node[key];
      if (isJson(child)) {
        node = child;
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return node;
}

/** First non-empty aliased value from an object. */
function firstOf(obj: Json, ...keys: string[]): string {
  for (const k of keys) {
    const val = str(obj[k]);
    if (val) return val;
  }
  return "";
}

const NAME_KEYS = [
  "name",
  "full_name",
  "fullName",
  "name_on_card",
  "aadhaar_name",
  "user_full_name",
];
const DOB_KEYS = ["dob", "date_of_birth", "dateOfBirth", "birth_date", "yob"];
const GENDER_KEYS = ["gender", "sex"];
const MOBILE_KEYS = [
  "mobile",
  "phone",
  "mobile_number",
  "mobileNumber",
  "phone_number",
  "contact",
  "mobileNo",
];
const ADDRESS_KEYS = [
  "address",
  "full_address",
  "fullAddress",
  "addressString",
  "address_string",
  "permanent_address",
];

/** Ordered components used to assemble a structured address object into one line. */
const ADDRESS_PART_KEYS = [
  "care_of",
  "careOf",
  "co",
  "house",
  "building",
  "street",
  "landmark",
  "locality",
  "loc",
  "vtc",
  "village",
  "po",
  "post_office",
  "subdist",
  "sub_district",
  "district",
  "dist",
  "city",
  "state",
  "country",
  "pincode",
  "pin",
  "zip",
  "zipcode",
  "postal_code",
];

/** Turn an address value (string OR structured object) into a single clean line. */
function assembleAddress(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (isJson(value)) {
    // Prefer a ready-made flat address field if the object carries one.
    const flat = firstOf(value, ...ADDRESS_KEYS);
    if (flat) return flat;
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const k of ADDRESS_PART_KEYS) {
      const p = str(value[k]);
      if (p && !seen.has(p.toLowerCase())) {
        seen.add(p.toLowerCase());
        parts.push(p);
      }
    }
    if (parts.length) return parts.join(", ");
    // Last resort: join any string leaves.
    const leaves = Object.values(value)
      .map((v) => str(v))
      .filter(Boolean);
    return leaves.join(", ");
  }
  return "";
}

/** Extract the address from a node: a flat key, or a nested address object. */
function extractAddress(node: Json): string {
  const flat = firstOf(node, ...ADDRESS_KEYS);
  if (flat) return flat;
  for (const k of ["address", "addressData", "address_information", "addressInformation"]) {
    if (isJson(node[k])) return assembleAddress(node[k]);
  }
  return "";
}

/**
 * Normalise any provider's JSON response into KycFields. Provider-agnostic:
 * unwraps the common envelope for the named provider, then reads aliased keys.
 * Anything it can't find comes back as an empty string (never fabricated).
 */
export function mapKycResponse(raw: unknown, provider: KycProvider = "generic"): KycFields {
  if (!isJson(raw)) return { ...EMPTY };
  const node = unwrap(raw, provider);
  return {
    name: firstOf(node, ...NAME_KEYS),
    dob: firstOf(node, ...DOB_KEYS),
    gender: normalizeGender(firstOf(node, ...GENDER_KEYS)),
    address: extractAddress(node),
    mobile: normalizeMobile(firstOf(node, ...MOBILE_KEYS)),
  };
}

/** The 28 states + 8 union territories, longest-first so "Andhra Pradesh" wins
 *  over a bare "Pradesh"-style partial and multi-word names match before short ones. */
const INDIAN_STATES: readonly string[] = [
  "Andaman and Nicobar Islands", "Arunachal Pradesh", "Andhra Pradesh",
  "Dadra and Nagar Haveli and Daman and Diu", "Himachal Pradesh", "Madhya Pradesh",
  "Uttar Pradesh", "Jammu and Kashmir", "West Bengal", "Tamil Nadu",
  "Maharashtra", "Chhattisgarh", "Uttarakhand", "Telangana", "Karnataka",
  "Rajasthan", "Jharkhand", "Nagaland", "Meghalaya", "Mizoram", "Manipur",
  "Lakshadweep", "Puducherry", "Chandigarh", "Ladakh", "Gujarat", "Haryana",
  "Tripura", "Kerala", "Punjab", "Sikkim", "Assam", "Bihar", "Delhi", "Odisha", "Goa",
];

/** Structured address the intake form can auto-fill from a single KYC address line. */
export interface SplitAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
}

/**
 * Best-effort split of one flat address string into the intake form's structured
 * fields. Pulls out a 6-digit pincode and a recognised state name, treats the
 * comma-segment nearest the end as the city, and keeps the remainder as address
 * lines. Whatever can't be separated falls back into addressLine1 (never lost).
 * Pure — safe to call from the client.
 */
export function splitAddress(full: string): SplitAddress {
  const empty: SplitAddress = { addressLine1: "", addressLine2: "", city: "", state: "", pincode: "" };
  const s = (full ?? "").trim();
  if (!s) return empty;

  let rest = s;
  const pin = /(?<!\d)(\d{6})(?!\d)/.exec(rest)?.[1] ?? "";
  if (pin) rest = rest.replace(pin, " ");

  let state = "";
  for (const st of INDIAN_STATES) {
    const re = new RegExp(`(^|[,\\s])${st.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[,\\s])`, "i");
    if (re.test(rest)) {
      state = st;
      rest = rest.replace(re, "$1$2");
      break;
    }
  }

  const parts = rest
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Nearest comma-segment to the end = city; everything before it = address lines.
  let city = "";
  let lineParts = parts;
  if (parts.length > 1) {
    city = parts[parts.length - 1] ?? "";
    lineParts = parts.slice(0, -1);
  }

  const addressLine1 = lineParts.length ? lineParts.join(", ") : s;
  return { addressLine1, addressLine2: "", city, state, pincode: pin };
}

/** Map a provider gender token to one of the intake form's options. */
export function normalizeGender(g: string): string {
  const v = g.trim().toLowerCase();
  if (!v) return "";
  if (v === "m" || v.startsWith("male")) return "Male";
  if (v === "f" || v.startsWith("female")) return "Female";
  if (v === "t" || v.startsWith("trans") || v.startsWith("other")) return "Prefer not to say";
  return "";
}

/** Keep the last 10 digits of an Indian mobile number; "" if it isn't one. */
export function normalizeMobile(m: string): string {
  const digits = m.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

/**
 * Best-effort convert a provider DOB to the yyyy-mm-dd the intake <input
 * type="date"> expects. Handles dd-mm-yyyy / dd/mm/yyyy and yyyy-mm-dd; returns
 * "" for a bare year or anything unparseable (so we never write a bad date).
 */
export function normalizeDob(dob: string): string {
  const v = dob.trim();
  if (!v) return "";
  // Already yyyy-mm-dd (allow / or -).
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  // dd-mm-yyyy or dd/mm/yyyy.
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(v);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return "";
}
