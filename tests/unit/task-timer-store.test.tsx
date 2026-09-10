// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import * as React from "react";

const startWorkAction = vi.fn();
const pauseWorkAction = vi.fn();
const restartTimerAction = vi.fn();
const fireToast = vi.fn();
const refresh = vi.fn();

// The actions module reaches lib/db (and its env schema) at import time, so it
// has to be stubbed for the store to be loadable in jsdom at all.
vi.mock("@/app/(app)/tasks/time-actions", () => ({
  startWorkAction: (...a: unknown[]) => startWorkAction(...a),
  pauseWorkAction: (...a: unknown[]) => pauseWorkAction(...a),
  restartTimerAction: (...a: unknown[]) => restartTimerAction(...a),
}));
vi.mock("@/lib/toast", () => ({ fireToast: (...a: unknown[]) => fireToast(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { TaskTimerProvider } from "@/components/tasks/time/task-timer-store";
import { TaskHeroBand } from "@/components/tasks/detail/task-hero-band";
import { TimeSpentCard } from "@/components/tasks/detail/detail-rail";
import type { TaskTimeState } from "@/lib/queries/task-time";

const START = "2026-09-10T10:00:00.000Z";

/** A task time state with `base` banked seconds and, optionally, a live
 *  session the server says began at `START`. */
function timeState(base: number, live: boolean): TaskTimeState {
  return {
    taskId: "t1",
    doerId: "d1",
    live: live ? { sessionId: "s2", startedAt: START, revision: 1 } : null,
    rollup: {
      totalActiveSeconds: base,
      originalSeconds: base,
      revisionSeconds: 0,
      // Non-zero so the rail's button reads "Resume" while the hero's reads
      // "Start Work" — otherwise both say "Start Work" and no query can tell
      // the two surfaces apart.
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
      },
    ],
    timeline: [],
    revisions: [],
  };
}

function Screen({ base = 600, live = false }: { base?: number; live?: boolean }) {
  const state = timeState(base, live);
  return (
    <TaskTimerProvider
      taskId="t1"
      live={state.live}
      baseSeconds={state.rollup.totalActiveSeconds}
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
const railClock = () => screen.getByText("Total active time").previousElementSibling?.textContent;
const heroStart = () => screen.getByRole("button", { name: "Start Work" });
const heroPause = () => screen.getByRole("button", { name: "Pause" });
const railResume = () => screen.getByRole("button", { name: "Resume" });
const railStop = () => screen.getByRole("button", { name: "Stop" });
const restartBtn = () => screen.getAllByRole("button", { name: "Restart" })[0]!;

/** Let the awaited action settle without advancing the wall clock. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("Task timer — one store behind every control", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(START));
    startWorkAction.mockResolvedValue({ ok: true });
    pauseWorkAction.mockResolvedValue({ ok: true });
    restartTimerAction.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("flips the button in the same frame as the click, not after the round trip", () => {
    // The action never settles — exactly the twenty-second /tasks refresh the
    // real screen waits on. The label must already have changed.
    startWorkAction.mockReturnValue(new Promise(() => {}));
    render(<Screen />);
    expect(heroStart()).toBeTruthy();
    fireEvent.click(heroStart());
    expect(screen.queryByRole("button", { name: "Start Work" })).toBeNull();
    expect(heroPause()).toBeTruthy();
  });

  it("moves the hero band and the rail card together", async () => {
    render(<Screen />);
    // Two surfaces, one running session: starting from the hero must not leave
    // the rail still offering Resume.
    expect(railResume()).toBeTruthy();
    fireEvent.click(heroStart());
    await settle();
    expect(heroPause()).toBeTruthy();
    expect(railStop()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("starts ticking without waiting for the server", async () => {
    render(<Screen />);
    expect(heroClock()).toBe("00:10:00"); // 600 banked seconds
    fireEvent.click(heroStart());
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(heroClock()).toBe("00:10:05");
  });

  it("banks the elapsed seconds on pause instead of dropping them", async () => {
    render(<Screen live />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(heroClock()).toBe("00:10:30");
    fireEvent.click(heroPause());
    await settle();
    // The readout must not jump BACKWARDS to the banked 600s the server last
    // reported — the half-minute just stopped is exactly what was saved.
    expect(heroClock()).toBe("00:10:30");
    expect(railClock()).toBe("11m");
  });

  it("keeps banked time when the session is restarted", async () => {
    render(<Screen live />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(heroClock()).toBe("00:10:45");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(restartBtn());
    await settle();
    expect(restartTimerAction).toHaveBeenCalledWith("t1");
    // Only the open session rewinds; the 600 banked seconds survive.
    expect(heroClock()).toBe("00:10:00");
    expect(heroPause()).toBeTruthy();
  });

  it("does not restart when the confirmation is declined", async () => {
    render(<Screen live />);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(restartBtn());
    await settle();
    expect(restartTimerAction).not.toHaveBeenCalled();
  });

  it("rolls the flip back and says so when the server refuses", async () => {
    startWorkAction.mockResolvedValue({ ok: false, message: "This task is approved and locked." });
    render(<Screen />);
    fireEvent.click(heroStart());
    await settle();
    expect(heroStart()).toBeTruthy();
    expect(fireToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "This task is approved and locked.", type: "error" }),
    );
  });

  it("rolls back and says so when the action THROWS", async () => {
    // A dropped connection or a redeploy mid-click. This used to reject into
    // nothing: no toast, no rollback, a button stuck mid-flip.
    vi.spyOn(console, "error").mockImplementation(() => {});
    startWorkAction.mockRejectedValue(new Error("fetch failed"));
    render(<Screen />);
    fireEvent.click(heroStart());
    await settle();
    await settle();
    expect(heroStart()).toBeTruthy();
    expect(fireToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("ignores a second click while one is in flight", () => {
    startWorkAction.mockReturnValue(new Promise(() => {}));
    render(<Screen />);
    fireEvent.click(heroStart());
    fireEvent.click(heroPause());
    expect(startWorkAction).toHaveBeenCalledTimes(1);
    expect(pauseWorkAction).not.toHaveBeenCalled();
  });

  it("keeps the banked total across a pause-then-resume the server hasn't seen", async () => {
    // Two clicks inside one refresh window: pause, look at the total, resume.
    // The resume must build on what is ON SCREEN, not on the stale figure the
    // server last sent — which rewound the readout by the whole session.
    render(<Screen live />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(heroClock()).toBe("00:12:00");
    fireEvent.click(heroPause());
    await settle();
    expect(heroClock()).toBe("00:12:00");
    fireEvent.click(heroStart());
    await settle();
    expect(heroClock()).toBe("00:12:00");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(heroClock()).toBe("00:12:03");
  });

  it("refreshes so the rest of the page catches up", async () => {
    render(<Screen />);
    fireEvent.click(heroStart());
    await settle();
    expect(refresh).toHaveBeenCalled();
  });
});
