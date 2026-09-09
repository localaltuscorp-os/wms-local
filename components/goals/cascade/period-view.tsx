"use client";

import * as React from "react";
import { ChevronDown, Target } from "lucide-react";
import type { GoalPeriod } from "@/lib/goals/types";
import { GoalCard } from "./goal-card";
import { AddGoalButton } from "./add-goal-button";
import {
  effectiveGoalPct,
  pctTone,
  PERIOD_LABEL,
  childLevelOf,
  type GoalDTO,
  type RosterMember,
} from "./util";

export function PeriodView({
  period,
  periodKey,
  goals,
  parentGoals,
  parentPeriod,
  childKeyOptions,
  moveTargets,
  roster,
  viewedEmployeeId,
  canWrite,
}: {
  period: GoalPeriod;
  periodKey: string;
  goals: GoalDTO[];
  parentGoals: GoalDTO[];
  parentPeriod: GoalPeriod | null;
  childKeyOptions: string[];
  moveTargets: string[];
  roster: RosterMember[];
  viewedEmployeeId: string;
  canWrite: boolean;
}) {
  const [showParents, setShowParents] = React.useState(false);
  const childLevel = childLevelOf(period);
  const adopted = goals.filter((g) => g.adopted);
  const avg =
    adopted.length > 0
      ? Math.round(adopted.reduce((s, g) => s + effectiveGoalPct(g), 0) / adopted.length)
      : 0;
  const tone = pctTone(avg);

  return (
    <div className="space-y-6">
      {/* Roll-up strip */}
      <div
        className="wg-rise relative flex flex-wrap items-center gap-3 overflow-hidden rounded-section border border-hairline p-4"
        style={{
          background:
            "radial-gradient(ellipse 70% 130% at 0% 0%, color-mix(in srgb, #E10600 7%, transparent), transparent 58%), var(--color-surface-card)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        <span
          className="inline-flex size-12 items-center justify-center rounded-xl text-[18px] font-black tabular-nums"
          style={{
            background: tone.bg,
            color: tone.color,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.color} 24%, transparent)`,
          }}
        >
          {avg}%
        </span>
        <div>
          <p className="text-[13px] font-bold text-ink-strong">
            {adopted.length} adopted {PERIOD_LABEL[period].toLowerCase()} goal{adopted.length === 1 ? "" : "s"}
          </p>
          <p className="text-[12px] font-semibold text-ink-muted">
            {goals.length - adopted.length} crossed out · effective average {avg}%
          </p>
        </div>
        {canWrite && (
          <div className="ml-auto">
            <AddGoalButton
              employeeId={viewedEmployeeId}
              period={period}
              periodKey={periodKey}
              roster={roster}
              label={`Add extra ${PERIOD_LABEL[period].toLowerCase()} goal`}
              variant="ghost"
            />
          </div>
        )}
      </div>

      {/* Parent-goal context (adopt/drop decisions) */}
      {parentGoals.length > 0 && parentPeriod && (
        <div className="rounded-2xl border border-hairline bg-black/[0.015] p-3">
          <button
            type="button"
            onClick={() => setShowParents((s) => !s)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-[12.5px] font-black uppercase tracking-[0.06em] text-ink-muted">
              {parentGoals.length} parent {PERIOD_LABEL[parentPeriod].toLowerCase()} goal
              {parentGoals.length === 1 ? "" : "s"} — decide what to keep
            </span>
            <ChevronDown
              size={16}
              className={`text-ink-soft transition-transform ${showParents ? "rotate-180" : ""}`}
            />
          </button>
          {showParents && (
            <ul className="mt-2 space-y-1.5">
              {parentGoals.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-surface-card px-3 py-1.5 text-[13px]"
                >
                  <span className="font-bold text-ink-strong">{p.title}</span>
                  {p.area && <span className="text-ink-muted">· {p.area}</span>}
                  <span className="ml-auto font-bold" style={{ color: pctTone(effectiveGoalPct(p)).color }}>
                    {effectiveGoalPct(p)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* This period's goals */}
      {goals.length === 0 ? (
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
            <Target size={26} strokeWidth={2.2} />
          </span>
          <p className="mt-3.5 text-[15px] font-bold text-ink-strong">Nothing here yet</p>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Generate from the parent goal to prepopulate this {PERIOD_LABEL[period].toLowerCase()}, or add an extra goal.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g, i) => (
            <div key={g.id} className="wg-rise" style={{ animationDelay: `${i * 45}ms` }}>
              <GoalCard
                goal={g}
                roster={roster}
                canWrite={canWrite}
                showAdopt
                canGenerate
                childKeyOptions={period === "quarter" ? childKeyOptions : []}
                moveTargets={moveTargets}
              />
            </div>
          ))}
        </div>
      )}

      {period === "month" && (
        <p className="text-[12.5px] text-ink-muted">
          Weekly goals for this month live on the{" "}
          <span className="font-bold text-ink-soft">Weekly Board</span> — use “Generate weeks” on a goal to
          prepopulate them.
        </p>
      )}
    </div>
  );
}
