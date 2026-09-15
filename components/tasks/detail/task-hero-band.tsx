"use client";

import * as React from "react";
import { Play, Pause, RotateCcw, Loader2 } from "lucide-react";
import type { TaskTimeState } from "@/lib/queries/task-time";
import { useTaskTimer } from "@/components/tasks/time/task-timer-store";

/**
 * THE CRIMSON HERO BAND — the task's identity, its progress, and its timer, in
 * one block at the top of the detail screen.
 *
 * IT DRIVES THE EXISTING ENGINE, it does not add a second one. The session
 * rollup and the Server Actions already exist and are already what the Time
 * Spent rail card and the Time Log tab operate; this is a third VIEW of the
 * same state, and it reads that state from `useTaskTimer` — the one store the
 * rail card reads too. It used to hold its own `busy` flag and call the actions
 * itself, which is exactly the "two clocks that disagree the moment one of them
 * is paused from the other surface" this comment warned about.
 *
 * #B80D22 is used as given rather than routed through --color-altus-red
 * (#E10600): the two are visibly different reds — this one is darker and
 * cooler — so this is a deliberate second brand tone for the hero, not a
 * near-miss of the button red. It is named once, here.
 */
const CRIMSON = "#B80D22";

/** `02:14:30`. Hours are not padded away at zero — a task timer that reads
 *  `14:30` is ambiguous between fourteen minutes and fourteen hours. */
function hms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * The completion ring.
 *
 * `strokeDasharray` + `strokeDashoffset` on a rotated circle, rather than an
 * arc path: an arc has to special-case 0% (nothing to draw) and 100% (a full
 * circle cannot be expressed as a single arc), and both are exactly the values
 * this shows most often.
 */
function ProgressRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 400ms ease-out" }}
        />
      </svg>
      <span className="absolute text-[12px] font-black tabular-nums text-white">
        {clamped}%
      </span>
    </span>
  );
}

export function TaskHeroBand({
  title,
  statusLabel,
  breadcrumb,
  actions,
  progressPct,
  time,
  canOperate,
  locked,
}: {
  title: string;
  statusLabel: string;
  breadcrumb: React.ReactNode;
  /** The existing Edit / Duplicate / More / Mark-as-Done cluster, passed in
   *  rather than rebuilt — those buttons carry real permission checks and
   *  server actions that must not be duplicated to change their colour. */
  actions?: React.ReactNode;
  progressPct: number;
  /** Null when time tracking is off for this task; the timer half then hides
   *  rather than showing a dead 00:00:00. */
  time: TaskTimeState | null;
  canOperate: boolean;
  locked: boolean;
}) {
  // Null only if this band is ever rendered outside the provider; the controls
  // then simply don't appear, which is the same as `canOperate: false`.
  const timer = useTaskTimer();

  // The banked total still comes from the server prop when there's no store,
  // so the READOUT never goes blank — only the buttons depend on the store.
  const total = timer ? timer.totalSeconds : (time?.rollup.totalActiveSeconds ?? 0);
  const running = timer?.running ?? false;
  const busy = timer?.busy ?? false;

  const btn =
    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold transition-colors disabled:opacity-50";

  return (
    <div className="mb-5 rounded-2xl bg-[#B80D22] px-5 py-3 text-white shadow-sm">
      {/* Top row — breadcrumbs and the caller's own action cluster. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white/75">
          {breadcrumb}
        </div>
        <span className="rounded-pill bg-white/20 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
          {statusLabel}
        </span>
        {/* REWORK CYCLES — `rejectionCount` is the number of times this task was
            sent back, which is exactly what a rework loop is. Hidden at zero:
            a "0 REWORK CYCLES" badge is noise on the majority of tasks that
            have never bounced. */}
        {(time?.rollup.rejectionCount ?? 0) > 0 && (
          <span className="rounded-pill bg-black/25 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wider text-white">
            {time!.rollup.rejectionCount} rework{" "}
            {time!.rollup.rejectionCount === 1 ? "cycle" : "cycles"}
          </span>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {/* Body — ring + title on the left, the timer on the right. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-4">
        <ProgressRing pct={progressPct} size={44} />
        {/* Title only. The `Altus Corp · App · Due 25 Aug 2026` line that sat
            under it is gone: every one of those three facts is stated in the
            4x3 field grid a short scroll below, and repeating them here cost
            the banner a whole second line. */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-black leading-tight text-white" title={title}>
            {title}
          </h1>
        </div>

        {/* TIMER — one horizontal group, so the banner is TWO rows and not four.
            It used to stack: label, then the clock, then the buttons, then a
            caption under those. Four stacked things on the right of a row whose
            left side is a 44px ring and one line of title, which is what made a
            "compact banner" three times the height of its content.

            Now the readout and its buttons sit side by side, which also puts
            Start Work · Restart directly beneath Edit Task · Link · Duplicate ·
            Archive on the row above — the same right-hand column, so the two
            action clusters line up instead of one being centred under a clock.

            The caption moved into this group's tooltip. "Runs until approved,
            cancelled or on hold" is worth saying once to someone who wonders;
            it is not worth a permanent fourth line on every task. */}
        {time && (
          <div
            className="ml-auto flex shrink-0 items-center gap-3"
            title="The timer runs until the task is approved, cancelled or put on hold."
          >
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase leading-none tracking-wider text-white/70">
                Total task timer
              </p>
              <p className="mt-1 text-[20px] font-black leading-none tabular-nums text-white">
                {hms(total)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canOperate && !locked && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (running ? timer?.pause() : timer?.start())}
                    /* GREEN TO GO, WHITE TO STOP — and this one surface has to
                       break the house rule to stay legible.

                       Everywhere else Pause is #B80D22. Here the button sits ON
                       #B80D22, so a crimson Pause would be a button-shaped hole
                       in the banner. The pair still reads as opposites: green
                       fill to start, white fill with crimson text to stop, which
                       is the same inversion the Mark-as-Done CTA already uses
                       two rows above it. */
                    className={`${btn} ${
                      running
                        ? "bg-white hover:bg-white/90"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                    style={running ? { color: CRIMSON } : undefined}
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : running ? (
                      <Pause size={14} strokeWidth={2.6} />
                    ) : (
                      <Play size={14} strokeWidth={2.6} />
                    )}
                    {running ? "Pause" : "Start Work"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    /* Confirmed, because it throws away the minutes since the
                       last Start. The old wording promised more than the engine
                       does — it said the session was ARCHIVED and the timer
                       reset to 00:00:00, when in fact closed sessions and the
                       banked total are untouched and only the session in
                       progress is rewound. Saying so is the difference between
                       a button people use and one they avoid. */
                    onClick={() => {
                      if (!confirm("Reset the current session to 00:00? Time already banked from earlier sessions is kept.")) return;
                      timer?.restart();
                    }}
                    title="Rewind the session in progress to zero; banked time is kept"
                    className={`${btn} bg-white/15 text-white hover:bg-white/25`}
                  >
                    <RotateCcw size={14} strokeWidth={2.6} />
                    Restart
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
