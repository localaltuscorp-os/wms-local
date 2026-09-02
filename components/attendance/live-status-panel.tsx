import {
  Activity,
  CheckCircle2,
  Clock,
  LogOut,
  AlertTriangle,
  Plane,
  Briefcase,
  ArrowRight,
} from "lucide-react";
import type { LiveStatus } from "@/lib/attendance/analytics/live-status";

/**
 * Right-rail "who's where right now" snapshot on the admin attendance home.
 * Pure display — the six counts come pre-computed from `loadLiveStatus`.
 */

const ROWS: Array<{
  key: keyof Omit<LiveStatus, "total">;
  label: string;
  icon: typeof CheckCircle2;
  accent: string;
}> = [
  { key: "currentlyIn", label: "Currently Checked In", icon: CheckCircle2, accent: "#16a34a" },
  { key: "lateArrivals", label: "Late Arrivals", icon: Clock, accent: "#d97706" },
  { key: "earlyDepartures", label: "Early Departures", icon: LogOut, accent: "#ea580c" },
  { key: "incomplete", label: "Incomplete Punches", icon: AlertTriangle, accent: "#dc2626" },
  { key: "onLeave", label: "On Leave Today", icon: Plane, accent: "#2563eb" },
  { key: "onBusinessField", label: "On Business / Field", icon: Briefcase, accent: "#7c3aed" },
];

export function LiveStatusPanel({ status }: { status: LiveStatus }) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "120ms",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="relative inline-grid size-9 place-items-center rounded-xl"
            style={{ background: "color-mix(in srgb, #16a34a 12%, transparent)", color: "#15803d" }}
          >
            <Activity size={17} strokeWidth={2.4} />
          </span>
          <div>
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Live Status
            </h2>
            <p className="text-[12px] font-medium text-ink-subtle">Right now · {status.total} active</p>
          </div>
        </div>
        <span aria-hidden className="relative inline-flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-70 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-green-500" />
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {ROWS.map(({ key, label, icon: Icon, accent }) => {
          const value = status[key];
          const dim = value === 0;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-soft"
            >
              <span
                className="inline-grid size-8 shrink-0 place-items-center rounded-lg"
                style={{
                  background: dim
                    ? "var(--color-surface-soft)"
                    : `color-mix(in srgb, ${accent} 12%, transparent)`,
                  color: dim ? "var(--color-ink-soft)" : accent,
                }}
              >
                <Icon size={16} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong">
                {label}
              </span>
              <span
                className="tabular-nums font-black"
                style={{ fontSize: 17, color: dim ? "var(--color-ink-soft)" : accent }}
              >
                {value}
              </span>
            </li>
          );
        })}
      </ul>

      <a
        href="/attendance/insights"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-pill py-2 text-[13px] font-bold text-ink-muted transition-colors hover:text-[var(--color-altus-red-deep)] hover:bg-surface-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40"
      >
        View All <ArrowRight size={14} strokeWidth={2.6} />
      </a>
    </section>
  );
}
