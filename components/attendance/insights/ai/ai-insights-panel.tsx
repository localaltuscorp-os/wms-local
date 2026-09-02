"use client";

import * as React from "react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  ThumbsUp,
  TriangleAlert,
  ArrowRight,
  Building2,
  TrendingUp,
} from "lucide-react";
import { ChartCard } from "@/components/hr/candidate/analytics/analytics-charts";
import type { WorkforceInsights } from "@/lib/ai/attendance-workforce-insights";
import { generateAttendanceInsights } from "@/app/(app)/attendance/insights/insights-actions";

/**
 * AI INSIGHTS PANEL — the executive read-out over the org attendance analytics.
 *
 * Self-contained + on-demand: calls the `generateAttendanceInsights` server
 * action for the given month (which runs Gemini → deterministic heuristic and
 * NEVER throws), then renders the summary / highlights / concerns /
 * recommendations / department call-outs / trend with a source badge.
 *
 * Pass `initialInsights` to server-render the first read instantly (the org
 * page can await the action in an RSC and hand the result down), or `autoRun`
 * to fetch on mount. Either way the "Regenerate" button re-runs it.
 */

const RED = "var(--color-altus-red)";
const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const TEAL = "var(--color-teal-deep)";
const INDIGO = "var(--color-indigo-deep, #4338ca)";

export function AiInsightsPanel({
  year,
  month,
  initialInsights,
  autoRun = false,
  className,
}: {
  year: number;
  month: number;
  initialInsights?: WorkforceInsights;
  autoRun?: boolean;
  className?: string;
}) {
  const [insights, setInsights] = React.useState<WorkforceInsights | null>(initialInsights ?? null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await generateAttendanceInsights(year, month);
      if (res.ok) setInsights(res.insights);
      else setError(res.error);
    });
  }, [year, month]);

  // Auto-run on mount / month change when asked and we don't already have data.
  const ranFor = React.useRef<string | null>(initialInsights ? `${year}-${month}` : null);
  React.useEffect(() => {
    if (!autoRun) return;
    const key = `${year}-${month}`;
    if (ranFor.current === key) return;
    ranFor.current = key;
    run();
  }, [autoRun, year, month, run]);

  return (
    <ChartCard
      title="AI Insights"
      subtitle="An executive read-out of the month, grounded in the numbers"
      icon={<Sparkles size={18} strokeWidth={2.2} />}
      className={className}
    >
      <div className="mb-4 flex items-center gap-2">
        {insights && (
          <span
            className="rounded-pill px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              color: insights.source === "ai" ? "#fff" : "var(--color-ink-subtle)",
              background:
                insights.source === "ai"
                  ? `linear-gradient(135deg, ${RED}, ${GREEN})`
                  : "var(--color-surface-track, rgba(15,23,42,0.05))",
            }}
          >
            {insights.source === "ai" ? "AI-generated" : "Rules-based"}
          </span>
        )}
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/75 px-3 py-1.5 text-[12.5px] font-bold text-ink-strong outline-none transition-colors hover:border-hairline-strong hover:text-[var(--color-altus-red-deep)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={14} strokeWidth={2.4} className="animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <RefreshCw size={14} strokeWidth={2.4} />
              {insights ? "Regenerate" : "Generate Insights"}
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-[13px] font-semibold"
          style={{
            color: "var(--color-altus-red-deep)",
            background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 20%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      {!insights && !error && (
        <EmptyPrompt pending={pending} />
      )}

      {insights && (
        <div className="flex flex-col gap-4">
          <p
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-serif), system-ui, sans-serif",
              fontStyle: "italic",
              fontSize: 16,
              lineHeight: 1.5,
            }}
          >
            {insights.summary}
          </p>

          {insights.trend && (
            <div
              className="flex items-start gap-2 rounded-2xl px-4 py-3"
              style={{ background: `color-mix(in srgb, ${INDIGO} 6%, transparent)` }}
            >
              <TrendingUp size={16} strokeWidth={2.4} style={{ color: INDIGO, marginTop: 2 }} />
              <p className="text-[13.5px] font-semibold leading-snug text-ink-soft">{insights.trend}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <PointList
              title="Highlights"
              icon={<ThumbsUp size={13} strokeWidth={2.5} />}
              accent={GREEN}
              points={insights.highlights}
              emptyText="No standout positives this month."
            />
            <PointList
              title="Concerns"
              icon={<TriangleAlert size={13} strokeWidth={2.5} />}
              accent={RED}
              points={insights.concerns}
              emptyText="No concerns flagged."
            />
          </div>

          <PointList
            title="Recommendations"
            icon={<ArrowRight size={13} strokeWidth={2.5} />}
            accent={AMBER}
            points={insights.recommendations}
            emptyText="No corrective action needed."
          />

          {insights.departmentCallouts.length > 0 && (
            <PointList
              title="Department call-outs"
              icon={<Building2 size={13} strokeWidth={2.5} />}
              accent={TEAL}
              points={insights.departmentCallouts}
              emptyText="No department stood out."
            />
          )}
        </div>
      )}
    </ChartCard>
  );
}

function EmptyPrompt({ pending }: { pending: boolean }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-10 text-center">
      <span
        className="inline-flex size-11 items-center justify-center rounded-full text-white"
        style={{ background: `linear-gradient(135deg, ${RED}, ${GREEN})` }}
      >
        {pending ? (
          <Loader2 size={22} strokeWidth={2.3} className="animate-spin" />
        ) : (
          <Sparkles size={22} strokeWidth={2.3} />
        )}
      </span>
      <p className="text-[14px] font-bold text-ink-strong">
        {pending ? "Reading the month…" : "Generate an AI read-out"}
      </p>
      <p className="max-w-sm text-[12.5px] font-medium text-ink-muted">
        Summarises attendance, punctuality, hours and department signals into highlights, concerns
        and concrete next actions.
      </p>
    </div>
  );
}

function PointList({
  title,
  icon,
  accent,
  points,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  points: string[];
  emptyText: string;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{
        background: `color-mix(in srgb, ${accent} 6%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent)`,
      }}
    >
      <div className="flex items-center gap-1.5" style={{ color: accent }}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">{title}</span>
      </div>
      {points.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-subtle">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[13.5px] leading-snug text-ink-soft">
              <span
                className="mt-[7px] size-1.5 shrink-0 rounded-full"
                style={{ background: accent }}
                aria-hidden
              />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
