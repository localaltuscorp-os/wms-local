import "server-only";
import ExcelJS from "exceljs";
import type { IncentiveRosterEntry } from "@/lib/import/incentive-import";

const HEADERS = [
  "Employee ID", "Employee Name", "Incentive Product", "Period Month", "Amount", "Approved",
  "Approved Amount", "Approved Date", "Paid", "Paid Amount", "Paid Date", "Note",
] as const;
const DATA_START = 2;
const DATA_END = 101;
const INR = '"Rs. "#,##0.00;[Red]("Rs. "#,##0.00)';
const DATE = "dd-mmm-yyyy";
const MONTH = "mmm yyyy";
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const border = { bottom: { style: "hair" as const, color: { argb: "FFE2E8F0" } } };

/** One visible entry sheet. Hidden lookup data exists only for native Excel validation/formulas. */
export async function buildIncentiveEntryTemplate(args: {
  roster: readonly IncentiveRosterEntry[];
  products: readonly string[];
}): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Altus Corp";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Incentive Entries", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  const lists = workbook.addWorksheet("_lists", { state: "veryHidden" });

  const widths = [38, 26, 28, 16, 15, 13, 18, 17, 11, 15, 17, 42];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  const header = sheet.addRow([...HEADERS]);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill("FFB91C1C");
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = border;
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  lists.getColumn(1).values = ["Employee ID", ...args.roster.map((employee) => employee.employeeCode)];
  lists.getColumn(2).values = ["Employee Name", ...args.roster.map((employee) => employee.name)];
  lists.getColumn(3).values = ["Incentive Product", ...args.products];
  const employeeEnd = Math.max(args.roster.length + 1, 2);
  const productEnd = Math.max(args.products.length + 1, 2);
  workbook.definedNames.add("'_lists'!$A$2:$A$" + employeeEnd, "IncentiveEmployeeIds");
  workbook.definedNames.add("'_lists'!$B$2:$B$" + employeeEnd, "IncentiveEmployeeNames");
  workbook.definedNames.add("'_lists'!$C$2:$C$" + productEnd, "IncentiveProducts");

  for (let rowNo = DATA_START; rowNo <= DATA_END; rowNo++) {
    const row = sheet.getRow(rowNo);
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Calibri", size: 10.5, color: { argb: "FF0F172A" } };
      cell.fill = fill(rowNo % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC");
      cell.alignment = { vertical: "middle" };
      cell.border = border;
    });
    const id = sheet.getCell(`A${rowNo}`);
    const name = sheet.getCell(`B${rowNo}`);
    const product = sheet.getCell(`C${rowNo}`);
    const month = sheet.getCell(`D${rowNo}`);
    const amount = sheet.getCell(`E${rowNo}`);
    const approved = sheet.getCell(`F${rowNo}`);
    const approvedAmount = sheet.getCell(`G${rowNo}`);
    const approvedDate = sheet.getCell(`H${rowNo}`);
    const paid = sheet.getCell(`I${rowNo}`);
    const paidAmount = sheet.getCell(`J${rowNo}`);
    const paidDate = sheet.getCell(`K${rowNo}`);
    const note = sheet.getCell(`L${rowNo}`);
    name.value = { formula: `IF(A${rowNo}=\"\",\"\",IFERROR(INDEX(_lists!$B$2:$B$${employeeEnd},MATCH(A${rowNo},_lists!$A$2:$A$${employeeEnd},0)),\"\"))` };
    id.dataValidation = listValidation("IncentiveEmployeeIds", "Select an Employee ID from Employee Master.");
    // Name is formula-filled for ID selection. Its dropdown still supports direct roster matching during import.
    name.dataValidation = listValidation("IncentiveEmployeeNames", "Select a current Employee Master name.");
    product.dataValidation = listValidation("IncentiveProducts", "Select a current Product Master product.");
    approved.value = "No";
    paid.value = "No";
    approved.dataValidation = listValidation('"Yes,No"', "Select Yes or No.");
    paid.dataValidation = listValidation('"Yes,No"', "Select Yes or No.");
    for (const cell of [amount, approvedAmount, paidAmount]) {
      cell.numFmt = INR;
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.dataValidation = numberValidation("Enter a non-negative amount.");
    }
    month.numFmt = MONTH;
    month.dataValidation = dateValidation("Enter a month as a real Excel date.");
    for (const cell of [approvedDate, paidDate]) {
      cell.numFmt = DATE;
      cell.dataValidation = dateValidation("Enter a real Excel date.");
    }
    note.alignment = { vertical: "middle", wrapText: true };
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

function listValidation(formula: string, prompt: string): ExcelJS.DataValidation {
  return { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: "stop", errorTitle: "Invalid value", error: prompt, showInputMessage: true, promptTitle: "Incentive entry", prompt };
}

function numberValidation(prompt: string): ExcelJS.DataValidation {
  return { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true, showErrorMessage: true, errorStyle: "stop", errorTitle: "Invalid amount", error: prompt };
}

function dateValidation(prompt: string): ExcelJS.DataValidation {
  return { type: "date", operator: "between", formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)], allowBlank: true, showErrorMessage: true, errorStyle: "stop", errorTitle: "Invalid date", error: prompt };
}
