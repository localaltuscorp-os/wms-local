import "server-only";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DAY_OPTIONS,
  MONTH_OPTIONS,
  WCC_DAY_PRESETS,
  bulkColumns,
  frequencyLabels,
  personLabels,
  readComplianceMatrix,
  type BulkColumn,
  type BulkList,
  type BulkPerson,
} from "./bulk";
import { CYCLE_MONTHS, DEADLINES_PER_MONTH, MCC_FREQUENCIES, MCC_FREQUENCY_LABEL } from "./mcc-frequency";
import { MAX_MINUTES, minutesText } from "./minutes";
import type { ComplianceKind } from "./schedule";

/**
 * THE WCC / MCC BULK-UPLOAD WORKBOOK (account holder, 2026-09-19: "the excel
 * should be made properly … with each column and all").
 *
 * Built in the Tasks template's house style (app/(app)/tasks/template.xlsx),
 * every column from the one manifest in lib/compliance/bulk.ts. Four sheets:
 *
 *   1. "WCC" / "MCC"  the entry sheet the upload reads — brand banner, a
 *                     one-line brief, the header (* = required, a note on each
 *                     heading), 300 banded rows. Every cell: a hint when it is
 *                     selected, and a dropdown or a check where the column has
 *                     one. Cells still needed turn red; cells the row's
 *                     frequency does not use turn grey.
 *   2. "Examples"     every frequency filled in once, with how the checklist
 *                     will read it — kept off the entry sheet so an example is
 *                     never uploaded by accident.
 *   3. "How to use"   the steps, every column, and the frequency table.
 *   4. "Lists"        hidden — the dropdowns' values.
 */

const HEADER_ROW = 3;
const DATA_START = HEADER_ROW + 1;
const DATA_ROWS = 300;
const DATA_END = DATA_START + DATA_ROWS - 1;

const INK = "FF1F2937";
const HEADER_FILL = "FF334155"; // premium slate header, as the Tasks template
const HEADER_TEXT = "FFFFFFFF";
const BAND_FILL = "FFF8FAFC";
const BRAND_RED = "FFE10600";
const MUTED = "FF64748B";
const HAIRLINE = "FFE2E8F0";
const NEEDED_FILL = "FFFEE2E2"; // still needed
const NOT_USED_FILL = "FFE5E7EB"; // not used for this frequency
const REQUIRED_MARK = " *";

const thin = { style: "thin" as const, color: { argb: HAIRLINE } };
const cellBorder = { top: thin, left: thin, bottom: thin, right: thin };
const font = (over: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: "Calibri", size: 10.5, color: { argb: INK }, ...over });
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CHECKLIST: Record<ComplianceKind, string> = {
  wcc: "WCC — Weekly Compliance Checklist",
  mcc: "MCC — Monthly Compliance Checklist",
};

/** The entry sheet's name — the upload reads the sheet by this name first. */
export const entrySheetName = (kind: ComplianceKind) => kind.toUpperCase();

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = font({ bold: true, color: { argb: HEADER_TEXT } });
  cell.fill = solid(HEADER_FILL);
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  cell.border = cellBorder;
}

function examples(kind: ComplianceKind, me: string): (string | number)[][] {
  if (kind === "wcc") {
    return [
      [me, "Calls", "Call every new lead within the day", "Mon to Sat", "", 30, "", ""],
      [me, "Security", "Check the CCTV recordings", "Mon to Sun", "", 10, "", ""],
      [me, "Outreach", "Send 25 follow-up emails to warm leads", "Each Day of the Week", "Mon, Wed, Fri", 45, 25, "emails"],
      [me, "Team", "Review the team's pipeline", "Each Day of the Week", "Tue, Thu", 20, "", ""],
      [me, "Reporting", "Send the weekly numbers to the founders", "Each Day of the Week", "Sat", 15, "", ""],
    ];
  }
  return [
    [me, "Accounts", "Pay the GST liability and file GSTR-3B", "Monthly", 20, "", "", "", "", ""],
    [me, "Reporting", "Send the MIS report to Manan Sir", "2 times/month", 15, "Last day", "", "", "", ""],
    [me, "Accounts", "Reconcile the bank statements", "3 times/month", 10, 20, "Last day", "", "", ""],
    [me, "Office", "Service the air conditioners", "Alternate Month", "Last day", "", "", "February", "", ""],
    [me, "Statutory", "File the quarterly TDS return", "Quarterly", "Last day", "", "", "July", "", ""],
    [me, "People", "Review every employee's goals", "Half Yearly", 15, "", "", "October", "", ""],
    [me, "Statutory", "Renew the shop and establishment licence", "Annually", "Last day", "", "", "March", "", ""],
    [me, "Marketing", "Visit 12 client sites", "Monthly", "Last day", "", "", "", 12, "visits"],
  ];
}

