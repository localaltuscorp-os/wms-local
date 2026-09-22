import "server-only";
import { readSheetValues } from "@/lib/google/read-sheet";
import { nameKey } from "@/lib/incentive/payout-sources";
import {
  mapBillingDeals,
  aggregateBilling,
  type BillingSummary,
} from "@/lib/billing/sheet";

// "All Billing Stacked" → Billing tab (the sales/billing ledger). Read live via
// the Firebase service account, so the dashboard is always current.
const SHEET_ID = "1eRm7ySTOdDeSlI7OXTc-IOacUClm11FrKiwKldiwWhI";
const RANGE = "Billing!A2:BD1000"; // A2 skips the header row

const EMPTY: BillingSummary = {
  totals: { deals: 0, billed: 0, paid: 0, outstanding: 0 },
  perSalesperson: [],
  monthly: [],
  deals: [],
};

/**
 * Billing-total earnings for a calendar year. Reads the live sheet, keeps deals
 * whose PSO date falls in `year` (deals without a parseable date are kept so
 * they're never lost), and aggregates per-salesperson / monthly / totals.
 *
 * Resilient: any sheet/auth failure returns an EMPTY summary with `error` set,
 * so a Sheets hiccup degrades the Billing tab gracefully instead of 500-ing the
 * whole /incentive page.
 *
 * ── SCOPE ─────────────────────────────────────────────────────────────────────
 * `visibleNames` is the Team/User narrowing, as normalised name keys, and is
 * applied HERE — before aggregation — so every figure the screen shows (totals,
 * the four KPI cards, both tables, the monthly series) is computed from the rows
 * the viewer is entitled to. Narrowing after aggregation would leave the KPIs
 * reporting company money under a "User" label.
 *
 * `undefined` and `null` both mean "no filter" (a company-wide viewer,
 * `visibleNameKeysFor` returning null). An EMPTY set means "nobody" and is
 * honoured as such: the caller decided this viewer may see no one, and widening
 * to everyone on that input is exactly the bug this parameter exists to stop.
 */
export async function getBillingDashboard(
  year: number,
  opts: { visibleNames?: ReadonlySet<string> | null } = {},
): Promise<BillingSummary & { error?: string }> {
  try {
    const matrix = await readSheetValues(SHEET_ID, RANGE);
    const visible = opts.visibleNames ?? null;
    const deals = mapBillingDeals(matrix).filter((d) => {
      if (d.month && Number(d.month.slice(0, 4)) !== year) return false;
      if (!visible) return true;
      return visible.has(nameKey(d.salesperson));
    });
    return aggregateBilling(deals);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...EMPTY, error: msg };
  }
}
