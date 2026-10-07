import "server-only";

import ExcelJS from "exceljs";
import { inArray } from "drizzle-orm";
import { incentiveRequests } from "@/db/schema";
import { INCENTIVE_TYPES, INCENTIVE_TYPE_LABELS, type IncentiveType } from "@/db/enums";
import { optionsFor } from "@/lib/incentive-fields";
import {
  bulkRequestHeaders,
  MAX_SPLIT_COLUMNS,
  requestFields,
  splitEmployeeHeader,
  splitPercentageHeader,
} from "@/lib/incentive/bulk-request-schema";
import { prepareIncentiveRequest, type PreparedIncentiveRequest } from "@/lib/incentive/prepare-request";
import { db } from "@/lib/db";
import { requiredHeader } from "@/lib/templates/field-config";
import { bulkRequestFieldId } from "@/lib/incentive/bulk-request-schema";

export const MAX_BULK_REQUEST_ROWS = 500;
export type BulkIssue = { rowNumber: number; field: string; message: string };

export const BULK_REQUEST_HEADERS = bulkRequestHeaders();

function columnLetter(n: number): string {
  let result = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

function clean(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) return String((value as { text?: unknown }).text ?? "").trim();
  return String(value).trim();
}

function listRange(sheet: ExcelJS.Worksheet, column: number, values: readonly string[]): string {
  const letter = columnLetter(column);
  values.forEach((value, index) => sheet.getCell(index + 1, column).value = value);
  return `Lists!$${letter}$1:$${letter}$${Math.max(values.length, 1)}`;
}

function applyListValidation(cell: ExcelJS.Cell, formula: string) {
  cell.dataValidation = { type: "list", allowBlank: true, formulae: [formula] };
}

