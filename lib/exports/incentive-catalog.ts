import type { CatalogRow } from "@/lib/queries/incentive-catalog";

/**
 * ONE column contract for both Incentive Table exports.
 *
 * The PDF and the XLSX routes render the same rows in the same order with the
 * same labels, so a person comparing the two files never has to work out which
 * one is authoritative. Same split as lib/exports/tasks-rich.ts: the shape lives
 * here, the two routes only decide how to draw it.
 *
 * WHAT IS EXPORTED, AND WHY IT IS MORE THAN THE SCREEN SHOWS. The dialog folds
 * Description and Notes underneath the incentive name and renders eligibility as
 * two chips. A spreadsheet cannot do that and should not try: each becomes its
 * own column, so Notes are filterable and eligibility is sortable. `active` is
 * exported too — it is a real field on every row that the dialog has no column
 * for, and an export that silently omitted it would misrepresent a retired
 * incentive as a live one.
 */

export const INCENTIVE_EXPORT_HEADERS = [
  "Incentive",
  "Amount (INR)",
  "Sales Eligible",
  "Interns Eligible",
  "Description",
  "Notes",
  "Status",
] as const;

/** Column widths in characters, positionally matched to the headers above. */
export const INCENTIVE_EXPORT_WIDTHS = [34, 14, 14, 16, 52, 46, 12] as const;

/** Which exported columns hold prose and therefore need wrapping. */
export const INCENTIVE_WRAP_COLUMNS = [1, 5, 6] as const;

/** The one column that is a number, not text — kept as a number in XLSX. */
export const INCENTIVE_AMOUNT_COLUMN = 2;

export const yesNo = (v: boolean): string => (v ? "Yes" : "No");

/** Both "who is this for" flags as one printable phrase, for the PDF column. */
export function eligibilityLabel(r: CatalogRow): string {
  const who: string[] = [];
  if (r.salesEligible) who.push("Sales");
  if (r.internsEligible) who.push("Interns");
  return who.length ? who.join(" · ") : "—";
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
    yesNo(r.salesEligible),
    yesNo(r.internsEligible),
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
