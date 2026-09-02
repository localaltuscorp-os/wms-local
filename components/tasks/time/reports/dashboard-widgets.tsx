import Link from "next/link";
import type { Route } from "next";
import {
  Clock,
  Gauge,
  RotateCcw,
  CheckCircle2,
  Flame,
  Target,
  CalendarDays,
} from "lucide-react";
import { CardGrid } from "@/components/layout/card-grid";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import type { TimeDashboardWidgets } from "@/lib/queries/time-reports";
import { StatCard, RichCard, EmptyState } from "./report-ui";
import { fmtDayLabel } from "./format";

/** The seven premium analytics widgets on the Time Intelligence hub. */
export function DashboardWidgets({ w }: { w: TimeDashboardWidgets }) {
  if (w.taskCount === 0) {
    return (
      <EmptyState
        Icon={Clock}
        title="No time recorded yet"
        hint="Start the timer on a task from its detail panel — total effort, revision time and approval cycles will roll up here automatically."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Row 1 — four headline numbers. */}
      <CardGrid min={230}>
        <StatCard
          label="Total Hours Worked"
          value={formatMinutesLabel(w.totalActiveSeconds)}
          sub={`${w.taskCount.toLocaleString("en-IN")} tracked ${w.taskCount === 1 ? "task" : "tasks"}`}
          Icon={Clock}
          accent
        />
        <StatCard
          label="Avg Time / Task"
          value={formatMinutesLabel(w.avgPerTaskSeconds)}
          sub="Active effort per task"
          Icon={Gauge}
        />
        <StatCard
          label="Revision Hours"
          value={formatMinutesLabel(w.revisionSeconds)}
          sub="Time spent on rework"
          Icon={RotateCcw}
        />
        <StatCard
          label="Avg Approval Cycle"
          value={
            w.avgApprovalCycleSeconds > 0
              ? formatMinutesLabel(w.avgApprovalCycleSeconds)
              : "—"
          }
          sub={`${w.approvedCount.toLocaleString("en-IN")} approved`}
          Icon={CheckCircle2}
        />
      </CardGrid>

      {/* Row 2 — three richer cards. */}
      <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1">
        <RichCard label="Highest-Effort Tasks" Icon={Flame}>
          {w.highestEffortTasks.length === 0 ? (
            <p className="font-semibold text-ink-muted" style={{ fontSize: 13.5 }}>
              No tasks yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {w.highestEffortTasks.map((t, i) => (
                <li key={t.taskId} className="flex items-center gap-3">
                  <span
                    className="shrink-0 tabular-nums font-bold text-ink-subtle"
                    style={{ fontSize: 12, width: 16 }}
                  >
                    {i + 1}
                  </span>
                  <Link
                    href={`/tasks/${t.taskId}` as Route}
                    className="min-w-0 flex-1 truncate font-semibold text-ink-strong hover:text-[var(--color-altus-red-deep)] transition-colors"
                    style={{ fontSize: 13.5 }}
                    title={[t.taskNo ? `#${t.taskNo}` : null, t.title, t.subject]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {/* Several tasks legitimately share a client-style title
                        ("Altus Corp" x4), so the SUBJECT is what tells them
                        apart — without it the list reads as a duplicate. */}
                    {t.title}
                    {t.subject ? (
                      <span className="font-medium text-ink-subtle"> · {t.subject}</span>
                    ) : null}
                  </Link>
                  <span
                    className="shrink-0 tabular-nums font-bold text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    {formatMinutesLabel(t.totalActiveSeconds)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </RichCard>

        <RichCard label="Most Time-Consuming Goal" Icon={Target}>
          {w.mostTimeConsumingGoal ? (
            <div>
              <div
                className="font-bold text-ink-strong"
                style={{ fontSize: 16, lineHeight: 1.25 }}
              >
                {w.mostTimeConsumingGoal.goalTitle}
              </div>
              <div
                className="mt-2 tabular-nums font-extrabold text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: 24,
                }}
              >
                {formatMinutesLabel(w.mostTimeConsumingGoal.totalActiveSeconds)}
              </div>
              <div className="mt-1 font-semibold text-ink-muted" style={{ fontSize: 12.5 }}>
                across {w.mostTimeConsumingGoal.taskCount.toLocaleString("en-IN")}{" "}
                {w.mostTimeConsumingGoal.taskCount === 1 ? "task" : "tasks"}
              </div>
            </div>
          ) : (
            <p className="font-semibold text-ink-muted" style={{ fontSize: 13.5 }}>
              No goal-linked tasks yet.
            </p>
          )}
        </RichCard>

        <RichCard label="Most Productive Day" Icon={CalendarDays}>
          {w.mostProductiveDay ? (
            <div>
              <div className="font-bold text-ink-strong" style={{ fontSize: 16 }}>
                {fmtDayLabel(w.mostProductiveDay.date)}
              </div>
              <div
                className="mt-2 tabular-nums font-extrabold text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: 24,
                }}
              >
                {formatMinutesLabel(w.mostProductiveDay.totalActiveSeconds)}
              </div>
              <div className="mt-1 font-semibold text-ink-muted" style={{ fontSize: 12.5 }}>
                total active time logged
              </div>
            </div>
          ) : (
            <p className="font-semibold text-ink-muted" style={{ fontSize: 13.5 }}>
              No sessions logged yet.
            </p>
          )}
        </RichCard>
      </div>
    </div>
  );
}
