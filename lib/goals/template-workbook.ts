import ExcelJS from "exceljs";

/**
 * Download-time decoration of the hand-authored Goals bulk-import workbook.
 *
 * Lives in lib/ rather than beside the route so it can be tested against the
 * real public/templates/Altus-Goals-Template.xlsx with no database, no auth and
 * no HTTP — see tests/unit/goals-template-workbook.test.ts. A route file can
 * only export the handler and its config, so nothing here could be reached from
 * a test while it lived there.
 */

/* ────────────────────────────────────────────────────────────────────────
   WHAT THIS DOES TO THE SHIPPED WORKBOOK, AND WHY.

   The .xlsx in public/templates is hand-authored and static. Three things
   about it cannot be static, so they are (re)built here on every download:

   1. CLIENT COLUMN. The dropdown must list the CURRENT clients. Baking them
      into the file would freeze the list at whenever someone last re-authored
      a binary, and every new client would need a human with Excel.

   2. EVERY OTHER DROPDOWN. The shipped file has NO list validation at all —
      Area, Measure, Type and Delegated were plain free-text cells even though
      the hidden Lists sheet carried (stale, hand-typed) values for them. They
      are now wired to the SAME live sources the app's own pickers use:
      `listGoalLookups()` for Area / Measure / Type, the active employee roster
      for Delegated. The Target Date cell keeps its hand-authored "day number
      1-31" rule, which is a deliberate design, not an oversight.

   3. THE INSERTED COLUMN'S CELLS. Client used to be APPENDED, and only its
      HEADER was styled — its 300 data cells got a dropdown but no borders and
      no banding, so it read as a blank white strip beside a ruled table. That
      is the "not even showing grid outlines" report. Every inserted cell now
      takes the style of that row's Area cell, which carries the banding for
      the row.

   CLIENT NOW SITS AT COLUMN 2, beside Area, at the account holder's request
   (2026-09-10). The note that used to live here warned that a mid-table insert
   risks the two merged title rows (A1:I1, A2:I2) and the Target Date
   validation. That warning is handled rather than avoided: the title merges
   are torn down before the splice and rebuilt to the new width after it, and
   EVERY validation on the sheet is re-applied from scratch afterwards by
   header name, so nothing depends on `spliceColumns` having carried it across.
   `tests/unit/goals-template-workbook.test.ts` runs this against the real
   shipped .xlsx, reopens the result, and asserts all of it.

   The importer resolves columns by HEADER NAME, not position
   (`columnForHeader` in lib/goals/template-columns), so moving the column
   cannot break an upload — including uploads of copies downloaded earlier.
   ──────────────────────────────────────────────────────────────────────── */

/** Header row of the "Goals" grid (rows 1–2 are the title band). */
const HEADER_ROW = 3;
/** How far down the sheet the dropdowns are applied — the shipped grid's extent. */
const LAST_DATA_ROW = 303;
/** Where Client goes: column 2, immediately right of Area. */
const CLIENT_COL = 2;

/** Normalised header text → column index, for the given header row. */
function headerIndex(ws: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let c = 1; c <= ws.columnCount; c++) {
    const raw = String(ws.getCell(headerRow, c).value ?? "").trim().toLowerCase();
    if (raw) m.set(raw, c);
  }
  return m;
}

/**
 * Park a list on the hidden Lists sheet and return the range to validate
 * against. A RANGE rather than an inline formula because Excel caps an inline
 * list at 255 characters, and the client and roster lists blow past that.
 */
