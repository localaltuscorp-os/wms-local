import { describe, it, expect } from "vitest";
import {
  OPERATIONS_AREAS,
  isOperationsItemActive,
  operationsAreaForPath,
} from "@/lib/operations/nav";

/**
 * The room's shape: a FIXED rail of four areas, and the current area's pages as
 * a quick-access row on top. These pin the matching, which is what decides
 * which row appears and which button in it reads active.
 */
describe("OPERATIONS_AREAS", () => {
  it("holds the four areas in rail order", () => {
    expect(OPERATIONS_AREAS.map((a) => a.id)).toEqual([
      "handholding",
      "events",
      "checklist",
      "guidelines",
    ]);
  });

  it("gives every area a destination and at least one prefix", () => {
    for (const a of OPERATIONS_AREAS) {
      expect(a.href, a.id).toMatch(/^\//);
      expect(a.prefixes.length, a.id).toBeGreaterThan(0);
      expect(a.label, a.id).toBeTruthy();
      expect(a.tagline, a.id).toBeTruthy();
    }
  });

  it("keeps the two absorbed areas on their ORIGINAL paths, so old links resolve", () => {
    expect(OPERATIONS_AREAS.find((a) => a.id === "handholding")!.href).toBe(
      "/people-allocation",
    );
    expect(OPERATIONS_AREAS.find((a) => a.id === "events")!.href).toBe("/events");
  });

  it("points every sub-item inside its own area's prefix", () => {
    for (const a of OPERATIONS_AREAS) {
      for (const it of a.items) {
        expect(
          a.prefixes.some((p) => it.href === p || it.href.startsWith(`${p}/`)),
          `${a.id} › ${it.label} (${it.href})`,
        ).toBe(true);
      }
    }
  });

  it("has no duplicate hrefs across the whole room", () => {
    const hrefs = OPERATIONS_AREAS.flatMap((a) => a.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("operationsAreaForPath", () => {
  it("finds the area a page belongs to", () => {
    expect(operationsAreaForPath("/people-allocation")?.id).toBe("handholding");
    expect(operationsAreaForPath("/people-allocation/participants")?.id).toBe("handholding");
    expect(operationsAreaForPath("/events")?.id).toBe("events");
    expect(operationsAreaForPath("/events/calendar")?.id).toBe("events");
    expect(operationsAreaForPath("/operations/checklist")?.id).toBe("checklist");
    expect(operationsAreaForPath("/operations/guidelines")?.id).toBe("guidelines");
  });

  it("returns null on the front door — it has no row of its own", () => {
    expect(operationsAreaForPath("/operations")).toBeNull();
  });

  it("does not match a path that merely starts with the same letters", () => {
    // The guard that stops /events-archive or /operations-x borrowing a row.
    expect(operationsAreaForPath("/events-archive")).toBeNull();
    expect(operationsAreaForPath("/people-allocation-old")).toBeNull();
  });
});

describe("isOperationsItemActive", () => {
  const hh = OPERATIONS_AREAS.find((a) => a.id === "handholding")!;
  const board = hh.items.find((i) => i.href === "/people-allocation")!;
  const participants = hh.items.find((i) => i.href === "/people-allocation/participants")!;

  it("lights EXACTLY one button on a child route", () => {
    // The board is `exact`; without that flag it would stay lit here and two
    // buttons would read active at once.
    expect(board.exact).toBe(true);
    expect(isOperationsItemActive(board, "/people-allocation/participants")).toBe(false);
    expect(isOperationsItemActive(participants, "/people-allocation/participants")).toBe(true);
  });

  it("lights the board on its own route", () => {
    expect(isOperationsItemActive(board, "/people-allocation")).toBe(true);
  });

  it("keeps a non-exact item lit on its own sub-routes", () => {
    expect(isOperationsItemActive(participants, "/people-allocation/participants/abc")).toBe(
      true,
    );
  });
});

describe("the quick-access row only appears where there is a choice", () => {
  it("gives the two multi-page areas a row", () => {
    // OperationsQuickNav renders nothing below two items.
    for (const id of ["handholding", "events"] as const) {
      expect(OPERATIONS_AREAS.find((a) => a.id === id)!.items.length).toBeGreaterThan(1);
    }
  });

  it("gives the single-page areas none", () => {
    for (const id of ["checklist", "guidelines"] as const) {
      expect(OPERATIONS_AREAS.find((a) => a.id === id)!.items.length).toBeLessThan(2);
    }
  });
});
