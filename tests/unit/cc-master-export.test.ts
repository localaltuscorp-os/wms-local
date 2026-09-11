import { describe, it, expect, vi } from "vitest";

// The renderer opens with `import "server-only"`.
vi.mock("server-only", () => ({}));

import ExcelJS from "exceljs";
import type { CcCardRow, CcMonthRow } from "@/lib/queries/accounts-cc";
import { fyLabel, fyMonthCols } from "@/lib/accounts/cc";
import {
  CC_MASTER_SHAPE,
  ccMasterFilename,
  renderCcMasterXlsx,
} from "@/lib/exports/cc-master-xlsx";

/**
 * THE CREDIT CARDS MASTER EXPORT — and specifically, the frozen panes.
 *
 * This file exists because of how the bug got in. Someone wrote
 * `ws["!freeze"] = { xSplit: 9, ySplit: 3 }` with SheetJS, which accepts the
 * property, raises nothing, and emits no `<pane>` element whatsoever. The code
 * READ as though the panes were frozen, the export looked plausible, and on a
 * 117-column sheet every downloaded file was unreadable in the middle — you
 * could not tell which card or which of the nine repeating field names a cell
 * belonged to.
 *
 * Nothing catches that except loading the workbook back and asking. So that is
 * what these do.
 */

const { MONTH_FIELDS, STATIC_HEADERS, FROZEN_COLS, FROZEN_ROWS } = CC_MASTER_SHAPE;
const FY = 2026;

const card = (n: number): CcCardRow => ({
  id: `card-${n}`,
  code: String(n),
  entityName: `Entity ${n}`,
  cardName: `HDFC Regalia ${n}`,
  ecs: n % 2 === 0 ? "Yes" : "No",
  ecsFrom: "ICICI 1234",
  stmtPeriod: "1-31",
  stmtStartDay: "1",
  dueDay: "18",
  softCopyAutoEmail: "Yes",
  sortOrder: n,
});

/** A month row for every (card, month) pair, with identifiable values. */
function monthsFor(cards: CcCardRow[]): CcMonthRow[] {
  const out: CcMonthRow[] = [];
  for (const c of cards) {
    for (const col of fyMonthCols(FY)) {
      out.push({
        cardId: c.id,
        month: col.month,
        hardCopy: "Yes",
        googleDrive: "Done",
        tallyEntry: "Pending",
        balanceTally: "Tallied",
        ccPaidDate: `${col.month}/2026`,
        ccPaidAmt: "12500",
        intFinChgs: "0",
        chgReversed: "NA",
        // Uniquely identifies the cell, so a mis-ordered block is detectable.
        notes: `${c.id}:${col.month}`,
      });
    }
  }
  return out;
}

async function build(cards: CcCardRow[], months: CcMonthRow[]) {
  const buf = await renderCcMasterXlsx({ fy: FY, cards, months });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(`CC Master ${fyLabel(FY)}`);
  if (!ws) throw new Error("worksheet missing");
  return { buf, wb, ws };
}

/* ── THE FIX ──────────────────────────────────────────────────────────────── */

describe("frozen panes — the bug this port exists to fix", () => {
  it("ACTUALLY writes a frozen pane, which SheetJS never did", async () => {
    const cards = [card(1), card(2)];
    const { ws } = await build(cards, monthsFor(cards));
    const view = ws.views?.[0] as
      | { state?: string; xSplit?: number; ySplit?: number }
      | undefined;
    expect(view).toBeDefined();
    expect(view!.state).toBe("frozen");
  });

  it("freezes the 9 static columns, so the card name survives scrolling right", async () => {
    const cards = [card(1)];
    const { ws } = await build(cards, monthsFor(cards));
    const view = ws.views?.[0] as { xSplit?: number };
    expect(view.xSplit).toBe(FROZEN_COLS);
    expect(view.xSplit).toBe(9);
  });

  it("freezes the 3 header rows, so the field names survive scrolling down", async () => {
    const cards = [card(1)];
    const { ws } = await build(cards, monthsFor(cards));
    const view = ws.views?.[0] as { ySplit?: number };
    expect(view.ySplit).toBe(FROZEN_ROWS);
    expect(view.ySplit).toBe(3);
  });

  it("keeps the split in step with the header rows it is supposed to pin", async () => {
    // If a header row is ever added without moving the split, the new row
    // scrolls away and the freeze is subtly wrong again. Row FROZEN_ROWS must
    // be the LAST header row (the field names) and FROZEN_ROWS+1 the first card.
    const cards = [card(1)];
    const { ws } = await build(cards, monthsFor(cards));
    expect(ws.getRow(FROZEN_ROWS).getCell(1).value).toBe(STATIC_HEADERS[0]);
    expect(ws.getRow(FROZEN_ROWS + 1).getCell(1).value).toBe("1"); // card 1's S. No
    // And the last frozen COLUMN must be the last static header.
    expect(ws.getRow(FROZEN_ROWS).getCell(FROZEN_COLS).value).toBe(
      STATIC_HEADERS[STATIC_HEADERS.length - 1],
    );
  });
});

/* ── A faithful port ──────────────────────────────────────────────────────── */

