"use client";

import * as React from "react";
import { LogIn, LogOut, Timer, CheckCircle2 } from "lucide-react";

/**
 * "Today" panel — beside the punch dial. Shows today's In/Out and a live ring of
 * hours-worked-so-far toward the 9-hour full-day target (Sir's rule: <9h ⇒ half
 * day). While checked-in-not-out the ring ticks up each minute.
 */
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

function fmtHm(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm}m`;
}

export function TodayPanel({
  inLabel,
  outLabel,
  inISO,
  outISO,
  fullDayHours = 9,
}: {
  inLabel: string | null;
  outLabel: string | null;
  inISO: string | null;
  outISO: string | null;
  fullDayHours?: number;
}) {
  // Null until mounted → server + first client render agree (no hydration drift);
  // the effect fills it in and ticks every minute while checked-in-not-out.
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const live = inISO != null && outISO == null;
  React.useEffect(() => {
    if (!live) return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [live]);

  const inMs = inISO ? Date.parse(inISO) : null;
  const outMs = outISO ? Date.parse(outISO) : null;
  const targetMin = fullDayHours * 60;
  const workedMin =
    inMs == null ? 0 : Math.max(0, ((outMs ?? nowMs ?? inMs) - inMs) / 60_000);
  const pct = Math.min(100, (workedMin / targetMin) * 100);
  const remaining = Math.max(0, targetMin - workedMin);
  const full = workedMin >= targetMin;

  // Ring geometry.
  const R = 46;
  const C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;

  return (
    <div
      className="wg-rise flex h-full flex-col rounded-[24px] bg-surface-card p-6 max-md:p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 30px -22px rgba(15,23,42,0.3)", animationDelay: "60ms" }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, #E10600 12%, transparent)`, color: "#A80400" }}>
          <Timer size={15} strokeWidth={2.4} />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-subtle">Today</span>
      </div>

      {/* ring */}
      <div className="mt-4 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width={112} height={112} viewBox="0 0 112 112" className="-rotate-90">
            <circle cx={56} cy={56} r={R} fill="none" stroke="var(--color-surface-track)" strokeWidth={9} />
            <circle
              cx={56}
              cy={56}
              r={R}
              fill="none"
              stroke={full ? GREEN_DEEP : GREEN}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[19px] font-black tabular-nums text-ink-strong">{fmtHm(workedMin)}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-subtle">of {fullDayHours}h</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <Row icon={<LogIn size={14} strokeWidth={2.4} />} label="Checked In" value={inLabel ?? "—"} on={!!inLabel} />
          <Row icon={<LogOut size={14} strokeWidth={2.4} />} label="Checked Out" value={outLabel ?? "—"} on={!!outLabel} />
        </div>
      </div>

      {/* status line */}
      <div className="mt-auto pt-4">
        {inMs == null ? (
          <p className="text-[13px] font-medium text-ink-muted">Punch in to start counting your hours.</p>
        ) : full ? (
          <p className="inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: GREEN_DEEP }}>
            <CheckCircle2 size={15} strokeWidth={2.4} /> Full day complete — {fmtHm(workedMin)} logged.
          </p>
        ) : (
          <p className="text-[13px] font-medium text-ink-muted">
            <span className="font-bold text-ink-strong tabular-nums">{fmtHm(remaining)}</span> more to reach a full day{live ? " · counting live" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value, on }: { icon: React.ReactNode; label: string; value: string; on: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="inline-flex size-6 items-center justify-center rounded-md" style={{ background: on ? "color-mix(in srgb, #16a34a 12%, transparent)" : "var(--color-surface-soft)", color: on ? GREEN_DEEP : "var(--color-ink-subtle)" }}>
        {icon}
      </span>
      <span className="text-[12.5px] font-medium text-ink-muted">{label}</span>
      <span className="ml-auto text-[14px] font-black tabular-nums" style={{ color: on ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}>{value}</span>
    </div>
  );
}
