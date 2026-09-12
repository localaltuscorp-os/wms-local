// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import * as React from "react";

const startWorkAction = vi.fn();
const pauseWorkAction = vi.fn();
const stopWorkAction = vi.fn();
const restartTimerAction = vi.fn();
const fireToast = vi.fn();
const refresh = vi.fn();

// The actions module reaches lib/db (and its env schema) at import time, so it
// has to be stubbed for the store to be loadable in jsdom at all.
vi.mock("@/app/(app)/tasks/time-actions", () => ({
  startWorkAction: (...a: unknown[]) => startWorkAction(...a),
  pauseWorkAction: (...a: unknown[]) => pauseWorkAction(...a),
  stopWorkAction: (...a: unknown[]) => stopWorkAction(...a),
  restartTimerAction: (...a: unknown[]) => restartTimerAction(...a),
}));
vi.mock("@/lib/toast", () => ({ fireToast: (...a: unknown[]) => fireToast(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { TaskTimerProvider } from "@/components/tasks/time/task-timer-store";
import { TaskHeroBand } from "@/components/tasks/detail/task-hero-band";
import { TimeSpentCard } from "@/components/tasks/detail/detail-rail";
import type { TaskTimeState } from "@/lib/queries/task-time";
import type { TimerPhase } from "@/lib/tasks/time/types";

const START = "2026-09-10T10:00:00.000Z";

/**
 * THE TIMER, AS THE SCREEN ACTUALLY SHOWS IT — hero band and rail card
 * together, inside one provider, because every bug this file exists for was a
 * disagreement BETWEEN the two rather than a fault in either.
 *
 * The rules being pinned (account holder, 2026-09-12, tenth report):
 *   start    counts up from where it was
 *   pause    freezes, banks the seconds, offers Resume
 *   stop     ends the run, banks the seconds, offers Restart AND Resume
 *   restart  clears the total and counts again from 00:00:00, running
 */
function timeState(base: number, phase: TimerPhase): TaskTimeState {
  const live = phase === "running";
  return {
    taskId: "t1",
    doerId: "d1",
    live: live ? { sessionId: "s2", startedAt: START, revision: 1 } : null,
    phase,
    resetAt: null,
    lastEventAt: START,
    rollup: {
      totalActiveSeconds: base,
      originalSeconds: base,
      revisionSeconds: 0,
      sessionCount: 1,
      pauseCount: 1,
      rejectionCount: 0,
      currentRevision: 1,
      longestSessionSec: base,
      shortestSessionSec: base,
      avgSessionSec: base,
    },
    sessions: [
      {
        id: "s1",
        revision: 1,
        startedAt: "2026-09-10T09:00:00.000Z",
        endedAt: "2026-09-10T09:10:00.000Z",
        durationSeconds: base,
        endReason: "paused",
        live: false,
        discarded: false,
      },
    ],
    timeline: [],
    revisions: [],
  };
}

function Screen({ base = 600, phase = "paused" }: { base?: number; phase?: TimerPhase }) {
  const state = timeState(base, phase);
  return (
    <TaskTimerProvider
      taskId="t1"
      live={state.live}
      baseSeconds={state.rollup.totalActiveSeconds}
      phase={state.phase}
      stamp={state.lastEventAt}
    >
      <TaskHeroBand
        title="Altus Corp"
        statusLabel="Initiated"
        breadcrumb={null}
        progressPct={25}
        time={state}
        canOperate
        locked={false}
      />
      <TimeSpentCard state={state} canOperate locked={false} />
    </TaskTimerProvider>
  );
}

const heroClock = () =>
  (screen.getByText("Total task timer").nextElementSibling as HTMLElement).textContent;
/** The rail's big readout — the only monospaced number on the screen. */
const railClock = () => document.querySelector(".font-mono")?.textContent;

/** EVERY button appears TWICE: once per surface. That is the point — a query
 *  that found one would be a query that could not see the two disagreeing. */
const both = (name: string) => screen.getAllByRole("button", { name });
const none = (name: string) => screen.queryAllByRole("button", { name });

/** Let the awaited action settle without advancing the wall clock. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("Task timer — one store and one set of buttons behind both surfaces", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(START));
    startWorkAction.mockResolvedValue({ ok: true });
    pauseWorkAction.mockResolvedValue({ ok: true });
    stopWorkAction.mockResolvedValue({ ok: true });
    restartTimerAction.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* ── What each phase offers, on BOTH surfaces ─────────────────────────── */

  it("offers exactly Start Work when nothing has been recorded", () => {
    render(<Screen phase="idle" />);
    expect(both("Start Work")).toHaveLength(2);
    expect(none("Pause")).toHaveLength(0);
    expect(none("Stop")).toHaveLength(0);
  });

  it("offers Pause · Stop · Restart while running — the same three in both places", () => {
    render(<Screen phase="running" />);
    for (const label of ["Pause", "Stop", "Restart"]) {
      expect(both(label), label).toHaveLength(2);
    }
    // Not Start Work: the hero used to say Pause while the rail said Start Work
    // on this very state, which is the report this file answers.
    expect(none("Start Work")).toHaveLength(0);
  });

  it("offers Resume · Stop · Restart when paused", () => {
    render(<Screen phase="paused" />);
    for (const label of ["Resume", "Stop", "Restart"]) {
      expect(both(label), label).toHaveLength(2);
    }
    expect(none("Pause")).toHaveLength(0);
  });

  it("offers Restart AND Resume once stopped, and no Stop", () => {
    // "if stop, give the option if they want to restart" — and that option has
    // to survive a reload, which is why the phase comes from the event log
    // rather than from a flag this component would forget.
    render(<Screen phase="stopped" />);
    expect(both("Restart")).toHaveLength(2);
    expect(both("Resume")).toHaveLength(2);
    expect(none("Stop")).toHaveLength(0);
    expect(none("Pause")).toHaveLength(0);
  });

  /* ── What each control does ───────────────────────────────────────────── */

  it("flips the button in the same frame as the click, not after the round trip", () => {
    // The action never settles — exactly the twenty-second /tasks refresh the
    // real screen waits on. The label must already have changed.
    startWorkAction.mockReturnValue(new Promise(() => {}));
    render(<Screen phase="idle" />);
    fireEvent.click(both("Start Work")[0]!);
    expect(none("Start Work")).toHaveLength(0);
    expect(both("Pause")).toHaveLength(2);
  });

  it("moves the hero band and the rail card together", async () => {
    render(<Screen phase="paused" />);
    fireEvent.click(both("Resume")[0]!); // clicked on the HERO
    await settle();
    // …and the RAIL followed. It used to keep offering Resume until a refresh.
    expect(both("Pause")).toHaveLength(2);
    expect(none("Resume")).toHaveLength(0);
  });

  it("starts ticking without waiting for the server", async () => {
    render(<Screen phase="idle" />);
    expect(heroClock()).toBe("00:10:00"); // 600 banked seconds
    fireEvent.click(both("Start Work")[0]!);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(heroClock()).toBe("00:10:05");
  });

  it("banks the elapsed seconds on pause instead of dropping them", async () => {
    render(<Screen phase="running" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(heroClock()).toBe("00:10:30");
    fireEvent.click(both("Pause")[0]!);
    await settle();
    // The readout must not jump BACKWARDS to the banked 600s the server last
    // reported — the half-minute just stopped is exactly what was saved.
    expect(heroClock()).toBe("00:10:30");
    expect(railClock()).toBe("11m");
  });

  it("freezes on pause: the clock does not keep running underneath", async () => {
    render(<Screen phase="running" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    fireEvent.click(both("Pause")[0]!);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(heroClock()).toBe("00:10:20"); // still, a minute later
  });

  it("stops like a pause for the numbers, and unlike one for the buttons", async () => {
    render(<Screen phase="running" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    fireEvent.click(both("Stop")[0]!);
    await settle();
    expect(stopWorkAction).toHaveBeenCalledWith("t1");
    expect(heroClock()).toBe("00:10:45"); // banked, not discarded
    expect(both("Restart")).toHaveLength(2);
    expect(both("Resume")).toHaveLength(2);
  });

  it("RESTARTS FROM ZERO — the whole complaint, in one assertion", async () => {
    /* Restart used to rewind only the session in progress and keep every banked
       minute, so a task with ten minutes on it read 00:10:00 the instant after
       a button promising 00:00:00. It now clears the total. */
    render(<Screen phase="running" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(heroClock()).toBe("00:10:45");
    fireEvent.click(both("Restart")[0]!);
    await settle();
    expect(restartTimerAction).toHaveBeenCalledWith("t1");
    expect(heroClock()).toBe("00:00:00");
    // …and it is RUNNING, because "start all over" that needs a second click to
    // start anything is not what the word means.
    expect(both("Pause")).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(heroClock()).toBe("00:00:03");
  });

  it("restarts from a STOPPED timer too, not only a running one", async () => {
    render(<Screen phase="stopped" />);
    expect(heroClock()).toBe("00:10:00");
    fireEvent.click(both("Restart")[0]!);
    await settle();
    expect(heroClock()).toBe("00:00:00");
    expect(both("Pause")).toHaveLength(2);
  });

  it("does not restart when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Screen phase="running" />);
    fireEvent.click(both("Restart")[0]!);
    await settle();
    expect(restartTimerAction).not.toHaveBeenCalled();
    expect(heroClock()).toBe("00:10:00");
  });

  /* ── When the server disagrees ────────────────────────────────────────── */

  it("rolls the flip back and says so when the server refuses", async () => {
    startWorkAction.mockResolvedValue({ ok: false, message: "This task is approved and locked." });
    render(<Screen phase="idle" />);
    fireEvent.click(both("Start Work")[0]!);
    await settle();
    expect(both("Start Work")).toHaveLength(2);
    expect(fireToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "This task is approved and locked.", type: "error" }),
    );
  });

  it("rolls back and says so when the action THROWS", async () => {
    // A dropped connection or a redeploy mid-click. This used to reject into
    // nothing: no toast, no rollback, a button stuck mid-flip.
    vi.spyOn(console, "error").mockImplementation(() => {});
    startWorkAction.mockRejectedValue(new Error("fetch failed"));
    render(<Screen phase="idle" />);
    fireEvent.click(both("Start Work")[0]!);
    await settle();
    await settle();
    expect(both("Start Work")).toHaveLength(2);
    expect(fireToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("ignores a second click while one is in flight", () => {
    startWorkAction.mockReturnValue(new Promise(() => {}));
    render(<Screen phase="idle" />);
    fireEvent.click(both("Start Work")[0]!);
    fireEvent.click(both("Pause")[0]!);
    expect(startWorkAction).toHaveBeenCalledTimes(1);
    expect(pauseWorkAction).not.toHaveBeenCalled();
  });

  it("keeps the banked total across a pause-then-resume the server hasn't seen", async () => {
    // Two clicks inside one refresh window: pause, look at the total, resume.
    // The resume must build on what is ON SCREEN, not on the stale figure the
    // server last sent — which rewound the readout by the whole session.
    render(<Screen phase="running" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(heroClock()).toBe("00:12:00");
    fireEvent.click(both("Pause")[0]!);
    await settle();
    expect(heroClock()).toBe("00:12:00");
    fireEvent.click(both("Resume")[0]!);
    await settle();
    expect(heroClock()).toBe("00:12:00");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(heroClock()).toBe("00:12:03");
  });

  it("stops a timer that was already paused, without erroring", async () => {
    // Nothing is open to close, so the server writes the event alone. The old
    // Pause-as-Stop returned "No session is running" here.
    render(<Screen phase="paused" />);
    fireEvent.click(both("Stop")[0]!);
    await settle();
    expect(stopWorkAction).toHaveBeenCalledWith("t1");
    expect(both("Restart")).toHaveLength(2);
    expect(fireToast).not.toHaveBeenCalled();
  });

  it("refreshes so the rest of the page catches up", async () => {
    render(<Screen phase="idle" />);
    fireEvent.click(both("Start Work")[0]!);
    await settle();
    expect(refresh).toHaveBeenCalled();
  });
});
