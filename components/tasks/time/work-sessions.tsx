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

  /* Numbering and revision headers, worked out BEFORE the JSX rather than by
     mutating two counters inside the map. The counters were a render-phase
     write (react-hooks/immutability), which React is free to run twice — and
     under StrictMode did, numbering the list 2, 4, 6. */
  const rows = sessions.map((s, i) => ({
    s,
    n: i + 1,
    showRevHeader: s.revision > 1 && s.revision !== sessions[i - 1]?.revision,
  }));

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ s, n, showRevHeader }) => {
        const auto = s.endReason === "auto_idle" || s.endReason === "auto_daily";
        /* Cleared by a Restart. Kept in the list — this IS the audit trail —
           but faded and struck, because the totals underneath no longer count
           it and a row that looks identical to a counted one would make those
           totals look wrong. */
        const dead = s.discarded;
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
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border border-hairline px-3.5 py-2.5 ${
                dead ? "bg-surface-soft opacity-60" : "bg-white"
              }`}
              title={dead ? "Cleared by a Restart — not counted in the total" : undefined}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-soft text-[12px] font-bold text-ink-muted tabular-nums">
                  {n}
                </span>
                <div className="min-w-0">
                  <div
                    className={`text-[13.5px] font-semibold tabular-nums ${
                      dead ? "text-ink-subtle line-through" : "text-ink-strong"
                    }`}
                  >
                    {clock(s.startedAt)}
                    {" → "}
                    {s.live ? <span className="text-altus-red-deep">live</span> : s.endedAt ? clock(s.endedAt) : "—"}
                  </div>
                  <div className="text-[11.5px] font-medium text-ink-subtle">
                    {s.live
                      ? "In progress"
                      : dead
                        ? "Cleared by Restart"
                        : auto
                          ? "Auto-closed (cap reached)"
                          : s.endReason === "done"
                            ? "Ended on Done"
                            : s.endReason === "stopped"
                              ? "Stopped"
                              : "Completed"}
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
