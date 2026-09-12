import { describe, it, expect } from "vitest";
import { derivePhase } from "@/lib/tasks/time/phase";

/**
 * THE FOUR STATES OF THE TASK TIMER (account holder, 2026-09-12).
 *
 * This is the fact the whole detail screen branches on — the crimson hero band,
 * the Time Spent card and the Time Log tab all draw their buttons from it. They
 * used to each derive it from whatever prop was nearest (`live` in one place,
 * `rollup.sessionCount` in another), which is how the same screen came to show
 * Pause at the top and Start Work down the side at the same instant.
 *
 * Pinned here rather than only through the rendered components because the
 * interesting cases are the ones no screenshot catches: STOPPED surviving a
 * reload, and a restart that leaves nothing to resume.
 */

const at = (o: Parameters<typeof derivePhase>[0]) => derivePhase(o);

describe("derivePhase", () => {
  it("is running whenever a session is open, whatever the log says", () => {
    // The live session wins even against a `work_done`: someone marked the task
    // done and then started work again, and the clock really is ticking.
    expect(at({ hasLiveSession: true, lastEventKind: "work_started", sessionsSinceReset: 1 })).toBe("running");
    expect(at({ hasLiveSession: true, lastEventKind: "work_done", sessionsSinceReset: 3 })).toBe("running");
  });

  it("is idle on a task nobody has timed yet", () => {
    expect(at({ hasLiveSession: false, lastEventKind: null, sessionsSinceReset: 0 })).toBe("idle");
  });

  it("is paused when there is time banked and no session open", () => {
    expect(at({ hasLiveSession: false, lastEventKind: "work_paused", sessionsSinceReset: 2 })).toBe("paused");
  });

  it("is STOPPED after a stop — the state Pause cannot express", () => {
    /* The distinction the brief asked for. Both Pause and Stop close the open
       session, so a screen that read only `live` could not tell them apart and
       always offered Resume; stopped is where Restart is offered as well. */
    expect(at({ hasLiveSession: false, lastEventKind: "work_stopped", sessionsSinceReset: 2 })).toBe("stopped");
  });

  it("treats done and approved work as stopped, not paused", () => {
    // A task sitting with its reviewer is not "paused mid-run"; offering Resume
    // as the only way forward there reads as though the work is unfinished.
    expect(at({ hasLiveSession: false, lastEventKind: "work_done", sessionsSinceReset: 4 })).toBe("stopped");
    expect(at({ hasLiveSession: false, lastEventKind: "approved", sessionsSinceReset: 4 })).toBe("stopped");
  });

  it("is idle again after a restart that has nothing left to count", () => {
    /* Restart clears the total. The sessions before it still exist in the
       ledger — `sessionsSinceReset` counts only what is on this side of the
       line — so a timer reset and then paused before a single second was banked
       is idle, and offers Start Work rather than a Resume that would resume
       nothing. */
    expect(at({ hasLiveSession: false, lastEventKind: "timer_reset", sessionsSinceReset: 0 })).toBe("idle");
  });

  it("does not treat the OLD timer_restarted as a stop", () => {
    // Tasks restarted before 2026-09-12 carry `timer_restarted`, which meant
    // "rewind the open session" and left the timer running or paused as it was.
    expect(at({ hasLiveSession: false, lastEventKind: "timer_restarted", sessionsSinceReset: 2 })).toBe("paused");
  });
});
