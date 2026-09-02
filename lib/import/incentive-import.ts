import "server-only";
import * as XLSX from "xlsx";

// Hard cap so a giant sheet can't blow up the request / DB.
export const MAX_INCENTIVE_IMPORT_ROWS = 2000;

export interface IncentiveRosterEntry {
  id: string;
  name: string;
}

/** One parsed, coerced incentive-entry row ready for insert. */
export interface ParsedIncentiveRow {
  rowNumber: number;
  srcSrNo: number | null;
  entryDate: string | null; // YYYY-MM-DD
  incentiveName: string;
  periodMonth: string | null; // first-of-month YYYY-MM-DD
  empName: string;
  employeeId: string | null;
  participantName: string | null;
  prospectGroupName: string | null;
  amount: number;
  approved: boolean;
  approvedAmt: number;
  paid: boolean;
  paidAmt: number;
  paidDate: string | null;
  note: string | null;
}

export interface ParseIncentiveResult {
  rows: ParsedIncentiveRow[];
  totalRows: number;
  /** Blank / unusable rows skipped during parse (missing emp name or incentive). */
  skipped: number;
  fatal?: string;
}

const FIELD_ALIASES: Record<string, string[]> = {
  srNo: ["srno", "sr", "serialno", "serial", "no", "sno", "slno"],
  entryDate: ["date", "entrydate"],
  incentiveName: ["incentive", "incentivename", "incentivetype", "type"],
  periodMonth: ["period", "month", "periodmonth", "incentivemonth"],
  empName: ["emp", "empname", "employee", "employeename", "name", "person"],
  participant: ["participant", "participantname", "candidate"],
  prospect: ["prospect", "group", "prospectgroup", "prospectgroupname", "client"],
  amount: ["amount", "amt", "incentiveamount"],
  approved: ["approved", "isapproved", "approvedyn"],
  approvedAmt: ["approvedamt", "approvedamount", "amtapproved"],
  paid: ["paid", "ispaid", "paidyn"],
  paidAmt: ["paidamt", "paidamount", "amtpaid"],
  paidDate: ["paiddate", "datepaid"],
  note: ["note", "notes", "remark", "remarks", "comment"],
};

const norm = (s: unknown): string =>
  String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Coerce a cell to a non-negative money number; NaN/invalid → 0. */
function coerceNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value ?? "").trim();
  if (!s) return 0;
  // Strip ₹, commas, spaces.
  const cleaned = s.replace(/[₹,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce a cell to a boolean; recognises true/yes/y/1/✓/approved/paid. */
function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "y", "1", "✓", "x", "approved", "paid", "done"].includes(s);
}

/** Coerce a cell to a YYYY-MM-DD date string, or null. */
function coerceDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ymd(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO yyyy-mm-dd
  if (m) {
    const mm = +m[2]!;
    const dd = +m[3]!;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return ymd(+m[1]!, mm, dd);
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // dd/mm/yyyy (IST)
  if (m) {
    let yr = +m[3]!;
    if (yr < 100) yr += 2000;
    const dd = +m[1]!;
    const mm = +m[2]!;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return ymd(yr, mm, dd);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Normalise any date string to first-of-month (for the period_month column). */
function toMonthStart(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${pad2(+m[2]!)}-01`;
}

/**
 * Parse a CSV/XLSX File into coerced incentive-entry rows. Fuzzy-matches the
 * sheet headers, coerces numbers/dates/booleans safely (never throws on a bad
 * cell), resolves emp name → employeeId against the roster (best-effort), and
 * skips rows that have no employee name AND no incentive name. Pure parse — no
 * DB writes; the same function backs the commit.
 */
export async function parseIncentiveImport(
  file: File,
  roster: IncentiveRosterEntry[],
): Promise<ParseIncentiveResult> {
  let raw: Record<string, unknown>[];
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return fatal("The file has no sheets.");
    const sheet = wb.Sheets[sheetName]!;
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } catch {
    return fatal("Couldn't read the file. Upload a .csv or .xlsx.");
  }

  if (raw.length === 0) return fatal("No data rows found.");
  if (raw.length > MAX_INCENTIVE_IMPORT_ROWS) {
    return fatal(
      `Too many rows (${raw.length}). Max ${MAX_INCENTIVE_IMPORT_ROWS} per import.`,
    );
  }

  // Map the sheet's actual headers → our canonical fields.
  const headerKeys = Object.keys(raw[0]!);
  const fieldToHeader: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const aliasSet = new Set(aliases.map(norm));
    const match = headerKeys.find((h) => aliasSet.has(norm(h)));
    if (match) fieldToHeader[field] = match;
  }

  if (!fieldToHeader.empName && !fieldToHeader.incentiveName) {
    return fatal(
      "Missing key columns. Expected at least an Employee Name and an Incentive column.",
    );
  }

  // Name → id resolution (duplicate names collapse to null = no confident match).
  const byName = new Map<string, string | "AMBIGUOUS">();
  for (const e of roster) {
    const n = norm(e.name);
    if (n) byName.set(n, byName.has(n) ? "AMBIGUOUS" : e.id);
  }
  function resolveId(name: string): string | null {
    const hit = byName.get(norm(name));
    return hit && hit !== "AMBIGUOUS" ? hit : null;
  }

  const cell = (row: Record<string, unknown>, field: string): unknown => {
    const header = fieldToHeader[field];
    return header ? row[header] : "";
  };
  const str = (row: Record<string, unknown>, field: string): string => {
    const v = cell(row, field);
    return v instanceof Date ? v.toISOString() : String(v ?? "").trim();
  };

  const rows: ParsedIncentiveRow[] = [];
  let skipped = 0;
  let rowNumber = 0;
  for (const r of raw) {
    rowNumber += 1;
    const empName = str(r, "empName");
    const incentiveName = str(r, "incentiveName");
    // Skip a row with neither an employee nor an incentive (blank / trailing).
    if (!empName && !incentiveName) {
      rowNumber -= 1;
      continue;
    }
    if (!empName) {
      skipped += 1;
      continue;
    }

    const srRaw = str(r, "srNo");
    const srNum = srRaw ? Number(srRaw.replace(/[^0-9]/g, "")) : NaN;
    const entryDate = coerceDate(cell(r, "entryDate"));
    const periodMonth =
      toMonthStart(coerceDate(cell(r, "periodMonth"))) ?? toMonthStart(entryDate);

    rows.push({
      rowNumber,
      srcSrNo: Number.isFinite(srNum) ? srNum : null,
      entryDate,
      incentiveName: incentiveName || "Incentive",
      periodMonth,
      empName,
      employeeId: resolveId(empName),
      participantName: str(r, "participant") || null,
      prospectGroupName: str(r, "prospect") || null,
      amount: coerceNum(cell(r, "amount")),
      approved: coerceBool(cell(r, "approved")),
      approvedAmt: coerceNum(cell(r, "approvedAmt")),
      paid: coerceBool(cell(r, "paid")),
      paidAmt: coerceNum(cell(r, "paidAmt")),
      paidDate: coerceDate(cell(r, "paidDate")),
      note: str(r, "note") || null,
    });
  }

  if (rows.length === 0 && skipped === 0) return fatal("No data rows found.");

  return { rows, totalRows: rows.length, skipped };
}

function fatal(msg: string): ParseIncentiveResult {
  return { rows: [], totalRows: 0, skipped: 0, fatal: msg };
}
