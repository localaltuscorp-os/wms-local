import "server-only";
import * as XLSX from "xlsx";

export const MAX_INCENTIVE_IMPORT_ROWS = 2000;

export interface IncentiveRosterEntry {
  id: string;
  employeeCode: string;
  name: string;
}

export interface ParsedIncentiveRow {
  rowNumber: number;
  incentiveName: string;
  periodMonth: string;
  empName: string;
  employeeId: string;
  amount: number;
  approved: boolean;
  approvedAmt: number;
  approvedDate: string | null;
  paid: boolean;
  paidAmt: number;
  paidDate: string | null;
  note: string | null;
}

export interface IncentiveImportIssue {
  rowNumber: number;
  field: string;
  message: string;
}

export interface ParseIncentiveResult {
  rows: ParsedIncentiveRow[];
  totalRows: number;
  skipped: number;
  issues: IncentiveImportIssue[];
  fatal?: string;
}

const HEADERS = {
  employeeId: ["employeeid", "empid"],
  empName: ["employeename", "empname", "employee", "name"],
  incentiveName: ["incentiveproduct", "incentive", "incentivename"],
  periodMonth: ["periodmonth", "period", "month"],
  amount: ["amount", "amt", "incentiveamount"],
  approved: ["approved", "isapproved"],
  approvedAmt: ["approvedamount", "approvedamt", "amtapproved"],
  approvedDate: ["approveddate", "dateapproved"],
  paid: ["paid", "ispaid"],
  paidAmt: ["paidamount", "paidamt", "amtpaid"],
  paidDate: ["paiddate", "datepaid"],
  note: ["note", "notes", "remark", "remarks", "comment"],
} as const;

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => String(value ?? "").trim();
const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

