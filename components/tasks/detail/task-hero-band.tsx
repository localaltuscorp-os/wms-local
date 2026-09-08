"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, RotateCcw, Loader2 } from "lucide-react";
import type { TaskTimeState } from "@/lib/queries/task-time";
import {
  startWorkAction,
  pauseWorkAction,
  restartTimerAction,
} from "@/app/(app)/tasks/time-actions";
import { useElapsedSeconds } from "@/components/tasks/time/use-elapsed";
import { fireToast } from "@/lib/toast";

/**
 * THE CRIMSON HERO BAND — the task's identity, its progress, and its timer, in
 * one block at the top of the detail screen.
 *
 * IT DRIVES THE EXISTING ENGINE, it does not add a second one.
 * `startWorkAction` / `pauseWorkAction` / `restartTimerAction` and the session
 * rollup already exist and are already what the Time Spent rail card and the
 * Time Log tab operate; this is a third VIEW of the same state. A timer here
 * with its own interval and its own idea of "running" would be two clocks that
 * disagree the moment one of them is paused from the other surface.
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
  taskId,
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
  taskId: string;
  canOperate: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const live = time?.live ?? null;
  const base = time?.rollup.totalActiveSeconds ?? 0;
  // The live seconds come from the SERVER's start stamp, not from a local
  // counter started on mount: reload the page mid-session and the clock has to
  // resume where the session actually is, not at zero.
  const liveSeconds = useElapsedSeconds(live?.startedAt ?? null);
  const total = base + (live ? liveSeconds : 0);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (busy) return;
    setBusy(true);
    void fn()
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.message ?? "Couldn't update the timer.", type: "error" });
          return;
        }
        // Refresh rather than patching local state: the rollup, the session
        // list and the timeline all move together on the server, and this
        // header is only one of three surfaces showing them.
        router.refresh();
      })
      .finally(() => setBusy(false));
  }

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

        {time && (
          <div className="shrink-0 text-right">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-white/70">
              Total task timer
            </p>
            <p className="text-[22px] font-black leading-none tabular-nums text-white">
              {hms(total)}
            </p>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              {canOperate && !locked && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() => (live ? pauseWorkAction(taskId) : startWorkAction(taskId)))
                    }
                    /* GREEN TO GO, WHITE TO STOP — and this one surface has to
                       break the house rule to stay legible.

                       Everywhere else Pause is #B80D22. Here the button sits ON
                       #B80D22, so a crimson Pause would be a button-shaped hole
                       in the banner. The pair still reads as opposites: green
                       fill to start, white fill with crimson text to stop, which
                       is the same inversion the Mark-as-Done CTA already uses
                       two rows above it. */
                    className={`${btn} ${
                      live
                        ? "bg-white hover:bg-white/90"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                    style={live ? { color: CRIMSON } : undefined}
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : live ? (
                      <Pause size={14} strokeWidth={2.6} />
                    ) : (
                      <Play size={14} strokeWidth={2.6} />
                    )}
                    {live ? "Pause" : "Start Work"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    // Confirmed, because it discards the running session. The
                    // engine archives it rather than deleting it, but the
                    // reader cannot know that from the button.
                    onClick={() => {
                      if (!confirm("Archive the running session and reset the timer to 00:00:00?")) return;
                      run(() => restartTimerAction(taskId));
                    }}
                    title="Archive the active session and reset to 00:00:00"
                    className={`${btn} bg-white/15 text-white hover:bg-white/25`}
                  >
                    <RotateCcw size={14} strokeWidth={2.6} />
                    Restart
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 text-[10.5px] font-medium text-white/60">
              Runs until approved, cancelled or on hold.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
