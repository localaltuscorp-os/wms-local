"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Layers } from "lucide-react";
import { quartersOfFy } from "@/lib/goals/types";
import { GoalCard } from "./goal-card";
import { AddGoalButton } from "./add-goal-button";
import {
  effectiveGoalPct,
  pctTone,
  periodKeyShort,
  periodKeyLabel,
  type GoalNodeDTO,
  type RosterMember,
} from "./util";

function QuarterChip({ node }: { node: GoalNodeDTO }) {
  const eff = effectiveGoalPct(node);
  const tone = pctTone(eff);
  return (
    <Link
      href={`/goals/cascade/${node.periodKey}` as Route}
      className={`group wg-btn inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2 transition-all hover:border-hairline-strong hover:shadow-sm ${
        node.adopted ? "" : "opacity-50"
      }`}
    >
      <span
        className="inline-flex size-7 items-center justify-center rounded-lg text-[11px] font-black tabular-nums"
        style={{
          background: tone.bg,
          color: tone.color,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.color} 22%, transparent)`,
        }}
      >
        {periodKeyShort(node.periodKey)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-ink-strong max-w-[160px]">
          {node.title}
        </span>
        <span className="block text-[11px] font-semibold text-ink-muted">
          {eff}% {node.adopted ? "" : "· dropped"}
        </span>
      </span>
      <ChevronRight size={15} className="text-ink-soft transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function YearBoard({
  fyStartYear,
  years,
  standalone,
  roster,
  viewedEmployeeId,
  canWrite,
}: {
  fyStartYear: number;
  years: GoalNodeDTO[];
  standalone: GoalNodeDTO[];
  roster: RosterMember[];
  viewedEmployeeId: string;
  canWrite: boolean;
}) {
  const yearKey = String(fyStartYear);
  const quarters = quartersOfFy(fyStartYear);

  return (
    <div className="space-y-8">
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <AddGoalButton
            employeeId={viewedEmployeeId}
            period="year"
            periodKey={yearKey}
            roster={roster}
            label="Add yearly goal"
          />
        </div>
      )}

      {years.length === 0 && standalone.length === 0 && (
        <div
          className="wg-rise relative overflow-hidden rounded-section border border-hairline-strong p-10 text-center"
          style={{
            background:
              "radial-gradient(ellipse 80% 130% at 50% 0%, color-mix(in srgb, #E10600 7%, transparent), transparent 60%), var(--color-surface-card)",
          }}
        >
          <span
            className="mx-auto inline-grid size-14 place-items-center rounded-2xl"
            style={{
              color: "#A80400",
              background: "color-mix(in srgb, #E10600 13%, transparent)",
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, #E10600 20%, transparent)",
            }}
          >
            <Layers size={26} strokeWidth={2.2} />
          </span>
          <p className="mt-3.5 text-[15px] font-bold text-ink-strong">No goals yet for {periodKeyLabel(yearKey)}</p>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Add a yearly goal, then Generate to auto-divide it into quarters, months and weeks.
          </p>
        </div>
      )}

      {years.map((year) => {
        // Quarter children of THIS year goal, ordered Q1..Q4.
        const byKey = new Map(year.children.filter((c) => c.period === "quarter").map((c) => [c.periodKey, c]));
        return (
          <section key={year.id} className="wg-rise">
            <GoalCard
              goal={year}
              roster={roster}
              canWrite={canWrite}
              canGenerate
              childKeyOptions={quarters}
            />
            {year.children.length > 0 && (
              <div className="mt-2 ml-6 flex flex-wrap gap-2 border-l-2 border-hairline pl-4">
                {quarters.map((qk) => {
                  const node = byKey.get(qk);
                  return node ? (
                    <QuarterChip key={qk} node={node} />
                  ) : (
                    <Link
                      key={qk}
                      href={`/goals/cascade/${qk}` as Route}
                      className="wg-btn inline-flex items-center gap-1.5 rounded-xl border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
                    >
                      {periodKeyShort(qk)} · open
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {standalone.length > 0 && (
        <section>
          <h2 className="mb-3 text-[13px] font-black uppercase tracking-[0.08em] text-ink-muted">
            Standalone goals (not cascaded)
          </h2>
          <div className="space-y-3">
            {standalone.map((g, i) => (
              <div key={g.id} className="wg-rise" style={{ animationDelay: `${i * 45}ms` }}>
                <GoalCard
                  goal={g}
                  roster={roster}
                  canWrite={canWrite}
                  canGenerate={g.period !== "month"}
                  drillKey={g.period !== "month" ? undefined : undefined}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
