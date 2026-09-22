import { describe, it, expect } from "vitest";
import { DCC_CHILD_ROUTES, DCC_DOORS, activeDccDoor } from "@/lib/dcc/nav";

/**
 * The doors. One list feeds the global rail AND the module's own quick-nav row,
 * so what is tested here is the thing that made the old module's rail advertise
 * a door its pages no longer honoured.
 */

describe("the doors", () => {
  it("is the Dashboard, then WCC, then MCC (account holder, 2026-09-18)", () => {
    expect(DCC_DOORS.map((d) => d.href)).toEqual(["/dcc/dashboard", "/dcc/wcc", "/dcc/mcc"]);
    expect(DCC_DOORS.map((d) => d.label)).toEqual(["Dashboard", "WCC", "MCC"]);
  });

  it("no longer has My Day or DCC Masters on the sidebar", () => {
    // My Day became WCC (/dcc redirects there); DCC Masters is reachable at its
    // own address but is not a door any more.
    expect(DCC_DOORS.some((d) => d.href === "/dcc")).toBe(false);
    expect(DCC_DOORS.some((d) => d.href === "/dcc/masters")).toBe(false);
  });

  it("has no SP1 and no Call Log door — both are the dashboard now", () => {
    for (const retired of ["/dcc/sp1", "/dcc/call-log"]) {
      expect(DCC_DOORS.some((d) => d.href === retired)).toBe(false);
      expect(DCC_CHILD_ROUTES).not.toContain(retired);
    }
  });
});

describe("which door you are standing on", () => {
  it("lights WCC, MCC and the dashboard on their own pages", () => {
    expect(activeDccDoor("/dcc/wcc")?.href).toBe("/dcc/wcc");
    expect(activeDccDoor("/dcc/mcc")?.href).toBe("/dcc/mcc");
    expect(activeDccDoor("/dcc/dashboard")?.href).toBe("/dcc/dashboard");
  });

  it("lights nothing on the addresses that are not doors", () => {
    expect(activeDccDoor("/dcc/sp1")).toBeNull();
    expect(activeDccDoor("/dcc/call-log")).toBeNull();
    expect(activeDccDoor("/dcc/masters")).toBeNull();
  });

  it("does not match a route that merely starts with the same letters", () => {
    expect(activeDccDoor("/dcc/wccx")).toBeNull();
    expect(activeDccDoor("/dashboard")).toBeNull();
  });
});
