"use client";

import * as React from "react";
import { Play, Pause, Square, RotateCcw, Loader2 } from "lucide-react";
import { useTaskTimer } from "@/components/tasks/time/task-timer-store";
import type { TimerPhase } from "@/lib/tasks/time/types";

/**
 * THE TIMER'S BUTTONS — one component, rendered by both surfaces that have any.
 *
 * The crimson hero band and the Time Spent rail card each used to draw their
 * own cluster. They shared the store, so they agreed about the STATE, but not
 * about what to do with it: the hero offered Pause · Restart, the rail offered
 * Stop · Resume · Restart, and the same action was called Pause in one place
 * and Stop in the other. Two spellings of one verb, on one screen, is the
 * "not in sync" the account holder kept reporting — and no amount of shared
 * state fixes it, because the divergence was in the markup.
 *
 * So the markup is shared too, and only the SKIN differs: `onCrimson` for the
 * band (which sits on #B80D22, where a crimson button is a button-shaped hole)
 * and `onSurface` for the white rail card. Adding a control to one surface now
 * adds it to the other by construction.
 *
 * WHAT EACH PHASE OFFERS — the whole behaviour, in one table:
 *
 *   idle     Start Work
 *   running  Pause · Stop · Restart
 *   paused   Resume · Stop · Restart
 *   stopped  Restart · Resume
 *
 * Pause and Stop both bank the time; they differ in what comes next. Pause
 * leaves a timer you are expected to resume. Stop ends the sitting and puts
 * Restart first — which is the "if stop, give the option to restart" the brief
 * asked for, and it survives a refresh because the phase is derived from the
 * event log rather than held in a component.
 */

type Tone = "onCrimson" | "onSurface";

const BASE =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/* Three roles, two skins. `go` starts or resumes, `halt` pauses or stops, and
   `ghost` is the quiet third option — Restart everywhere except the stopped
   state, where it is the one thing most likely to be wanted and swaps up. */
const SKIN: Record<Tone, { go: string; halt: string; ghost: string }> = {
  onCrimson: {
    go: "bg-emerald-600 text-white hover:bg-emerald-700",
    halt: "bg-white text-[#B80D22] hover:bg-white/90",
    ghost: "bg-white/15 text-white hover:bg-white/25",
  },
  onSurface: {
    go: "bg-emerald-600 text-white hover:bg-emerald-700",
    halt: "bg-[#B80D22] text-white hover:bg-red-700",
    ghost: "border border-slate-200/80 bg-white text-ink-strong hover:bg-surface-soft",
  },
};

/** What the readout's caption says under the clock, per phase. */
export function phaseCaption(phase: TimerPhase): string {
  switch (phase) {
    case "running":
      return "Running…";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    default:
      return "Total active time";
  }
}

/** Spelled once so the hero and the rail cannot warn about different things. */
const RESTART_CONFIRM =
  "Restart the timer?\n\nThe time recorded so far is cleared and the clock counts again from 00:00. Earlier sessions stay in the Start/Stop history, marked as discarded.";

export function TimerControls({
  tone,
  canOperate,
  locked,
  className,
}: {
  tone: Tone;
  canOperate: boolean;
  /** Approved work is read-only; the controls disappear rather than erroring. */
  locked: boolean;
  className?: string;
}) {
  const timer = useTaskTimer();
  if (!timer || !canOperate || locked) return null;

  const { phase, busy } = timer;
  const skin = SKIN[tone];
  const spinner = <Loader2 size={14} className="animate-spin" />;

  const restart = () => {
    if (!window.confirm(RESTART_CONFIRM)) return;
    timer.restart();
  };

  /* `type="button"` on every one of these: the rail card sits inside the task
     detail form on some routes, and a bare <button> there submits it. */
  const Go = (label: string) => (
    <button type="button" disabled={busy} onClick={timer.start} className={`${BASE} ${skin.go}`}>
      {busy ? spinner : <Play size={14} strokeWidth={2.6} />} {label}
    </button>
  );
  const PauseBtn = (
    <button type="button" disabled={busy} onClick={timer.pause} className={`${BASE} ${skin.halt}`}>
      {busy ? spinner : <Pause size={14} strokeWidth={2.6} />} Pause
    </button>
  );
  const StopBtn = (
    <button
      type="button"
      disabled={busy}
      onClick={timer.stop}
      title="End this run. The time is kept; Restart starts again from 00:00."
      className={`${BASE} ${tone === "onCrimson" ? skin.ghost : skin.halt}`}
    >
      <Square size={13} strokeWidth={2.8} /> Stop
    </button>
  );
  const RestartBtn = (primary: boolean) => (
    <button
      type="button"
      disabled={busy}
      onClick={restart}
      title="Clear the recorded time and count again from 00:00"
      className={`${BASE} ${primary ? skin.go : skin.ghost}`}
    >
      <RotateCcw size={14} strokeWidth={2.6} /> Restart
    </button>
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {phase === "idle" && Go("Start Work")}
      {phase === "running" && (
        <>
          {PauseBtn}
          {StopBtn}
          {RestartBtn(false)}
        </>
      )}
      {phase === "paused" && (
        <>
          {Go("Resume")}
          {StopBtn}
          {RestartBtn(false)}
        </>
      )}
      {/* STOPPED leads with Restart. Resume stays available — stopping is not a
          decision anyone should have to be sure about — but the run is over, so
          "start again from zero" is the likelier next move and reads first. */}
      {phase === "stopped" && (
        <>
          {RestartBtn(true)}
          {Go("Resume")}
        </>
      )}
    </div>
  );
}
