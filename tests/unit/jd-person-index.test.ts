import { describe, it, expect } from "vitest";
import { buildPersonIndex, initialsOf } from "@/lib/jd/person-index";

/**
 * The badge under each name in the person picker, and the sections beneath it,
 * are the SAME numbers — one index, built once, shared by both. These pin the
 * arithmetic, and in particular the double-count it exists to avoid.
 */

const NOBODY = { dcc: [], wms: [], event: [] };

function entry(over: Partial<Parameters<typeof buildPersonIndex>[0][number]> = {}) {
  return {
    isActive: true,
    positionId: null,
    ownerEmployeeId: null,
    targetPeople: NOBODY,
    ...over,
  };
}

describe("buildPersonIndex", () => {
  it("counts a seat's tasks for whoever holds the seat", () => {
    const idx = buildPersonIndex(
      [entry({ positionId: "seat-1" }), entry({ positionId: "seat-1" })],
      [{ employeeId: "amit", positionId: "seat-1" }],
    );
    expect(idx.countsFor("amit")).toEqual({ seat: 2, byName: 0, personal: 0, total: 2 });
    // Nobody else inherits it.
    expect(idx.countsFor("bina").total).toBe(0);
  });

  it("DOES NOT count a task twice when somebody is named on their OWN seat's JD", () => {
    /* The ordinary case: the tea round belongs to Reception and the receptionist
       is also named on it. Counting the seat AND the name would make every such
       badge read double — for the most common shape there is. */
    const idx = buildPersonIndex(
      [entry({ positionId: "seat-1", targetPeople: { dcc: ["amit"], wms: ["amit"], event: [] } })],
      [{ employeeId: "amit", positionId: "seat-1" }],
    );
    expect(idx.countsFor("amit")).toEqual({ seat: 1, byName: 0, personal: 0, total: 1 });
  });

  it("counts a task from ANOTHER seat as 'by name'", () => {
    const idx = buildPersonIndex(
      [entry({ positionId: "seat-2", targetPeople: { dcc: ["amit"], wms: [], event: [] } })],
      [{ employeeId: "amit", positionId: "seat-1" }],
    );
    expect(idx.countsFor("amit")).toEqual({ seat: 0, byName: 1, personal: 0, total: 1 });
  });

  it("counts a person named under several destinations once", () => {
    // One row with three flags is ONE task, not three.
    const idx = buildPersonIndex(
      [entry({ positionId: "seat-2", targetPeople: { dcc: ["amit"], wms: ["amit"], event: ["amit"] } })],
      [],
    );
    expect(idx.countsFor("amit").byName).toBe(1);
  });

  it("counts a personal task against its owner and nothing else", () => {
    const idx = buildPersonIndex(
      [entry({ ownerEmployeeId: "amit", targetPeople: { dcc: ["bina"], wms: [], event: [] } })],
      [],
    );
    expect(idx.countsFor("amit")).toEqual({ seat: 0, byName: 0, personal: 1, total: 1 });
    // A personal task belongs to nobody's seat, so its assignment lists are not
    // consulted — Bina is not carrying Amit's personal task.
    expect(idx.countsFor("bina").total).toBe(0);
  });

  it("ignores retired rows", () => {
    const idx = buildPersonIndex(
      [entry({ positionId: "seat-1", isActive: false }), entry({ ownerEmployeeId: "amit", isActive: false })],
      [{ employeeId: "amit", positionId: "seat-1" }],
    );
    expect(idx.countsFor("amit").total).toBe(0);
  });

  it("reports which seat each person holds", () => {
    const idx = buildPersonIndex([], [{ employeeId: "amit", positionId: "seat-1" }]);
    expect(idx.seatOf.get("amit")).toBe("seat-1");
    expect(idx.seatOf.has("bina")).toBe(false);
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Daniel Sayyed")).toBe("DS");
    expect(initialsOf("Prakash Kumar Kumawat")).toBe("PK");
    expect(initialsOf("Madonna")).toBe("M");
  });

  it("survives the messy names a real directory holds", () => {
    expect(initialsOf("  rashmi   tripathi ")).toBe("RT");
    expect(initialsOf("")).toBe("");
  });
});