function putList(lists: ExcelJS.Worksheet, key: string, values: string[]): string | null {
  const clean = values.map((v) => v.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const col = lists.columnCount + 1;
  const letter = lists.getColumn(col).letter;
  lists.getCell(1, col).value = key;
  clean.forEach((v, i) => {
    lists.getCell(i + 2, col).value = v;
  });
  lists.getColumn(col).width = 28;
  return `Lists!$${letter}$2:$${letter}$${clean.length + 1}`;
}

/** Apply a dropdown down one column's data rows. */
function applyList(ws: ExcelJS.Worksheet, col: number, range: string, from: number, to: number): void {
  for (let r = from; r <= to; r++) {
    ws.getCell(r, col).dataValidation = {
      type: "list",
      allowBlank: true,
      // NOT `showErrorMessage` — a value that is not on the list must still be
      // typeable. That is how a new client is created on the Tasks side, and
      // Area / Measure / Type are admin-extensible lists, so rejecting an
      // unlisted entry here would make the workbook stricter than the app.
      showErrorMessage: false,
      formulae: [range],
    };
  }
}

/* ── A1 formula plumbing, needed because the Weight column is a formula ──
   The shipped Weight column is 300 cells of
   `IF($B4="","",ROUND(100/COUNTA($B$4:$B$303),2))` — an equal split across
   however many Goal Titles are filled in, stored as ONE shared-formula master
   with 299 clones pointing at it.

   Inserting a column ahead of it breaks that twice over. ExcelJS refuses to
   write the file at all ("Shared Formula master must exist above and or left of
   clone"), and — the quiet one — those `$B` references still say B afterwards,
   which is now CLIENT. Weight would have gone on computing, from the wrong
   column, with nothing on screen to say so.

   So every formula is resolved to a plain per-cell formula before the splice
   and re-emitted afterwards with its column letters remapped. */

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Rewrite every A1 reference in `formula`, shifting relative rows by `dRow` and
 * mapping columns through `mapCol`. Absolute parts ($) are left alone, which is
 * what makes `$B$4:$B$303` stay anchored while `$B4` follows its row.
 *
 * The lookbehind skips sheet-qualified refs (`Lists!$A$2`) — the Lists sheet is
 * not spliced, so remapping its columns would break the dropdowns. The
 * lookahead skips `NAME(` so a function like `LOG10(` is never read as a cell.
 */
function rewriteRefs(formula: string, dRow: number, mapCol: (c: number) => number): string {
  return formula.replace(
    /(?<![!A-Za-z0-9_$])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?!\s*\()/g,
    (_m, cAbs: string, letters: string, rAbs: string, row: string) => {
      const newCol = colLetter(mapCol(colIndex(letters)));
      const newRow = rAbs ? Number(row) : Number(row) + dRow;
      return `${cAbs}${newCol}${rAbs}${newRow}`;
    },
  );
}

interface FormulaCell {
  row: number;
  col: number;
  formula: string;
}

/**
 * Every formula on the sheet, resolved to standalone text — shared clones are
 * expanded from their master by the row/column offset they sit at, so nothing
 * afterwards depends on the master/clone links surviving.
 */
function snapshotFormulas(ws: ExcelJS.Worksheet): FormulaCell[] {
  const masters = new Map<string, { formula: string; row: number; col: number }>();
  const cells: { row: number; col: number; value: ExcelJS.CellValue }[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as unknown as Record<string, unknown> | null;
      if (!v || typeof v !== "object") return;
      if (typeof v.formula === "string") {
        masters.set(cell.address, { formula: v.formula, row: Number(cell.row), col: Number(cell.col) });
      }
      if (typeof v.formula === "string" || typeof v.sharedFormula === "string") {
        cells.push({ row: Number(cell.row), col: Number(cell.col), value: cell.value });
      }
    });
  });

  const out: FormulaCell[] = [];
  for (const c of cells) {
    const v = c.value as unknown as Record<string, unknown>;
    if (typeof v.formula === "string") {
      out.push({ row: c.row, col: c.col, formula: v.formula });
      continue;
    }
    const master = masters.get(String(v.sharedFormula));
    if (!master) continue; // an orphan clone is dropped rather than guessed at
    out.push({
      row: c.row,
      col: c.col,
      formula: rewriteRefs(master.formula, c.row - master.row, (col) => col + (c.col - master.col)),
    });
  }
  return out;
}

export interface GoalsTemplateMaster {
  clients: string[];
  areas: string[];
  measures: string[];
  types: string[];
  roster: string[];
}

