import { describe, it, expect } from "vitest";
import { DCC_CHILD_ROUTES, DCC_DOORS, activeDccDoor } from "@/lib/dcc/nav";

/**
 * The three doors (DCC-SPEC §2). One list feeds the global rail AND the module's
 * own quick-nav row, so what is tested here is the thing that made the old
 * module's rail advertise a door its pages no longer honoured.
 */

describe("the doors", () => {
  it("is My Day first, then the two rooms behind it", () => {
    expect(DCC_DOORS.map((d) => d.href)).toEqual(["/dcc", "/dcc/dashboard", "/dcc/masters"]);
  });

  it("has no SP1 and no Call Log door — both are the dashboard now", () => {
    // Account holder, 2026-09-17. The sheet IS the dashboard and the fifteen
    // numbers are typed into that sheet, so a door for either would be a second
    // entry pointing at one screen. Both addresses survive only as redirects.
    for (const retired of ["/dcc/sp1", "/dcc/call-log"]) {
      expect(DCC_DOORS.some((d) => d.href === retired)).toBe(false);
      expect(DCC_CHILD_ROUTES).not.toContain(retired);
    }
  });

  it("lists every child so the parent can exclude them", () => {
    // Without this the rail keeps /dcc lit while you stand on /dcc/dashboard.
    expect(DCC_CHILD_ROUTES).toEqual(["/dcc/dashboard", "/dcc/masters"]);
    expect(DCC_CHILD_ROUTES).not.toContain("/dcc");
  });
});

describe("which door you are standing on", () => {
  it("matches My Day only exactly", () => {
    expect(activeDccDoor("/dcc")?.href).toBe("/dcc");
    expect(activeDccDoor("/dcc/dashboard")?.href).toBe("/dcc/dashboard");
  });

  it("lets the longest match win over the parent", () => {
    // /dcc/masters/person must light DCC Masters, not fall back to My Day.
    expect(activeDccDoor("/dcc/masters/person")?.href).toBe("/dcc/masters");
  });

  it("lights nothing on the retired addresses", () => {
    // They redirect, and a rail entry glowing on a route that is about to become
    // a different route would flicker the wrong pill on the way through.
    expect(activeDccDoor("/dcc/sp1")).toBeNull();
    expect(activeDccDoor("/dcc/call-log")).toBeNull();
  });

  it("does not match a route that merely starts with the same letters", () => {
    expect(activeDccDoor("/dccsomething")).toBeNull();
    expect(activeDccDoor("/dashboard")).toBeNull();
  });
});
