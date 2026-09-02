"use client";

import * as React from "react";
import { CalendarRange, Rows3 } from "lucide-react";
import { AgendaBoard, type AgendaTask } from "./agenda-board";
import { TaskTable } from "./task-table";
import type { TaskListRow } from "@/lib/types";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

type DayCol = { ymd: string; label: string; sub: string };
type View = "agenda" | "list";
const VIEW_STORAGE_KEY = "altus.myday.view.v1";

/**
 * "My Day" — a personal task workspace with two views over the SAME filtered
 * set (the page's FilterBar drives both):
 *   • Agenda — the day-column board (drag to reschedule).
 *   • List  — the full Tasks-tab table (search + group-by + sort + paging).
 * The welcome banner + the Agenda/List toggle live here so both views share
 * them; the per-view summaries (lifecycle buckets / table toolbar) stay inside
 * each view.
 */
export function MyDayWorkspace({
  firstName,
  isAdmin,
  todayYmd,
  days,
  agendaTasks,
  rows,
  employees,
  me,
  statusLabels,
  statusTones,
}: {
  firstName: string;
  isAdmin: boolean;
  todayYmd: string;
  days: DayCol[];
  agendaTasks: AgendaTask[];
  rows: TaskListRow[];
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
}) {
  // Start on Agenda for SSR + first paint (stable), then hydrate the saved
  // choice so a returning user keeps their preferred view.
  const [view, setView] = React.useState<View>("agenda");
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "agenda" || saved === "list") setView(saved);
    } catch {
      /* storage may be unavailable */
    }
  }, []);
  function pick(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  const dueToday = agendaTasks.filter((t) => t.dueYmd === todayYmd).length;
  const overdue = agendaTasks.filter((t) => t.dueYmd < todayYmd).length;

  return (
    <main className="mx-auto max-w-[1600px] px-8 max-md:px-4 pt-8 pb-16">
      {/* Welcome banner + view toggle */}
      <div className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(42px, 4.6vw, 60px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Welcome, {firstName}
          </h1>
          <p className="text-ink-subtle mt-3" style={{ fontSize: 19, lineHeight: 1.5 }}>
            You have{" "}
            <span className="font-bold text-ink-strong tabular-nums">{dueToday}</span>{" "}
            {dueToday === 1 ? "task" : "tasks"} due today
            {overdue > 0 && (
              <>
                {" "}and{" "}
                <span className="font-bold tabular-nums" style={{ color: "var(--color-red-deep)" }}>
                  {overdue}
                </span>{" "}
                overdue
              </>
            )}
            .
            {isAdmin && view === "agenda" && (
              <span className="text-ink-subtle"> Drag a card to another day to reschedule it.</span>
            )}
          </p>
        </div>

        <ViewToggle view={view} onPick={pick} />
      </div>

      {view === "agenda" ? (
        <AgendaBoard todayYmd={todayYmd} days={days} tasks={agendaTasks} isAdmin={isAdmin} />
      ) : rows.length === 0 ? (
        <div
          className="bg-surface-card rounded-section border border-hairline p-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="font-bold" style={{ fontSize: 20, color: "var(--color-ink-strong)" }}>
            No tasks match the current filter.
          </p>
          <p className="mt-2 font-semibold" style={{ fontSize: 15, color: "var(--color-ink-muted)" }}>
            Try widening your date range or clearing assignee filters.
          </p>
        </div>
      ) : (
        <TaskTable
          rows={rows}
          employees={employees}
          me={me}
          statusLabels={statusLabels}
          statusTones={statusTones}
        />
      )}
    </main>
  );
}

// Segmented Agenda | List switch. Matches the app's pill language; the active
// segment reads red-on-white.
function ViewToggle({ view, onPick }: { view: View; onPick: (v: View) => void }) {
  const opts: { key: View; label: string; Icon: typeof CalendarRange }[] = [
    { key: "agenda", label: "Agenda", Icon: CalendarRange },
    { key: "list", label: "List", Icon: Rows3 },
  ];
  return (
    <div
      className="inline-flex items-center rounded-pill border border-hairline bg-surface-card p-0.5 shrink-0"
      style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
      role="tablist"
      aria-label="My Day view"
    >
      {opts.map((o) => {
        const active = view === o.key;
        const Icon = o.Icon;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPick(o.key)}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-pill text-[14px] font-bold transition-all ${
              active ? "bg-altus-red text-white" : "text-ink-soft hover:text-ink-strong"
            }`}
          >
            <Icon size={15} strokeWidth={2.3} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
