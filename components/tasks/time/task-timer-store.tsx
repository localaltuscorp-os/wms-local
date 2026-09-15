"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  startWorkAction,
  pauseWorkAction,
  restartTimerAction,
} from "@/app/(app)/tasks/time-actions";
import { fireToast } from "@/lib/toast";
import { useElapsedSeconds } from "@/components/tasks/time/use-elapsed";

/**
 * ONE timer per task detail screen, shared by every control that drives it.
 *
 * The task detail shows the same timer TWICE — the crimson hero band at the top
 * and the Time Spent card in the right rail — and each used to own a private
 * copy of "is it running", talking to the server on its own. Start from the
 * hero and the rail still said Start Work; the two clocks disagreed until a
 * refresh landed. Both now read this store, so a click anywhere moves both.
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
 * HOW THE FLIP RETIRES ITSELF. It records `basedOn` — the server's live-session
 * stamp at the moment it was made — and is honoured only while the server still
 * says that. Every one of these actions changes that stamp (start and restart
 * mint a new one, pause clears it), so the first refresh that lands makes
 * `basedOn` stale and the server value takes over by itself. No effect
 * reconciles anything, and there is no window where both are believed.
 */

export interface TaskTimerState {
  /** Is the clock running right now (optimistic value included)? */
  running: boolean;
  /** ISO stamp the running clock counts up from; null when stopped. */
  since: string | null;
  /** Banked seconds from sessions that have already closed. */
  baseSeconds: number;
  /** Banked + the live session's seconds, ticking. Render this. */
  totalSeconds: number;
  /** An action is in flight — disable the controls, don't hide them. */
  busy: boolean;
  start: () => void;
  pause: () => void;
  restart: () => void;
}

type Flip = {
  running: boolean;
  since: string | null;
  base: number;
  /** The server's live stamp when this flip was made. */
  basedOn: string | null;
};

const Ctx = React.createContext<TaskTimerState | null>(null);

export function TaskTimerProvider({
  taskId,
  /** The server's view: the open session, if there is one. */
  live,
  /** The server's view: seconds banked by CLOSED sessions. */
  baseSeconds,
  children,
}: {
  taskId: string;
  live: { startedAt: string } | null;
  baseSeconds: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const serverSince = live?.startedAt ?? null;
  const [flip, setFlip] = React.useState<Flip | null>(null);
  const [busy, setBusy] = React.useState(false);

  const current = flip !== null && flip.basedOn === serverSince ? flip : null;
  const running = current ? current.running : Boolean(serverSince);
  const since = current ? current.since : serverSince;
  const base = current ? current.base : baseSeconds;

  // Hook order is fixed: the clock ticks whenever `since` is set, whether that
  // stamp came from the server or from the flip.
  const liveSeconds = useElapsedSeconds(running ? since : null);
  const totalSeconds = base + (running ? liveSeconds : 0);

  /** Seconds the open session has run, measured against the server's stamp —
   *  what Pause is about to bank. */
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
      { running: true, since: new Date().toISOString(), base, basedOn: serverSince },
      () => startWorkAction(taskId),
    );
  }, [run, base, serverSince, taskId]);

  const pause = React.useCallback(() => {
    // Pause BANKS the seconds it just stopped counting. Showing `baseSeconds`
    // alone here would drop them from the readout until the refresh landed —
    // the clock visibly jumping backwards on the click that saved the time.
    run(
      { running: false, since: null, base: base + elapsedNow(), basedOn: serverSince },
      () => pauseWorkAction(taskId),
    );
  }, [run, base, elapsedNow, serverSince, taskId]);

  const restart = React.useCallback(() => {
    // Restart rewinds the OPEN session to zero and leaves every closed session
    // alone, so the banked total is deliberately unchanged here.
    run(
      { running: true, since: new Date().toISOString(), base, basedOn: serverSince },
      () => restartTimerAction(taskId),
    );
  }, [run, base, serverSince, taskId]);

  const value: TaskTimerState = {
    running,
    since,
    baseSeconds: base,
    totalSeconds,
    busy,
    start,
    pause,
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
