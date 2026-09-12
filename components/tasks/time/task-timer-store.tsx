"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  startWorkAction,
  pauseWorkAction,
  stopWorkAction,
  restartTimerAction,
} from "@/app/(app)/tasks/time-actions";
import { fireToast } from "@/lib/toast";
import { useElapsedSeconds } from "@/components/tasks/time/use-elapsed";
import type { TimerPhase } from "@/lib/tasks/time/types";

/**
 * ONE timer per task detail screen, shared by every control that drives it.
 *
 * The task detail shows the same timer TWICE — the crimson hero band at the top
 * and the Time Spent card in the right rail — and each used to own a private
 * copy of "is it running", talking to the server on its own. Start from the
 * hero and the rail still said Start Work; the two clocks disagreed until a
 * refresh landed. Both now read this store, so a click anywhere moves both.
 *
 * IT CARRIES THE PHASE, NOT A BOOLEAN. `running` was never enough to tell
 * PAUSED from STOPPED, so each surface guessed from whatever else it had to
 * hand — one looked at `live`, the other at `rollup.sessionCount` — and they
 * guessed differently. The phase is decided once, on the server, from the event
 * log (lib/queries/task-time.ts), and every button is a function of it.
 *
 * WHY IT IS OPTIMISTIC. Every control here calls a Server Action and then
 * `router.refresh()`. On the detail drawer that refresh re-renders /tasks —
 * the whole 800-row table plus the drawer — against a remote database, which
 * measured at twenty seconds. Without a local flip the button keeps its old
 * label and the clock stays frozen for that entire window, so the honest
 * reading of the screen is "the timer is broken": you click Start Work, nothing
 * moves, you click again, and the ledger quietly collects a second session.
 * The flip makes the label and the clock change in the same frame as the click.
 *
 * HOW THE FLIP RETIRES ITSELF. It records `basedOn` — the server's newest event
 * stamp at the moment it was made — and is honoured only while the server still
 * reports that stamp. Every action here appends an event, so the first refresh
 * that lands makes `basedOn` stale and the server value takes over by itself.
 * No effect reconciles anything, and there is no window where both are believed.
 *
 * (The stamp used to be the live session's `startedAt`, which does not change
 * when you STOP a timer that was already paused — nothing opens or closes — so
 * that flip would have been believed forever.)
 */

export interface TaskTimerState {
  /** idle · running · paused · stopped, optimistic value included. */
  phase: TimerPhase;
  /** Convenience for the many places that only care whether it ticks. */
  running: boolean;
  /** ISO stamp the running clock counts up from; null when not running. */
  since: string | null;
  /** Banked seconds from sessions that have already closed (since the last reset). */
  baseSeconds: number;
  /** Banked + the live session's seconds, ticking. Render this. */
  totalSeconds: number;
  /** An action is in flight — disable the controls, don't hide them. */
  busy: boolean;
  start: () => void;
  pause: () => void;
  stop: () => void;
  restart: () => void;
}

type Flip = {
  phase: TimerPhase;
  since: string | null;
  base: number;
  /** The server's newest event stamp when this flip was made. */
  basedOn: string | null;
};

const Ctx = React.createContext<TaskTimerState | null>(null);

