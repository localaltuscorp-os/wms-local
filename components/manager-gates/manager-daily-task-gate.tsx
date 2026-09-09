"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Plus, Check, RefreshCw, Loader2, Users } from "lucide-react";
import type { DailyGateState } from "@/lib/manager-gates";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

/**
 * Hard gate: a manager must give each direct report their daily quota of tasks
 * before entering the app. Lists every report with given/quota; "Assign" opens
 * the New Task form pre-set to that person. Re-check refreshes the gate.
 */
export function ManagerDailyTaskGate({
  greetingName,
  state,
}: {
  greetingName?: string;
  state: DailyGateState;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const totalNeeded = state.reports.reduce((s, r) => s + Math.max(0, r.quota - r.given), 0);

  function recheck() {
    setBusy(true);
    router.refresh();
    window.setTimeout(() => setBusy(false), 3000);
  }

  return (
    <main
      className="relative min-h-[100svh] w-full"
      style={{
        background:
          "linear-gradient(180deg, var(--color-surface-soft) 0%, color-mix(in srgb, var(--color-surface-track) 60%, var(--color-surface-soft)) 100%)",
        color: "var(--color-ink-strong)",
      }}
    >
      <div className="mx-auto max-w-[920px] px-8 max-md:px-4 py-8">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>
          Assign today&apos;s tasks{greetingName ? ` · ${greetingName}` : ""}
        </span>
        <h1
          className="mt-2 font-bold"
          style={{ fontSize: "clamp(26px, 3vw, 40px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
        >
          Give your team their tasks for today
        </h1>
        <p className="mt-2 max-w-[62ch] font-medium" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
          Before you start, assign each person who reports to you their tasks for the day. You need to give{" "}
          <span className="font-bold text-altus-red tabular-nums">{totalNeeded}</span> more task{totalNeeded === 1 ? "" : "s"} to continue.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          {state.reports.map((r) => {
            const done = r.given >= r.quota;
            const left = Math.max(0, r.quota - r.given);
            return (
              <div
                key={r.id}
                className="flex items-center gap-4 rounded-section border bg-surface-card p-4 max-md:p-3.5"
                style={{
                  borderColor: done ? "color-mix(in srgb, var(--color-green) 40%, transparent)" : "var(--color-hairline)",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
                }}
              >
                <span
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={done ? { background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))" } : { background: "var(--color-surface-track)" }}
                >
                  {done ? <Check size={20} strokeWidth={3} className="text-white" /> : <Users size={18} style={{ color: "var(--color-ink-subtle)" }} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-strong" style={{ fontSize: 15.5 }}>{r.name}</div>
                  <div className="text-[13px] font-bold tabular-nums" style={{ color: done ? "var(--color-green-deep)" : "var(--color-ink-subtle)" }}>
                    {r.given} of {r.quota} given{done ? " ✓" : ` · ${left} to go`}
                  </div>
                </div>
                <a
                  href={`/tasks/new?doer=${r.id}` as Route}
                  className={`wg-sheen inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white ${FOCUS}`}
                  style={{ background: done ? "var(--color-ink-soft)" : "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  <Plus size={16} strokeWidth={2.6} /> Assign
                </a>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={recheck}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-5 py-3 text-[15px] font-bold text-ink-strong disabled:opacity-60 ${FOCUS}`}
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />} I&apos;ve assigned them — re-check
          </button>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle">
            <ArrowRight size={14} /> the app unlocks once every person has their tasks
          </span>
        </div>
      </div>
    </main>
  );
}