/**
 * The workbook, for one checklist and the people this viewer may add
 * compliances for (the viewer first).
 */
export async function buildComplianceTemplate(args: { kind: ComplianceKind; people: readonly BulkPerson[] }): Promise<Buffer> {
  const { kind, people } = args;
  const cols = bulkColumns(kind);
  const lastCol = cols.length;
  const KIND = kind.toUpperCase();
  const labels = personLabels(people);
  const peopleList = people.map((p) => labels.get(p.id)!);

  const wb = new ExcelJS.Workbook();
  wb.creator = `ALTUS Corp — ${KIND}`;
  wb.title = `${KIND} bulk upload template`;
  wb.created = new Date();

  /* ── Lists (hidden) — the dropdowns' values ───────────────────────────── */
  const listSheet = wb.addWorksheet("Lists", { state: "veryHidden" });
  const sources: Record<Exclude<BulkList, null>, (string | number)[]> = {
    people: peopleList,
    wccFrequency: frequencyLabels("wcc"),
    mccFrequency: frequencyLabels("mcc"),
    wccDays: WCC_DAY_PRESETS,
    day: DAY_OPTIONS,
    month: MONTH_OPTIONS,
  };
  const rangeOf = new Map<Exclude<BulkList, null>, string>();
  let li = 0;
  for (const [key, values] of Object.entries(sources) as [Exclude<BulkList, null>, (string | number)[]][]) {
    if (values.length === 0) continue;
    li += 1;
    const L = colLetter(li);
    listSheet.getCell(`${L}1`).value = key;
    values.forEach((v, i) => (listSheet.getCell(`${L}${i + 2}`).value = v));
    listSheet.getColumn(li).width = 28;
    rangeOf.set(key, `Lists!$${L}$2:$${L}$${values.length + 1}`);
  }

  /* ── 1. The entry sheet ───────────────────────────────────────────────── */
  const sheet = wb.addWorksheet(entrySheetName(kind), {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: BRAND_RED } },
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  cols.forEach((c, i) => (sheet.getColumn(i + 1).width = c.width));

  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell(1, 1);
  title.value = `ALTUS Corp · ${CHECKLIST[kind]} · Bulk Upload`;
  title.font = font({ bold: true, size: 18, color: { argb: BRAND_RED } });
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 40;
  try {
    const logo = await readFile(path.join(process.cwd(), "public", "logo.png"));
    const img = wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: "png" });
    sheet.addImage(img, { tl: { col: lastCol - 1.6, row: 0.12 }, ext: { width: 132, height: 34 }, editAs: "oneCell" });
  } catch {
    /* the logo is optional — the title stands alone */
  }

  sheet.mergeCells(2, 1, 2, lastCol);
  const brief = sheet.getCell(2, 1);
  brief.value = [
    `One compliance per row, from row ${DATA_START}`,
    "* = required",
    "select a cell to see what it needs",
    "red = still needed · grey = not used for that frequency",
    `then on the ${KIND} page: Bulk upload`,
  ].join("   ·   ");
  brief.font = font({ size: 10, italic: true, color: { argb: MUTED } });
  brief.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 18;

  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.height = 30;
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.required === "yes" ? `${c.header}${REQUIRED_MARK}` : c.header;
    styleHeaderCell(cell);
    cell.note = { texts: [{ text: c.help }], margins: { insetmode: "auto" } } as ExcelJS.Comment;
  });

  for (let r = DATA_START; r <= DATA_END; r++) {
    const row = sheet.getRow(r);
    row.height = 18;
    const banded = (r - DATA_START) % 2 === 1;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.border = cellBorder;
      cell.font = font();
      const numeric = c.field === "target" || c.field === "mins";
      cell.alignment = { vertical: "middle", horizontal: numeric ? "right" : "left", indent: 1 };
      if (banded) cell.fill = solid(BAND_FILL);
      if (numeric) cell.numFmt = "0";
      cell.dataValidation = validationFor(c, rangeOf);
    });
  }

  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: lastCol } };
  addHighlights(sheet, kind, cols);

  /* ── 2. Examples ──────────────────────────────────────────────────────── */
  const ex = wb.addWorksheet("Examples", { views: [{ showGridLines: false }] });
  const exCols = [...cols.map((c) => ({ header: c.header, width: c.width })), { header: "How the checklist reads it", width: 58 }];
  exCols.forEach((c, i) => {
    ex.getColumn(i + 1).width = c.width;
    const cell = ex.getRow(1).getCell(i + 1);
    cell.value = c.header;
    styleHeaderCell(cell);
  });
  ex.getRow(1).height = 26;
  const exampleRows = examples(kind, peopleList[0] ?? "Your name");
  // Each example is read back by the importer itself, so the "reads as" column
  // is exactly what an upload of that row would do.
  const read = readComplianceMatrix([cols.map((c) => c.header), ...exampleRows], { kind, people, firstLine: 1 }).rows;
  exampleRows.forEach((values, e) => {
    const row = ex.getRow(2 + e);
    row.height = 20;
    const r = read[e];
    const reads = r
      ? r.errors.length
        ? r.errors.join(" ")
        : `${r.frequency} — ${r.when}${r.minutes !== null ? ` · ${minutesText(r.minutes)}` : ""}${r.counts ? ` · Done asks how many of ${r.counts.replace(" (from the title)", "")}` : ""}`
      : "";
    [...values, reads].forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v === "" ? null : v;
      cell.font = i === values.length ? font({ italic: true, color: { argb: MUTED } }) : font();
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      cell.border = cellBorder;
      if (e % 2 === 1) cell.fill = solid(BAND_FILL);
    });
  });

  /* ── 3. How to use ────────────────────────────────────────────────────── */
  buildHowTo(wb, kind, cols);

  // Open on the entry sheet.
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 1, activeTab: 1, visibility: "visible" }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A column's check and its hint (Excel caps the hint at 255 characters and its title at 32). */
function validationFor(c: BulkColumn, rangeOf: Map<Exclude<BulkList, null>, string>): ExcelJS.DataValidation {
  const hint = { showInputMessage: true, promptTitle: c.header.slice(0, 32), prompt: c.prompt.slice(0, 255) };
  const range = c.list ? rangeOf.get(c.list) : undefined;
  if (range) {
    return {
      type: "list",
      allowBlank: true,
      formulae: [range],
      ...hint,
      showErrorMessage: c.strict,
      errorStyle: "stop",
      errorTitle: `Not a ${c.header}`,
      error: `Pick a ${c.header} from the list.`,
    };
  }
  if (c.field === "target") {
    return {
      type: "whole",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: [1],
      ...hint,
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Not a Target",
      error: "The Target is a whole number, 1 or more — or leave it blank.",
    };
  }
  if (c.field === "mins") {
    return {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [1, MAX_MINUTES],
      ...hint,
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Not Mins",
      error: `Mins is a whole number of minutes, 1 to ${MAX_MINUTES} — or leave it blank.`,
    };
  }
  const max = c.field === "compliance" ? 300 : c.field === "section" ? 120 : 40;
  return {
    type: "textLength",
    operator: "lessThanOrEqual",
    allowBlank: true,
    formulae: [max],
    ...hint,
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "Too long",
    error: `${c.header} takes up to ${max} characters.`,
  };
}

