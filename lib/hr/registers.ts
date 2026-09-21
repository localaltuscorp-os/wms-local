/**
 * HR REGISTERS — Address Book of Resources + Asset Register.
 *
 * PURE + CLIENT-SAFE (no DB, no server-only), same shape as
 * lib/hr/holiday-admins.ts: a client component can hide a control the server
 * would refuse anyway. The server guards that USE this live in the two actions
 * files (app/(app)/hr/address-book/actions.ts, app/(app)/hr/assets/actions.ts).
 */

/**
 * WHO MAY ADD, EDIT OR DELETE — Ruchita, Rutvisha and Manan. Everyone else who
 * can open HR can only view. Keyed by login email (unique, survives a rename),
 * matching lib/teams/roster.ts and lib/hr/holiday-admins.ts.
 */
export const HR_REGISTER_EDITOR_EMAILS = [
  "ruchitaambre.altuscorp@gmail.com", // Ruchita Ambre
  "rutvishamehta.altuscorp@gmail.com", // Rutvisha Mehta
  "manan@unleashed.in", // Manan Vasa
] as const;

export function canEditHrRegisters(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (HR_REGISTER_EDITOR_EMAILS as readonly string[]).includes(e);
}

/* ------------------------------------------------------------------ */
/* Address Book                                                         */
/* ------------------------------------------------------------------ */

/** Suggested services. The field stays free text — "etc." means the list will grow. */
export const CONTACT_SERVICES = [
  "AC",
  "Aquaguard",
  "Broadband",
  "CCTV",
  "Carpenter",
  "Electrician",
  "Plumber",
  "Stationery",
  "Computer Repairs",
  "Pest Control",
  "Courier",
  "Other",
] as const;

/**
 * A WhatsApp click-to-chat link for an Indian number, or null when the number
 * can't be dialled. Opens WhatsApp (web or app) with the chat ready — no Meta
 * template, no cost, free text. A 10-digit number gets +91; a leading 0 is dropped.
 *
 * NOTE: this could later switch to sending from the company WhatsApp Business
 * number (lib/whatsapp) — that path only allows Meta-approved templates.
 */
export function whatsappHref(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  if (d.length < 11 || d.length > 15) return null;
  return `https://wa.me/${d}`;
}

/* ------------------------------------------------------------------ */
/* Asset Register                                                       */
/* ------------------------------------------------------------------ */

/**
 * The asset types and their code prefixes. The prefix is part of every issued
 * code (LAP-0001), so NEVER change an existing prefix — add a new type instead.
 */
export const ASSET_TYPES = [
  { label: "Laptop", prefix: "LAP" },
  { label: "Laptop Charger", prefix: "LCH" },
  { label: "Cell Phone", prefix: "PHN" },
  { label: "Cell Phone Charger", prefix: "PCH" },
  { label: "Printer", prefix: "PRN" },
  { label: "Licenses", prefix: "LIC" },
  { label: "Softwares", prefix: "SFT" },
  { label: "Monitor", prefix: "MON" },
  { label: "CPU", prefix: "CPU" },
  { label: "Keyboards", prefix: "KBD" },
  { label: "Mouse", prefix: "MOU" },
  { label: "Hard Disks", prefix: "HDD" },
  { label: "Gimble", prefix: "GMB" },
  { label: "Microphones", prefix: "MIC" },
  { label: "Projectors", prefix: "PRJ" },
  { label: "TV", prefix: "TV" },
  { label: "Other", prefix: "OTH" },
] as const;

export type AssetTypeLabel = (typeof ASSET_TYPES)[number]["label"];

export function isAssetType(v: string): v is AssetTypeLabel {
  return ASSET_TYPES.some((t) => t.label === v);
}

export function assetPrefix(type: string): string {
  return ASSET_TYPES.find((t) => t.label === type)?.prefix ?? "OTH";
}

/** "LAP" + 7 → "LAP-0007". Four digits, growing past 9999 without truncating. */
export function formatAssetCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}
