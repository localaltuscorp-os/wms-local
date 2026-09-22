import { describe, it, expect } from "vitest";
import { parseClock, parseSheetDate, parseSheetPaste } from "@/lib/exec-calendar/import";

/**
 * Importing a copied block of the master sheet. The fixture below is the shape
 * of the real thing: a month title row, a week-number row, hourly times down
 * the first column, and long blocks drawn as the SAME TEXT repeated down
 * consecutive rows.
 */

describe("reading a clock cell", () => {
  it("reads the sheet's 12-hour labels", () => {
    expect(parseClock("7:00 AM")).toBe(420);
    expect(parseClock("12:00 PM")).toBe(720);
    expect(parseClock("12:00 AM")).toBe(0);
    expect(parseClock("4:30 pm")).toBe(16 * 60 + 30);
  });

  it("reads 24-hour and bare hours too", () => {
    expect(parseClock("16:30")).toBe(990);
    expect(parseClock("7")).toBe(420);
  });

  it("refuses what is not a time", () => {
    expect(parseClock("Week No 11")).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("25:00")).toBeNull();
  });
});

describe("reading a date cell", () => {
  it("fills in the year the sheet leaves out", () => {
    expect(parseSheetDate("1 Jul", 2026)).toBe("2026-07-01");
    expect(parseSheetDate("14 Sep", 2026)).toBe("2026-09-14");
  });

  it("takes an explicit year when there is one", () => {
    expect(parseSheetDate("14 Sep 2025", 2026)).toBe("2025-09-14");
    expect(parseSheetDate("2024-03-02", 2026)).toBe("2024-03-02");
    expect(parseSheetDate("02/03/2024", 2026)).toBe("2024-03-02");
  });

  it("refuses a weekday or a blank", () => {
    expect(parseSheetDate("Monday", 2026)).toBeNull();
    expect(parseSheetDate("", 2026)).toBeNull();
  });
});

/* A copy of the real sheet: two days, hourly rows, repeated cells. */
const PASTE = [
  "July 2026\t\t",
  "Week No 11\tMonday\tTuesday",
  "\t1 Jul\t2 Jul",
  "7:00 AM\tManan Sir Break\t",
  "8:00 AM\tManan Sir Break\t",
  "9:00 AM\tManan Sir Break\tBNI Premier",
  "10:00 AM\t\tBNI Premier",
  "11:00 AM\tSukhsons\t",
  "12:00 PM\tSukhsons\t",
].join("\n");

describe("importing a pasted sheet block", () => {
  const { blocks, warnings } = parseSheetPaste(PASTE, { year: 2026, slotMin: 60 });

  it("skips the title and week-number rows and finds the dates", () => {
    expect(blocks.every((b) => b.day === "2026-07-01" || b.day === "2026-07-02")).toBe(true);
  });

  it("COLLAPSES a repeated cell into one long block, not one per row", () => {
    const brk = blocks.find((b) => b.title === "Manan Sir Break")!;
    expect(brk).toBeDefined();
    expect(brk.startMin).toBe(7 * 60);
    expect(brk.endMin).toBe(10 * 60); // 07:00 through the 09:00 row, which ends at 10:00
    expect(blocks.filter((b) => b.title === "Manan Sir Break")).toHaveLength(1);
  });

  it("gives a single-row entry one slot of length", () => {
    const bni = blocks.find((b) => b.title === "BNI Premier")!;
    expect(bni.startMin).toBe(9 * 60);
    expect(bni.endMin).toBe(11 * 60); // two rows: 09:00 and 10:00
  });

  it("does not run two separate blocks together across a gap", () => {
    const sukh = blocks.find((b) => b.title === "Sukhsons")!;
    expect(sukh.startMin).toBe(11 * 60);
    expect(sukh.endMin).toBe(13 * 60);
  });

  it("puts each column on its own date", () => {
    expect(blocks.find((b) => b.title === "BNI Premier")!.day).toBe("2026-07-02");
    expect(blocks.find((b) => b.title === "Sukhsons")!.day).toBe("2026-07-01");
  });

  it("categorises what it recognises and admits what it cannot", () => {
    expect(blocks.find((b) => b.title === "Manan Sir Break")!.categoryKey).toBe("wkly_off");
    expect(blocks.find((b) => b.title === "BNI Premier")!.categoryKey).toBe("sales");
    // "Sukhsons" is a client NAME the code has never seen — not guessed.
    expect(blocks.find((b) => b.title === "Sukhsons")!.categoryKey).toBeNull();
    expect(warnings.join(" ")).toMatch(/could not be categorised/);
  });

  it("returns them in day and time order", () => {
    const keys = blocks.map((b) => `${b.day} ${b.startMin}`);
    expect([...keys].sort()).toEqual(keys.map((k) => k).sort());
  });
});

describe("when the paste is not a sheet", () => {
  it("says so rather than importing nothing silently", () => {
    expect(parseSheetPaste("hello", { year: 2026 }).warnings[0]).toMatch(/looks like a grid/);
  });

  it("complains when there is no date row", () => {
    const r = parseSheetPaste("7:00 AM\tThing\n8:00 AM\tThing", { year: 2026 });
    expect(r.blocks).toEqual([]);
    expect(r.warnings[0]).toMatch(/No date row/);
  });

  it("complains when there is no time column", () => {
    const r = parseSheetPaste("\t1 Jul\t2 Jul\nfoo\tThing\tThing", { year: 2026 });
    expect(r.blocks).toEqual([]);
    expect(r.warnings[0]).toMatch(/No time column/);
  });

  it("warns about a column of entries with no date above it", () => {
    const r = parseSheetPaste(
      ["\t1 Jul\t2 Jul\tnotadate", "7:00 AM\tA\tB\tC"].join("\n"),
      { year: 2026 },
    );
    expect(r.warnings.join(" ")).toMatch(/no date in the header/);
  });
});
