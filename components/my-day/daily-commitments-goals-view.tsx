"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface DailyCommitmentsGoal {
  id: string;
  title: string;
  detail: string | null;
  progress: number;
}

export function DailyCommitmentsGoalsView({
  weekly,
  monthly,
}: {
  weekly: DailyCommitmentsGoal[];
  monthly: DailyCommitmentsGoal[];
}) {
  const [period, setPeriod] = React.useState<"weekly" | "monthly">("weekly");
  const [open, setOpen] = React.useState(true);
  const goals = period === "weekly" ? weekly : monthly;
  const title = period === "weekly" ? "This Week's Goals" : "This Month's Goals";

  return (
    <section
      className="mt-6 overflow-hidden rounded-none"
      aria-labelledby="daily-goals-heading"
      style={{
        border: "1px solid color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red) 4%, white), var(--color-surface-card))",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 max-md:px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 id="daily-goals-heading" className="truncate text-[16px] font-bold text-ink-strong">
            {title}
          </h2>
          <span
            className="shrink-0 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red-deep)",
            }}
          >
            {goals.length}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="inline-flex rounded-lg border border-hairline bg-surface-soft p-0.5" role="tablist" aria-label="Goal period">
          {([
            ["weekly", "Weekly"],
            ["monthly", "Monthly"],
          ] as const).map(([value, label]) => {
            const selected = period === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setPeriod(value)}
                className="rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors focus-visible:outline-2"
                style={selected ? { background: "#ffffff", color: "var(--color-altus-red-deep)", boxShadow: "0 1px 2px rgba(15,23,42,0.08)", outlineColor: "var(--color-altus-red)" } : { color: "var(--color-ink-soft)", outlineColor: "var(--color-altus-red)" }}
              >
                {label}
              </button>
            );
          })}
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="daily-commitments-goal-list"
            aria-label={`${open ? "Hide" : "Show"} ${title.toLowerCase()}`}
            className="inline-flex size-8 items-center justify-center rounded-md border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red focus-visible:outline-2 focus-visible:outline-altus-red"
          >
            {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
        </div>
      </header>

      {open ? <div id="daily-commitments-goal-list" role="tabpanel" className="border-t border-hairline">
        {goals.length === 0 ? (
          <p className="px-4 py-5 text-[13px] font-medium text-ink-muted">
            No {period} goals are available for this period.
          </p>
        ) : (
          goals.map((goal) => (
            <article key={goal.id} className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0 max-md:flex-wrap max-md:px-3">
              <span aria-hidden className="h-6 w-1 shrink-0 rounded-full bg-altus-red" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[13px] font-bold leading-snug text-ink-strong">{goal.title}</h3>
                {goal.detail ? <p className="mt-0.5 truncate text-[12px] leading-snug text-ink-muted">{goal.detail}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2" title={`${goal.progress}% complete`}>
                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-track" aria-hidden>
                  <div className="h-full rounded-full bg-altus-red" style={{ width: `${Math.max(0, Math.min(100, goal.progress))}%` }} />
                </div>
                <span className="w-9 text-right text-[12px] font-bold tabular-nums text-ink-soft">{goal.progress}%</span>
              </div>
            </article>
          ))
        )}
      </div> : null}
    </section>
  );
}
