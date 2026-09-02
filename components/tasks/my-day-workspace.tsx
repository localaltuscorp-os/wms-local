"use client";

import * as React from "react";
import { AlertTriangle, CalendarCheck2, CalendarRange, Layers, Rows3 } from "lucide-react";
import { AgendaBoard, type AgendaTask } from "./agenda-board";
import { TaskTable, NoResults } from "./task-table";
import { SectionErrorBoundary } from "@/components/ui/section-error-boundary";
import {
  useSectionSearch,
  matchesSearch,
  setSectionSearch,
} from "@/lib/client/section-search";
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
 * The glass hero (greeting + date + summary strip) and the Agenda/List toggle
 * live here so both views share them; the per-view summaries (lifecycle
 * buckets / table toolbar) stay inside each view.
 */
export function MyDayWorkspace({
  firstName,
  isAdmin,
  todayLabel,
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
  /** Human today in IST, e.g. "Wednesday, July 2, 2026". */
  todayLabel?: string;
  todayYmd: string;
  days: DayCol[];
  agendaTasks: AgendaTask[];
  rows: TaskListRow[];
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean; canChangeDoer?: boolean };
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

  // The FilterBar's section search narrows the scheduled agenda items. (The
  // List view is the shared TaskTable, which reads the same store itself, so
  // both views of My Day respond to one box.) Counts are derived from the
  // FILTERED set so the hero strip agrees with what's on the board.
  const sectionQuery = useSectionSearch();
  const visibleAgenda = React.useMemo(() => {
    if (!sectionQuery) return agendaTasks;
    const qNum = sectionQuery.replace(/^#/, "");
    return agendaTasks.filter(
      (t) =>
        (t.taskNo != null && String(t.taskNo).includes(qNum)) ||
        matchesSearch(sectionQuery, t.title, t.description, t.subject, t.client, t.doerName),
    );
  }, [agendaTasks, sectionQuery]);

  const dueToday = visibleAgenda.filter((t) => t.dueYmd === todayYmd).length;
  const overdue = visibleAgenda.filter((t) => t.dueYmd < todayYmd).length;
  const inView = visibleAgenda.length;

  return (
    <main className="w-full px-6 max-md:px-4 pt-6 pb-16">
      {/* ── Glass hero — greeting, date, summary strip + view toggle ───────── */}
      <section
        className="wg-rise relative overflow-hidden rounded-section mb-7"
        style={{
          border: "1px solid var(--color-hairline)",
          background:
            "linear-gradient(130deg, rgba(255,255,255,0.92) 0%, rgba(255,251,250,0.9) 55%, rgba(255,244,243,0.88) 100%)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow:
            "0 1px 2px rgba(15,23,42,0.04), 0 24px 56px -36px rgba(225,6,0,0.22), 0 12px 32px -24px rgba(15,23,42,0.12)",
        }}
      >
        {/* Brand strip + soft red aurora washes (GPU-cheap, decorative). */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0"
          style={{
            height: 3,
            background:
              "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep) 55%, transparent)",
          }}
        />
        <span
          aria-hidden
          className="absolute -right-28 -top-36 size-[340px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-altus-red) 9%, transparent), transparent 70%)",
          }}
        />
        <span
          aria-hidden
          className="absolute -left-24 -bottom-40 size-[300px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-altus-red) 5%, transparent), transparent 70%)",
          }}
        />

        <div className="relative flex items-end justify-between gap-6 flex-wrap px-8 py-7 max-md:px-5 max-md:py-6">
          <div className="min-w-0">
            <p
              className="uppercase font-black"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontSize: 13,
                letterSpacing: "0.14em",
                color: "var(--color-altus-red-deep)",
              }}
            >
              WMS · My Day
            </p>
            <h1
              className="mt-2 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(38px, 4.2vw, 56px)",
                letterSpacing: "-0.025em",
                lineHeight: 1,
              }}
            >
              Welcome, {firstName}
            </h1>
            {todayLabel && (
              <p className="mt-2.5 font-semibold text-ink-subtle" style={{ fontSize: 16 }}>
                {todayLabel}
              </p>
            )}

            {/* Summary strip — real counts over the filtered set. */}
            <div className="mt-4 flex items-center gap-2.5 flex-wrap">
              <HeroChip
                tone="blue"
                icon={<CalendarCheck2 size={15} strokeWidth={2.5} />}
                strong={dueToday}
                label={dueToday === 1 ? "task due today" : "tasks due today"}
              />
              {overdue > 0 && (
                <HeroChip
                  tone="red"
                  icon={<AlertTriangle size={15} strokeWidth={2.5} />}
                  strong={overdue}
                  label="overdue"
                />
              )}
              <HeroChip
                tone="slate"
                icon={<Layers size={15} strokeWidth={2.5} />}
                strong={inView}
                label="in view"
              />
              {isAdmin && view === "agenda" && (
                <span className="text-ink-subtle font-semibold" style={{ fontSize: 14 }}>
                  Drag a card to another day to reschedule it.
                </span>
              )}
            </div>
          </div>

          <ViewToggle view={view} onPick={pick} />
        </div>
      </section>

      {view === "agenda" && sectionQuery && visibleAgenda.length === 0 ? (
        <NoResults
          query={sectionQuery}
          noun="agenda items"
          onClear={() => setSectionSearch("")}
        />
      ) : view === "agenda" ? (
        <AgendaBoard
          todayYmd={todayYmd}
          days={days}
          tasks={visibleAgenda}
          isAdmin={isAdmin}
          statusLabels={statusLabels}
          statusTones={statusTones}
        />
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
        <SectionErrorBoundary label="today's tasks">
          <TaskTable
            rows={rows}
            employees={employees}
            me={me}
            statusLabels={statusLabels}
            statusTones={statusTones}
          />
        </SectionErrorBoundary>
      )}
    </main>
  );
}

// A tinted summary pill for the hero strip — count in display type + label.
function HeroChip({
  tone,
  icon,
  strong,
  label,
}: {
  tone: string;
  icon: React.ReactNode;
  strong: number;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-bold whitespace-nowrap"
      style={{
        fontSize: 14,
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 11%, white)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 26%, transparent)`,
      }}
    >
      {icon}
      <span
        className="tabular-nums"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 15 }}
      >
        {strong}
      </span>
      {label}
    </span>
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
            className={`wg-btn inline-flex items-center gap-1.5 px-4 h-9 rounded-pill text-[14px] font-bold transition-all ${
              active ? "text-white" : "text-ink-soft hover:text-ink-strong"
            }`}
            style={
              active
                ? {
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    boxShadow: "0 6px 16px -8px rgba(225,6,0,0.55)",
                  }
                : undefined
            }
          >
            <Icon size={15} strokeWidth={2.3} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
