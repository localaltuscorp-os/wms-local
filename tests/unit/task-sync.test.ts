import { describe, it, expect } from "vitest";
import { pctToTaskStatus, taskStatusToGoalPct } from "@/lib/weekly-goals/task-sync-map";

/**
 * Phase 2 — the Goal⇄Task two-way sync mappings. These are the pure heart of
 * the link: get them wrong and a goal's % silently contradicts its task status.
 */

describe("pctToTaskStatus (goal % → task status)", () => {
  it("100% completes the task", () => {
    expect(pctToTaskStatus(100, "initiated")).toBe("done");
    expect(pctToTaskStatus(100, "not_started")).toBe("done");
  });

  it("0% resets to not_started", () => {
    expect(pctToTaskStatus(0, "follow_up")).toBe("not_started");
    expect(pctToTaskStatus(0, "done")).toBe("not_started");
  });

  it("a partial % preserves an existing in-progress nuance", () => {
    // follow_up / need_info are richer than 'initiated' — don't flatten them.
    expect(pctToTaskStatus(40, "follow_up")).toBe("follow_up");
    expect(pctToTaskStatus(60, "need_info")).toBe("need_info");
    expect(pctToTaskStatus(10, "on_hold")).toBe("on_hold");
  });

  it("a partial % from a terminal/blank status lands on 'initiated'", () => {
    expect(pctToTaskStatus(50, "done")).toBe("initiated");
    expect(pctToTaskStatus(50, "not_started")).toBe("initiated");
    expect(pctToTaskStatus(50, "dont_know")).toBe("initiated");
  });
});

describe("taskStatusToGoalPct (task status → goal %)", () => {
  it("done drives the goal to 100", () => {
    expect(taskStatusToGoalPct("done", 0)).toBe(100);
    expect(taskStatusToGoalPct("done", 40)).toBe(100);
  });

  it("not_started / dont_know reset the goal to 0", () => {
    expect(taskStatusToGoalPct("not_started", 80)).toBe(0);
    expect(taskStatusToGoalPct("dont_know", 80)).toBe(0);
  });

  it("an in-progress status keeps an existing partial %", () => {
    expect(taskStatusToGoalPct("follow_up", 35)).toBe(35);
    expect(taskStatusToGoalPct("initiated", 99)).toBe(99);
  });

  it("an in-progress status from 0 or 100 lands mid-way (50)", () => {
    // Reopening a completed task (was 100) shouldn't claim 100% nor 0%.
    expect(taskStatusToGoalPct("follow_up", 100)).toBe(50);
    expect(taskStatusToGoalPct("initiated", 0)).toBe(50);
  });

  it("is round-trip-consistent at the extremes (no contradiction)", () => {
    // done ⇄ 100 and not_started ⇄ 0 must agree both ways.
    expect(pctToTaskStatus(taskStatusToGoalPct("done", 0), "done")).toBe("done");
    expect(pctToTaskStatus(taskStatusToGoalPct("not_started", 50), "x" as never)).toBe("not_started");
  });
});