export async function decorateGoalsTemplate(
  base: Buffer,
  master: GoalsTemplateMaster,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(base as unknown as ArrayBuffer);

  const goals = wb.getWorksheet("Goals");
  const lists = wb.getWorksheet("Lists");
  // Defensive: if the shipped workbook is ever re-authored without these
  // sheets, serve it untouched rather than throwing on a download.
  if (!goals || !lists) return new Uint8Array(base);

  /* ── 1. Insert the Client column beside Area ─────────────────────── */
  const widthBefore = goals.columnCount;
  const headerStyle = { ...goals.getCell(HEADER_ROW, 1).style };
  const titleStyles = [1, 2].map((r) => ({ ...goals.getCell(r, 1).style }));

  // Formulas come out first and go back in last — see the note above
  // rewriteRefs. Clearing them also has to happen before the splice, or
  // ExcelJS throws on the orphaned shared-formula clones.
  const formulas = snapshotFormulas(goals);
  for (const f of formulas) goals.getCell(f.row, f.col).value = null;

  // Tear the title band down BEFORE the splice, at its known pre-splice width.
  // Doing it afterwards would mean guessing whether ExcelJS grew the range.
  for (const r of [1, 2]) goals.unMergeCells(r, 1, r, widthBefore);

  goals.spliceColumns(CLIENT_COL, 0, []);
  const widthAfter = Math.max(goals.columnCount, widthBefore + 1);

  // Everything at or right of the insert point moved one column along.
  const shift = (c: number) => (c >= CLIENT_COL ? c + 1 : c);
  for (const f of formulas) {
    // No cached result is written alongside the formula. That is deliberate:
    // a cell with a formula and no stored value is one Excel computes on open,
    // whereas carrying the OLD cached number across would show a stale weight
    // until someone happened to edit the sheet.
    goals.getCell(f.row, shift(f.col)).value = {
      formula: rewriteRefs(f.formula, 0, shift),
    } as ExcelJS.CellFormulaValue;
  }

  [1, 2].forEach((r, i) => {
    goals.mergeCells(r, 1, r, widthAfter);
    goals.getCell(r, 1).style = { ...titleStyles[i] };
  });

  const headerCell = goals.getCell(HEADER_ROW, CLIENT_COL);
  headerCell.value = "Client";
  headerCell.style = { ...headerStyle };
  goals.getColumn(CLIENT_COL).width = 22;

  /* ── 2. Give the inserted cells the table's ruling ───────────────── */
  // Copying from that row's OWN Area cell (not one fixed template cell) is what
  // keeps the zebra banding continuous — row 5's band differs from row 4's.
  for (let r = HEADER_ROW + 1; r <= LAST_DATA_ROW; r++) {
    goals.getCell(r, CLIENT_COL).style = { ...goals.getCell(r, 1).style };
  }

  /* ── 3. Rebuild every dropdown from live data ────────────────────── */
  // WIPE FIRST. `spliceColumns` moves cells but NOT data validations — they
  // stay pinned to the column INDEX they were authored at. Leaving them meant
  // the Target Date rule ("type a day, 1-31") stayed on column 3, which after
  // the insert is Goal Title: typing a goal there was rejected as "Day only".
  // Clearing the sheet's whole validation map and re-applying by header name is
  // what makes the column order something this file can change safely.
  (goals as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations.model = {};

  const at = headerIndex(goals, HEADER_ROW);
  const wire: [string, string[]][] = [
    ["area", master.areas],
    ["client", master.clients],
    ["measure", master.measures],
    ["type", master.types],
    ["delegated", master.roster],
  ];
  for (const [header, values] of wire) {
    const col = at.get(header);
    if (!col) continue;
    const range = putList(lists, `${header}_live`, values);
    if (range) applyList(goals, col, range, HEADER_ROW + 1, LAST_DATA_ROW);
  }

  // Target Date is a "type the day number" cell, not a list. Re-stamped here
  // because the splice shifted the column and nothing else re-applies it.
  const dateCol = at.get("target date");
  if (dateCol) {
    for (let r = HEADER_ROW + 1; r <= LAST_DATA_ROW; r++) {
      goals.getCell(r, dateCol).dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [1, 31],
        allowBlank: true,
        showInputMessage: true,
        promptTitle: "Enter the day",
        prompt: "Type the day number (1-31). Month & year fill in automatically.",
        showErrorMessage: true,
        errorTitle: "Day only",
        error: "Enter the day as a number from 1 to 31.",
      };
    }
  }

  /* ── 4. Show the gridlines ───────────────────────────────────────── */
  // Every visible sheet shipped with them off. The ruled table reads fine that
  // way, but the moment anything sits outside the ruling — the inserted column
  // did, and so does anything typed past the last ruled row — the sheet looks
  // broken rather than styled.
  for (const ws of wb.worksheets) {
    if (ws.state === "veryHidden" || ws.state === "hidden") continue;
    const views = ws.views ?? [];
    ws.views = views.length
      ? views.map((v) => ({ ...v, showGridLines: true }))
      : [{ showGridLines: true } as ExcelJS.WorksheetView];
  }

  /* ── 5. Examples: same column, and an actual value in it ─────────── */
  const examples = wb.getWorksheet("Examples");
  if (examples) {
    examples.spliceColumns(CLIENT_COL, 0, []);
    const exHead = examples.getRow(1).getCell(CLIENT_COL);
    exHead.value = "Client";
    exHead.style = { ...examples.getRow(1).getCell(1).style };
    examples.getColumn(CLIENT_COL).width = 22;
    // The reference rows had a blank Client, which is the one cell someone
    // reading this sheet could learn nothing from. Real client names are used
    // where we have them: the Examples sheet is never read by the importer (it
    // reads "Goals"), so a real name teaches the format with nothing at stake.
    const samples = master.clients.length > 0 ? master.clients : ["Carbide India", "Altus Corp"];
    const lastRow = Math.max(3, examples.rowCount);
    for (let r = 2; r <= lastRow; r++) {
      const cell = examples.getRow(r).getCell(CLIENT_COL);
      cell.style = { ...examples.getRow(r).getCell(1).style };
      // Only rows that already carry an example get one — never invent a row.
      if (String(examples.getRow(r).getCell(1).value ?? "").trim()) {
        cell.value = samples[(r - 2) % samples.length];
      }
    }
  }

  /* ── 6. Glossary row, so "How to use" covers the column ──────────── */
  const how = wb.getWorksheet("How to use");
  if (how) {
    const row = how.addRow([
      "Client",
      "Yes",
      "client",
      "Which client the goal is for. Pick from the dropdown or type a new name. Optional.",
    ]);
    const ref = how.getRow(row.number - 1);
    row.eachCell((cell, i) => {
      cell.style = { ...ref.getCell(i).style };
    });
  }

  // ExcelJS ships its own Buffer type; normalise to a plain Uint8Array, which
  // is what the Response body wants anyway.
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
