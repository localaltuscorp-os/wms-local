"use client";

import * as React from "react";
import {
  Circle,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  BadgeCheck,
  ShieldAlert,
  ChevronDown,
} from "lucide-react";
import type { TimelineEntry } from "@/lib/queries/task-time";
import { formatDate } from "@/lib/format";

const META: Record<
  TimelineEntry["kind"],
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }
> = {
  created: { label: "Task Created", icon: Circle, tone: "text-ink-subtle" },
  work_started: { label: "Started Work", icon: Play, tone: "text-emerald-600" },
  work_resumed: { label: "Resumed Work", icon: Play, tone: "text-emerald-600" },
  work_paused: { label: "Paused", icon: Pause, tone: "text-amber-500" },
  timer_restarted: { label: "Task Timer Restarted", icon: RotateCcw, tone: "text-amber-500" },
  revision_started: { label: "Started Revision", icon: RotateCcw, tone: "text-altus-red" },
  work_done: { label: "Marked Done", icon: CheckCircle2, tone: "text-emerald-600" },
  sent_back: { label: "Not Approved — Sent Back", icon: XCircle, tone: "text-altus-red" },
  approved: { label: "Approved", icon: BadgeCheck, tone: "text-emerald-600" },
  auto_closed: { label: "Auto-closed (cap reached)", icon: ShieldAlert, tone: "text-amber-500" },
};

function fullTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleString("en-IN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  return `${formatDate(d)}, ${time}`;
}

// Work events that happened on revision 2+ ARE rework, so they say so. The
// "Rev N" badge already carried that, but only to someone who knows a revision
// implies a rejection — a manager auditing the log reads labels, not badges.
const REWORK_LABEL: Partial<Record<TimelineEntry["kind"], string>> = {
  work_started: "Rework Start",
  work_resumed: "Rework Resumed",
  work_paused: "Rework Paused",
  work_done: "Rework Ended — Marked Done",
};

/** Modern vertical activity timeline. Click any event to expand its details. */
export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  // Rework rounds = how many times this task was sent back. Counted from the log
  // itself rather than threaded in as a prop, so it can never disagree with the
  // events rendered directly below it.
  const reworkRounds = entries.filter((e) => e.kind === "sent_back").length;
  if (entries.length === 0) return null;

  return (
    <>
      {reworkRounds > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-hairline bg-surface-soft px-3 py-2">
          <RotateCcw size={14} className="shrink-0 text-altus-red" />
          <span className="text-[12.5px] font-bold text-ink-strong">
            {reworkRounds} rework round{reworkRounds > 1 ? "s" : ""}
          </span>
          <span className="text-[12px] font-medium text-ink-subtle">
            — rejection cycles before final approval
          </span>
        </div>
      )}
    <ol className="relative flex flex-col">
      {entries.map((e, i) => {
        const meta = META[e.kind] ?? META.created;
        const Icon = meta.icon;
        const isOpen = open === e.id;
        const hasDetail = !!e.comment || !!e.autoReason || e.revision > 1;
        const last = i === entries.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-hairline" />}
            <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hairline bg-white ${meta.tone}`}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => hasDetail && setOpen(isOpen ? null : e.id)}
                className={`flex w-full items-center justify-between gap-2 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-[13.5px] font-bold text-ink-strong">
                  {(e.revision > 1 && REWORK_LABEL[e.kind]) || meta.label}
                  {e.revision > 1 && (
                    <span className="ml-2 rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-bold text-ink-muted">
                      Rev {e.revision}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11.5px] font-medium text-ink-subtle tabular-nums">{fullTime(e.at)}</span>
                  {hasDetail && (
                    <ChevronDown size={14} className={`text-ink-subtle transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  )}
                </span>
              </button>
              <div className="mt-0.5 text-[11.5px] text-ink-muted">{e.actorName}</div>
              {isOpen && hasDetail && (
                <div className="mt-2 rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[12.5px] text-ink-strong">
                  {e.comment && (
                    <p>
                      <span className="font-bold">Comment: </span>
                      {e.comment}
                    </p>
                  )}
                  {e.autoReason && (
                    <p className="text-ink-muted">
                      <span className="font-bold">Auto: </span>
                      {e.autoReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
    </>
  );
}
