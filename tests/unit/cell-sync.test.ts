import { describe, it, expect } from "vitest";
import { mergeServerCells, sameCells, isLatestWrite } from "@/lib/accounts/cell-sync";

/**
 * These tests stand in for the bug report "the Bank Balance page loses what I
 * type when I refresh". The write path was never broken — production holds the
 * rows. What was broken is the rule below: the old grid replaced its whole state
 * from the server on every revalidate, and every cell save triggers one.
 */
describe("mergeServerCells", () => {
  it("takes the server's value for a cell nobody is editing", () => {
    const out = mergeServerCells({
      server: { "a:w1": "5000" },
      current: { "a:w1": "4000" },
      protectedKeys: [],
    });
    expect(out).toEqual({ "a:w1": "5000" });
  });

  it("does NOT overwrite a cell the user is still typing in", () => {
    // The exact regression: save cell A, its revalidate pushes a snapshot down,
    // and B — typed since — must survive it.
    const out = mergeServerCells({
      server: { "a:w1": "5000" },
      current: { "a:w1": "5000", "b:w1": "77" },
      protectedKeys: ["b:w1"],
    });
    expect(out).toEqual({ "a:w1": "5000", "b:w1": "77" });
  });

  it("does NOT overwrite a cell whose write is still in flight", () => {
    // The server snapshot predates the write, so its value is the OLD one.
    const out = mergeServerCells({
      server: { "a:w1": "4000" },
      current: { "a:w1": "9000" },
      protectedKeys: ["a:w1"],
    });
    expect(out["a:w1"]).toBe("9000");
  });

  it("drops a cell the server has cleared", () => {
    const out = mergeServerCells({
      server: {},
      current: { "a:w1": "5000" },
      protectedKeys: [],
    });
    expect(out).toEqual({});
  });

  it("keeps a cleared-on-the-server cell when the user is mid-edit", () => {
    const out = mergeServerCells({
      server: {},
      current: { "a:w1": "123" },
      protectedKeys: ["a:w1"],
    });
    expect(out).toEqual({ "a:w1": "123" });
  });

  it("treats an emptied protected cell as an intentional clear", () => {
    // Selecting a cell's contents and deleting them must not resurrect the old
    // value from the server copy.
    const out = mergeServerCells({
      server: { "a:w1": "5000" },
      current: { "a:w1": "" },
      protectedKeys: ["a:w1"],
    });
    expect(out["a:w1"]).toBeUndefined();
  });

  it("returns the same object when nothing would change, so React can skip", () => {
    // A grid that re-renders on every revalidate steals focus and drops the caret.
    const current = { "a:w1": "5000" };
    const out = mergeServerCells({ server: { "a:w1": "5000" }, current, protectedKeys: [] });
    expect(out).toBe(current);
  });

  it("survives a whole interleaved sequence", () => {
    let grid: Record<string, string> = {};
    // Server has one saved cell.
    grid = mergeServerCells({ server: { "a:w1": "100" }, current: grid, protectedKeys: [] });
    // User types into a second cell.
    grid = { ...grid, "b:w1": "200" };
    // Cell A's save revalidates; the snapshot has no idea about B.
    grid = mergeServerCells({ server: { "a:w1": "100" }, current: grid, protectedKeys: ["b:w1"] });
    expect(grid).toEqual({ "a:w1": "100", "b:w1": "200" });
    // B's write lands and the next snapshot carries it; B is no longer protected.
    grid = mergeServerCells({ server: { "a:w1": "100", "b:w1": "200" }, current: grid, protectedKeys: [] });
    expect(grid).toEqual({ "a:w1": "100", "b:w1": "200" });
  });
});

describe("sameCells", () => {
  it("compares by value, not identity", () => {
    expect(sameCells({ a: "1" }, { a: "1" })).toBe(true);
    expect(sameCells({ a: "1" }, { a: "2" })).toBe(false);
    expect(sameCells({ a: "1" }, { a: "1", b: "2" })).toBe(false);
    expect(sameCells({}, {})).toBe(true);
  });
});

describe("isLatestWrite", () => {
  it("lets the newest write settle its cell", () => {
    const seq = new Map([["a:w1", 2]]);
    expect(isLatestWrite(seq, "a:w1", 2)).toBe(true);
  });

  it("silences a slow write that a newer edit has overtaken", () => {
    // Otherwise a save that started first but finished last would restore the
    // value the user has already replaced.
    const seq = new Map([["a:w1", 3]]);
    expect(isLatestWrite(seq, "a:w1", 2)).toBe(false);
  });

  it("treats an unknown cell as having no outstanding write", () => {
    expect(isLatestWrite(new Map(), "a:w1", 1)).toBe(false);
  });
});
