import { describe, it, expect } from "vitest";
import { mergeStatusDisplay } from "@/lib/queries/status-display-merge";
import type { TaskStatus } from "@/db/enums";

describe("mergeStatusDisplay", () => {
  it("returns fallback when no rows", () => {
    const merged = mergeStatusDisplay([]);
    expect(merged.not_started.label).toBe("Not Started");
    expect(merged.need_help.color).toBe("red");
    expect(merged.done.label).toBe("Done");
    // Manan's scheme: transferred = brown.
    expect(merged.transferred.color).toBe("brown");
  });

  it("overrides fallback per row", () => {
    const merged = mergeStatusDisplay([
      { status: "need_help" as TaskStatus, label: "Stuck", colorToken: "rose" },
    ]);
    expect(merged.need_help.label).toBe("Stuck");
    expect(merged.need_help.color).toBe("rose");
    expect(merged.done.label).toBe("Done");
  });

  it("accepts custom hex colour tokens", () => {
    const merged = mergeStatusDisplay([
      {
        status: "transferred" as TaskStatus,
        label: "Handed off",
        colorToken: "#7c3aed",
      },
    ]);
    expect(merged.transferred.color).toBe("#7c3aed");
  });

  it("merges multiple rows independently", () => {
    const merged = mergeStatusDisplay([
      { status: "approved" as TaskStatus, label: "Signed off", colorToken: "blue" },
      { status: "cancelled" as TaskStatus, label: "Killed", colorToken: "amber" },
    ]);
    expect(merged.approved).toEqual({ label: "Signed off", color: "blue" });
    expect(merged.cancelled).toEqual({ label: "Killed", color: "amber" });
    // Manan's scheme: not_approved = rose (light red).
    expect(merged.not_approved).toEqual({
      label: "Not Approved",
      color: "rose",
    });
  });
});
