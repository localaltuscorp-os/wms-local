"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ChevronDown,
  Search,
  X,
  Target,
  ClipboardList,
  ArrowRight,
  Gauge,
  LogIn,
  LogOut,
  Users,
} from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Donut, type DonutSlice } from "@/components/charts/donut";
import { GradeBadge, GradeLegend } from "@/components/productivity/grade-badge";
import { calculateCompletionGrade, type Grade } from "@/lib/productivity/calc";
import { GRADE_ORDER, GRADE_OUTLINE, gradeColor } from "@/lib/productivity/theme";

/**
 * The Team Performance board — a COMPACT, SCANNABLE employee table with
 * expand-in-place detail, replacing the previous two-column grid of large
 * per-employee cards.
 *
 * WHY THE REWRITE: the card grid rendered every metric for every person, so a
 * 36-person team was ~36 tall cards and answering "who is worst?" meant reading
 * all of them. The information was complete but not comparable. A table makes
 * the same numbers line up in columns, which is what comparison actually needs;
 * the metrics that don't earn a column move behind the row's expander rather
 * than being dropped.
 *
 * Nothing is lost: every metric the cards showed is still here (the collapsed
 * row carries the comparison set, the expanded panel carries the rest), and
 * both actions — View Goals, Daily Checklist — survive unchanged.
 *
 * All derivation stays on the server (`page.tsx` computes `status` with the same
 * precedence the old `statusOf` used). This component only filters, sorts and
 * renders what it is given.
 */

/* ------------------------------------------------------------------ */
/* Types — the serialisable row the server page builds                  */
/* ------------------------------------------------------------------ */

/** Live working state, derived server-side with the original precedence:
 *  need-help → blocked → working → clocked out → no plan → not in yet. */
export type TeamStatus =
  | "needs_help"
  | "blocked"
  | "working"
  | "clocked_out"
  | "no_plan"
  | "not_in";

export interface TeamRow {
  id: string;
  name: string;
  department: string | null;
  /** The person they report to (`employees.manager_id`) — this data set has no
   *  separate "team" entity, so the reporting line IS the team. */
  managerName: string | null;
  goalsCount: number;
  goalsDone: number;
  /** Weight-aware effective % this week. `null` = no goals set (NOT zero). */
  goalScorePct: number | null;
  assignedToday: number;
  overdueTasks: number;
  pendingTasks: number;
  needHelp: number;
  blockedTasks: number;
  doneToday: number;
  plannedToday: boolean;
  dccCompliancePct: number | null;
  trainingHoursMonth: number;
  lastInLabel: string;
  lastOutLabel: string;
  status: TeamStatus;
}

const STATUS_META: Record<TeamStatus, { label: string; color: string; bg: string }> = {
  needs_help: { label: "Needs help", color: "#b45309", bg: "color-mix(in srgb, var(--color-amber) 16%, transparent)" },
  blocked: { label: "Blocked", color: "#b45309", bg: "color-mix(in srgb, var(--color-amber) 14%, transparent)" },
  working: { label: "Working", color: "#15803d", bg: "color-mix(in srgb, var(--color-green) 15%, transparent)" },
  clocked_out: { label: "Clocked out", color: "#475569", bg: "var(--color-surface-soft)" },
  no_plan: { label: "No plan", color: "#dc2626", bg: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" },
  not_in: { label: "Not in yet", color: "#64748b", bg: "var(--color-surface-soft)" },
};

/* ------------------------------------------------------------------ */
/* Grades                                                              */
/* ------------------------------------------------------------------ */

/**
 * The row's letter grade, derived — never stored.
 *
 * It runs the SAME `calculateCompletionGrade` ladder the Productivity Dashboard
 * uses for goal completion, so the grade a manager reads next to a name on this
 * table is the identical letter that person sees on their own dashboard. Nothing
 * is recomputed with a second set of thresholds here.
 *
 * `null` when there is no score: "no goals set" is not 0% and must not grade as
 * an F (see `byScore` below for the same rule applied to sorting).
 */
function gradeOf(r: TeamRow): Grade | null {
  return r.goalScorePct == null ? null : calculateCompletionGrade(r.goalScorePct);
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

type SortKey =
  | "attention"
  | "best"
  | "worst"
  | "score"
  | "done"
  | "overdue"
  | "pending"
  | "needHelp"
  | "name";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "attention", label: "Needs attention" },
  { value: "worst", label: "Worst performing" },
  { value: "best", label: "Best performing" },
  { value: "score", label: "Goal score" },
  { value: "done", label: "Tasks completed" },
  { value: "overdue", label: "Overdue tasks" },
  { value: "pending", label: "Pending tasks" },
  { value: "needHelp", label: "Need help" },
  { value: "name", label: "Name A–Z" },
];

