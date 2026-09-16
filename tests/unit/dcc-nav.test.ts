import { describe, it, expect } from "vitest";
import { DCC_CHILD_ROUTES, DCC_DOORS, activeDccDoor } from "@/lib/dcc/nav";

/**
 * The five doors (DCC-SPEC §2). One list feeds the global rail AND the module's
 * own quick-nav row, so what is tested here is the thing that made the old
 * module's rail advertise a door its pages no longer honoured.
 */

describe("the doors", () => {
  it("is My Day first, then the four rooms behind it", () => {
    expect(DCC_DOORS.map((d) => d.href)).toEqual([
      "/dcc",
      "/dcc/call-log",
      "/dcc/sp1",
      "/dcc/dashboard",
      "/dcc/masters",
    ]);
  });

  it("lists every child so the parent can exclude them", () => {
    // Without this the rail keeps /dcc lit while you stand on /dcc/sp1.
    expect(DCC_CHILD_ROUTES).toEqual([
      "/dcc/call-log",
      "/dcc/sp1",
      "/dcc/dashboard",
      "/dcc/masters",
    ]);
    expect(DCC_CHILD_ROUTES).not.toContain("/dcc");
  });
});

describe("which door you are standing on", () => {
  it("matches My Day only exactly", () => {
    expect(activeDccDoor("/dcc")?.href).toBe("/dcc");
    expect(activeDccDoor("/dcc/sp1")?.href).toBe("/dcc/sp1");
  });

  it("lets the longest match win over the parent", () => {
    // /dcc/masters/person must light DCC Masters, not fall back to My Day.
    expect(activeDccDoor("/dcc/masters/person")?.href).toBe("/dcc/masters");
  });

  it("does not match a route that merely starts with the same letters", () => {
    expect(activeDccDoor("/dccsomething")).toBeNull();
    expect(activeDccDoor("/dashboard")).toBeNull();
  });
});
