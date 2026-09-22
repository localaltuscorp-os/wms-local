import type { CatalogRow } from "@/lib/queries/incentive-catalog";
import { INCENTIVE_APPLICABILITY_LABELS } from "@/db/enums";

/**
 * ONE column contract for both Incentive Table exports.
 *
 * The PDF and the XLSX routes render the same rows in the same order with the
 * same labels, so a person comparing the two files never has to work out which
 * one is authoritative. Same split as lib/exports/tasks-rich.ts: the shape lives
 * here, the two routes only decide how to draw it.
 *
 * WHAT IS EXPORTED, AND WHY IT IS MORE THAN THE SCREEN SHOWS. The dialog folds
 * Description and Notes underneath the incentive name and renders applicability
 * as one chip. A spreadsheet cannot do that and should not try: each becomes its
 * own column, so Notes are filterable and the audience is sortable. `active` is
 * exported too — it is a real field on every row that the dialog has no column
 * for, and an export that silently omitted it would misrepresent a retired
 * incentive as a live one.
 *
 * ── WHY THE TWO ELIGIBILITY FLAGS BECAME ONE COLUMN (0244) ─────────────────
 * "Sales Eligible" and "Interns Eligible" were the old group model, and a
 * spreadsheet that still printed them would now be WRONG rather than merely
 * dated: a scheme scoped to Function: Sales, or to three named people, has both
 * flags false and would export as eligible for nobody. The one column that
 * answers the question is the rule — All Employees / Function / Selected
 * Employees — so that is what is exported.
 */

export const INCENTIVE_EXPORT_HEADERS = [
  "Incentive",
  "Amount (INR)",
  "Applies To",
  "Description",
  "Notes",
  "Status",
] as const;

/** Column widths in characters, positionally matched to the headers above. */
export const INCENTIVE_EXPORT_WIDTHS = [34, 14, 26, 52, 46, 12] as const;

/** Which exported columns hold prose and therefore need wrapping.
 *  1-BASED, matching the header positions (the amount constant below and the
 *  renderers use the same convention). */
export const INCENTIVE_WRAP_COLUMNS = [1, 4, 5] as const;

/** The one column that is a number, not text — kept as a number in XLSX.
 *  1-BASED: the amount is the SECOND header, i.e. position 2. */
export const INCENTIVE_AMOUNT_COLUMN = 2;

export const yesNo = (v: boolean): string => (v ? "Yes" : "No");

/** Who the incentive applies to, as one printable phrase, for both exports. */
export function eligibilityLabel(r: CatalogRow): string {
  return INCENTIVE_APPLICABILITY_LABELS[r.applicability] ?? "All Employees";
}

/**
 * One catalog row as the spreadsheet stores it.
 *
 * The amount stays a NUMBER so Excel can sum and format it; every other cell is
 * a string. A "₹1,500" text cell looks right and cannot be added up, which is
 * the first thing anyone does with an exported amount column.
 */
export function toIncentiveExportRow(r: CatalogRow): (string | number)[] {
  return [
    r.name,
    r.amount,
    eligibilityLabel(r),
    r.description ?? "",
    r.notes ?? "",
    r.active ? "Active" : "Inactive",
  ];
}

export function incentiveExportFilename(
  ext: "xlsx" | "pdf",
  date: Date = new Date(),
): string {
  return `Altus-Corp-Incentive-Table-${date.toISOString().slice(0, 10)}.${ext}`;
}
