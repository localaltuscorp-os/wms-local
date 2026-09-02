"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import { cloneGoalForward, moveGoalForward } from "@/app/(app)/goals/cascade/actions";
import { periodKeyLabel } from "./util";

/**
 * Move-unfinished-forward control (design §4). Default = CLONE forward (origin
 * preserved, progress resets unless "retain progress"); a distinct destructive
 * MOVE re-timeframes in place. Targets are the sibling period keys the caller
 * supplies (e.g. Q1 → Q2/Q3, or other months of the FY).
 */
export function MoveForwardMenu({
  goalId,
  targets,
}: {
  goalId: string;
  targets: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string>(targets[0] ?? "");
  const [retain, setRetain] = React.useState(false);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (targets.length && !targets.includes(target)) setTarget(targets[0]!);
  }, [targets, target]);

  if (targets.length === 0) return null;

  function run(kind: "clone" | "move") {
    if (!target) return;
    start(async () => {
      const res =
        kind === "clone"
          ? await cloneGoalForward({ id: goalId, targetPeriodKey: target, retainProgress: retain })
          : await moveGoalForward({ id: goalId, targetPeriodKey: target });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: kind === "clone" ? `Cloned to ${periodKeyLabel(target)}` : `Moved to ${periodKeyLabel(target)}`,
        type: "success",
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Carry forward"
          className="wg-btn inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
        >
          <ArrowRightCircle size={13} strokeWidth={2.4} />
          Carry
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-2xl border border-hairline bg-surface-card p-3"
      >
        <p className="text-[11.5px] font-black uppercase tracking-[0.06em] text-ink-muted">
          Carry forward to
        </p>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13.5px] font-semibold text-ink-strong outline-none"
        >
          {targets.map((t) => (
            <option key={t} value={t}>
              {periodKeyLabel(t)}
            </option>
          ))}
        </select>

        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-soft">
          <input
            type="checkbox"
            checked={retain}
            onChange={(e) => setRetain(e.target.checked)}
            className="size-4 accent-[#E10600]"
          />
          Retain Progress
        </label>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => run("clone")}
            disabled={pending}
            className="wg-btn wg-sheen inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            Clone
          </button>
          <button
            type="button"
            onClick={() => run("move")}
            disabled={pending}
            className="rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:text-altus-red"
            title="Re-timeframe in place (removes from origin)"
          >
            Move
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