/** The original board's risk weighting — need-help dominates, overdue breaks
 *  ties. Kept byte-for-byte so the default order is the one managers know. */
function riskOf(r: TeamRow): number {
  return r.needHelp * 100 + r.overdueTasks;
}

/**
 * Goal-score comparator with a deliberate rule: **a missing score is never
 * treated as a score**. `null` means "no goals set this week", which is not the
 * same as 0% and must not win "worst performing" — that would bury the people
 * who genuinely are at 5% under everyone who simply hasn't planned. Nulls
 * therefore sort LAST in both directions, and `no_plan` surfaces them instead.
 */
function byScore(dir: "asc" | "desc") {
  return (a: TeamRow, b: TeamRow): number => {
    const av = a.goalScorePct;
    const bv = b.goalScorePct;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir === "desc" ? bv - av : av - bv;
  };
}

function comparatorFor(sort: SortKey): (a: TeamRow, b: TeamRow) => number {
  const byName = (a: TeamRow, b: TeamRow) => a.name.localeCompare(b.name);
  const desc = (pick: (r: TeamRow) => number) => (a: TeamRow, b: TeamRow) => pick(b) - pick(a);

  switch (sort) {
    case "best":
      // Highest score; among equals, the one carrying fewer problems.
      return (a, b) => byScore("desc")(a, b) || riskOf(a) - riskOf(b) || byName(a, b);
    case "worst":
      // Lowest score; among equals, the one carrying more problems.
      return (a, b) => byScore("asc")(a, b) || riskOf(b) - riskOf(a) || byName(a, b);
    case "score":
      return (a, b) => byScore("desc")(a, b) || byName(a, b);
    case "done":
      return (a, b) => desc((r) => r.doneToday)(a, b) || byName(a, b);
    case "overdue":
      return (a, b) => desc((r) => r.overdueTasks)(a, b) || byName(a, b);
    case "pending":
      return (a, b) => desc((r) => r.pendingTasks)(a, b) || byName(a, b);
    case "needHelp":
      return (a, b) => desc((r) => r.needHelp)(a, b) || byName(a, b);
    case "name":
      return byName;
    case "attention":
    default:
      // The board's original default, preserved exactly: risk first, then the
      // weaker goal score. `?? -1` keeps scoreless people below scored ones.
      return (a, b) =>
        riskOf(b) - riskOf(a) ||
        (b.goalScorePct ?? -1) - (a.goalScorePct ?? -1) ||
        byName(a, b);
  }
}

/* ------------------------------------------------------------------ */
/* Status filter                                                       */
/* ------------------------------------------------------------------ */

type StatusFilter = "all" | "on_track" | "working" | "needs_help" | "blocked" | "no_plan" | "overdue";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "on_track", label: "On track" },
  { value: "working", label: "Working" },
  { value: "needs_help", label: "Needs help" },
  { value: "blocked", label: "Blocked" },
  { value: "no_plan", label: "No plan" },
  { value: "overdue", label: "Overdue" },
];

/** On track = nothing is wrong AND there is a plan — the positive state, which
 *  is narrower than "not currently flagged". */
function matchesStatus(r: TeamRow, f: StatusFilter): boolean {
  switch (f) {
    case "on_track":
      return r.needHelp === 0 && r.overdueTasks === 0 && r.blockedTasks === 0 && r.plannedToday;
    case "working":
      return r.status === "working";
    case "needs_help":
      return r.needHelp > 0;
    case "blocked":
      return r.blockedTasks > 0;
    case "no_plan":
      return !r.plannedToday;
    case "overdue":
      return r.overdueTasks > 0;
    case "all":
    default:
      return true;
  }
}