/**
 * Red where a row still needs something; grey where its frequency does not use
 * a column. Only on rows that have been started, so an empty sheet stays clean.
 */
function addHighlights(sheet: ExcelJS.Worksheet, kind: ComplianceKind, cols: readonly BulkColumn[]) {
  const at = (field: BulkColumn["field"]) => colLetter(cols.findIndex((c) => c.field === field) + 1);
  const first = colLetter(1);
  const last = colLetter(cols.length);
  const started = `COUNTA($${first}${DATA_START}:$${last}${DATA_START})>0`;
  const F = `$${at("frequency")}${DATA_START}`;
  const blank = (field: BulkColumn["field"]) => `LEN(TRIM(${at(field)}${DATA_START}))=0`;
  const is = (labels: string[]) => (labels.length === 1 ? `${F}="${labels[0]}"` : `OR(${labels.map((l) => `${F}="${l}"`).join(",")})`);
  const needed = { type: "expression" as const, priority: 1, style: { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: NEEDED_FILL } } } };
  const unused = { type: "expression" as const, priority: 2, style: { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: NOT_USED_FILL } } } };
  const range = (field: BulkColumn["field"]) => `${at(field)}${DATA_START}:${at(field)}${DATA_END}`;

  for (const c of cols.filter((x) => x.required === "yes")) {
    sheet.addConditionalFormatting({ ref: range(c.field), rules: [{ ...needed, formulae: [`AND(${started},${blank(c.field)})`] }] });
  }

  const conditional = (field: BulkColumn["field"], uses: string[]) => {
    const others = `AND(LEN(TRIM(${F}))>0,NOT(${is(uses)}))`;
    sheet.addConditionalFormatting({
      ref: range(field),
      rules: [
        { ...needed, formulae: [`AND(${is(uses)},${blank(field)})`] },
        { ...unused, formulae: [others] },
      ],
    });
  };

  if (kind === "wcc") {
    // Days: needed for Each Day of the Week, unused for Mon to Sat / Mon to Sun.
    conditional("days", ["Each Day of the Week"]);
    return;
  }
  const label = (f: (typeof MCC_FREQUENCIES)[number]) => MCC_FREQUENCY_LABEL[f];
  conditional("day2", MCC_FREQUENCIES.filter((f) => DEADLINES_PER_MONTH[f] >= 2).map(label));
  conditional("day3", MCC_FREQUENCIES.filter((f) => DEADLINES_PER_MONTH[f] >= 3).map(label));
  conditional("dueMonth", MCC_FREQUENCIES.filter((f) => CYCLE_MONTHS[f] > 1).map(label));
}

