"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Loader2 } from "lucide-react";
import { startWorkAction, pauseWorkAction } from "@/app/(app)/tasks/time-actions";
import { fireToast } from "@/lib/toast";

/**
 * Inline Start / Stop for one row of the tasks table.
 *
 * It drives the SAME engine the Task Detail drawer does — startWork /
 * pauseWork — so the session ledger, the rollup and the immutable event log are
 * written identically whether the timer is driven from here or from the
 * drawer. Nothing about the audit trail is special-cased for this control;
 * that is the point of routing through the actions rather than writing rows.
 *
 * OPTIMISTIC BY NECESSITY, not for polish. The row's `running` flag comes from
 * task_time_rollup via a 30s unstable_cache; even with the cache tag now busted
 * on every timer action (see time-actions.ts), the server round-trip plus
 * re-render is long enough that a non-optimistic button would sit on its old
 * label after the click. Local state flips immediately and `router.refresh()`
 * reconciles; a failed action rolls the flip back and says why.
 */
export function TaskTimerCell({
  taskId,
  running,
  canOperate,
}: {
  taskId: string;
  running: boolean;
  /** False hides the control entirely. A button that always errors is worse
   *  than no button. */
  canOperate: boolean;
}) {
  const router = useRouter();
  // The flip records WHAT the server said when it was made, so staleness is
  // derived during render rather than reconciled in an effect: once `running`
  // changes, `basedOn` no longer matches and the server value takes over on its
  // own. No setState-in-effect, and no window where both are briefly true.
  const [flip, setFlip] = React.useState<{ value: boolean; basedOn: boolean } | null>(null);
  const [pending, setPending] = React.useState(false);

  const isRunning = flip && flip.basedOn === running ? flip.value : running;

  if (!canOperate) return <span className="text-ink-subtle">—</span>;

  function toggle(e: React.MouseEvent) {
    // The row itself is a click-to-open target in drawer mode; the timer must
    // not also open the record.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !isRunning;
    setFlip({ value: next, basedOn: running });
    setPending(true);
    void (next ? startWorkAction(taskId) : pauseWorkAction(taskId))
      .then((res) => {
        if (!res.ok) {
          setFlip(null); // roll back to whatever the server says
          fireToast({
            message: res.message ?? "Couldn't update the timer.",
            type: "error",
          });
          return;
        }
        router.refresh();
      })
      .finally(() => setPending(false));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={isRunning}
      title={isRunning ? "Stop the timer on this task" : "Start the timer on this task"}
      /* GREEN GOES, RED STOPS. Both states used to be green — filled to stop,
         outlined to start — so the colour identified the CONTROL rather than
         its action, and the only thing distinguishing "will start" from "will
         stop" was a fill weight and a four-letter label. */
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-white transition-colors disabled:opacity-50 ${
        isRunning
          ? "bg-[#B80D22] hover:bg-red-700"
          : "bg-emerald-600 hover:bg-emerald-700"
      }`}
    >
      {pending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : isRunning ? (
        <Square size={11} strokeWidth={3} fill="currentColor" />
      ) : (
        <Play size={11} strokeWidth={3} fill="currentColor" />
      )}
      {isRunning ? "Stop" : "Start"}
    </button>
  );
}
