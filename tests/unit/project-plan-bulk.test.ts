import { describe, it, expect } from "vitest";
import {
  columnsFor,
  evaluateRows,
  emptyRow,
  findHeaderRow,
  importable,
  mapHeader,
  matchPerson,
  parseDateCell,
  parseMatrix,
  parseText,
  splitCsvLine,
  toPayload,
  type BulkPerson,
  type BulkRow,
} from "@/lib/project-plan/bulk";

/**
 * BULK UPLOAD — the reading and the checking.
 *
 * The dialog shows every row before anything is written, which is the safety
 * net; this is the thing the net is under. Two families of bug matter here and
 * neither is visible by eye in a table of forty rows:
 *
 *   a date read as the WRONG DAY   12/06 is 12 June in this office, and a
 *                                  silently American reading puts forty tasks
 *                                  in the wrong month.
 *   a row that imports when it     a duplicate that slipped its flag, or a
 *   should not                     broken row that re-ticked itself on an edit.
 */

const ROSTER: BulkPerson[] = [
  { id: "e1", name: "Manan Vasa", email: "manan@example.com" },
  { id: "e2", name: "Priya Shah", email: "priya@example.com" },
  { id: "e3", name: "Manan Doshi", email: "doshi@example.com" },
];

describe("columnsFor", () => {
  it("offers Start / End only to the levels that have a schedule", () => {
    expect(columnsFor("action").map((c) => c.field)).toContain("startsAt");
    expect(columnsFor("result").map((c) => c.field)).toContain("endsAt");
    expect(columnsFor("project").map((c) => c.field)).not.toContain("startsAt");
    expect(columnsFor("milestone").map((c) => c.field)).not.toContain("endsAt");
  });
});

describe("mapHeader", () => {
  it("reads the template's own headers", () => {
    expect(mapHeader("Name", "action")).toBe("name");
    expect(mapHeader("Target Date", "action")).toBe("targetDate");
  });

  it("reads what people actually type instead", () => {
    expect(mapHeader("Assigned To", "action")).toBe("owner");
    expect(mapHeader("due_date", "action")).toBe("targetDate");
    expect(mapHeader("  TITLE  ", "action")).toBe("name");
  });

  it("does not map a column the level has nowhere to put", () => {
    expect(mapHeader("Start Date", "milestone")).toBeNull();
    expect(mapHeader("Start Date", "action")).toBe("startsAt");
  });

  it("ignores a column that means nothing here", () => {
    expect(mapHeader("Invoice No", "action")).toBeNull();
    expect(mapHeader("", "action")).toBeNull();
  });
});

describe("findHeaderRow", () => {
  it("skips a title and a blank line above the grid", () => {
    const m = [["Project Plan — Actions"], [""], ["Name", "Owner", "Target Date"], ["Do a thing"]];
    expect(findHeaderRow(m, "action")).toBe(2);
  });

  it("says there is no header when the first row is already data", () => {
    expect(findHeaderRow([["Do a thing"], ["Do another"]], "action")).toBe(-1);
  });
});

describe("parseDateCell", () => {
  it("reads ISO", () => {
    expect(parseDateCell("2026-06-12")).toEqual({ date: "2026-06-12", time: null, ok: true });
  });

  it("reads the format the plan itself prints", () => {
    expect(parseDateCell("12-Jun-2026").date).toBe("2026-06-12");
    expect(parseDateCell("12 June 2026").date).toBe("2026-06-12");
  });

  it("reads a slashed date DAY FIRST — 12/06 is 12 June, not 6 December", () => {
    expect(parseDateCell("12/06/2026").date).toBe("2026-06-12");
    expect(parseDateCell("01/02/2026").date).toBe("2026-02-01");
  });

  it("reads a JS Date without shifting the day", () => {
    // Local-midnight on the 12th must not come back as the 11th, which is what
    // a toISOString round-trip does west of Greenwich.
    expect(parseDateCell(new Date(2026, 5, 12)).date).toBe("2026-06-12");
  });

  it("keeps a time when the cell carries one, and drops it when it does not", () => {
    expect(parseDateCell("2026-06-12 14:30").time).toBe("14:30");
    expect(parseDateCell("2026-06-12 2:30 pm").time).toBe("14:30");
    expect(parseDateCell("2026-06-12").time).toBeNull();
  });

  it("reads an unconverted Excel serial", () => {
    // The sheet's epoch: serial 45000 is 2023-03-15, and 85 days on is 8 June.
    expect(parseDateCell(45_000).date).toBe("2023-03-15");
    expect(parseDateCell(45_085).date).toBe("2023-06-08");
  });

  it("treats a blank cell as blank, not as broken", () => {
    expect(parseDateCell("")).toEqual({ date: null, time: null, ok: true });
    expect(parseDateCell(null)).toEqual({ date: null, time: null, ok: true });
  });

  it("REFUSES a date it cannot read rather than guessing one", () => {
    expect(parseDateCell("next Tuesday").ok).toBe(false);
    expect(parseDateCell("31-Feb-2026").ok).toBe(false);
    expect(parseDateCell("2026-13-01").ok).toBe(false);
  });
});

