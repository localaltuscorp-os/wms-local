"use client";
import * as React from "react";
import { format, parseISO } from "date-fns";
import type { VelocityPoint } from "@/lib/types";
import { VelocityChart } from "@/components/charts/velocity-chart";
import { VelocityHeadline } from "./velocity-headline";

interface WeeklyPoint {
  weekStart: string;
  weekLabel: string;
  created: number;
  completed: number;
}

function bucketByWeek(points: VelocityPoint[]): WeeklyPoint[] {
  const buckets = new Map<string, { created: number; completed: number }>();
  for (const p of points) {
    const d = parseISO(p.date);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // shift to ISO Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const key = format(monday, "yyyy-MM-dd");
    const b = buckets.get(key) ?? { created: 0, completed: 0 };
    b.created += p.created;
    b.completed += p.completed;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([weekStart, v]) => ({
      weekStart,
      weekLabel: format(parseISO(weekStart), "MMM d"),
      created: v.created,
      completed: v.completed,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function VelocityHero({
  data,
  embedded = false,
}: {
  data: VelocityPoint[];
  /** Rendered inside the collapsible section — drop the standalone card
   *  wrapper + the internal "Task Velocity" header (the collapsible bar owns
   *  the title). */
  embedded?: boolean;
}) {
  const weekly = React.useMemo(() => bucketByWeek(data), [data]);

  const totalCreated = weekly.reduce((s, w) => s + w.created, 0);
  const totalCompleted = weekly.reduce((s, w) => s + w.completed, 0);
  const weeks = Math.max(weekly.length, 1);

  const avgCreated = Math.round(totalCreated / weeks);
  const avgCompleted = Math.round(totalCompleted / weeks);
  const netPerWeek = avgCreated - avgCompleted;

  let insightTone: "amber" | "green" | "blue";
  let insightEmoji: string;
  let insightText: string;
  if (netPerWeek > 0) {
    insightTone = "amber";
    insightEmoji = netPerWeek >= 10 ? "⚠️" : "📈";
    insightText = `Backlog growing — about ${netPerWeek} more new tasks than finished each week, on average.`;
  } else if (netPerWeek < 0) {
    insightTone = "green";
    insightEmoji = "✅";
    insightText = `Team is catching up — finishing about ${-netPerWeek} more tasks than coming in each week.`;
  } else {
    insightTone = "blue";
    insightEmoji = "➖";
    insightText = `Steady pace — about ${avgCompleted} tasks closing per week, matching incoming.`;
  }

  return (
    <section
      className={
        embedded
          ? "p-8 max-md:p-4"
          : "mx-auto max-w-[1600px] mt-12 bg-surface-card rounded-section p-8 max-md:p-4 max-md:mt-6"
      }
      style={
        embedded
          ? undefined
          : {
              border: "1px solid var(--color-hairline)",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
              opacity: 0,
              animation: "fadeUp 500ms ease-out 300ms forwards",
            }
      }
    >
      <VelocityHeadline totalCreated={totalCreated} totalCompleted={totalCompleted} />
      <div>
        {!embedded && (
          <header className="mb-5">
            <h2 className="text-display-lg text-ink-strong">
              <span aria-hidden className="mr-2">📈</span>Task Velocity
            </h2>
            <p className="text-body-lg text-ink-subtle mt-1">
              Each bar = one week. Blue = new tasks coming in. Green = tasks
              finished. A healthy team keeps green at or above blue.
            </p>
          </header>
        )}

        {/* Auto-generated insight chip */}
        <div
          className="inline-flex items-start gap-2.5 px-4 py-2.5 rounded-chip mb-6 max-w-full"
          style={{
            background: `color-mix(in srgb, var(--color-${insightTone}) 10%, transparent)`,
            border: `1px solid color-mix(in srgb, var(--color-${insightTone}) 22%, transparent)`,
          }}
        >
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
            {insightEmoji}
          </span>
          <span
            className="text-body-lg"
            style={{ color: `var(--color-${insightTone}-deep)`, fontWeight: 600 }}
          >
            {insightText}
          </span>
        </div>

        <VelocityChart data={weekly} />

        <footer className="mt-6 pt-5 border-t border-hairline flex items-center justify-between gap-6 flex-wrap max-md:flex-col max-md:items-start max-md:gap-2">
          <span
            className="uppercase font-bold tracking-[0.12em]"
            style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
          >
            Avg per week
          </span>
          <span
            className="tabular-nums font-bold"
            style={{ fontSize: 22, color: "var(--color-ink-strong)" }}
          >
            <span style={{ color: "var(--color-blue-deep)" }}>{avgCreated}</span>
            <span className="text-ink-subtle font-medium mx-2">new</span>
            <span className="text-ink-subtle mx-2">·</span>
            <span style={{ color: "var(--color-green-deep)" }}>{avgCompleted}</span>
            <span className="text-ink-subtle font-medium mx-2">finished</span>
          </span>
        </footer>
      </div>
    </section>
  );
}
