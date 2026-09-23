/**
 * CLIENT ENGAGEMENT — the fixed vocabulary (rebuild, 2026-09-18).
 *
 * P / C / A:
 *   P  Participants — PS and BSS. Both belong to a BATCH.
 *   C  Clients      — Retainer and Corporate consulting. No batch.
 *   A  Ambassadors  — channel partners.
 *
 * Every code here is mirrored by a CHECK in migration 0238, so adding one means
 * changing both.
 *
 * PURE + CLIENT-SAFE.
 */

export type CeGroup = "P" | "C" | "A";

export const CE_GROUPS: readonly { code: CeGroup; label: string; plural: string }[] = [
  { code: "P", label: "Participant", plural: "Participants" },
  { code: "C", label: "Client", plural: "Clients" },
  { code: "A", label: "Ambassador", plural: "Ambassadors" },
];

export type CeCategory = "retainer" | "ambassador" | "ps" | "bss" | "corporate";

export interface CeCategoryMeta {
  code: CeCategory;
  /** The product, as a dropdown shows it. */
  label: string;
  /** The section heading, numbered as the brief numbers them. */
  section: string;
  group: CeGroup;
  /** PS and BSS carry a batch number; nothing else does. */
  batch: boolean;
}

/** In the brief's section order: 1 Retainer … 5 Corporate. */
export const CE_CATEGORIES: readonly CeCategoryMeta[] = [
  { code: "retainer", label: "Retainer", section: "Retainer Clients", group: "C", batch: false },
  { code: "ambassador", label: "Ambassador", section: "Ambassadors", group: "A", batch: false },
  { code: "ps", label: "PS", section: "PS Participants", group: "P", batch: true },
  { code: "bss", label: "BSS", section: "BSS Participants", group: "P", batch: true },
  { code: "corporate", label: "Corporate", section: "Corporate Consulting Clients", group: "C", batch: false },
];

export const CE_CATEGORY_CODES: readonly string[] = CE_CATEGORIES.map((c) => c.code);

export function categoryOf(code: string | null | undefined): CeCategoryMeta | null {
  return CE_CATEGORIES.find((c) => c.code === code) ?? null;
}

export function isCeCategory(code: string | null | undefined): code is CeCategory {
  return CE_CATEGORY_CODES.includes(code ?? "");
}

export function categoryNeedsBatch(code: string | null | undefined): boolean {
  return categoryOf(code)?.batch ?? false;
}

export function groupOf(code: string | null | undefined): CeGroup {
  return categoryOf(code)?.group ?? "C";
}

/** "ABC Shah (79)" — the name as every grid prints it. */
export function accountLabel(name: string, batchCode?: string | null): string {
  const batch = (batchCode ?? "").trim();
  return batch ? `${name} (${batch})` : name;
}

/* ── Calls ────────────────────────────────────────────────────────────── */

/** The four call types (confirmed 2026-09-18: HH, Tool, Check-in, Reference). */
export const CE_CALL_TYPES = [
  { code: "hh", label: "Handholding Call", short: "HH" },
  { code: "tool", label: "Tool Call", short: "Tool" },
  { code: "checkin", label: "Check-in Call", short: "Check-in" },
  { code: "reference", label: "Reference Call", short: "Reference" },
] as const;

export type CeCallType = (typeof CE_CALL_TYPES)[number]["code"];

export const CE_CALL_TYPE_CODES: readonly string[] = CE_CALL_TYPES.map((c) => c.code);

export function callTypeLabel(code: string, short = false): string {
  const t = CE_CALL_TYPES.find((c) => c.code === code);
  return t ? (short ? t.short : t.label) : code;
}

export const CE_DAYS = [
  { code: "mon", label: "Monday", short: "Mon" },
  { code: "tue", label: "Tuesday", short: "Tue" },
  { code: "wed", label: "Wednesday", short: "Wed" },
  { code: "thu", label: "Thursday", short: "Thu" },
  { code: "fri", label: "Friday", short: "Fri" },
  { code: "sat", label: "Saturday", short: "Sat" },
  { code: "sun", label: "Sunday", short: "Sun" },
] as const;

export type CeDay = (typeof CE_DAYS)[number]["code"];

export const CE_DAY_CODES: readonly string[] = CE_DAYS.map((d) => d.code);

export function dayLabel(code: string): string {
  return CE_DAYS.find((d) => d.code === code)?.label ?? code;
}

/** Durations the form offers; any whole number of minutes that fits is accepted. */
export const CE_DURATIONS: readonly number[] = [5, 10, 15, 20, 30, 45, 60, 90, 120];

/* ── The working window ───────────────────────────────────────────────── */

/** The calendar runs 10:00 to 20:00 and nothing outside it (DB CHECK too). */
export const CE_DAY_START = "10:00";
export const CE_DAY_END = "20:00";
export const CE_DAY_START_MIN = 10 * 60;
export const CE_DAY_END_MIN = 20 * 60;

/* ── Team ─────────────────────────────────────────────────────────────── */

export const CE_ROLES = [
  { code: "coach", label: "Coach" },
  { code: "consultant", label: "Consultant" },
  { code: "account_manager", label: "Account Manager" },
  { code: "admin", label: "Admin" },
] as const;

export const CE_ROLE_CODES: readonly string[] = CE_ROLES.map((r) => r.code);

export function roleLabel(code: string): string {
  return CE_ROLES.find((r) => r.code === code)?.label ?? code;
}

/* ── References ───────────────────────────────────────────────────────── */

export const CE_REFERENCE_PROGRAMS = [
  { code: "bss", label: "BSS" },
  { code: "bss_c", label: "BSS/C" },
  { code: "general", label: "General" },
] as const;

export const CE_REFERENCE_PROGRAM_CODES: readonly string[] = CE_REFERENCE_PROGRAMS.map((p) => p.code);

export function referenceProgramLabel(code: string): string {
  return CE_REFERENCE_PROGRAMS.find((p) => p.code === code)?.label ?? code;
}

export const CE_FREQUENCIES = [
  { code: "one_time", label: "One Time" },
  { code: "every_week", label: "Every Week" },
] as const;

export const CE_FREQUENCY_CODES: readonly string[] = CE_FREQUENCIES.map((f) => f.code);

export function frequencyLabel(code: string): string {
  return CE_FREQUENCIES.find((f) => f.code === code)?.label ?? code;
}