function dateYmd(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const indian = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const parts = iso ? [+iso[1]!, +iso[2]!, +iso[3]!] : indian ? [+indian[3]!, +indian[2]!, +indian[1]!] : null;
  if (!parts) return null;
  // Read by index and asserted, like the captures above: `parts` is a plain
  // array, so under `noUncheckedIndexedAccess` its elements are `number |
  // undefined` and destructuring cannot prove otherwise.
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function money(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = text(value);
  if (!raw) return 0;
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function yesNo(value: unknown): boolean | null {
  const raw = text(value).toLowerCase();
  if (!raw || raw === "no") return false;
  if (raw === "yes") return true;
  return null;
}

function isBlank(row: Record<string, unknown>, fields: Record<string, string>) {
  return Object.values(fields).every((header) => !text(row[header]));
}

export async function parseIncentiveImport(
  file: File,
  roster: IncentiveRosterEntry[],
  products: readonly string[],
): Promise<ParseIncentiveResult> {
  let raw: Record<string, unknown>[];
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return fatal("The file has no sheets.");
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]!, { defval: "" });
  } catch {
    return fatal("Couldn't read the file. Upload a .xlsx file.");
  }
  if (raw.length > MAX_INCENTIVE_IMPORT_ROWS) return fatal(`Too many rows (${raw.length}). Max ${MAX_INCENTIVE_IMPORT_ROWS} per import.`);
  if (!raw.length) return fatal("No data rows found.");

  const fields: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(HEADERS)) {
    const aliasSet = new Set<string>(aliases);
    const header = Object.keys(raw[0]!).find((key) => aliasSet.has(norm(key)));
    if (header) fields[field] = header;
  }
  for (const required of ["employeeId", "empName", "incentiveName", "periodMonth", "amount", "approved", "paid"]) {
    if (!fields[required]) return fatal(`Missing required column: ${headerLabel(required)}.`);
  }

  const byId = new Map(roster.map((employee) => [employee.employeeCode.toUpperCase(), employee]));
  const byName = new Map<string, IncentiveRosterEntry | "AMBIGUOUS">();
  for (const employee of roster) {
    const key = nameKey(employee.name);
    byName.set(key, byName.has(key) ? "AMBIGUOUS" : employee);
  }
  const productByKey = new Map(products.map((product) => [nameKey(product), product]));
  const rows: ParsedIncentiveRow[] = [];
  const issues: IncentiveImportIssue[] = [];
  let skipped = 0;

  for (const [index, source] of raw.entries()) {
    const rowNumber = index + 2;
    if (isBlank(source, fields)) {
      skipped += 1;
      continue;
    }
    const issue = (field: string, message: string) => issues.push({ rowNumber, field, message });
    const enteredId = text(source[fields.employeeId!]);
    const enteredName = text(source[fields.empName!]);
    const byEmployeeId = enteredId ? byId.get(enteredId.toUpperCase()) : undefined;
    const byEmployeeName = enteredName ? byName.get(nameKey(enteredName)) : undefined;
    if (!enteredId && !enteredName) issue("Employee", "Employee ID or Employee Name is required.");
    if (enteredId && !byEmployeeId) issue("Employee ID", "Employee ID is not in current Employee Master.");
    if (enteredName && (!byEmployeeName || byEmployeeName === "AMBIGUOUS")) issue("Employee Name", "Employee Name is not a unique current Employee Master record.");
    if (byEmployeeId && byEmployeeName && byEmployeeName !== "AMBIGUOUS" && byEmployeeId.id !== byEmployeeName.id) {
      issue("Employee", "Employee ID and Employee Name refer to different Employee Master records.");
    }
    const employee = byEmployeeId ?? (byEmployeeName !== "AMBIGUOUS" ? byEmployeeName : undefined);

    const inputProduct = text(source[fields.incentiveName!]);
    const incentiveName = productByKey.get(nameKey(inputProduct));
    if (!incentiveName) issue("Incentive Product", "Incentive Product is not in current Product Master.");

    const periodDate = dateYmd(source[fields.periodMonth!]);
    if (!periodDate) issue("Period Month", "Period Month must be a valid Excel date.");
    const amount = money(source[fields.amount!]);
    if (amount === null) issue("Amount", "Amount must be a non-negative number.");
    const approved = yesNo(source[fields.approved!]);
    if (approved === null) issue("Approved", "Approved must be Yes or No.");
    const approvedAmount = money(fields.approvedAmt ? source[fields.approvedAmt] : "");
    if (approvedAmount === null) issue("Approved Amount", "Approved Amount must be a non-negative number.");
    const approvedDateRaw = fields.approvedDate ? source[fields.approvedDate] : "";
    const approvedDate = text(approvedDateRaw) ? dateYmd(approvedDateRaw) : null;
    if (text(approvedDateRaw) && !approvedDate) issue("Approved Date", "Approved Date must be a valid Excel date.");
    const paid = yesNo(source[fields.paid!]);
    if (paid === null) issue("Paid", "Paid must be Yes or No.");
    const paidAmount = money(fields.paidAmt ? source[fields.paidAmt] : "");
    if (paidAmount === null) issue("Paid Amount", "Paid Amount must be a non-negative number.");
    const paidDateRaw = fields.paidDate ? source[fields.paidDate] : "";
    const paidDate = text(paidDateRaw) ? dateYmd(paidDateRaw) : null;
    if (text(paidDateRaw) && !paidDate) issue("Paid Date", "Paid Date must be a valid Excel date.");

    if (issues.some((entry) => entry.rowNumber === rowNumber)) continue;
    rows.push({
      rowNumber,
      employeeId: employee!.id,
      empName: employee!.name,
      incentiveName: incentiveName!,
      periodMonth: `${periodDate!.slice(0, 7)}-01`,
      amount: amount!,
      approved: approved!,
      approvedAmt: approvedAmount!,
      approvedDate,
      paid: paid!,
      paidAmt: paidAmount!,
      paidDate,
      note: fields.note ? text(source[fields.note]) || null : null,
    });
  }
  return { rows, totalRows: rows.length, skipped, issues };
}

function headerLabel(field: string) {
  return ({ employeeId: "Employee ID", empName: "Employee Name", incentiveName: "Incentive Product", periodMonth: "Period Month", amount: "Amount", approved: "Approved", paid: "Paid" } as Record<string, string>)[field] ?? field;
}

function fatal(message: string): ParseIncentiveResult {
  return { rows: [], totalRows: 0, skipped: 0, issues: [], fatal: message };
}
