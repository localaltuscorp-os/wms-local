/**
 * Shared row-shaping for the Outstanding importer — the glue between a parsed
 * sheet/CSV and the pure mappers in `import-map.ts`. NO DB, NO server-only IO,
 * so it can run on the server action *and* in the one-off CLI scripts.
 *
 *   - header-tolerant column pickers (CSV headers vary)        → pickOutstanding / pickCollection
 *   - Excel-serial / Date / textual date → "YYYY-MM-DD"        → serialToYmd
 *
 * Extracted from scripts/import-outstanding.ts (pick*) and
 * scripts/import-outstanding-xlsx.ts (serialToYmd) so the in-app Import modal
 * and the CLI use one code path.
 */
import * as XLSX from "xlsx";
import type { RawOutstandingRow, RawCollectionRow } from "./import-map";

type LooseRow = Record<string, unknown>;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Find the first present value among candidate header names (case-insensitive). */
export function pick(row: LooseRow, ...names: string[]): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = str(v);
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

/**
 * Robust Excel-serial → "YYYY-MM-DD". Handles:
 *   - number (Excel serial, e.g. 46068)                → via SSF.parse_date_code
 *   - numeric string ("46068")                          → same
 *   - a real Date object (cellDates / pre-parsed)       → calendar date
 *   - an already-formatted date string                  → passed through verbatim
 *     (the mapper's parseDate copes with ISO / dd-Mon-yyyy / dd/mm/yyyy)
 * Returns "" when blank / unconvertible (the mapper then skips the row).
 */
export function serialToYmd(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }

  let serial: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) serial = v;
  else if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) serial = Number(v.trim());

  if (serial !== null) {
    const d = XLSX.SSF.parse_date_code(serial);
    if (!d || !d.y) return "";
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }

  // Non-numeric string — hand the raw text to the mapper's parseDate verbatim.
  return str(v);
}

/** Normalise a loose Outstanding-sheet record into a RawOutstandingRow. */
export function pickOutstanding(row: LooseRow): RawOutstandingRow {
  // Support both a single "client name" header and the split First/Last form
  // the real xlsx uses (First Name + Last Name → "First Last").
  let clientName = pick(row, "clientName", "client name", "client", "party", "name");
  const first = pick(row, "firstName", "first name");
  const last = pick(row, "lastName", "last name");
  if (!clientName && (first || last)) {
    clientName = `${first} ${last}`.replace(/\s+/g, " ").trim();
  }
  return {
    clientName,
    product: pick(row, "product", "service", "product/service"),
    cycle: pick(row, "cycle", "type", "billing", "frequency", "payment cycle"),
    entity: pick(row, "entity", "company", "billed by", "billing entity"),
    responsible: pick(row, "responsible", "responsible person", "owner", "assigned to", "rm", "person"),
    dueDate: serialToYmd(
      firstRaw(row, "dueDate", "due date", "due", "date", "month"),
    ),
    // The real xlsx carries gross-with-GST in "Total"; fall back to amount-like
    // headers. Pass the raw cell (number or string) through to parseAmount.
    amount: amountCell(firstRaw(row, "total", "amount", "value", "outstanding", "expected", "installment", "instalment")),
    pdcReceived: pick(row, "pdcReceived", "pdc received", "pdc", "pdc?"),
  };
}

/** Normalise a loose Collection-sheet record into a RawCollectionRow. */
export function pickCollection(row: LooseRow): RawCollectionRow {
  return {
    clientName: pick(row, "clientName", "client name", "client", "party", "name"),
    amount: amountCell(firstRaw(row, "amount", "value", "collected", "received", "payment")),
    paymentMode: pick(row, "paymentMode", "payment mode", "mode", "method", "received in"),
    responsible: pick(row, "responsible", "responsible person", "owner", "collected by", "rm", "person"),
    collectedAt: serialToYmd(
      firstRaw(row, "collectedAt", "collected at", "date", "collection date", "received on"),
    ),
    comments: pick(row, "comments", "remarks", "notes", "comment", "other comments"),
  };
}

/**
 * Like `pick` but returns the RAW cell value (number / Date / string) of the
 * first matching header — used for amount + date cells where the downstream
 * parser (parseAmount / serialToYmd) wants the original type, not a trimmed
 * string.
 */
/** Coerce a raw cell to the number|string|null shape parseAmount accepts. */
function amountCell(v: unknown): string | number | null {
  if (typeof v === "number" || typeof v === "string") return v;
  return v === null || v === undefined ? null : str(v);
}

function firstRaw(row: LooseRow, ...names: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lower.set(k.trim().toLowerCase(), v);
  for (const n of names) {
    if (lower.has(n.toLowerCase())) {
      const v = lower.get(n.toLowerCase());
      if (v !== undefined && v !== null && str(v) !== "") return v;
    }
  }
  return null;
}
