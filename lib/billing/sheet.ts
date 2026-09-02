/**
 * Pure mappers + aggregation for the "All Billing Stacked" → **Billing** tab
 * (raw matrix from the Sheets API). The Billing tab is the sales/billing ledger;
 * incentive *earnings* are the BILLING TOTAL per salesperson (decided
 * 2026-06-19: billing total, not a % commission).
 *
 * Dependency-free + total — bad rows are skipped, never thrown.
 *
 * Column layout (fixed index, 56-col Billing tab):
 *   [2]  C  PSO Date ("18-Apr-2025")     [7]  H  Full Name (client)
 *   [32] AG Sales Follow Up By (grouping) [33] AH Sales Resolution
 *   [34] AI Total Payable (the BILLED amount)  [35] AJ Entity
 *   [36] AK Amount Paid (collected)            [39] AN Balance Receivable
 */

const COL = {
  psoDate: 2,
  client: 7,
  salesperson: 32,
  resolution: 33,
  billed: 34,
  entity: 35,
  paid: 36,
} as const;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "18-Apr-2025" / "18/04/2025" / "2025-04-18" → "YYYY-MM". null if unparseable. */
export function parseBillingMonth(raw: string): string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  // DD-Mon-YYYY
  let m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{4})$/);
  if (m) {
    const mm = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    return mm ? `${m[3]}-${mm}` : null;
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}`;
  return null;
}

/** "₹5,84,100" / "584100" → number. Blank/non-numeric → 0. */
export function parseRupees(raw: string): number {
  const s = String(raw ?? "").replace(/[₹,\s]/g, "").trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export interface BillingDeal {
  salesperson: string;
  client: string;
  month: string | null; // YYYY-MM
  billed: number; // Total Payable
  paid: number; // Amount Paid
  outstanding: number; // max(0, billed − paid) — the AN column is unreliable
  entity: string | null;
  resolution: string | null;
}

export interface BillingPerson {
  name: string;
  deals: number;
  billed: number;
  paid: number;
  outstanding: number;
}

export interface BillingMonth {
  month: string; // YYYY-MM
  billed: number;
  paid: number;
  deals: number;
}

export interface BillingSummary {
  totals: { deals: number; billed: number; paid: number; outstanding: number };
  perSalesperson: BillingPerson[]; // billed desc
  monthly: BillingMonth[]; // month asc
  deals: BillingDeal[]; // billed desc (for the ledger table)
}

/** Raw Billing rows (no header) → deals. Rows with no salesperson are dropped. */
export function mapBillingDeals(matrix: unknown[][]): BillingDeal[] {
  const out: BillingDeal[] = [];
  for (const r of matrix) {
    if (!Array.isArray(r)) continue;
    const salesperson = (r[COL.salesperson] ?? "").toString().replace(/\s+/g, " ").trim();
    if (!salesperson) continue; // unassigned lead → not a sales-credited deal
    const billed = parseRupees((r[COL.billed] ?? "").toString());
    const paid = parseRupees((r[COL.paid] ?? "").toString());
    out.push({
      salesperson,
      client: (r[COL.client] ?? "").toString().replace(/\s+/g, " ").trim(),
      month: parseBillingMonth((r[COL.psoDate] ?? "").toString()),
      billed,
      paid,
      outstanding: Math.max(0, billed - paid),
      entity: (r[COL.entity] ?? "").toString().trim() || null,
      resolution: (r[COL.resolution] ?? "").toString().trim() || null,
    });
  }
  return out;
}

/** Aggregate deals → per-salesperson, monthly, and grand totals. */
export function aggregateBilling(deals: BillingDeal[]): BillingSummary {
  const byPerson = new Map<string, BillingPerson>();
  const byMonth = new Map<string, BillingMonth>();
  const totals = { deals: 0, billed: 0, paid: 0, outstanding: 0 };

  for (const d of deals) {
    totals.deals += 1;
    totals.billed += d.billed;
    totals.paid += d.paid;
    totals.outstanding += d.outstanding;

    const p = byPerson.get(d.salesperson) ?? {
      name: d.salesperson, deals: 0, billed: 0, paid: 0, outstanding: 0,
    };
    p.deals += 1;
    p.billed += d.billed;
    p.paid += d.paid;
    p.outstanding += d.outstanding;
    byPerson.set(d.salesperson, p);

    if (d.month) {
      const m = byMonth.get(d.month) ?? { month: d.month, billed: 0, paid: 0, deals: 0 };
      m.billed += d.billed;
      m.paid += d.paid;
      m.deals += 1;
      byMonth.set(d.month, m);
    }
  }

  return {
    totals,
    perSalesperson: [...byPerson.values()].sort((a, b) => b.billed - a.billed),
    monthly: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    deals: [...deals].sort((a, b) => b.billed - a.billed),
  };
}
