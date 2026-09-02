"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Search,
  X,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  CalendarRange,
  Timer,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";
import { formatDate } from "@/lib/format";
import type { DoneDashboardData, DonePersonRow } from "@/lib/queries/done-dashboard";

/**
 * Statuses the drill-through carries. Matches the query's definition of
 * "completed" and the Task Summary's DONE card, so the number you click and the
 * list you land on are provably the same set — the commonest way a drill-down
 * loses trust is the destination disagreeing with the tile.
 */
const DONE_STATUS_PARAM = "done,approved";

type SortKey =
  | keyof Pick<
      DonePersonRow,
      "employeeName" | "totalDone" | "onTime" | "overdue" | "avgCompletionDays"
    >
  | "lastCompletedAt";

export function DoneDashboardView({
  data,
  avatarById,
}: {
  data: DoneDashboardData;
  avatarById: Record<string, string | null>;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "totalDone",
    dir: "desc",
  });

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.people.filter(
          (p) =>
            p.employeeName.toLowerCase().includes(q) ||
            (p.department ?? "").toLowerCase().includes(q),
        )
      : data.people;

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const k = sort.key;
      if (k === "employeeName") {
        return a.employeeName.localeCompare(b.employeeName) * dir;
      }
      if (k === "lastCompletedAt") {
        // Never-completed sinks to the bottom in BOTH directions. A null here
        // means "no data", not "the beginning of time" — sorting it as epoch-0
        // would put people who have finished nothing at the top of an ascending
        // "oldest first" sort, which reads as the opposite of the truth.
        const av = a.lastCompletedAt?.getTime() ?? null;
        const bv = b.lastCompletedAt?.getTime() ?? null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      }
      return ((a[k] as number) - (b[k] as number)) * dir;
    });
  }, [data.people, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : // First click on a NEW column sorts descending for the numeric ones —
          // biggest-first is what a leaderboard is opened for — and ascending
          // for the name, where A–Z is the expectation.
          { key, dir: key === "employeeName" ? "asc" : "desc" },
    );
  }

  const k = data.kpis;

  return (
    <PageShell as="div" width="full" py={false} className="pb-20">
      <CardGrid min={200} gap="0.875rem">
        <Kpi
          label="Total Completed"
          value={k.total.toLocaleString("en-IN")}
          sub={`${k.undated.toLocaleString("en-IN")} without a comparable date`}
          fill="bg-slate-900"
          icon={<CheckCircle2 size={18} strokeWidth={2.4} />}
        />
        <Kpi
          label="On Time"
          value={`${k.onTimePct}%`}
          sub={`${k.onTime.toLocaleString("en-IN")} on time · ${k.overdue.toLocaleString("en-IN")} late`}
          fill="bg-emerald-600"
          icon={<Clock size={18} strokeWidth={2.4} />}
        />
        <Kpi
          label="Avg. Resolution"
          value={`${k.avgResolutionDays}d`}
          sub="Created to completed, calendar days"
          fill="bg-blue-600"
          icon={<Timer size={18} strokeWidth={2.4} />}
        />
        <Kpi
          label="Completed"
          value={k.thisWeek.toLocaleString("en-IN")}
          sub={`last 7 days · ${k.thisMonth.toLocaleString("en-IN")} in 30`}
          fill="bg-slate-700"
          icon={<CalendarRange size={18} strokeWidth={2.4} />}
        />
      </CardGrid>

      <section className="mt-6" aria-label="Done by person">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-black uppercase tracking-[0.08em] text-ink-strong">
            Done by person
          </h2>
          <div className="relative flex h-9 w-[240px] items-center rounded-lg border border-hairline bg-surface-card pl-2.5 pr-1.5 max-md:w-full">
            <Search className="size-3.5 shrink-0 text-ink-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search name or department"
              aria-label="Filter by employee name or department"
              className="min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-soft hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        <div
          className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-hairline-strong">
                <Th
                  onClick={() => toggleSort("employeeName")}
                  active={sort.key === "employeeName"}
                  dir={sort.dir}
                >
                  Employee
                </Th>
                <Th
                  align="center"
                  onClick={() => toggleSort("totalDone")}
                  active={sort.key === "totalDone"}
                  dir={sort.dir}
                >
                  Total Done
                </Th>
                <Th
                  align="center"
                  onClick={() => toggleSort("onTime")}
                  active={sort.key === "onTime"}
                  dir={sort.dir}
                >
                  On Time
                </Th>
                <Th
                  align="center"
                  onClick={() => toggleSort("overdue")}
                  active={sort.key === "overdue"}
                  dir={sort.dir}
                >
                  Overdue
                </Th>
                <Th
                  align="center"
                  onClick={() => toggleSort("avgCompletionDays")}
                  active={sort.key === "avgCompletionDays"}
                  dir={sort.dir}
                >
                  Avg Completion
                </Th>
                <Th
                  align="right"
                  onClick={() => toggleSort("lastCompletedAt")}
                  active={sort.key === "lastCompletedAt"}
                  dir={sort.dir}
                >
                  Last Completed
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-[14px] font-semibold text-ink-subtle"
                  >
                    {data.people.length === 0
                      ? "Nothing completed yet."
                      : "No one matches that search."}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr
                    key={p.employeeId}
                    className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    {/* The row links to that person's completed work. `emp` and
                        `status` are params /tasks already parses, so the
                        drill-through needs no new filter plumbing. */}
                    <td className="px-4 py-2">
                      <DrillLink employeeId={p.employeeId} name={p.employeeName}>
                        <Avatar
                          name={p.employeeName}
                          avatarUrl={avatarById[p.employeeId] ?? null}
                          size={28}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-bold text-ink-strong">
                            {p.employeeName}
                          </span>
                          {p.department && (
                            <span className="block truncate text-[11.5px] font-medium text-ink-subtle">
                              {p.department}
                            </span>
                          )}
                        </span>
                      </DrillLink>
                    </td>
                    <Td align="center">
                      <DrillLink employeeId={p.employeeId} name={p.employeeName} plain>
                        <span className="text-[15px] font-black tabular-nums text-ink-strong">
                          {p.totalDone}
                        </span>
                      </DrillLink>
                    </Td>
                    <Td align="center">
                      <span className="text-[14px] font-bold tabular-nums text-emerald-700">
                        {p.onTime}
                      </span>
                    </Td>
                    <Td align="center">
                      <span
                        className={`text-[14px] font-bold tabular-nums ${
                          p.overdue > 0 ? "text-red-600" : "text-ink-subtle"
                        }`}
                      >
                        {p.overdue}
                      </span>
                    </Td>
                    <Td align="center">
                      <span className="text-[14px] font-semibold tabular-nums text-ink-soft">
                        {p.avgCompletionDays}d
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="text-[13px] font-medium tabular-nums text-ink-soft">
                        {p.lastCompletedAt ? formatDate(p.lastCompletedAt) : "—"}
                      </span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function DrillLink({
  employeeId,
  name,
  children,
  plain,
}: {
  employeeId: string;
  name: string;
  children: React.ReactNode;
  plain?: boolean;
}) {
  return (
    <Link
      href={
        `/tasks?status=${DONE_STATUS_PARAM}&emp=${encodeURIComponent(employeeId)}` as Route
      }
      title={`Open completed tasks for ${name}`}
      className={plain ? "block" : "flex items-center gap-2.5"}
    >
      {children}
    </Link>
  );
}

function Kpi({
  label,
  value,
  sub,
  fill,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  fill: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl p-4 text-white shadow-sm ${fill}`}>
      <span className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.07em] text-white/85">
        {icon}
        {label}
      </span>
      <span
        className="mt-2 block tabular-nums leading-none text-white"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 32,
        }}
      >
        {value}
      </span>
      <span className="mt-2 block text-[12px] font-medium text-white/80">{sub}</span>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "center" | "right";
}) {
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-subtle ${
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink-strong ${
          active ? "text-ink-strong" : ""
        }`}
      >
        {children}
        <ArrowUpDown className={`size-3 ${active ? "opacity-100" : "opacity-35"}`} />
      </button>
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
}) {
  return (
    <td
      className={`px-4 py-2 whitespace-nowrap ${
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}
