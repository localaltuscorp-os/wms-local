"use client";

import * as React from "react";
import { TriangleAlert, AlertTriangle, Info, ArrowRight, ShieldCheck } from "lucide-react";
import { ChartCard } from "@/components/hr/candidate/analytics/analytics-charts";
import type { SmartAlert, AlertSeverity } from "@/lib/attendance/analytics/alerts";

/**
 * SMART ALERTS PANEL — pure presentational. Renders the ranked, rule-based
 * alerts as severity-coloured cards with an optional action link. Self-contained
 * so the org dashboard can drop it in with `<SmartAlertsPanel alerts={...} />`.
 * Alerts are computed with `computeSmartAlerts` (pure) either on the server or
 * on the client — this component only paints them.
 */

const TONES: Record<AlertSeverity, { c: string; d: string; label: string; icon: React.ReactNode }> = {
  critical: {
    c: "var(--color-altus-red)",
    d: "var(--color-altus-red-deep)",
    label: "Critical",
    icon: <TriangleAlert size={16} strokeWidth={2.4} />,
  },
  warning: {
    c: "var(--color-amber)",
    d: "var(--color-amber-deep)",
    label: "Warning",
    icon: <AlertTriangle size={16} strokeWidth={2.4} />,
  },
  info: {
    c: "var(--color-teal)",
    d: "var(--color-teal-deep)",
    label: "Info",
    icon: <Info size={16} strokeWidth={2.4} />,
  },
};

export function SmartAlertsPanel({
  alerts,
  className,
}: {
  alerts: SmartAlert[];
  className?: string;
}) {
  const counts = React.useMemo(
    () =>
      alerts.reduce(
        (acc, a) => {
          acc[a.severity] += 1;
          return acc;
        },
        { critical: 0, warning: 0, info: 0 } as Record<AlertSeverity, number>,
      ),
    [alerts],
  );

  const subtitle =
    alerts.length === 0
      ? "No anomalies detected — everything is within thresholds"
      : `${counts.critical} critical · ${counts.warning} warning · ${counts.info} info`;

  return (
    <ChartCard
      title="Smart Alerts"
      subtitle={subtitle}
      icon={<TriangleAlert size={18} strokeWidth={2.2} />}
      className={className}
    >
      {alerts.length === 0 ? (
        <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
          <span
            className="inline-flex size-10 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--color-green) 12%, transparent)", color: "var(--color-green-deep)" }}
          >
            <ShieldCheck size={20} strokeWidth={2.3} />
          </span>
          <p className="text-[14px] font-bold text-ink-strong">All clear</p>
          <p className="max-w-xs text-[12.5px] font-medium text-ink-muted">
            No attendance anomalies crossed a threshold this month.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function AlertCard({ alert }: { alert: SmartAlert }) {
  const tone = TONES[alert.severity];
  return (
    <li
      className="flex items-start gap-3 rounded-2xl p-3.5 max-md:p-3"
      style={{
        background: `color-mix(in srgb, ${tone.c} 6%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.c} 22%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: `linear-gradient(135deg, ${tone.c}, ${tone.d})` }}
      >
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-pill px-1.5 py-[1px] text-[9.5px] font-black uppercase tracking-[0.1em] text-white"
            style={{ background: tone.d }}
          >
            {tone.label}
          </span>
          <h3 className="min-w-0 truncate text-[14px] font-bold text-ink-strong">{alert.title}</h3>
          {alert.metric && (
            <span
              className="ml-auto shrink-0 tabular-nums text-[15px] font-black"
              style={{ color: tone.d, letterSpacing: "-0.01em" }}
            >
              {alert.metric}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12.5px] font-medium leading-snug text-ink-soft">{alert.detail}</p>
        {alert.actionRoute && (
          <a
            href={alert.actionRoute}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold outline-none transition-colors focus-visible:underline"
            style={{ color: tone.d }}
          >
            Investigate
            <ArrowRight size={13} strokeWidth={2.5} />
          </a>
        )}
      </div>
    </li>
  );
}
