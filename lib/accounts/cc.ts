/**
 * Client-SAFE helpers for the Credit Cards Master (no DB import). Reuses the
 * financial-year model from the Quarter/Month/Annual checklist so the two
 * sections navigate identically (FY Apr→Mar).
 */
export {
  FY_MONTHS,
  fyMonthCols,
  fyLabel,
  fyStartYearFor,
  calYearForFyMonth,
  MONTH_SHORT,
  MONTH_LABELS,
  type FyMonthCol,
} from "./monthly";

/** Fixed option sets for the per-month tracked fields. */
export const CC_YESNO = ["Yes", "No", "NA"] as const;
export const CC_TALLY = ["Done", "Pending", "NA"] as const;
export const CC_BALANCE = ["Tallied", "Pending", "NA"] as const;

/** Stable map key for one card's month record. */
export function ccMonthKey(cardId: string, month: number): string {
  return `${cardId}:${month}`;
}

/** Tone for the status-ish CC fields. */
export function ccTone(value: string | null | undefined): { bg: string; fg: string } | null {
  if (!value) return null;
  const s = value.trim().toLowerCase();
  if (["done", "tallied", "yes"].includes(s))
    return { bg: "color-mix(in srgb, var(--color-green) 16%, transparent)", fg: "var(--color-green-deep)" };
  if (s === "pending")
    return { bg: "color-mix(in srgb, var(--color-amber, #f59e0b) 20%, transparent)", fg: "var(--color-amber-deep, #b45309)" };
  if (["no", "na"].includes(s))
    return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-subtle)" };
  return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-soft)" };
}
