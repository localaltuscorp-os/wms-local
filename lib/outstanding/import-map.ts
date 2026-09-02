/**
 * Pure mapping for the one-time legacy Google-Sheets → Outstanding Tracker
 * import.  NO DB, NO IO — just turns loosely-typed CSV rows into the
 * structured import specs the script writes.
 *
 * Each legacy "Outstanding" sheet row is effectively a dated installment.
 * Rows that share (clientName, product, cycle, entity, responsible) belong
 * to the same contract; their amounts are taken VERBATIM (preserving
 * non-uniform real data — e.g. a ₹5,000 first month then ₹25,000) instead
 * of being re-generated from baseAmount.  "Collection" rows are payments.
 */
import type { OutstandingCycle } from "@/db/enums";

// ── Loose input row types ───────────────────────────────────────────────
// Real CSV headers vary, so callers normalise their own column names into
// these string-keyed shapes before mapping.  All fields are optional/loose.
export interface RawOutstandingRow {
  clientName?: string | null;
  product?: string | null;
  cycle?: string | null;
  entity?: string | null;
  responsible?: string | null;
  dueDate?: string | null;
  amount?: string | number | null;
  pdcReceived?: string | boolean | null;
  [key: string]: unknown;
}

export interface RawCollectionRow {
  clientName?: string | null;
  amount?: string | number | null;
  paymentMode?: string | null;
  responsible?: string | null;
  collectedAt?: string | null;
  comments?: string | null;
  [key: string]: unknown;
}

// ── Output specs ────────────────────────────────────────────────────────
export interface InstallmentImport {
  dueDate: string; // YYYY-MM-DD
  amount: number; // rupees, verbatim from the row
}

export interface ContractImportSpec {
  clientName: string;
  product: string | null;
  entity: string | null;
  responsible: string | null;
  cycle: OutstandingCycle;
  baseAmount: number; // modal (most common) row amount; falls back to first
  gstRate: number; // percent — 0 unless derivable
  startDate: string; // YYYY-MM-DD — earliest due date in the group
  pdcReceived: boolean;
  /** Installments inserted verbatim (so non-uniform real data is preserved). */
  installments: InstallmentImport[];
}

export interface CollectionImportSpec {
  clientName: string;
  amount: number;
  paymentMode: string | null;
  responsible: string | null;
  collectedAt: string; // YYYY-MM-DD
  comments: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Parse a sheet money cell to a number of rupees.
 *   "₹25,000" / "25000" / "25,000.00" / "Rs. 1,00,000" → 25000
 * Strips currency symbols, the word "Rs", and ALL commas (handles the
 * Indian 1,00,000 grouping too).  Blank / non-numeric → 0.
 */
export function parseAmount(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let raw = str(v);
  if (!raw) return 0;
  // Strip a leading currency word ("Rs"/"INR") incl. its trailing dot so the
  // "Rs. 1,00,000" form doesn't leave an orphan "." → bogus decimal.
  raw = raw.replace(/^(rs\.?|inr|₹)\s*/i, "");
  // Drop everything that isn't a digit, dot or minus (commas, ₹, spaces).
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normalise the sheet's date formats to YYYY-MM-DD (no timezone math —
 * we only care about the calendar date):
 *   "2025-09-01"  → "2025-09-01"
 *   "01-Sep-2025" → "2025-09-01"
 *   "01/09/2025"  → "2025-09-01"  (interpreted dd/mm/yyyy, the sheet's locale)
 * Blank / unparseable → null.
 */
export function parseDate(v: string | null | undefined): string | null {
  const raw = str(v);
  if (!raw) return null;

  // Already ISO (YYYY-MM-DD or with a time component).
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m}-${d}`;
  }

  // dd-Mon-yyyy / d-Mon-yyyy (also tolerates slashes/spaces as separators).
  const named = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{4})$/);
  if (named) {
    const day = Number(named[1]);
    const mon = MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    const year = Number(named[3]);
    if (mon && day >= 1 && day <= 31) return `${year}-${pad(mon)}-${pad(day)}`;
    return null;
  }

  // dd/mm/yyyy or d/m/yyyy (sheet locale is day-first).
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const mon = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(mon)}-${pad(day)}`;
    }
    return null;
  }

  return null;
}