const ALL = "__all__";
/** The grade filter's "no score to grade" option — a real choice, not the
 *  absence of one, so scoreless people stay findable. */
const UNGRADED = "__ungraded__";

/**
 * Which module is showing the board, and therefore what "select an employee"
 * means.
 *
 *   • `goals` (default) — the Goals Team Dashboard. Selecting a row expands the
 *     inline detail; the row actions lead to Goals surfaces. UNCHANGED.
 *   • `productivity` — the Productivity module's Team Performance. Selecting a
 *     row OPENS that person's Productivity Dashboard, which is the whole point
 *     of the drill-down; the expander still works from the chevron.
 *
 * A serialisable string rather than a callback, because the board is a client
 * component rendered by server pages — a function prop could not cross that
 * boundary. Defaulting to `goals` is what keeps the existing page untouched.
 */
export type TeamBoardVariant = "goals" | "productivity";

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export function TeamPerformanceBoard({
  rows,
  variant = "goals",
}: {
  rows: TeamRow[];
  variant?: TeamBoardVariant;
}) {
  const [dept, setDept] = React.useState<string>(ALL);
  const [team, setTeam] = React.useState<string>(ALL);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [grade, setGrade] = React.useState<string>(ALL);
  const [sort, setSort] = React.useState<SortKey>("attention");
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());

  // Grades are a Productivity-module surface. The Goals Team Dashboard renders
  // the same board and is deliberately left exactly as it was, so every grade
  // affordance below — column, filter, distribution — is behind this one flag.
  const showGrades = variant === "productivity";

  // Filter vocabularies come from the loaded roster, so they can only ever
  // offer values that actually exist on screen.
  const departments = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter((d): d is string => !!d))).sort(),
    [rows],
  );
  const teams = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.managerName).filter((m): m is string => !!m))).sort(),
    [rows],
  );

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (dept !== ALL && r.department !== dept) return false;
      if (team !== ALL && r.managerName !== team) return false;
      if (!matchesStatus(r, status)) return false;
      // "Ungraded" is its own choice rather than a hidden bucket, so the people
      // with no goals set are findable instead of quietly absent from every
      // grade filter.
      if (showGrades && grade !== ALL) {
        const g = gradeOf(r);
        if (grade === UNGRADED ? g !== null : g !== grade) return false;
      }
      // Search spans the three things people actually type: the person, their
      // department, and the manager they report to.
      if (
        q &&
        !`${r.name} ${r.department ?? ""} ${r.managerName ?? ""}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
    return filtered.sort(comparatorFor(sort));
  }, [rows, dept, team, status, grade, showGrades, query, sort]);

  /**
   * Grade distribution across the WHOLE roster, not the filtered subset — the
   * same rule the summary counts follow, so the shape of the team stays a fixed
   * reference while you slice the list under it.
   *
   * Only grades that actually occur become slices; an empty band would add a
   * legend entry and a 0° wedge for nothing.
   */
  const distribution = React.useMemo(() => {
    const counts = {} as Record<Grade, number>;
    let ungraded = 0;
    for (const r of rows) {
      const g = gradeOf(r);
      if (g == null) ungraded += 1;
      else counts[g] = (counts[g] ?? 0) + 1;
    }
    const present = GRADE_ORDER.filter((g) => (counts[g] ?? 0) > 0);
    const slices: DonutSlice[] = present.map((g) => ({
      label: `Grade ${g}`,
      value: counts[g] ?? 0,
      color: gradeColor(g),
    }));
    return { counts, present, slices, ungraded, graded: rows.length - ungraded };
  }, [rows]);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Team-level counts — always the WHOLE roster, never the filtered subset, so
  // the summary stays a fixed reference point while you slice the list.
  const working = rows.filter((r) => r.status === "working").length;
  const noPlan = rows.filter((r) => !r.plannedToday).length;
  const needHelp = rows.filter((r) => r.needHelp > 0).length;
  const overdue = rows.filter((r) => r.overdueTasks > 0).length;

  const filtersActive =
    dept !== ALL ||
    team !== ALL ||
    status !== "all" ||
    (showGrades && grade !== ALL) ||
    query.trim() !== "";

  function clearFilters() {
    setDept(ALL);
    setTeam(ALL);
    setStatus("all");
    setGrade(ALL);
    setQuery("");
  }

  return (
    <>
      {/* ── 1 · compact team summary — one horizontal line, not four big cards.
          Each count is a filter shortcut, so "5 need help" goes straight to
          those five people. ── */}
      <section
        aria-label="Team summary"
        className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-xl border border-hairline bg-surface-card px-4 py-2.5"
      >
        <SummaryStat label="Employees" value={rows.length} />
        <Divider />
        <SummaryStat
          label="Working"
          value={working}
          tone={working > 0 ? "green" : undefined}
          active={status === "working"}
          onClick={() => setStatus(status === "working" ? "all" : "working")}
        />
        <Divider />
        <SummaryStat
          label="No plan"
          value={noPlan}
          tone={noPlan > 0 ? "red" : undefined}
          active={status === "no_plan"}
          onClick={() => setStatus(status === "no_plan" ? "all" : "no_plan")}
        />
        <Divider />
        <SummaryStat
          label="Need help"
          value={needHelp}
          tone={needHelp > 0 ? "amber" : undefined}
          active={status === "needs_help"}
          onClick={() => setStatus(status === "needs_help" ? "all" : "needs_help")}
        />
        <Divider />
        <SummaryStat
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "red" : undefined}
          active={status === "overdue"}
          onClick={() => setStatus(status === "overdue" ? "all" : "overdue")}
        />
      </section>

      {/* ── 1b · grade distribution — the team's shape in one ring.
          Productivity only, and only once somebody is actually graded: an empty
          ring beside "0 graded" tells a manager nothing they didn't know from
          the table being blank. The legend carries the counts, so the numbers
          are readable without separating the slices by colour. ── */}
      {showGrades && distribution.graded > 0 && (
        <section
          aria-label="Grade distribution"
          className="mb-5 flex flex-wrap items-center gap-x-7 gap-y-4 rounded-xl border border-hairline bg-surface-card px-4 py-3.5"
        >
          <Donut
            data={distribution.slices}
            size={124}
            centerLabel="Graded"
            centerValue={String(distribution.graded)}
            // The same thin black ring the grade chips and legend swatches wear,
            // so the wedges read as the same objects as the badges in the table.
            stroke={GRADE_OUTLINE}
            strokeWidth={1}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              Grade distribution
            </div>
            <GradeLegend
              className="mt-2"
              grades={distribution.present}
              counts={distribution.counts}
            />
            <p className="mt-2 text-[12px] text-ink-subtle">
              Goal-completion grade, best to worst: O · A · B · C · D · F.
              {distribution.ungraded > 0 && (
                <>
                  {" "}
                  <span className="tabular-nums font-bold text-ink-muted">
                    {distribution.ungraded}
                  </span>{" "}
                  ungraded — no goals set to grade against.
                </>
              )}
            </p>
          </div>
        </section>
      )}

      {/* ── 2 · filter + sort toolbar ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={dept}
          onValueChange={setDept}
          ariaLabel="Filter by department"
          searchable={departments.length > 8}
          searchPlaceholder="Search departments…"
          unstyled
          className={FIELD}
          options={[
            { value: ALL, label: "All departments" },
            ...departments.map((d) => ({ value: d, label: d })),
          ]}
        />
        <Select
          value={team}
          onValueChange={setTeam}
          ariaLabel="Filter by team (reporting line)"
          searchable={teams.length > 8}
          searchPlaceholder="Search managers…"
          unstyled
          className={FIELD}
          options={[
            { value: ALL, label: "All teams" },
            ...teams.map((m) => ({ value: m, label: `Reports to ${m}` })),
          ]}
        />
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
          ariaLabel="Filter by status"
          unstyled
          className={FIELD}
          options={STATUS_FILTERS}
        />
        {showGrades && (
          <Select
            value={grade}
            onValueChange={setGrade}
            ariaLabel="Filter by grade"
            unstyled
            className={FIELD}
            options={[
              { value: ALL, label: "All grades" },
              // Only the grades someone actually holds — offering a band nobody
              // is in is an option that can only ever empty the table.
              ...distribution.present.map((g) => ({
                value: g,
                label: `Grade ${g} · ${distribution.counts[g] ?? 0}`,
              })),
              ...(distribution.ungraded > 0
                ? [{ value: UNGRADED, label: `Ungraded · ${distribution.ungraded}` }]
                : []),
            ]}
          />
        )}
        <Select
          value={sort}
          onValueChange={(v) => setSort(v as SortKey)}
          ariaLabel="Sort employees"
          unstyled
          className={FIELD}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: `Sort: ${o.label}` }))}
        />

        <label className="relative ml-auto max-md:ml-0 max-md:w-full">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Local search — employee" title="Local search — filters only the list on this page" aria-label="Local search — employee — this page only"
            className={`h-9 w-[210px] rounded-lg border border-hairline-strong bg-surface-card pl-8 pr-7 text-[13px] font-medium text-ink-strong outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40 max-md:w-full`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink-strong"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          )}
        </label>
      </div>

      {/* Result count + reset — only once a filter is actually narrowing things. */}
      {filtersActive && (
        <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-subtle">
          <span>
            Showing <span className="font-bold text-ink-strong tabular-nums">{visible.length}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span>
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="font-bold text-altus-red underline underline-offset-2 transition-opacity hover:opacity-75"
          >
            Reset
          </button>
        </div>
      )}

      {/* ── 3 · the employee list ── */}
      {rows.length === 0 ? (
        <EmptyState
          title="No team members to show."
          body="You don't have anyone in your reporting line yet. Team members appear here once they report to you, or for admins once they're active."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={query.trim() ? `No employee matches "${query.trim()}".` : "No employee matches these filters."}
          body={
            query.trim()
              ? "Check the spelling, or clear the search to see the whole team."
              : "Try a different department, team or status — or reset to see the whole team."
          }
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex items-center rounded-lg border border-hairline-strong px-3 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                <Th className="pl-4">Employee</Th>
                <Th className="max-lg:hidden">Department · Team</Th>
                <Th align="right">Goal</Th>
                {showGrades && <Th align="right">Grade</Th>}
                <Th align="right" className="max-xl:hidden">Goals</Th>
                <Th align="right" className="max-xl:hidden">Done</Th>
                <Th align="right">Overdue</Th>
                <Th>Status</Th>
                <Th className="w-9 pr-3"><span className="sr-only">Expand</span></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <EmployeeRow
                  key={r.id}
                  row={r}
                  variant={variant}
                  open={expanded.has(r.id)}
                  onToggle={() => toggle(r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[12.5px] text-ink-subtle">
        Goal score is this week&apos;s weight-aware completion; “—” means no goals set. All figures read
        live from the same task, goal and attendance records — nothing duplicated.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Row + expanded detail                                               */
/* ------------------------------------------------------------------ */

function EmployeeRow({
  row,
  variant,
  open,
  onToggle,
}: {
  row: TeamRow;
  variant: TeamBoardVariant;
  open: boolean;
  onToggle: () => void;
}) {
  const st = STATUS_META[row.status];
  const panelId = `team-detail-${row.id}`;
  const router = useRouter();
  const dashboardHref = `/productivity?emp=${row.id}` as Route;
  const toProductivity = variant === "productivity";

  return (
    <>
      <tr
        // In the Productivity module "selecting an employee" means opening their
        // dashboard, not unfolding a summary — the summary is still one click
        // away on the chevron, which stops the event from reaching this handler.
        onClick={toProductivity ? () => router.push(dashboardHref) : onToggle}
        title={toProductivity ? `Open ${row.name}'s Productivity Dashboard` : undefined}
        className="cursor-pointer border-b border-hairline transition-colors hover:bg-surface-soft"
        style={open ? { background: "var(--color-surface-soft)" } : undefined}
      >
        <td className="py-2.5 pl-4 pr-3">
          <div className="flex items-center gap-2.5">
            <EmployeeAvatar name={row.name} size="sm" />
            <span className="truncate text-[13.5px] font-bold text-ink-strong">{row.name}</span>
          </div>
        </td>
        <td className="py-2.5 pr-3 text-[12.5px] text-ink-subtle max-lg:hidden">
          <span className="block truncate">{row.department || "—"}</span>
          {row.managerName && (
            <span className="block truncate text-[11.5px] text-ink-subtle opacity-80">
              {row.managerName}
            </span>
          )}
        </td>
        <td className="py-2.5 pr-3 text-right">
          <ScoreText pct={row.goalScorePct} />
        </td>
        {toProductivity && (
          <td className="py-2.5 pr-3 text-right">
            <GradeBadge grade={gradeOf(row)} size="sm" />
          </td>
        )}
        <td className="py-2.5 pr-3 text-right text-[13px] tabular-nums text-ink-strong max-xl:hidden">
          {row.goalsDone}/{row.goalsCount}
        </td>
        <td className="py-2.5 pr-3 text-right text-[13px] tabular-nums text-ink-strong max-xl:hidden">
          {row.doneToday}
        </td>
        <td className="py-2.5 pr-3 text-right">
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{ color: row.overdueTasks > 0 ? "#dc2626" : "var(--color-ink-subtle)" }}
          >
            {row.overdueTasks}
          </span>
        </td>
        <td className="py-2.5 pr-3">
          <span
            className="inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
            style={{ color: st.color, background: st.bg }}
          >
            {st.label}
          </span>
        </td>
        <td className="py-2.5 pr-3 text-right">
          <button
            type="button"
            onClick={(e) => {
              // The row already toggles; stop the bubble so the click isn't
              // counted twice (which would re-collapse what it just opened).
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? "Collapse" : "Expand"} details for ${row.name}`}
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-card hover:text-ink-strong focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40 outline-none"
          >
            <ChevronDown
              size={15}
              strokeWidth={2.6}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </td>
      </tr>

      {open && (
        <tr id={panelId}>
          {/* Spans every column, including the Grade one the Productivity
              variant adds — a fixed 8 would have left a gap in that layout. */}
          <td colSpan={toProductivity ? 9 : 8} className="border-b border-hairline px-4 py-4" style={{ background: "var(--color-surface-soft)" }}>
            <EmployeeDetail row={row} variant={variant} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The mini report behind a row — every metric the old card carried, laid out
 *  as a plain grid. Deliberately NOT bordered tiles: a card inside a row inside
 *  a table is the nesting this redesign exists to remove. */
function EmployeeDetail({ row, variant }: { row: TeamRow; variant: TeamBoardVariant }) {
  return (
    <div className="flex flex-col gap-3.5">
      {/* Identity line — restates department/team, which the collapsed row hides
          on narrow screens. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <Users size={13} strokeWidth={2.2} />
          {row.department || "No department"}
        </span>
        {row.managerName && <span>Reports to {row.managerName}</span>}
        <span className="inline-flex items-center gap-1.5">
          <LogIn size={13} strokeWidth={2.4} className="text-green-700" /> In {row.lastInLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LogOut size={13} strokeWidth={2.4} /> Out {row.lastOutLabel}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-x-5 gap-y-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
        <Detail label="Goal score" value={row.goalScorePct == null ? "—" : `${row.goalScorePct}%`} tone={scoreTone(row.goalScorePct)} />
        <Detail label="Goals" value={`${row.goalsDone}/${row.goalsCount}`} />
        <Detail label="Tasks given" value={row.assignedToday} />
        <Detail label="Done today" value={row.doneToday} tone={row.doneToday > 0 ? "green" : undefined} />
        <Detail label="Pending" value={row.pendingTasks} />
        <Detail label="Overdue" value={row.overdueTasks} tone={row.overdueTasks > 0 ? "red" : undefined} />
        <Detail label="On hold" value={row.blockedTasks} tone={row.blockedTasks > 0 ? "amber" : undefined} />
        <Detail label="Need help" value={row.needHelp} tone={row.needHelp > 0 ? "amber" : undefined} />
        <Detail
          label="Daily checklist"
          value={row.dccCompliancePct == null ? "—" : `${row.dccCompliancePct}%`}
          tone={row.dccCompliancePct != null && row.dccCompliancePct < 80 ? "red" : undefined}
        />
        <Detail label="Training this month" value={`${row.trainingHoursMonth}h`} />
      </div>

      {/* Actions. The Goals board keeps both of its original destinations; the
          Productivity board leads with the full dashboard, which is the surface
          this row is a summary OF. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/goals/weekly?emp=${row.id}` as Route}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-surface-card"
          style={{
            borderColor: "color-mix(in srgb, var(--color-altus-red) 35%, transparent)",
            color: "var(--color-altus-red-deep)",
          }}
        >
          <Target size={13} strokeWidth={2.4} /> View Goals
        </Link>
        {variant === "productivity" ? (
          <Link
            href={`/productivity?emp=${row.id}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            <Gauge size={13} strokeWidth={2.4} /> Productivity Dashboard
            <ArrowRight size={12} strokeWidth={2.6} />
          </Link>
        ) : (
          <Link
            href={`/goals/weekly/team/${row.id}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            <ClipboardList size={13} strokeWidth={2.4} /> Daily Checklist
            <ArrowRight size={12} strokeWidth={2.6} />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** The toolbar's control language — deliberately the SAME compact, quiet trigger
 *  the Goals headers use via `ViewingSelect`, not the default `gdd-trigger` look
 *  (h-11, red-tinted 1.5px border, soft shadow). Each Select is passed
 *  `unstyled` so this string fully drives it; the red survives only in the focus
 *  ring, where it carries meaning. */
const FIELD = [
  "h-9 w-[168px] cursor-pointer rounded-lg border border-hairline-strong bg-surface-card px-3",
  "text-[13px] font-semibold text-ink-strong transition-colors",
  "hover:border-[color-mix(in_srgb,var(--color-altus-red)_35%,var(--color-hairline-strong))]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40",
  "max-md:w-full",
].join(" ");

function scoreTone(pct: number | null): Tone | undefined {
  if (pct == null) return undefined;
  if (pct >= 80) return "green";
  if (pct >= 60) return "amber";
  return "red";
}

type Tone = "green" | "amber" | "red";

const TONE_COLOR: Record<Tone, string> = {
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
};

function ScoreText({ pct }: { pct: number | null }) {
  const tone = scoreTone(pct);
  return (
    <span
      className="text-[13.5px] font-bold tabular-nums"
      style={{ color: tone ? TONE_COLOR[tone] : "var(--color-ink-subtle)" }}
    >
      {pct == null ? "—" : `${pct}%`}
    </span>
  );
}

function Th({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Divider() {
  return <span aria-hidden className="mx-2 h-4 w-px bg-hairline max-sm:hidden" />;
}

function SummaryStat({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const color = tone ? TONE_COLOR[tone] : "var(--color-ink-strong)";
  const body = (
    <>
      <span className="text-[17px] font-black tabular-nums leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] font-semibold text-ink-subtle">{label}</span>
    </>
  );

  if (!onClick) {
    return <span className="inline-flex items-baseline gap-1.5 px-1">{body}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Show everyone again` : `Show only: ${label}`}
      className="inline-flex cursor-pointer items-baseline gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40 outline-none"
      style={active ? { background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" } : undefined}
    >
      {body}
    </button>
  );
}

function Detail({ label, value, tone }: { label: string; value: string | number; tone?: Tone }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</div>
      <div
        className="mt-0.5 text-[15px] font-bold tabular-nums"
        style={{ color: tone ? TONE_COLOR[tone] : "var(--color-ink-strong)" }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-card px-6 py-12 text-center">
      <p className="text-[14px] font-bold text-ink-strong">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-ink-muted">{body}</p>
      {action}
    </div>
  );
}
