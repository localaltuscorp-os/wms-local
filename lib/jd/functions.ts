import { FUNCTION_LABELS, type BusinessFunction } from "@/lib/org/functions";

/**
 * THE SEVEN FUNCTIONS a job description or a checklist can belong to
 * (account holder, 2026-09-12).
 *
 * ── WHY THIS IS A SUBSET AND NOT THE MASTER LIST ─────────────────────────
 * The firm's function master holds NINE — these seven plus Sales and Others —
 * and both are live: employees carry them, the org chart groups by them, the
 * dashboards count by them. Editing the master down to seven would not remove
 * Sales from the company, it would remove the LABEL from rows that still hold
 * the key, and a Sales employee would start rendering as a blank chip
 * everywhere.
 *
 * So the master stays as it is and this narrows what the JD Bank and the
 * Operations checklists OFFER. The distinction matters in one direction only:
 * anything already stored still reads correctly — `FUNCTION_LABELS` is
 * untouched — while nothing new can be filed under a function these two
 * features do not use.
 *
 * ── IF A SALES SEAT ALREADY EXISTS ───────────────────────────────────────
 * It keeps working and keeps its label; it simply cannot be chosen again from
 * these pickers. `isOfferedFunction` is what a screen uses to decide whether to
 * flag such a row for reassignment rather than silently hiding it.
 */
export const JD_FUNCTIONS: readonly BusinessFunction[] = [
  "marketing",
  "operations",
  "handholding",
  "hr",
  "admin",
  "accounts",
  "apps",
] as const;

/** The picker's options, label and all — ordered as the account holder listed them. */
export const JD_FUNCTION_OPTIONS: readonly { key: BusinessFunction; label: string }[] =
  JD_FUNCTIONS.map((key) => ({ key, label: FUNCTION_LABELS[key] }));

/** Is this one of the seven, or a function inherited from before the narrowing? */
export function isOfferedFunction(key: string): boolean {
  return (JD_FUNCTIONS as readonly string[]).includes(key);
}

/**
 * The checklist code prefix for each function — `HR-001`, `IT-E-001`.
 *
 * Spelled out rather than derived from the key: `apps` would abbreviate to APP
 * and the business writes IT, `handholding` would give HAN. A prefix appears on
 * printed sheets and in messages, so it is chosen, not computed.
 */
export const FUNCTION_CODE_PREFIX: Record<BusinessFunction, string> = {
  marketing: "MKT",
  operations: "OPS",
  handholding: "HH",
  hr: "HR",
  admin: "ADM",
  accounts: "ACC",
  apps: "IT",
  sales: "SLS",
  others: "OTH",
};
