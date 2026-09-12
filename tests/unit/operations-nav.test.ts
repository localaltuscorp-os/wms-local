import { describe, it, expect } from "vitest";
import {
  OPERATIONS_AREAS,
  OPERATIONS_LANDING_AREA,
  isOperationsItemActive,
  operationsAreaForPath,
} from "@/lib/operations/nav";

/**
 * The room's shape: a FIXED rail of seven areas, and the current area's pages as
 * a quick-access row on top. These pin the matching, which is what decides
 * which row appears and which button in it reads active.
 */
describe("OPERATIONS_AREAS", () => {
  it("holds the seven areas in alphabetical rail order", () => {
    /* ALPHABETICAL BY LABEL since 2026-09-12, replacing an order-by-importance
       that only its author could predict. Written out rather than computed so
       the expectation is readable — the next test is the one that enforces the
       rule. */
    expect(OPERATIONS_AREAS.map((a) => a.id)).toEqual([
      "broadcasts",
      "checklist",
      "guidelines",
      "handholding",
      "jobdescription",
      "events", // Monthly Events Master — sorted by the LABEL, not the id
      "training",
    ]);
  });

  it("stays sorted when somebody adds the eighth area", () => {
    /* The point of the alphabet is that it needs no argument — but only if the
       next arrival actually lands in place. A new area appended to the end of
       the array fails here rather than quietly reintroducing an order nobody
       can predict. */
    const labels = OPERATIONS_AREAS.map((a) => a.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("opens the room on Hand-holding, whatever the rail's order", () => {
    /* THE LANDING IS NAMED, NOT POSITIONAL. `/operations` forwarded to
       `OPERATIONS_AREAS[0]` until the rail was alphabetised, at which point the
       first entry became Broadcasts — a cosmetic sort would have silently moved
       where the room opens. Hand-holding is the landing because it was asked
       for; this is what keeps the two decisions apart. */
    expect(OPERATIONS_LANDING_AREA).toBe("handholding");
    const landing = OPERATIONS_AREAS.find((a) => a.id === OPERATIONS_LANDING_AREA);
    expect(landing?.href).toBe("/people-allocation");
  });

  it("gives every area a destination and at least one prefix", () => {
    for (const a of OPERATIONS_AREAS) {
      expect(a.href, a.id).toMatch(/^\//);
      expect(a.prefixes.length, a.id).toBeGreaterThan(0);
      expect(a.label, a.id).toBeTruthy();
      expect(a.tagline, a.id).toBeTruthy();
    }
  });

  it("keeps the absorbed areas on paths that still resolve, so old links work", () => {
    expect(OPERATIONS_AREAS.find((a) => a.id === "handholding")!.href).toBe(
      "/people-allocation",
    );
    expect(OPERATIONS_AREAS.find((a) => a.id === "events")!.href).toBe("/events");
    // Training absorbed 2026-09-12. Its pages did NOT move under /operations —
    // every bookmark, every link in a sent email and every `/training/<id>`
    // deep link keeps working, which is the whole reason absorbing a room is
    // cheap here. Only the rail around them changed.
    expect(OPERATIONS_AREAS.find((a) => a.id === "training")!.href).toBe("/training");
    // Broadcasts never lived under /hr, so its path did not have to move at all
    // — only the chrome around it was HR's.
    expect(OPERATIONS_AREAS.find((a) => a.id === "broadcasts")!.href).toBe("/communications");
    /* Job Description is the exception that proves the rule: it DID have to
       move, from /hr/job-description, because everything under app/(app)/hr/ is
       wrapped in the HR console shell. /hr/job-description redirects here. */
    expect(OPERATIONS_AREAS.find((a) => a.id === "jobdescription")!.href).toBe(
      "/operations/job-description",
    );
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
    expect(operationsAreaForPath("/training")?.id).toBe("training");
    expect(operationsAreaForPath("/training/feedback")?.id).toBe("training");
    expect(operationsAreaForPath("/operations/job-description")?.id).toBe("jobdescription");
    expect(operationsAreaForPath("/communications")?.id).toBe("broadcasts");
    expect(operationsAreaForPath("/communications/compose")?.id).toBe("broadcasts");
  });

  it("returns null on /operations itself — it is a forwarder, not an area", () => {
    expect(operationsAreaForPath("/operations")).toBeNull();
  });

  it("never lets /operations forward to itself", () => {
    /* app/(app)/operations/page.tsx redirects to OPERATIONS_AREAS[0].href. If an
       area ever claimed "/operations" as its own href, that redirect would point
       at the page issuing it and the room would hang in a loop — a failure that
       shows up as a dead room in the browser and nowhere in a typecheck. The
       forwarder itself cannot assert this, so it is asserted here. */
    for (const a of OPERATIONS_AREAS) {
      expect(a.href, `${a.id} may not own the forwarder's own path`).not.toBe(
        "/operations",
      );
    }
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
  it("gives the multi-page areas a row", () => {
    // OperationsQuickNav renders nothing below two items.
    for (const id of ["handholding", "events", "training"] as const) {
      expect(OPERATIONS_AREAS.find((a) => a.id === id)!.items.length).toBeGreaterThan(1);
    }
  });

  it("gives the single-page areas none", () => {
    for (const id of ["jobdescription", "broadcasts", "checklist", "guidelines"] as const) {
      expect(OPERATIONS_AREAS.find((a) => a.id === id)!.items.length).toBeLessThan(2);
    }
  });
});