export async function buildIncentiveRequestTemplate(required?: ReadonlySet<string>): Promise<Buffer> {
  let employees: { name: string }[] = [];
  let products: string[] = [];
  let shiftTypes: string[] = [];
  try {
    const [{ listEmployeeOptions }, { listActiveProductNames }, { listActiveShiftTypeNames }] = await Promise.all([
      import("@/lib/queries/employees"),
      import("@/lib/queries/products"),
      import("@/lib/queries/shift-types"),
    ]);
    [employees, products, shiftTypes] = await Promise.all([
      listEmployeeOptions(),
      listActiveProductNames(),
      listActiveShiftTypeNames(),
    ]);
  } catch {
    // Workbook remains usable without dropdown sources; import parser rechecks live masters.
  }
  const fields = requestFields();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Requests");
  const lists = workbook.addWorksheet("Lists");
  const instructions = workbook.addWorksheet("Instructions");
  lists.state = "hidden";

  const employeeNames = employees.map((employee) => employee.name);
  const employeeRange = listRange(lists, 1, employeeNames);
  const typeRange = listRange(lists, 2, INCENTIVE_TYPES.map((type) => INCENTIVE_TYPE_LABELS[type]));
  const productRange = listRange(lists, 3, products);
  const shiftRange = listRange(lists, 4, shiftTypes);
  const staticRanges = new Map<string, string>();
  let listColumn = 5;
  for (const field of fields) {
    const values = optionsFor(field, { productNames: products, shiftTypeNames: shiftTypes });
    if (values?.length) staticRanges.set(field.key, listRange(lists, listColumn++, values));
  }

  sheet.columns = BULK_REQUEST_HEADERS.map((header) => ({
    header: required ? requiredHeader(header, bulkRequestFieldId(header), required) : header,
    key: header,
    width: Math.max(16, Math.min(34, header.length + 4)),
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9B1C31" } };
  header.alignment = { vertical: "middle", wrapText: true };
  for (let row = 2; row <= 201; row += 1) {
    applyListValidation(sheet.getCell(row, 1), `=${employeeRange}`);
    applyListValidation(sheet.getCell(row, 2), `=${typeRange}`);
    fields.forEach((field, index) => {
      const values = optionsFor(field, { productNames: products, shiftTypeNames: shiftTypes });
      const formula = field.optionsFrom === "products" ? `=${productRange}` : field.optionsFrom === "shiftTypes" ? `=${shiftRange}` : staticRanges.get(field.key);
      if (formula) applyListValidation(sheet.getCell(row, index + 3), formula);
      if (field.type === "date") sheet.getCell(row, index + 3).numFmt = "yyyy-mm-dd";
    });
    for (let split = 1; split <= MAX_SPLIT_COLUMNS; split += 1) {
      const employeeCol = 3 + fields.length + (split - 1) * 2;
      applyListValidation(sheet.getCell(row, employeeCol), `=${employeeRange}`);
      sheet.getCell(row, employeeCol + 1).dataValidation = { type: "decimal", operator: "between", formulae: [0, 100], allowBlank: true };
    }
  }

  instructions.getColumn(1).width = 110;
  instructions.addRows([
    ["Bulk Incentive Request Upload"],
    ["One non-empty row creates one New Incentive Request. Do not rename headers."],
    ["Employee, Incentive Type, products, shifts, and split employees use the same active sources as the New Incentive Request form."],
    ["Conditional fields are validated using the selected Incentive Type and the same server validation as manual submission."],
    ["For a split, enter 2–5 active employees including the Employee in the row. Percentages must total exactly 100."],
    ["Upload is previewed first. Invalid or duplicate rows are not created. Imported requests start Pending."],
    ["Dates must be entered as YYYY-MM-DD."],
    ["Field keys are the application field names; blank optional/hidden fields may remain blank."],
  ]);
  instructions.getRow(1).font = { bold: true, size: 14 };
  lists.getRow(1).hidden = false;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function typeFromCell(value: string): IncentiveType | null {
  if ((INCENTIVE_TYPES as readonly string[]).includes(value)) return value as IncentiveType;
  return INCENTIVE_TYPES.find((type) => INCENTIVE_TYPE_LABELS[type] === value) ?? null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function requestDuplicateKey(values: Pick<PreparedIncentiveRequest, "employeeId" | "type" | "details" | "split">): string {
  return `${values.employeeId}|${values.type}|${stable(values.details)}|${stable(values.split)}`;
}

export type PreparedBulkRow = { rowNumber: number; values: PreparedIncentiveRequest; key: string };
export type ParsedBulkRequests = { rows: PreparedBulkRow[]; issues: BulkIssue[]; skipped: number };

export async function parseAndPrepareBulkRequests(file: File, requiredFields: ReadonlySet<string> = new Set(["employee", "incentive_type"])): Promise<ParsedBulkRequests> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheet.");
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(clean(cell.value).replace(/\s*\*\s*$/, "").toLowerCase(), column));
  const required = [...requiredFields].map((field) => field.replace(/_/g, " "));
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(", ")}.`);
  const [employeeOptions, productNames, shiftTypeNames] = await Promise.all([listEmployeeOptions(), listActiveProductNames(), listActiveShiftTypeNames()]);
  const employeesByName = new Map<string, typeof employeeOptions>();
  employeeOptions.forEach((employee) => employeesByName.set(employee.name.trim().toLowerCase(), [...(employeesByName.get(employee.name.trim().toLowerCase()) ?? []), employee]));
  const fieldByKey = new Map(requestFields().map((field) => [field.key.toLowerCase(), field]));
  const rows: PreparedBulkRow[] = [];
  const issues: BulkIssue[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  const rowCount = Math.max(0, sheet.rowCount - 1);
  if (rowCount > MAX_BULK_REQUEST_ROWS) throw new Error(`Workbook cannot contain more than ${MAX_BULK_REQUEST_ROWS} request rows.`);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const allBlank = BULK_REQUEST_HEADERS.every((header) => {
      const column = headers.get(header.toLowerCase());
      return !column || !clean(row.getCell(column).value);
    });
    if (allBlank) { skipped += 1; continue; }
    const rowIssues: BulkIssue[] = [];
    for (const field of requiredFields) {
      const header = BULK_REQUEST_HEADERS.find((candidate) => bulkRequestFieldId(candidate) === field);
      const column = header ? headers.get(header.toLowerCase()) : undefined;
      if (column && !clean(row.getCell(column).value)) {
        rowIssues.push({ rowNumber, field: header ?? field, message: "is required." });
      }
    }
    const employeeName = clean(row.getCell(headers.get("employee")!).value);
    const employeeMatches = employeesByName.get(employeeName.toLowerCase()) ?? [];
    if (employeeMatches.length !== 1) rowIssues.push({ rowNumber, field: "Employee", message: employeeMatches.length ? "Employee name is ambiguous." : "Pick an active employee." });
    const type = typeFromCell(clean(row.getCell(headers.get("incentive type")!).value));
    if (!type) rowIssues.push({ rowNumber, field: "Incentive Type", message: "Pick an active Incentive Type." });
    if (rowIssues.length) { issues.push(...rowIssues); continue; }
    const details: Record<string, string> = {};
    for (const [key, field] of fieldByKey) {
      const column = headers.get(key);
      if (column) details[field.key] = clean(row.getCell(column).value);
    }
    const split: { employeeId: string; pct: number }[] = [];
    for (let n = 1; n <= MAX_SPLIT_COLUMNS; n += 1) {
      const nameColumn = headers.get(splitEmployeeHeader(n).toLowerCase());
      const pctColumn = headers.get(splitPercentageHeader(n).toLowerCase());
      const name = nameColumn ? clean(row.getCell(nameColumn).value) : "";
      const pctText = pctColumn ? clean(row.getCell(pctColumn).value) : "";
      if (!name && !pctText) continue;
      const match = employeesByName.get(name.toLowerCase()) ?? [];
      const pct = Number(pctText);
      if (match.length !== 1) rowIssues.push({ rowNumber, field: splitEmployeeHeader(n), message: "Pick one active employee." });
      if (!Number.isFinite(pct)) rowIssues.push({ rowNumber, field: splitPercentageHeader(n), message: "Enter a percentage." });
      if (match.length === 1 && Number.isFinite(pct)) split.push({ employeeId: match[0]!.id, pct });
    }
    if (rowIssues.length) { issues.push(...rowIssues); continue; }
    const prepared = await prepareIncentiveRequest(employeeMatches[0]!.id, { type, details, split: split.length ? split : null });
    if (!prepared.ok) { issues.push({ rowNumber, field: "Request", message: prepared.error }); continue; }
    const key = requestDuplicateKey(prepared.values);
    if (seen.has(key)) { issues.push({ rowNumber, field: "Duplicate", message: "This request is duplicated in the workbook." }); continue; }
    seen.add(key);
    rows.push({ rowNumber, values: prepared.values, key });
  }
  return { rows, issues, skipped };
}

export async function existingRequestKeys(rows: PreparedBulkRow[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const employeeIds = [...new Set(rows.map((row) => row.values.employeeId))];
  const existing = await db.select({ employeeId: incentiveRequests.employeeId, type: incentiveRequests.type, details: incentiveRequests.details, split: incentiveRequests.split }).from(incentiveRequests).where(inArray(incentiveRequests.employeeId, employeeIds));
  return new Set(existing.map(requestDuplicateKey));
}