describe("matchPerson", () => {
  it("matches a full name, whatever the spacing and case", () => {
    expect(matchPerson("manan vasa", ROSTER)).toEqual({ id: "e1", name: "Manan Vasa" });
    expect(matchPerson("  Priya   Shah ", ROSTER)).toEqual({ id: "e2", name: "Priya Shah" });
  });

  it("matches an email", () => {
    expect(matchPerson("priya@example.com", ROSTER)).toEqual({ id: "e2", name: "Priya Shah" });
  });

  it("matches a unique first name", () => {
    expect(matchPerson("Priya", ROSTER)).toEqual({ id: "e2", name: "Priya Shah" });
  });

  it("REFUSES to guess between two people with the same first name", () => {
    expect(matchPerson("Manan", ROSTER)).toBe("ambiguous");
  });

  it("returns null for a blank cell and for a stranger", () => {
    expect(matchPerson("", ROSTER)).toBeNull();
    expect(matchPerson("Someone Else", ROSTER)).toBeNull();
  });
});

describe("splitCsvLine", () => {
  it("keeps a comma that is inside quotes", () => {
    expect(splitCsvLine('Measure, then draft,"Vasa, Manan",2026-06-12')).toEqual([
      "Measure",
      " then draft",
      "Vasa, Manan",
      "2026-06-12",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitCsvLine('"He said ""go""",x')).toEqual(['He said "go"', "x"]);
  });
});

describe("parseText", () => {
  it("reads a bare list of names with no header at all", () => {
    const res = parseText("Measure the mezzanine\nDraft the layout", "action", ROSTER, []);
    expect(res.error).toBeNull();
    expect(res.rows.map((r) => r.name)).toEqual(["Measure the mezzanine", "Draft the layout"]);
    expect(res.rows.every((r) => r.include)).toBe(true);
  });

  it("reads a tab-separated paste out of a spreadsheet", () => {
    const res = parseText(
      "Name\tOwner\tTarget Date\nMeasure the mezzanine\tPriya\t12-Jun-2026",
      "action",
      ROSTER,
      [],
    );
    const row = res.rows[0]!;
    expect(row.name).toBe("Measure the mezzanine");
    expect(row.ownerId).toBe("e2");
    expect(row.targetDate).toBe("2026-06-12");
  });

  it("prefers tabs over commas, so a description keeps its commas", () => {
    const res = parseText(
      "Name\tDescription\nDraft the layout\tMeasure, draw, sign off",
      "action",
      ROSTER,
      [],
    );
    expect(res.rows[0]!.description).toBe("Measure, draw, sign off");
  });

  it("skips blank lines instead of importing empty rows", () => {
    const res = parseText("One\n\n\nTwo\n", "action", ROSTER, []);
    expect(res.rows).toHaveLength(2);
  });

  it("says so rather than returning nothing", () => {
    expect(parseText("   ", "action", ROSTER, []).error).toBeTruthy();
  });
});

describe("parseMatrix", () => {
  const header = ["Name", "Owner", "Target Date", "Start Date", "End Date", "Description"];

  it("puts a bad date on the row that carries it, and unticks that row only", () => {
    const res = parseMatrix(
      [header, ["Good one", "Priya", "2026-06-12", "", "", ""], ["Bad one", "Priya", "someday", "", "", ""]],
      "action",
      ROSTER,
      [],
    );
    expect(res.rows[0]!.include).toBe(true);
    expect(res.rows[1]!.include).toBe(false);
    expect(res.rows[1]!.errors.join(" ")).toMatch(/Target Date/);
  });

  it("warns about an owner it could not place without blocking the row", () => {
    const res = parseMatrix([header, ["A thing", "Manan", "2026-06-12", "", "", ""]], "action", ROSTER, []);
    const row = res.rows[0]!;
    expect(row.ownerId).toBeNull();
    expect(row.errors).toEqual([]);
    expect(row.include).toBe(true);
    expect(row.warnings.join(" ")).toMatch(/No match/);
  });

  it("says an executable row has no task yet when it lacks an owner or a date", () => {
    const res = parseMatrix([header, ["A thing", "", "", "", "", ""]], "action", ROSTER, []);
    expect(res.rows[0]!.warnings.join(" ")).toMatch(/No task yet/);
  });

  it("does not say that about a container, which never becomes a task", () => {
    const res = parseMatrix([["Name"], ["A milestone"]], "milestone", ROSTER, []);
    expect(res.rows[0]!.warnings.join(" ")).not.toMatch(/task/);
  });

  it("refuses a sheet with no Name column rather than importing blank rows", () => {
    const res = parseMatrix([["Owner", "Target Date"], ["Priya", "2026-06-12"]], "action", ROSTER, []);
    expect(res.rows).toHaveLength(0);
    expect(res.error).toMatch(/Name/);
  });

  it("ignores Start / End on a level that has no schedule", () => {
    const res = parseMatrix(
      [["Name", "Start Date"], ["A milestone", "2026-06-12"]],
      "milestone",
      ROSTER,
      [],
    );
    expect(res.rows[0]!.startDate).toBe("");
  });

  it("catches an end that lands before its start", () => {
    const res = parseMatrix(
      [header, ["Backwards", "", "", "2026-06-20", "2026-06-12", ""]],
      "action",
      ROSTER,
      [],
    );
    expect(res.rows[0]!.errors).toContain("End is before Start");
    expect(res.rows[0]!.include).toBe(false);
  });
});

describe("evaluateRows — duplicates", () => {
  function rowsNamed(...names: string[]): BulkRow[] {
    return names.map((n, i) => ({ ...emptyRow(i + 1), name: n }));
  }

  it("flags a name already sitting under the parent, and unticks it", () => {
    const out = evaluateRows(rowsNamed("Measure the mezzanine"), "action", ["measure the  mezzanine"]);
    expect(out[0]!.duplicate).toBe("existing");
    expect(out[0]!.include).toBe(false);
  });

  it("flags the SECOND of two identical rows, not the first", () => {
    const out = evaluateRows(rowsNamed("Same", "Same"), "action", []);
    expect(out[0]!.duplicate).toBeNull();
    expect(out[0]!.include).toBe(true);
    expect(out[1]!.duplicate).toBe("file");
    expect(out[1]!.include).toBe(false);
  });

  it("clears the flag when the clashing name is renamed", () => {
    const flagged = evaluateRows(rowsNamed("Same", "Same"), "action", []);
    const fixed = evaluateRows(
      flagged.map((r) => (r.key === 2 ? { ...r, name: "Different" } : r)),
      "action",
      [],
    );
    expect(fixed[1]!.duplicate).toBeNull();
  });

  it("KEEPS a duplicate the user deliberately ticked through an unrelated edit", () => {
    const flagged = evaluateRows(rowsNamed("Same", "Same"), "action", []);
    const ticked = flagged.map((r) => (r.key === 2 ? { ...r, include: true } : r));
    const after = evaluateRows(
      ticked.map((r) => (r.key === 1 ? { ...r, description: "edited" } : r)),
      "action",
      [],
    );
    expect(after[1]!.include).toBe(true);
  });

  it("never re-ticks a row that is still broken", () => {
    const broken = evaluateRows([{ ...emptyRow(1), name: "" }], "action", []);
    expect(broken[0]!.include).toBe(false);
    const still = evaluateRows(broken.map((r) => ({ ...r, include: true })), "action", []);
    expect(still[0]!.include).toBe(false);
  });
});

describe("importable + toPayload", () => {
  it("sends only the ticked, unbroken rows", () => {
    const rows = evaluateRows(
      [
        { ...emptyRow(1), name: "Keep" },
        { ...emptyRow(2), name: "" },
        { ...emptyRow(3), name: "Untick", include: false },
      ],
      "action",
      [],
    );
    expect(importable(rows).map((r) => r.name)).toEqual(["Keep"]);
  });

  it("turns a row into the exact shape the server action takes", () => {
    const row: BulkRow = {
      ...emptyRow(1),
      name: "  Measure the mezzanine  ",
      ownerId: "e2",
      targetDate: "2026-06-12",
      startDate: "2026-06-10",
      startTime: "09:30",
      endDate: "2026-06-12",
      endTime: null,
      description: "  scope  ",
    };
    const out = toPayload(row, "action");
    expect(out.name).toBe("Measure the mezzanine");
    expect(out.ownerId).toBe("e2");
    expect(out.targetDate).toBe("2026-06-12");
    expect(out.description).toBe("scope");
    // A local 09:30 on the 10th, whatever the box's zone.
    expect(new Date(out.startsAt!).getTime()).toBe(new Date(2026, 5, 10, 9, 30).getTime());
    expect(new Date(out.endsAt!).getTime()).toBe(new Date(2026, 5, 12, 0, 0).getTime());
  });

  it("drops Start / End for a level that has no schedule", () => {
    const row: BulkRow = { ...emptyRow(1), name: "A milestone", startDate: "2026-06-10", endDate: "2026-06-12" };
    const out = toPayload(row, "milestone");
    expect(out.startsAt).toBeNull();
    expect(out.endsAt).toBeNull();
  });

  it("sends nulls rather than empty strings for the optional fields", () => {
    const out = toPayload({ ...emptyRow(1), name: "Bare" }, "action");
    expect(out).toEqual({
      name: "Bare",
      ownerId: null,
      targetDate: null,
      startsAt: null,
      endsAt: null,
      description: null,
    });
  });
});
