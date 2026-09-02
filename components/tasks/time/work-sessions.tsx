"use client";

import * as React from "react";
import { CheckCircle2, Radio, ShieldAlert, Pause } from "lucide-react";
import type { SessionRow } from "@/lib/queries/task-time";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import { useElapsedSeconds } from "./use-elapsed";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function LiveDuration({ startedAt }: { startedAt: string }) {
  const secs = useElapsedSeconds(startedAt);
  return <span className="tabular-nums text-altus-red-deep">{formatMinutesLabel(secs)}</span>;
}

/**
 * Immutable per-session ledger. Sessions are grouped by revision cycle; the first
 * revision is "Original work", later ones are "Revision work". Footer sums both.
 */
export function WorkSessions({
  sessions,
  originalSeconds,
  revisionSeconds,
  totalSeconds,
}: {
  sessions: SessionRow[];
  originalSeconds: number;
  revisionSeconds: number;
  totalSeconds: number;
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-[13.5px] text-ink-muted">No work sessions yet — press Start Work to begin recording.</p>
    );
  }

  // Number sessions globally but label revision boundaries.
  let n = 0;
  let lastRevision = 0;

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s) => {
        n += 1;
        const showRevHeader = s.revision !== lastRevision && s.revision > 1;
        lastRevision = s.revision;
        const auto = s.endReason === "auto_idle" || s.endReason === "auto_daily";
        return (
          <React.Fragment key={s.id}>
            {showRevHeader && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-altus-red">
                  Revision {s.revision - 1} · Rework
                </span>
                <span className="h-px flex-1" style={{ background: "var(--color-hairline)" }} />
              </div>
            )}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-soft text-[12px] font-bold text-ink-muted tabular-nums">
                  {n}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink-strong tabular-nums">
                    {clock(s.startedAt)}
                    {" → "}
                    {s.live ? <span className="text-altus-red-deep">live</span> : s.endedAt ? clock(s.endedAt) : "—"}
                  </div>
                  <div className="text-[11.5px] font-medium text-ink-subtle">
                    {s.live ? "In progress" : auto ? "Auto-closed (cap reached)" : s.endReason === "done" ? "Ended on Done" : "Completed"}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[14px] font-bold tabular-nums text-ink-strong">
                  {s.live ? <LiveDuration startedAt={s.startedAt} /> : formatMinutesLabel(s.durationSeconds ?? 0)}
                </span>
                {s.live ? (
                  <Radio size={15} className="text-altus-red" />
                ) : auto ? (
                  <ShieldAlert size={15} className="text-amber-500" />
                ) : s.endReason === "paused" ? (
                  <Pause size={14} className="text-ink-subtle" />
                ) : (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Foot label="Original" value={formatMinutesLabel(originalSeconds)} />
        <Foot label="Revision" value={formatMinutesLabel(revisionSeconds)} />
        <Foot label="Total" value={formatMinutesLabel(totalSeconds)} strong />
      </div>
    </div>
  );
}

function Foot({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${strong ? "border-altus-red/40 bg-[color-mix(in_srgb,var(--color-altus-red)_6%,white)]" : "border-hairline bg-surface-soft"}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</div>
      <div className={`tabular-nums ${strong ? "text-[16px] font-black text-altus-red-deep" : "text-[15px] font-bold text-ink-strong"}`}>
        {value}
      </div>
    </div>
  );
}