export function TaskTimerProvider({
  taskId,
  /** The server's view: the open session, if there is one. */
  live,
  /** The server's view: seconds banked by CLOSED sessions since the last reset. */
  baseSeconds,
  /** The server's view: which phase the timer is in. */
  phase: serverPhase,
  /** The server's newest event stamp — the flip's staleness token. */
  stamp: serverStamp = null,
  children,
}: {
  taskId: string;
  live: { startedAt: string } | null;
  baseSeconds: number;
  phase: TimerPhase;
  stamp?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const serverSince = live?.startedAt ?? null;
  // Falls back to the live stamp so a server that predates `lastEventAt` still
  // retires flips on start/pause rather than never.
  const token = serverStamp ?? serverSince;
  const [flip, setFlip] = React.useState<Flip | null>(null);
  const [busy, setBusy] = React.useState(false);

  const current = flip !== null && flip.basedOn === token ? flip : null;
  const phase = current ? current.phase : serverPhase;
  const running = phase === "running";
  const since = current ? current.since : serverSince;
  const base = current ? current.base : baseSeconds;

  // Hook order is fixed: the clock ticks whenever `since` is set, whether that
  // stamp came from the server or from the flip.
  const liveSeconds = useElapsedSeconds(running ? since : null);
  const totalSeconds = base + (running ? liveSeconds : 0);

  /** Seconds the open session has run, measured against the server's stamp —
   *  what Pause and Stop are about to bank. */
  const elapsedNow = React.useCallback(() => {
    if (!since) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  }, [since]);

  const run = React.useCallback(
    (next: Flip, fn: () => Promise<{ ok: boolean; message?: string }>) => {
      if (busy) return;
      setFlip(next);
      setBusy(true);
      void fn()
        .then((res) => {
          if (!res.ok) {
            setFlip(null);
            fireToast({ message: res.message ?? "Couldn't update the timer.", type: "error" });
            return;
          }
          // The rollup, the session ledger, the timeline and the row's inline
          // Start/Stop all move together on the server; refresh rather than
          // patch, and let the flip cover the wait.
          router.refresh();
        })
        // Without this a Server Action that THROWS — a dropped database
        // connection, a redeploy mid-click — rejected into nothing: no toast,
        // no rollback, a button stuck mid-flip. Silence is the one outcome a
        // timer must never have.
        .catch((err: unknown) => {
          setFlip(null);
          console.error("[task-timer]", err);
          fireToast({ message: "Couldn't reach the server. Try again.", type: "error" });
        })
        .finally(() => setBusy(false));
    },
    [busy, router],
  );

  /* Every flip is built from `base` — the total ON SCREEN — rather than from
     the server's `baseSeconds`. They are the same figure right up until a
     SECOND action is taken before the first one's refresh has landed, which is
     ordinary use: pause, glance at the total, resume. Reading the server value
     there would rewind the readout to whatever it said two clicks ago —
     observed live as 23:34 dropping back to 03:45 on the resume. */
  const start = React.useCallback(() => {
    run(
      { phase: "running", since: new Date().toISOString(), base, basedOn: token },
      () => startWorkAction(taskId),
    );
  }, [run, base, token, taskId]);

  const pause = React.useCallback(() => {
    // Pause BANKS the seconds it just stopped counting. Showing `baseSeconds`
    // alone here would drop them from the readout until the refresh landed —
    // the clock visibly jumping backwards on the click that saved the time.
    run(
      { phase: "paused", since: null, base: base + elapsedNow(), basedOn: token },
      () => pauseWorkAction(taskId),
    );
  }, [run, base, elapsedNow, token, taskId]);

  const stop = React.useCallback(() => {
    // Banks exactly like Pause — the difference is the phase it leaves behind,
    // which is what decides whether the screen offers Restart next to Resume.
    run(
      { phase: "stopped", since: null, base: base + elapsedNow(), basedOn: token },
      () => stopWorkAction(taskId),
    );
  }, [run, base, elapsedNow, token, taskId]);

  const restart = React.useCallback(() => {
    // BACK TO ZERO, ticking. `base: 0` is the fix for the complaint that
    // Restart did not restart: it used to keep every banked minute, so the
    // clock read 40:00 the instant after a button promising 00:00.
    run(
      { phase: "running", since: new Date().toISOString(), base: 0, basedOn: token },
      () => restartTimerAction(taskId),
    );
  }, [run, token, taskId]);

  const value: TaskTimerState = {
    phase,
    running,
    since,
    baseSeconds: base,
    totalSeconds,
    busy,
    start,
    pause,
    stop,
    restart,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The task's timer. Null outside a provider — callers render their static
 *  view rather than crashing, since the rail and hero are both reachable from
 *  screens that don't track time. */
export function useTaskTimer(): TaskTimerState | null {
  return React.useContext(Ctx);
}
