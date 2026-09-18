import { describe, it, expect } from "vitest";
import {
  allAssignedIds,
  fromAssignmentRows,
  hasAnyAssignee,
  toAssignmentRows,
  type TargetPeople,
} from "@/lib/jd/assignment-targets";

/**
 * ASSIGNING PEOPLE PER DESTINATION (account holder, 2026-09-12).
 *
 * The JD form has three boxes — DCC, WMS, Event Checklist — each with its own
 * roster. This is the mapping between those three lists and the rows in
 * `jd_assignments`, and the two failures it exists to prevent are the ones
 * nobody would notice for weeks: somebody assigned to a destination they were
 * never picked for, and somebody receiving the same task twice.
 */

const on = { dcc: true, wms: true, event: true };
const people = (p: Partial<TargetPeople>): TargetPeople => ({
  dcc: [],
  wms: [],
  event: [],
  ...p,
});

describe("three lists becoming rows", () => {
  it("writes one row per person, whatever they are assigned to", () => {
    const rows = toAssignmentRows(people({ dcc: ["a"], wms: ["b"] }), on);
    expect(rows).toEqual([
      { employeeId: "a", forDcc: true, forWms: false, forEvent: false },
      { employeeId: "b", forDcc: false, forWms: true, forEvent: false },
    ]);
  });

  it("MERGES a person picked in two boxes into ONE row", () => {
    /* The whole reason for flags instead of a row per destination. Two rows for
       one person collides with the partial unique index on
       (jd_id, employee_id) — and if that index were dropped to allow it, the
       push job would hand the same person the same task twice. */
    const rows = toAssignmentRows(people({ dcc: ["a"], wms: ["a"], event: ["a"] }), on);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ employeeId: "a", forDcc: true, forWms: true, forEvent: true });
  });

  it("saves nobody for a destination that is switched OFF", () => {
    /* An assignment to a destination the job does not go to is a row that does
       nothing — until somebody ticks the box months later and is surprised by
       who starts receiving the work. */
    const rows = toAssignmentRows(people({ dcc: ["a"], wms: ["b"] }), {
      dcc: true,
      wms: false,
      event: true,
    });
    expect(rows.map((r) => r.employeeId)).toEqual(["a"]);
  });

  it("drops a person entirely when their only destination is off", () => {
    const rows = toAssignmentRows(people({ wms: ["b"] }), { dcc: true, wms: false, event: true });
    expect(rows).toEqual([]);
  });

  it("keeps a person whose OTHER destination is still on", () => {
    // The surprise to avoid: switching off the WMS quietly unassigning someone
    // from the DCC as well.
    const rows = toAssignmentRows(people({ dcc: ["a"], wms: ["a"] }), {
      dcc: true,
      wms: false,
      event: true,
    });
    expect(rows).toEqual([{ employeeId: "a", forDcc: true, forWms: false, forEvent: false }]);
  });

  it("ignores an empty id rather than writing a row for nobody", () => {
    expect(toAssignmentRows(people({ dcc: ["", "a"] }), on).map((r) => r.employeeId)).toEqual(["a"]);
  });

  it("writes nothing when every roster is empty", () => {
    // A legitimate answer: it means the seat's holder does it.
    expect(toAssignmentRows(people({}), on)).toEqual([]);
  });
});

describe("rows becoming three lists", () => {
  it("is the inverse of writing them", () => {
    const original = people({ dcc: ["a", "b"], wms: ["a"], event: ["c"] });
    expect(fromAssignmentRows(toAssignmentRows(original, on))).toEqual(original);
  });

  it("puts a multi-flag row in each of its lists", () => {
    const back = fromAssignmentRows([
      { employeeId: "a", forDcc: true, forWms: true, forEvent: false },
    ]);
    expect(back).toEqual({ dcc: ["a"], wms: ["a"], event: [] });
  });

  it("drops a row flagged for nothing", () => {
    // Possible in stored data: migration 0225 backfills from the JD's own push
    // flags, and a JD that pushed nowhere leaves its assignments flagless.
    const back = fromAssignmentRows([
      { employeeId: "a", forDcc: false, forWms: false, forEvent: false },
    ]);
    expect(back).toEqual({ dcc: [], wms: [], event: [] });
  });
});

describe("the summary the Bank's column shows", () => {
  it("lists everybody once, across all three", () => {
    expect(allAssignedIds(people({ dcc: ["a", "b"], wms: ["a"], event: ["c", "a"] }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("knows when nobody is named", () => {
    expect(hasAnyAssignee(people({}))).toBe(false);
    expect(hasAnyAssignee(people({ event: ["c"] }))).toBe(true);
  });
});
