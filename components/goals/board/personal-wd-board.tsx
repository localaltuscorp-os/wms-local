"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, CalendarCheck, CalendarDays } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { useOptimisticGoals } from "@/components/goals/canvas/optimistic";
import { GoalTableView } from "@/components/goals/board/goal-table-view";
import { BoardQuickAdd } from "@/components/goals/board/board-quick-add";
import { DateInput } from "@/components/ui/date-input";
import { formatWeekShort, nextWeekStart, prevWeekStart } from "@/lib/weekly-goals/week";
import { formatDate } from "@/lib/format";
import type { PersonalWDData } from "@/app/(app)/goals/personal-wd-data";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${weekday}, ${formatDate(day)}`;
}

/**
 * The PERSONAL Weekly / Daily board — the same inline goals table at a single
 * week (Monday) or day bucket, with a prev/next picker. Personal-scoped; the
 * professional Weekly/Daily surfaces are untouched.
 */
export function PersonalWDBoard({ data }: { data: PersonalWDData }) {
  const router = useRouter();
  const { goals, mutation } = useOptimisticGoals(data.goals);
  const isWeek = data.level === "week";

  function goTo(key: string) {
    const param = isWeek ? `wk=${key}` : `day=${key}`;
    router.push(`${isWeek ? "/goals/weekly" : "/my-day"}?${param}` as Route);
  }

  const Icon = isWeek ? CalendarCheck : CalendarDays;
  const bucketLabel = isWeek ? `Week of ${formatWeekShort(data.periodKey)}` : dayLabel(data.periodKey);

  return (
    <PageShell width="full" py={false} className="pt-8 pb-10 max-md:pt-6 max-md:pb-8">
      {/* Header + period picker */}
      <div className="wg-rise mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
            <Icon size={22} strokeWidth={2.4} />
          </span>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--color-altus-red-deep)" }}>
              Personal
            </div>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: "-0.02em" }}>
              {isWeek ? "Weekly Goals" : "Daily Goals"}
            </h1>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-card)", border: "1px solid color-mix(in srgb, var(--color-altus-red) 20%, var(--color-hairline))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)" }}>
          <button
            type="button"
            aria-label={isWeek ? "Previous week" : "Previous day"}
            onClick={() => goTo(isWeek ? prevWeekStart(data.periodKey) : shiftDay(data.periodKey, -1))}
            className={`cursor-pointer px-3 py-2 text-ink-subtle transition-colors hover:text-altus-red hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] ${FOCUS_RING}`}
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>
          {isWeek ? (
            <span className="px-4 py-2 text-[14px] tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display)", fontWeight: 800, borderInline: "1px solid color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))" }}>
              {bucketLabel}
            </span>
          ) : (
            <DateInput
              value={data.periodKey}
              onChange={(iso) => iso && goTo(iso)}
              ariaLabel="Pick a day"
              className={`cursor-pointer border-x bg-transparent px-3 py-2 text-[14px] font-bold tabular-nums text-ink-strong ${FOCUS_RING}`}
              style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))" }}
            />
          )}
          <button
            type="button"
            aria-label={isWeek ? "Next week" : "Next day"}
            onClick={() => goTo(isWeek ? nextWeekStart(data.periodKey) : shiftDay(data.periodKey, 1))}
            className={`cursor-pointer px-3 py-2 text-ink-subtle transition-colors hover:text-altus-red hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] ${FOCUS_RING}`}
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <GoalTableView
        goals={goals}
        canWrite
        isAdmin={data.isAdmin}
        roster={data.roster}
        areaOptions={data.areaOptions}
        measureOptions={data.measureOptions}
        typeOptions={data.typeOptions}
        customLookups={data.customLookups}
        fyStartYear={data.fyStartYear}
        level={data.level}
      />

      <div className="mt-4">
        <BoardQuickAdd
          employeeId={data.myEmployeeId}
          level={data.level}
          periodKey={data.periodKey}
          parent={null}
          areaOptions={data.areaOptions}
          measureOptions={data.measureOptions}
          typeOptions={data.typeOptions}
          customLookups={data.customLookups}
          isAdmin={data.isAdmin}
          roster={data.roster}
          currentCount={goals.length}
          mutation={mutation}
          existingTitles={goals.map((g) => g.title)}
        />
      </div>
    </PageShell>
  );
}
