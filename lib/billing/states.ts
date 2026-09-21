/**
 * The statutory GST state codes.
 *
 * Not business data — this is the government's own numbering, the first two
 * characters of every GSTIN, and it is what decides CGST+SGST versus IGST. It
 * belongs in code for the same reason the financial-year boundary does: it is a
 * rule, not a preference, and nobody should be typing "27" by hand.
 */

export interface GstState {
  code: string;
  name: string;
}

export const GST_STATES: GstState[] = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
  { code: "96", name: "Other Country" },
];

const BY_CODE = new Map(GST_STATES.map((s) => [s.code, s]));
const BY_NAME = new Map(GST_STATES.map((s) => [s.name.toLowerCase(), s]));

export function stateByCode(code: string | null | undefined): GstState | null {
  return code ? (BY_CODE.get(code.trim()) ?? null) : null;
}

export function stateByName(name: string | null | undefined): GstState | null {
  return name ? (BY_NAME.get(name.trim().toLowerCase()) ?? null) : null;
}

/** The state a GSTIN belongs to, read off its first two digits. */
export function stateFromGstin(gstin: string | null | undefined): GstState | null {
  const code = gstin?.trim().slice(0, 2);
  return stateByCode(code);
}