/** Map the sheet's free-text cycle label onto the canonical enum value. */
export function normalizeCycle(v: string | null | undefined): OutstandingCycle {
  const k = str(v).toLowerCase().replace(/\s+/g, "_");
  if (k.includes("subscription")) return "subscription";
  if (k.includes("full")) return "full_payment";
  if (k.includes("monthly") || k.includes("bill")) return "monthly_bill";
  // Default: a single dated row is most naturally a monthly bill.
  return "monthly_bill";
}

/** Truthy-ish parse of a "PDC received?" cell (Yes / Y / TRUE / 1 / ✓). */
function parsePdc(v: string | boolean | null | undefined): boolean {
  if (typeof v === "boolean") return v;
  const k = str(v).toLowerCase();
  return k === "yes" || k === "y" || k === "true" || k === "1" || k === "✓" || k === "received";
}

/** Most-frequent value in a list; ties resolve to the first seen. */
function modal(nums: number[]): number {
  if (nums.length === 0) return 0;
  const counts = new Map<number, number>();
  let best = nums[0]!;
  let bestCount = 0;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      bestCount = c;
      best = n;
    }
  }
  return best;
}

// ── Mappers ─────────────────────────────────────────────────────────────
/**
 * Group raw outstanding rows into contracts.  Rows are grouped by the
 * (clientName, product, cycle, entity, responsible) tuple (case-insensitive,
 * whitespace-collapsed); each group's row amounts become its installments
 * VERBATIM.  Rows without a client name or a parseable due date are skipped.
 */
export function mapOutstandingRows(rows: RawOutstandingRow[]): {
  contracts: ContractImportSpec[];
} {
  interface Group {
    clientName: string;
    product: string | null;
    entity: string | null;
    responsible: string | null;
    cycle: OutstandingCycle;
    pdcReceived: boolean;
    installments: InstallmentImport[];
  }
  // Use insertion-ordered Map so output order is stable / deterministic.
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const clientName = str(row.clientName);
    const dueDate = parseDate(typeof row.dueDate === "string" ? row.dueDate : str(row.dueDate));
    if (!clientName || !dueDate) continue; // skip structural / blank rows

    const product = str(row.product) || null;
    const entity = str(row.entity) || null;
    const responsible = str(row.responsible) || null;
    const cycle = normalizeCycle(row.cycle);
    const amount = parseAmount(row.amount);

    const key = [
      clientName.toLowerCase(),
      (product ?? "").toLowerCase(),
      cycle,
      (entity ?? "").toLowerCase(),
      (responsible ?? "").toLowerCase(),
    ].join("|");

    let g = groups.get(key);
    if (!g) {
      g = { clientName, product, entity, responsible, cycle, pdcReceived: false, installments: [] };
      groups.set(key, g);
    }
    g.installments.push({ dueDate, amount });
    if (parsePdc(row.pdcReceived)) g.pdcReceived = true;
  }

  const contracts: ContractImportSpec[] = [];
  for (const g of groups.values()) {
    // Sort installments by due date so startDate = earliest and the schedule
    // is chronological regardless of source row order.
    const installments = [...g.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const startDate = installments[0]!.dueDate;
    const baseAmount = modal(installments.map((i) => i.amount));
    contracts.push({
      clientName: g.clientName,
      product: g.product,
      entity: g.entity,
      responsible: g.responsible,
      cycle: g.cycle,
      baseAmount,
      gstRate: 0, // no reliable GST signal in the legacy sheet
      startDate,
      pdcReceived: g.pdcReceived,
      installments,
    });
  }
  return { contracts };
}

/**
 * Map collection (payment) rows straight through.  Rows with no client name
 * AND no amount are skipped (trailing blank rows).  Unparseable dates fall
 * back to an empty string so the script can report them.
 */
export function mapCollectionRows(rows: RawCollectionRow[]): CollectionImportSpec[] {
  const out: CollectionImportSpec[] = [];
  for (const row of rows) {
    const clientName = str(row.clientName);
    const amount = parseAmount(row.amount);
    if (!clientName && amount === 0) continue;
    out.push({
      clientName,
      amount,
      paymentMode: str(row.paymentMode) || null,
      responsible: str(row.responsible) || null,
      collectedAt: parseDate(typeof row.collectedAt === "string" ? row.collectedAt : str(row.collectedAt)) ?? "",
      comments: str(row.comments) || null,
    });
  }
  return out;
}
