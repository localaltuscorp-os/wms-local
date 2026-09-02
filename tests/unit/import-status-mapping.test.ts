import { describe, it, expect } from "vitest";
import { mapLegacyStatus } from "@/lib/import/status-mapping";

describe("mapLegacyStatus", () => {
  it("maps each of the 9 known labels to the enum value", () => {
    const pairs: [string, string][] = [
      ["Not Started", "not_started"],
      ["Initiated", "initiated"],
      ["Follow Up", "follow_up"],
      // need_help retired 2026-06-10 — legacy "Need Help" now imports as need_info.
      ["Need Help", "need_info"],
      ["Done", "done"],
      ["Approved", "approved"],
      ["Not Approved", "not_approved"],
      ["Cancelled", "cancelled"],
      ["Transferred", "transferred"],
    ];
    for (const [legacy, expected] of pairs) {
      expect(mapLegacyStatus(legacy)).toBe(expected);
    }
  });

  it("is case + whitespace insensitive", () => {
    expect(mapLegacyStatus("  done  ")).toBe("done");
    expect(mapLegacyStatus("FOLLOW UP")).toBe("follow_up");
    expect(mapLegacyStatus("not started")).toBe("not_started");
  });

  it("returns null for unknown labels", () => {
    expect(mapLegacyStatus("In Progress")).toBeNull();
    expect(mapLegacyStatus("")).toBeNull();
    expect(mapLegacyStatus("   ")).toBeNull();
  });
});
