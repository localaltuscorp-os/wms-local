/**
 * View-model types shared between the Obligations server page and its client
 * components. These are local to the Obligations slice (the page computes them);
 * they intentionally do NOT live in lib/monthly-events/types.ts.
 */

/** One month column of the selected financial year (Apr→Mar order). */
export interface FyMonthCol {
  /** Calendar month 1–12. */
  month: number;
  /** Calendar year the month falls in (Apr–Dec = fyStartYear, Jan–Mar = +1). */
  calYear: number;
  /** Short label, e.g. "Apr". */
  label: string;
  /** Month lies entirely after the current month. */
  isFuture: boolean;
  /** Month is the current calendar month. */
  isCurrent: boolean;
}

/** The compliance value for one obligation × month cell. */
export interface ObligationCell {
  /** Auto-count from tagged calendar_events in that month. */
  auto: number;
  /** Manual override (obligation_completions), or null when none set. */
  manual: number | null;
  /** MAX(auto, manual ?? 0). */
  effective: number;
  /** Note stored with the manual override. */
  note: string | null;
}

/** One obligation row with its full FY of cells. */
export interface ObligationRowVM {
  id: string;
  name: string;
  counterparty: string | null;
  targetCount: number;
  isCompulsory: boolean;
  penaltyNote: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  /** periodMonth (1–12) → cell. Every month of the FY is populated. */
  cells: Record<number, ObligationCell>;
}

export interface ObligationsKpi {
  onTrack: number;
  total: number;
  monthLabel: string;
  periodMonth: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

/** The four cell states driving colour (design §8). */
export type CellStatus = "met" | "partial" | "missed" | "future" | "none";

/**
 * Classify a cell for colouring.
 * - future month                              → grey ("future")
 * - effective ≥ target                        → green ("met")
 * - current month, still short                → amber ("partial", in progress)
 * - past, 0 < effective < target              → amber ("partial")
 * - past, effective 0, compulsory             → red ("missed")
 * - past, effective 0, not compulsory         → grey ("none")
 */
export function classifyCell(
  effective: number,
  target: number,
  compulsory: boolean,
  col: Pick<FyMonthCol, "isFuture" | "isCurrent">,
): CellStatus {
  if (col.isFuture) return "future";
  if (effective >= target) return "met";
  if (col.isCurrent) return "partial";
  if (effective > 0) return "partial";
  return compulsory ? "missed" : "none";
}