function buildHowTo(wb: ExcelJS.Workbook, kind: ComplianceKind, cols: readonly BulkColumn[]) {
  const KIND = kind.toUpperCase();
  const how = wb.addWorksheet("How to use", { views: [{ showGridLines: false }] });
  [22, 14, 70, 30].forEach((w, i) => (how.getColumn(i + 1).width = w));
  let r = 1;

  const heading = (text: string, size = 13) => {
    how.mergeCells(r, 1, r, 4);
    const cell = how.getCell(r, 1);
    cell.value = text;
    cell.font = font({ bold: true, size, color: { argb: size > 13 ? BRAND_RED : INK } });
    how.getRow(r).height = size > 13 ? 30 : 22;
    r += 1;
  };
  const para = (text: string, height = 18) => {
    how.mergeCells(r, 1, r, 4);
    const cell = how.getCell(r, 1);
    cell.value = text;
    cell.font = font();
    cell.alignment = { wrapText: true, vertical: "top", indent: 1 };
    how.getRow(r).height = height;
    r += 1;
  };
  const table = (head: string[], rows: string[][], height = 30) => {
    head.forEach((t, i) => {
      const cell = how.getRow(r).getCell(i + 1);
      cell.value = t;
      styleHeaderCell(cell);
    });
    how.getRow(r).height = 22;
    r += 1;
    rows.forEach((values, idx) => {
      const row = how.getRow(r);
      values.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = font({ size: 10, color: { argb: i === 2 ? INK : i === 0 ? INK : MUTED }, bold: i === 0 });
        cell.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
        cell.border = cellBorder;
        if (idx % 2 === 1) cell.fill = solid(BAND_FILL);
      });
      row.height = height;
      r += 1;
    });
    r += 1;
  };

  heading(`ALTUS Corp · ${KIND} bulk upload — how to use`, 16);
  r += 1;
  heading("Steps");
  [
    `1.  Fill the "${KIND}" sheet — one compliance per row, starting at row ${DATA_START}. Keep the header row as it is.`,
    "2.  Select any cell to see what it needs. Pick from the dropdown where a column has one (Employee, Frequency" +
      (kind === "mcc" ? ", Deadline Day, Due Month)." : ", Days)."),
    "3.  Red cells are still needed for that row; grey cells are not used for its frequency and can stay empty.",
    `4.  Save the file. On the ${KIND} page, choose Bulk upload → upload the filled sheet (or paste the rows, with the header).`,
    "5.  Every row is checked and shown before anything is added. A row with a problem says what is wrong and by row number; nothing is added until every row is right.",
  ].forEach((t) => para(t, 20));
  r += 1;

  heading("Columns");
  // Each column's example: the first example row that fills it.
  const exRows = examples(kind, "Priya Shah");
  table(
    ["Column", "Required?", "What to enter", "Example"],
    cols.map((c, i) => [
      c.header,
      c.required === "yes" ? "Required" : c.required === "depends" ? "Depends on Frequency" : "Optional",
      c.help,
      String(exRows.find((row) => row[i] !== "")?.[i] ?? ""),
    ]),
    46,
  );

  heading("Frequencies");
  if (kind === "wcc") {
    table(
      ["Frequency", "Days", "What it means", "Example"],
      [
        ["Mon to Sat", "Not used", "Due every day, Monday to Saturday — one row a day.", "Call every new lead"],
        ["Mon to Sun", "Not used", "Due every day of the week, Sunday too — one row a day.", "Check the CCTV recordings"],
        ["Each Day of the Week", "Required", "Repeats on each day listed — Mon, Wed, Fri is due on those three days every week.", "Days: Mon, Wed, Fri"],
      ],
    );
  } else {
    table(
      ["Frequency", "Deadline days · Due Month", "What it means", "Example"],
      [
        ["Monthly", "1 day · —", "Every month, by the Deadline Day.", "20 → by the 20th"],
        ["2 times/month", "2 days · —", "Every month, by each of the two days; each is its own row.", "15 & Last day"],
        ["3 times/month", "3 days · —", "Every month, by each of the three days.", "10, 20 & Last day"],
        ["Alternate Month", "1 day · needed", "Every 2nd month from the Due Month.", "February → Feb, Apr, Jun, Aug, Oct, Dec"],
        ["Quarterly", "1 day · needed", "Every 3rd month from the Due Month.", "July → Jul, Oct, Jan, Apr"],
        ["Half Yearly", "1 day · needed", "Every 6th month from the Due Month.", "October → Oct, Apr"],
        ["Annually", "1 day · needed", "Once a year, in the Due Month.", "March → every March"],
      ],
    );
    para("Deadline Day: 1 to 30, or Last day (the month's last day). A day past a short month's end falls on its last day.", 20);
  }

  heading("Good to know");
  [
    "A compliance already on that person's checklist — the same title — is not added again.",
    ...(kind === "wcc"
      ? [
          "Mins: how many minutes it takes each time it is due. The checklist adds them up — all the Dailys, all the Mondays, all the Tuesdays — so you see each day's compliance time.",
        ]
      : []),
    "Target: above 1, marking it Done asks how many were completed (18 of 25). Blank: a count written in the title is used; 1: simply Done.",
    "At most 500 rows in one upload. Only the people in the Employee list can be given compliances by you.",
    "The Examples sheet shows every frequency filled in once, with how the checklist will read it.",
  ].forEach((t) => para(`•  ${t}`, 20));
}
