import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireGoalsAccess } from "@/lib/goals/access";
import { listActiveClientNames } from "@/lib/queries/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /goals/template.xlsx?level=…&periodKey=…
 *
 * Serves the hand-crafted Altus Goals bulk-import workbook
 * (public/templates/Altus-Goals-Template.xlsx). Four sheets:
 *   1. "Goals"      — the entry grid the import reads. Header row 3:
 *                     Area · Goal Title · Measure · Actual · Target · Type ·
 *                     Weight · Client.
 *   2. "Examples"   — two pre-filled reference rows (never imported).
 *   3. "How to use" — column glossary.
 *   4. "Lists"      — dropdown master data.
 *
 * One template serves every level (the columns are level-agnostic; the level is
 * taken from the board context at upload time). `level`/`periodKey` only flavour
 * the download filename. The upload parser lives in app/(app)/goals/import.
 *
 * The file is force-included in this function's bundle via
 * `outputFileTracingIncludes` in next.config.ts, so the runtime readFile is safe
 * on Vercel (public/ assets are otherwise CDN-only, not on the function disk).
 */
const LEVEL_FILE_LABEL: Record<string, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};

/* ────────────────────────────────────────────────────────────────────────
   THE CLIENT COLUMN, added to the shipped workbook at download time.

   WHY NOT IN THE .xlsx ITSELF: the dropdown has to list the CURRENT clients.
   Baking them into the static file would freeze the list at whenever the file
   was last hand-edited, and every new client would need someone to re-author a
   binary. The Tasks template already resolves its Client list live for exactly
   this reason; this brings the Goals template in line.

   WHY IT IS APPENDED, not inserted next to "Goal Title" where it reads best:
   this workbook is hand-crafted. Its header band is two merged rows (A1:I1,
   A2:I2), the Target Date column carries per-cell date validation down 300
   rows, and there is a `veryHidden` Lists sheet the validations point into.
   `spliceColumns` would shift all of that and ExcelJS does not reliably carry
   merges and validations across the move — so a mid-table insert risks
   silently corrupting a file nobody can eyeball in a diff. Appending touches
   nothing that already exists. Say the word and I will move it, but that is a
   change worth verifying by opening the file, not by a type-check.
   ──────────────────────────────────────────────────────────────────────── */

/** Header row of the "Goals" grid (rows 1–2 are the title band). */
const HEADER_ROW = 3;
/** How far down the sheet the dropdown is applied — the shipped grid's extent. */
const LAST_DATA_ROW = 303;

async function withClientColumn(base: Buffer, clients: string[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(base as unknown as ArrayBuffer);

  const goals = wb.getWorksheet("Goals");
  const lists = wb.getWorksheet("Lists");
  // Defensive: if the shipped workbook is ever re-authored without these
  // sheets, serve it untouched rather than throwing on a download.
  if (!goals || !lists) return new Uint8Array(base);

  const col = goals.columnCount + 1;

  // Header, styled off its left-hand neighbour so it matches the band exactly
  // without restating the red fill, the font or the border in code.
  const headerCell = goals.getCell(HEADER_ROW, col);
  const template = goals.getCell(HEADER_ROW, col - 1);
  headerCell.value = "Client";
  headerCell.style = { ...template.style };
  goals.getColumn(col).width = 22;

  // The two merged title rows have to grow with the grid, or the new column
  // sits outside the header band with bare white cells above it.
  for (const row of [1, 2]) {
    const merged = goals.getCell(row, 1);
    goals.unMergeCells(row, 1, row, col - 1);
    goals.mergeCells(row, 1, row, col);
    // Re-merging clears the master cell's style in some ExcelJS versions;
    // re-stamping it is cheap and keeps the band intact either way.
    goals.getCell(row, 1).style = { ...merged.style };
  }

  /* The dropdown source lives on the hidden Lists sheet, one column per
     source key — the same shape the other dropdowns already use. Writing the
     names into the sheet and pointing the validation at a RANGE (rather than
     inlining them in the formula) is what keeps it working past Excel's
     255-character limit on an inline list. */
  const listCol = lists.columnCount + 1;
  const letter = lists.getColumn(listCol).letter;
  lists.getCell(1, listCol).value = "client";
  clients.forEach((name, i) => {
    lists.getCell(i + 2, listCol).value = name;
  });
  lists.getColumn(listCol).width = 28;

  if (clients.length > 0) {
    for (let r = HEADER_ROW + 1; r <= LAST_DATA_ROW; r++) {
      goals.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        // NOT `showErrorMessage` — a client that is not on the list must still
        // be typeable. That is how a new client is created on the Tasks side,
        // and the importer accepts free text for the same reason.
        showErrorMessage: false,
        formulae: [`Lists!$${letter}$2:$${letter}$${clients.length + 1}`],
      };
    }
  }

  // The Examples sheet gets the header too, so the two sheets agree on the
  // column set. No example VALUE: a made-up client name on a reference row is
  // the kind of thing that gets pasted into a real import.
  const examples = wb.getWorksheet("Examples");
  if (examples) {
    const exCol = examples.columnCount + 1;
    const exCell = examples.getRow(1).getCell(exCol);
    exCell.value = "Client";
    exCell.style = { ...examples.getRow(1).getCell(exCol - 1).style };
    examples.getColumn(exCol).width = 22;
  }

  // And the glossary, so someone reading "How to use" is not left guessing
  // whether the column is required.
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

export async function GET(request: Request): Promise<Response> {
  await requireGoalsAccess();

  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? "";
  const periodKey = url.searchParams.get("periodKey") ?? "";

  const [baseFile, clients] = await Promise.all([
    readFile(path.join(process.cwd(), "public", "templates", "Altus-Goals-Template.xlsx")),
    listActiveClientNames(),
  ]);

  const buffer = await withClientColumn(baseFile, clients);

  const levelLabel = level
    ? LEVEL_FILE_LABEL[level] ?? level.charAt(0).toUpperCase() + level.slice(1)
    : "";
  const fname = `Altus-Goals-Template${levelLabel ? `-${levelLabel}` : ""}${
    periodKey ? `-${periodKey}` : ""
  }.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