describe("the sheet's shape is unchanged by the port", () => {
  it("is a real .xlsx, named for the financial year", async () => {
    const cards = [card(1)];
    const { buf, wb } = await build(cards, monthsFor(cards));
    expect(Buffer.from(buf).subarray(0, 2).toString()).toBe("PK");
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0]!.name).toBe(`CC Master ${fyLabel(FY)}`);
  });

  it("lays out 9 static columns then 12 blocks of 9 month fields", async () => {
    const cards = [card(1)];
    const { ws } = await build(cards, monthsFor(cards));
    const expected = 9 + 12 * 9;
    expect(expected).toBe(117);
    expect(ws.columnCount).toBe(expected);

    const header = ws.getRow(FROZEN_ROWS);
    STATIC_HEADERS.forEach((h, i) => expect(header.getCell(i + 1).value).toBe(h));
    // First month block, right after the static columns.
    MONTH_FIELDS.forEach((f, i) =>
      expect(header.getCell(FROZEN_COLS + 1 + i).value).toBe(f),
    );
    // And the LAST block — 12th month, 9th field, i.e. column 117.
    expect(header.getCell(117).value).toBe(MONTH_FIELDS[MONTH_FIELDS.length - 1]);
  });

  it("puts each month's label over the first cell of its block", async () => {
    const cards = [card(1)];
    const { ws } = await build(cards, monthsFor(cards));
    const band = ws.getRow(2);
    fyMonthCols(FY).forEach((c, i) => {
      const col = FROZEN_COLS + 1 + i * MONTH_FIELDS.length;
      expect(band.getCell(col).value).toBe(c.yearLabel);
    });
    // The 9 static columns carry no band label.
    for (let c = 1; c <= FROZEN_COLS; c++) {
      expect(band.getCell(c).value ?? "").toBe("");
    }
  });

  it("writes one row per card, in the order given", async () => {
    const cards = [card(1), card(2), card(3)];
    const { ws } = await build(cards, monthsFor(cards));
    expect(ws.rowCount).toBe(FROZEN_ROWS + cards.length);
    cards.forEach((c, i) => {
      expect(ws.getRow(FROZEN_ROWS + 1 + i).getCell(3).value).toBe(c.cardName);
    });
  });

  it("puts every month's data in the right block", async () => {
    const cards = [card(1), card(2)];
    const { ws } = await build(cards, monthsFor(cards));
    // `notes` is the 9th field of each block and was seeded as "<cardId>:<month>",
    // so a shifted or transposed block shows up immediately.
    cards.forEach((c, ci) => {
      const row = ws.getRow(FROZEN_ROWS + 1 + ci);
      fyMonthCols(FY).forEach((col, mi) => {
        const notesCol = FROZEN_COLS + mi * MONTH_FIELDS.length + MONTH_FIELDS.length;
        expect(row.getCell(notesCol).value).toBe(`${c.id}:${col.month}`);
      });
    });
  });

  it("sets a width on every one of the 117 columns", async () => {
    const cards = [card(1)];
    const { ws } = await build(cards, monthsFor(cards));
    for (let c = 1; c <= 117; c++) {
      expect(ws.getColumn(c).width, `column ${c}`).toBeGreaterThan(0);
    }
    // Card Name is the widest static column; month columns are uniform.
    expect(ws.getColumn(3).width!).toBeGreaterThan(ws.getColumn(1).width!);
    expect(ws.getColumn(FROZEN_COLS + 1).width).toBe(ws.getColumn(117).width);
  });
});

/* ── Edges ────────────────────────────────────────────────────────────────── */

describe("edges", () => {
  it("renders a year with NO cards — headers and freeze still correct", async () => {
    const { ws } = await build([], []);
    expect(ws.rowCount).toBe(FROZEN_ROWS);
    const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number };
    expect(view.state).toBe("frozen");
    expect(view.xSplit).toBe(9);
    expect(view.ySplit).toBe(3);
  });

  it("leaves a card with no month records as empty cells, not missing columns", async () => {
    const cards = [card(1)];
    const { ws } = await build(cards, []); // cards, but zero month rows
    const row = ws.getRow(FROZEN_ROWS + 1);
    expect(row.getCell(3).value).toBe("HDFC Regalia 1"); // static data survives
    for (let c = FROZEN_COLS + 1; c <= 117; c++) {
      expect(row.getCell(c).value ?? "").toBe("");
    }
  });

  it("tolerates nulls throughout a card row", async () => {
    const bare: CcCardRow = {
      id: "card-x",
      code: null,
      entityName: null,
      cardName: "Unnamed",
      ecs: null,
      ecsFrom: null,
      stmtPeriod: null,
      stmtStartDay: null,
      dueDay: null,
      softCopyAutoEmail: null,
      sortOrder: null,
    };
    const { ws } = await build([bare], []);
    const row = ws.getRow(FROZEN_ROWS + 1);
    expect(row.getCell(1).value ?? "").toBe("");
    expect(row.getCell(3).value).toBe("Unnamed");
  });

  it("ignores month rows belonging to a card that is not in the sheet", async () => {
    const cards = [card(1)];
    const stray = monthsFor([card(99)]); // records for a card we are not exporting
    const { ws } = await build(cards, stray);
    expect(ws.rowCount).toBe(FROZEN_ROWS + 1);
    expect(ws.getRow(FROZEN_ROWS + 1).getCell(117).value ?? "").toBe("");
  });

  it("scales to a realistic card count", async () => {
    const cards = Array.from({ length: 60 }, (_, i) => card(i + 1));
    const { ws } = await build(cards, monthsFor(cards));
    expect(ws.rowCount).toBe(FROZEN_ROWS + 60);
    expect(ws.getRow(FROZEN_ROWS + 60).getCell(3).value).toBe("HDFC Regalia 60");
  });
});

describe("ccMasterFilename", () => {
  it("strips whatever the FY label uses that a filename cannot", async () => {
    const name = ccMasterFilename(FY);
    expect(name.endsWith(".xlsx")).toBe(true);
    expect(name.startsWith("CC-Master-")).toBe(true);
    // No separators, quotes or spaces that would break Content-Disposition.
    expect(name).toMatch(/^CC-Master-[0-9A-Za-z-]*\.xlsx$/);
  });
});
