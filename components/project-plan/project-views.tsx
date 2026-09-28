"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ChevronRight,
  FolderKanban,
  SquareArrowOutUpRight,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ListTree,
  TrendingUp,
  Paperclip,
  X,
} from "lucide-react";
import {
  KIND_LABEL,
  levelTextStyle,
  formatPlanDate,
  toHm,
  type PlanKind,
} from "@/lib/project-plan/levels";
import {
  childCompletion,
  nodeFraction,
  toPercent,
  formatCompletion,
} from "@/lib/project-plan/progress";
import {
  resolveViewPath,
  flattenPlanTree,
  expandableIds,
  expansionForSelection,
  LEVEL_FIELDS,
  type ViewSelection,
  type TreeRow,
} from "@/lib/project-plan/views";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { MultiSelect } from "@/components/ui/multi-select";

import type { PlanRow } from "./plan-board";
import { effectivePlanStatus, PLAN_STATUS_LABEL, PLAN_STATUS_TONE, type PlanStatus } from "@/lib/project-plan/status";

/**
 * PROJECT VIEWS — the whole plan as ONE indented tree.
 *
 * WHAT THIS IS NOT: a second copy of the plan. It renders the SAME `PlanRow`
 * tree the hierarchy board and the two registers render, built by the one
 * `listPlanTree()` from `project_nodes` + the linked `tasks`. Every write goes
 * through the SAME server actions — `setPlanNodeStatus`, `setPlanNodeProgress`,
 * the attachment actions — so a status changed here is changed everywhere,
 * including in WMS when the row is an executable one carrying a task.
 *
 * THE SHAPE. Projects at the left margin; each row opens in place to reveal
 * what sits under it, all five levels in one column of lines:
 *
 *     ▾ P1  AICL WMS
 *       ▾ M1  Attendance
 *         ▾ RA  Biometric feed
 *           ▸ A1  Vendor demo
 *           ▾ A2  Install readers
 *               SA2.1  Site survey
 *     ▸ P2  Payroll
 *
 * WHY A TREE RATHER THAN THE OLD PANE-PER-LEVEL DRILL-DOWN. The panes could
 * only ever show one branch: to compare two milestones you had to click back up
 * and lose your place, and the shape of a project — how deep it runs, where the
 * work actually is — was never on screen at once. An indent shows all of that
 * without a click, and expansion is cheap because the whole subtree is already
 * in memory.
 *
 * INDENT IS THE ONLY DEPTH CUE THAT SCALES, so the columns to the right of the
 * name sit in one grid and line up across every level. Which columns that grid
 * has is decided by the rows CURRENTLY VISIBLE — see `activeColumns()`. A level
 * that has no business carrying a field leaves its cell empty rather than
 * shifting its neighbours; a field NO visible level carries loses its column
 * entirely, so a collapsed tree is not four blank columns wide.
 *
 * NAVIGATION IS BY UUID through `parent_id`, never by the P1/M1/RA labels —
 * those are computed from sibling position for display and would silently point
 * at the wrong row the moment anything is renumbered. `lib/project-plan/
 * views.ts` owns the flattening, the refs and the ancestor walk, and is
 * unit-tested against them.
 *
 * ACTIONS AND SUB-ACTIONS ARE WMS TASKS. Rather than rebuilding Start/End time,
 * Repeat, Custom Repeat, Duration, the Start/Stop timer and the approval trail,
 * an executable row opens the REAL WMS task record in the drawer `/tasks`
 * itself uses (`?task=<id>` → `TaskDetailLoader`). One record, one editor.
 *
 * RESULTS EXCLUDE CLOCK TIMES. Brief §5: no Start Time, no End Time, no hours
 * duration. Enforced from the one `LEVEL_FIELDS` table in views.ts rather than
 * by an `if` in the markup, so the exclusion is auditable in a single place.
 *
 * EXPANSION IS LOCAL STATE. Opening a row must not cost a server round-trip for
 * rows already held on the client. An old drill-down link (`?project=&m=&r=&a=`)
 * still works: those ids are resolved against the real tree on arrival and the
 * branch they name is opened, so shared links from the previous screen land in
 * the right place instead of 404-ing. Opening a task record DOES navigate,
 * because the drawer's contents are server-rendered.
 */

/**
 * The columns, in order, with the width each takes in the shared grid.
 *
 * ONLY THE COLUMNS A VISIBLE ROW CAN FILL ARE DRAWN. A Project is a container:
 * it never carries a WMS task, a clock time or an hours duration, so on a
 * collapsed tree "Start / End / Duration / Task" could only ever be four empty
 * cells — and four empty cells are what push the real ones off the right edge
 * behind a scrollbar. `activeColumns()` decides per render from the rows
 * actually on screen, and the header and every row read the same answer, so
 * they cannot disagree about what column three is.
 *
 * The name column is the only elastic one; everything else is fixed so the
 * values line up down the whole tree regardless of depth.
 */
const COLUMN_SPEC = [
  { key: "name", label: "Name", width: "minmax(300px,1fr)" },
  { key: "status", label: "Status", width: "148px" },
  { key: "target", label: "Target", width: "96px" },
  { key: "start", label: "Start", width: "128px" },
  { key: "end", label: "End", width: "128px" },
  { key: "progress", label: "Progress", width: "150px" },
  { key: "children", label: "Children", width: "148px" },
  { key: "files", label: "Files", width: "68px" },
  { key: "task", label: "Task", width: "132px" },
] as const;

type ColumnKey = (typeof COLUMN_SPEC)[number]["key"];
type TreeSort = { key: ColumnKey; direction: "asc" | "desc" } | null;

function nodeStatus(node: PlanRow): PlanStatus {
  return effectivePlanStatus(node.status, node.approvalStatus, false);
}

function allPlanRows(nodes: PlanRow[]): PlanRow[] {
  return nodes.flatMap((node) => [node, ...allPlanRows(node.children)]);
}

function sortValue(node: PlanRow, key: ColumnKey, attachmentCounts: Record<string, number>): string | number {
  switch (key) {
    case "name": return node.name;
    case "status": return PLAN_STATUS_LABEL[nodeStatus(node)];
    case "target": return node.targetDate ?? "";
    case "start": return node.startsAt ?? "";
    case "end": return node.endsAt ?? "";
    case "progress": return toPercent(nodeFraction(node));
    case "children": return node.children.length;
    case "files": return attachmentCounts[node.id] ?? 0;
    case "task": return node.task?.statusLabel ?? "";
  }
}

/** Sort every sibling set, preserving the tree relationship while ordering rows. */
function sortPlanTree(nodes: PlanRow[], sort: TreeSort, attachmentCounts: Record<string, number>): PlanRow[] {
  const nested = nodes.map((node) => ({
    ...node,
    children: sortPlanTree(node.children, sort, attachmentCounts),
  }));
  if (!sort) return nested;
  const direction = sort.direction === "asc" ? 1 : -1;
  return nested.sort((left, right) => {
    const a = sortValue(left, sort.key, attachmentCounts);
    const b = sortValue(right, sort.key, attachmentCounts);
    if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
  });
}

/**
 * Which columns the rows on screen can actually fill.
 *
 * Read straight off `LEVEL_FIELDS` — the same table that decides whether a
 * given row renders a value — so a column can never appear without a level
 * behind it, and a level can never render a value into a column that was
 * dropped.
 */
function activeColumns(rows: TreeRow<PlanRow>[]): Set<ColumnKey> {
  const on = new Set<ColumnKey>(["name", "status", "target", "files"]);
  for (const r of rows) {
    const f = LEVEL_FIELDS[r.kind];
    if (f.clockTimes) {
      on.add("start");
      on.add("end");
    }
    // Executable rows own the Task column; containers own the two completion
    // columns. A tree usually shows both kinds, but a fully collapsed one
    // shows only containers — and then the Task column has no business here.
    if (f.wmsTask) on.add("task");
    else {
      on.add("progress");
      on.add("children");
    }
  }
  return on;
}

export function ProjectViews({
  tree,
  initialSelection,
  attachmentCounts,
  mode = "tree",
}: {
  /** The whole plan — the same tree the board and registers receive. */
  tree: PlanRow[];
  /** Where an old drill-down URL says we are. Stale ids are dropped by
   *  resolveViewPath before they are turned into expanded branches. */
  initialSelection: ViewSelection;
  /** nodeId → attached file count, batched by the server in one query. */
  attachmentCounts: Record<string, number>;
  mode?: "dashboard" | "tree";
}) {
  const router = useRouter();


  // The arriving URL is resolved against the REAL tree first, so a bookmark
  // naming a milestone that has since moved opens the project and stops there
  // rather than opening a branch it no longer belongs to.
  const arriving = React.useMemo(
    () => resolveViewPath(tree, initialSelection).selection,
    [tree, initialSelection],
  );

  const [rootIds, setRootIds] = React.useState<string[]>(arriving.projectId ? [arriving.projectId] : []);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<PlanStatus | "all">("all");
  const [sort, setSort] = React.useState<TreeSort>(null);
  // A tree can be wider than its viewport, but Project Views must always open
  // from the first column.  In particular, restoring a page from browser
  // history must not leave Name hidden while Status is still visible.
  const treeScrollRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() =>
    // Nothing named in the URL? Open the projects themselves, so the screen
    // never opens on a wall of collapsed one-liners with the work hidden.
    expansionForSelection(arriving).size > 0
      ? expansionForSelection(arriving)
       : new Set(tree.filter((n) => n.kind === "project").map((n) => n.id)),
  );

  const orderedTree = React.useMemo(
    () => sortPlanTree(tree, sort, attachmentCounts),
    [tree, sort, attachmentCounts],
  );
  const projects = React.useMemo(() => orderedTree.filter((n) => n.kind === "project"), [orderedTree]);

  const rows = React.useMemo(
    () =>
      flattenPlanTree(
        rootIds.length > 0 ? orderedTree.filter((p) => rootIds.includes(p.id)) : orderedTree,
        expanded,
        { query },
      ),
    [orderedTree, expanded, rootIds, query],
  );
  const filteredRows = React.useMemo(
    () => statusFilter === "all" ? rows : rows.filter((row) => nodeStatus(row.node) === statusFilter),
    [rows, statusFilter],

  );

  // Recomputed as rows open and close: expand down to an Action and the Start /
  // End / Duration / Task columns appear alongside it; collapse back to the
  // projects and they go again rather than sitting there empty.
  const columns = React.useMemo(() => activeColumns(filteredRows), [filteredRows]);
  const shown = React.useMemo(
    () => COLUMN_SPEC.filter((c) => columns.has(c.key)),
    [columns],
  );
  const grid = React.useMemo(() => shown.map((c) => c.width).join(" "), [shown]);

  const allNodes = React.useMemo(() => allPlanRows(orderedTree), [orderedTree]);
  const metrics = React.useMemo(() => {
    const projectStatuses = projects.reduce<Record<PlanStatus, number>>((counts, projectNode) => {
      const status = nodeStatus(projectNode);
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {} as Record<PlanStatus, number>);
    const milestoneCount = allNodes.filter((node) => node.kind === "milestone").length;
    const progress = projects.length
      ? Math.round(projects.reduce((sum, projectNode) => sum + toPercent(nodeFraction(projectNode)), 0) / projects.length)
      : 0;
    return { projectStatuses, milestoneCount, progress };
  }, [allNodes, projects]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Keep the project filter in the URL — it is the one piece of this screen's
   *  state worth sharing, and `replaceState` avoids a refetch of rows we hold. */
  /**
   * The project filter holds a LIST (pick several at once), but the dashboard
   * widgets above the tree each pick exactly ONE — a bar, a timeline row, a
   * metric card. This adapts the one to the other rather than making every
   * caller build an array, and an empty id means "clear the filter", which is
   * what the Total projects card does.
   */
  function pickOneProject(id: string) {
    if (mode === "dashboard") {
      router.push(`/project-plan/views?project=${id}` as Route);
      return;
    }
    pickProject(id ? [id] : []);
  }

  function pickProject(ids: string[]) {
    setRootIds(ids);
    if (ids.length === 1) setExpanded((prev) => new Set(prev).add(ids[0]!));
    window.history.replaceState(null, "", ids.length === 1 ? `?project=${ids[0]!}` : window.location.pathname);
  }

  /** Open the real WMS task record for an executable row. */
  function openTask(taskId: string) {
    const q = new URLSearchParams();
    if (rootIds.length === 1) q.set("project", rootIds[0]!);
    q.set("task", taskId);
    router.push(`/project-plan/views?${q.toString()}` as Route);
  }

  function openNode(node: PlanRow) {
    if (node.task) {
      openTask(node.task.id);
      return;
    }
    const route: Record<PlanKind, Route> = {
      project: "/project-plan?view=tree" as Route,
      milestone: "/project-plan/milestones?view=tree" as Route,
      result: "/project-plan/results?view=tree" as Route,
      action: "/project-plan/actions?view=tree" as Route,
      sub_action: "/project-plan/sub-actions?view=tree" as Route,
      sub_sub_action: "/project-plan/sub-actions?view=tree" as Route,
    };
    router.push(route[node.kind]);
  }

  function changeSort(key: ColumnKey) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  const project = rootIds.length === 1 ? projects.find((p) => p.id === rootIds[0]) ?? null : null;

  const scope = React.useMemo(
    () => (project ? [project] : orderedTree),
    [project, orderedTree],
  );
  const scopeExpandable = React.useMemo(() => expandableIds(scope), [scope]);

  React.useEffect(() => {
    treeScrollRef.current?.scrollTo({ left: 0 });
  }, [mode]);

  return (
    <div className="flex flex-col gap-5">
      {mode === "dashboard" && (
        <>
      {/* ── Title + controls ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Project Dashboard</h1>
          <p className="mt-0.5 text-[13px] font-medium text-ink-muted">
            The whole plan as one tree — open a row to see what sits under it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleSearch scope="project rows">
          <label className="relative flex items-center">
            <Search
              size={14}
              strokeWidth={2.4}
              aria-hidden
              className="pointer-events-none absolute left-2.5 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a row…"
              aria-label="Search the plan"
              className="w-[200px] rounded-xl border border-hairline-strong bg-white py-2 pl-8 pr-7 text-[13px] font-semibold text-ink-strong outline-none placeholder:font-medium placeholder:text-ink-subtle focus-visible:ring-2 focus-visible:ring-altus-red/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 text-ink-subtle transition-colors hover:text-ink-strong"
              >
                <X size={13} strokeWidth={2.6} />
              </button>
            )}
          </label>
          </CollapsibleSearch>

          <MultiSelect
            selected={rootIds}
            onChange={pickProject}
            placeholder="All projects"
            options={projects.map((p, i) => ({ value: p.id, label: `P${i + 1} · ${p.name}` }))}
            className="min-w-[200px] rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-bold text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-altus-red/30"
          />
          <button
            type="button"
            onClick={() => setExpanded(new Set(expandableIds(scope)))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            title="Open every level"
          >
            <ChevronsUpDown size={13} strokeWidth={2.4} aria-hidden />
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            title="Close every level"
          >
            <ChevronsDownUp size={13} strokeWidth={2.4} aria-hidden />
            Collapse
          </button>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as PlanStatus | "all")}
            aria-label="Filter by project status"
            className="min-w-[150px] rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-altus-red/30"

          >
            <option value="all">All statuses</option>
            {Object.entries(PLAN_STATUS_LABEL).map(([status, label]) => (
              <option key={status} value={status}>{label}</option>
            ))}
          </select>

        </div>
      </div>

      <nav className="sticky sticky-below-topbar z-30 -mx-8 border-y border-hairline bg-white/95 px-8 py-2.5 backdrop-blur max-lg:-mx-6 max-lg:px-6 max-md:-mx-4 max-md:px-4" aria-label="Project dashboard quick access">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          {[{ id: "project-overview", label: "Overview" }, { id: "project-status", label: "Status Distribution" }, { id: "project-breakdown", label: "Milestone Breakdown" }, { id: "project-delivery", label: "Delivery Timeline" }, { id: "project-execution", label: "Execution" }].map((item) => (
            <button key={item.id} type="button" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="h-7 shrink-0 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-altus-red">{item.label}</button>
          ))}
        </div>
      </nav>

      <section id="project-overview" className="grid gap-3 scroll-mt-32 sm:grid-cols-2 xl:grid-cols-5" aria-label="Project summary">
        <MetricCard label="Total projects" value={projects.length} icon={<FolderKanban size={18} />} onClick={() => pickProject([])} />
        <MetricCard label="Initiated" value={metrics.projectStatuses.initiated ?? 0} tone="cyan" icon={<TrendingUp size={18} />} onClick={() => { setStatusFilter("initiated"); document.getElementById("project-tree")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
        <MetricCard label="Not started" value={metrics.projectStatuses.not_started ?? 0} tone="slate" icon={<ListTree size={18} />} onClick={() => { setStatusFilter("not_started"); document.getElementById("project-tree")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
        <MetricCard label="Total milestones" value={metrics.milestoneCount} tone="violet" icon={<BarChart3 size={18} />} onClick={() => router.push("/project-plan/milestones" as Route)} />
        <MetricCard label="Overall progress" value={`${metrics.progress}%`} tone="green" icon={<TrendingUp size={18} />} onClick={() => document.getElementById("project-tree")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      </section>

      <section className="space-y-5">
        <DashboardWidget id="project-status" title="Project status distribution" icon={<BarChart3 size={17} />} subtitle="Current status across top-level projects">
          <StatusDistribution counts={metrics.projectStatuses} total={projects.length} onPick={(status) => { setStatusFilter(status); document.getElementById("project-tree")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
        </DashboardWidget>
        <DashboardWidget id="project-breakdown" title="Milestone & results breakdown" icon={<TrendingUp size={17} />} subtitle="Completion across the top-level project portfolio">
          <ProjectProgressChart projects={projects} onPick={pickOneProject} />
        </DashboardWidget>
        <DashboardWidget id="project-delivery" title="Delivery timeline" icon={<ListTree size={17} />} subtitle="Target dates and current delivery state for each project">
          <DeliveryTimeline projects={projects} onPick={pickOneProject} />
        </DashboardWidget>
        <DashboardWidget id="project-execution" title="Execution breakdown" icon={<FolderKanban size={17} />} subtitle="How the portfolio is distributed across milestones, results, and work items">
          <ExecutionBreakdown nodes={allNodes} />
        </DashboardWidget>
      </section>

      {project && <ProjectSummary project={project} />}

        </>
      )}

      {mode === "tree" && (
        <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Project Views</h1>
          <p className="mt-0.5 text-[13px] font-medium text-ink-muted">
            The whole plan as one tree — open a row to see what sits under it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <Search
              size={14}
              strokeWidth={2.4}
              aria-hidden
              className="pointer-events-none absolute left-2.5 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a row…"
              aria-label="Search the plan"
              className="w-[200px] rounded-xl border border-hairline-strong bg-white py-2 pl-8 pr-7 text-[13px] font-semibold text-ink-strong outline-none placeholder:font-medium placeholder:text-ink-subtle focus-visible:ring-2 focus-visible:ring-altus-red/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 text-ink-subtle transition-colors hover:text-ink-strong"
              >
                <X size={13} strokeWidth={2.6} />
              </button>
            )}
          </label>

          <MultiSelect
            selected={rootIds}
            onChange={pickProject}
            placeholder="All projects"
            options={projects.map((p, i) => ({ value: p.id, label: `P${i + 1} · ${p.name}` }))}
            className="min-w-[200px] rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-bold text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-altus-red/30"
          />
          <button
            type="button"
            onClick={() => setExpanded(new Set(expandableIds(scope)))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            title="Open every level"
          >
            <ChevronsUpDown size={13} strokeWidth={2.4} aria-hidden />
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            title="Close every level"
          >
            <ChevronsDownUp size={13} strokeWidth={2.4} aria-hidden />
            Collapse
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          body="Add a project from the hierarchy board and its tree will open here."
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={query ? `Nothing matches “${query}”.` : "Nothing to show."}
          body={
            query
              ? "The search looks at row names across every level of the plan."
              : "This project has no rows under it yet."
          }
        />
      ) : (
        // SCROLLS ON BOTH AXES, inside its own box — the same shape the
        // hierarchy table and the kanban use. Sideways because a deep plan's
        // columns outrun the card, and DOWN because this had `overflow-x-auto`
        // only: a long tree ran off the bottom and the page chrome above had to
        // scroll away before you could reach the end of it. The header below is
        // already `sticky top-0`, which needs a scrolling ancestor to stick to —
        // it now has one, so it pins to the top of this box while the rows move
        // under it.
        <div
          id="project-tree"
          ref={treeScrollRef}
          className="overflow-auto rounded-xl border border-hairline-strong bg-white"
          style={{ maxHeight: "calc(100vh - 220px)", minHeight: 220 }}
        >
          {/* `w-max min-w-full`: as wide as the columns need, never narrower
              than the card — so the header and the rows always agree on their
              width, and the scrollbar appears only when the columns earn it. */}
          <div className="w-max min-w-full">
            {/* One header for the whole tree — the alternative is a micro-label
                repeated on every cell of every row, which is what makes a deep
                plan unreadable. */}
            <div
              className="sticky top-0 z-10 grid items-center gap-x-3 border-b border-hairline-strong bg-surface-soft px-4 py-2"
              style={{ gridTemplateColumns: grid }}
            >
              {shown.map((c) => {
                const active = sort?.key === c.key;
                const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => changeSort(c.key)}
                      title={`Sort by ${c.label}`}
                      className={`group/sort inline-flex items-center gap-1 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors hover:text-ink-strong ${active ? "text-ink-strong" : "text-ink-subtle"}`}
                    >
                      {c.label}
                      <SortIcon size={12} strokeWidth={2.5} className={active ? "text-altus-red" : "opacity-40 group-hover/sort:opacity-100"} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>

            <ul className="divide-y divide-hairline-soft">
              {filteredRows.map((row) => (
                <TreeLine
                  key={row.node.id}
                  row={row}
                  columns={columns}
                  grid={grid}
                  onToggle={toggle}
                  onOpenNode={openNode}
                  attachmentCount={attachmentCounts[row.node.id] ?? 0}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── Summary ─ */

/** The filtered project's own line: what it contains and where it stands. */
function MetricCard({
  label,
  value,
  icon,
  tone = "red",
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "red" | "cyan" | "slate" | "violet" | "green";
  onClick: () => void;
}) {
  const tones = {
    red: "border-red-200 bg-red-50/50 text-altus-red",
    cyan: "border-cyan-200 bg-cyan-50/70 text-cyan-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    violet: "border-violet-200 bg-violet-50/70 text-violet-700",
    green: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
  };
  return <button type="button" onClick={onClick} className={`group rounded-[16px] border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 ${tones[tone]}`}><span className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-wider">{label}<span className="opacity-70 transition-transform group-hover:scale-110">{icon}</span></span><span className="mt-3 block text-[28px] font-black leading-none tabular-nums text-ink-strong">{value}</span></button>;
}

function DashboardWidget({ id, title, subtitle, icon, actions, children }: { id?: string; title: string; subtitle: string; icon: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return <section id={id} className="scroll-mt-32 rounded-[18px] border border-hairline-strong bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-altus-red/10 text-altus-red">{icon}</span><div className="min-w-0"><h2 className="truncate text-[15px] font-black text-ink-strong">{title}</h2><p className="truncate text-[11.5px] font-medium text-ink-subtle">{subtitle}</p></div></div><div className="flex shrink-0 items-center gap-2">{actions}<CollapseToggle expanded={open} onToggle={() => setOpen((value) => !value)} label={title} /></div></div><CollapsibleBody expanded={open}><div className="pt-5">{children}</div></CollapsibleBody></section>;
}

function StatusDistribution({ counts, total, onPick }: { counts: Partial<Record<PlanStatus, number>>; total: number; onPick: (status: PlanStatus) => void }) {
  const entries = (Object.entries(counts) as [PlanStatus, number][]).filter(([, count]) => count > 0);
  if (entries.length === 0) return <p className="py-6 text-center text-[13px] font-semibold text-ink-subtle">No project statuses to display.</p>;
  return <div className="space-y-5"><div className="flex h-12 w-full overflow-hidden rounded-xl bg-slate-100 shadow-inner">{entries.map(([status, count]) => <button key={status} type="button" onClick={() => onPick(status)} title={`${PLAN_STATUS_LABEL[status]}: ${count} projects`} className="min-w-0 transition-[filter] hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ flexGrow: count, background: PLAN_STATUS_TONE[status] }}><span className="sr-only">{PLAN_STATUS_LABEL[status]} {count}</span></button>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{entries.map(([status, count]) => { const percent = total ? Math.round((count / total) * 100) : 0; return <button key={status} type="button" onClick={() => onPick(status)} className="rounded-xl border border-hairline p-3 text-left transition-colors hover:border-altus-red/40 hover:bg-surface-soft"><span className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-[12px] font-bold text-ink-strong"><i className="size-2.5 rounded-full" style={{ background: PLAN_STATUS_TONE[status] }} />{PLAN_STATUS_LABEL[status]}</span><strong className="text-[18px] font-black tabular-nums" style={{ color: PLAN_STATUS_TONE[status] }}>{count}</strong></span><span className="mt-2 block text-[11px] font-semibold text-ink-subtle">{percent}% of the portfolio</span></button>; })}</div></div>;
}

function ProjectProgressChart({ projects, onPick }: { projects: PlanRow[]; onPick: (id: string) => void }) {
  if (projects.length === 0) return <p className="py-6 text-center text-[13px] font-semibold text-ink-subtle">No projects to compare.</p>;
  return <div className="space-y-4">{projects.map((project) => { const progress = toPercent(nodeFraction(project)); const milestones = childCompletion(project, "milestone"); const results = project.children.flatMap((milestone) => milestone.children).filter((node) => node.kind === "result").length; return <button key={project.id} type="button" onClick={() => onPick(project.id)} className="group w-full text-left"><span className="flex items-end justify-between gap-3"><span className="truncate text-[12.5px] font-bold text-ink-strong group-hover:text-altus-red">{project.name}</span><span className="shrink-0 text-[12px] font-black tabular-nums text-ink-strong">{progress}%</span></span><span className="mt-2 block h-3 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-altus-red transition-[width] group-hover:bg-altus-red-deep" style={{ width: `${progress}%` }} /></span><span className="mt-1.5 block text-[11px] font-semibold text-ink-subtle">{formatCompletion(milestones)} milestones complete · {results} results</span></button>; })}</div>;
}

function DeliveryTimeline({ projects, onPick }: { projects: PlanRow[]; onPick: (id: string) => void }) {
  const ordered = projects.slice().sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));
  const dated = ordered.filter((project) => project.targetDate).map((project) => new Date(`${project.targetDate}T12:00:00`).getTime());
  const start = dated.length > 0 ? Math.min(...dated) : 0;
  const end = dated.length > 0 ? Math.max(...dated) : 1;
  const span = Math.max(1, end - start);
  return <div className="space-y-5"><div className="ml-[180px] hidden justify-between border-b border-dashed border-hairline pb-2 text-[10px] font-bold uppercase tracking-wider text-ink-subtle md:flex"><span>Earliest target</span><span>Latest target</span></div>{ordered.map((project) => { const status = nodeStatus(project); const point = project.targetDate ? ((new Date(`${project.targetDate}T12:00:00`).getTime() - start) / span) * 100 : 0; return <button key={project.id} type="button" onClick={() => onPick(project.id)} className="group grid w-full items-center gap-3 text-left md:grid-cols-[168px_minmax(0,1fr)_150px]"><span className="truncate text-[12.5px] font-bold text-ink-strong group-hover:text-altus-red">{project.name}</span><span className="relative h-8 rounded-lg bg-slate-100"><span className="absolute inset-y-0 left-0 rounded-lg bg-altus-red/10" style={{ width: `${Math.max(4, point)}%` }} /><i className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow" style={{ left: `${Math.max(2, Math.min(98, point))}%`, background: PLAN_STATUS_TONE[status] }} /><span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-ink-subtle">Target</span></span><span className="flex items-center justify-between gap-2"><small className="text-[11.5px] font-semibold text-ink-subtle">{formatPlanDate(project.targetDate) || "No date"}</small><ReadOnlyStatus status={status} /></span></button>; })}</div>;
}

function ExecutionBreakdown({ nodes }: { nodes: PlanRow[] }) {
  const groups: { kind: PlanKind; label: string }[] = [{ kind: "milestone", label: "Milestones" }, { kind: "result", label: "Results" }, { kind: "action", label: "Actions" }, { kind: "sub_action", label: "Sub-actions" }];
  const stats = groups.map(({ kind, label }, index) => { const rows = nodes.filter((node) => node.kind === kind); return { kind, label, total: rows.length, done: rows.filter((node) => nodeStatus(node) === "done").length, color: ["#7C3AED", "#0891B2", "#E10600", "#F59E0B"][index]! }; });
  const max = Math.max(1, ...stats.map((item) => item.total));
  return <div className="grid min-h-[230px] grid-cols-4 items-end gap-5 rounded-xl border border-hairline bg-surface-soft/45 p-5 sm:gap-8">{stats.map((item) => <div key={item.kind} className="flex h-[180px] min-w-0 flex-col justify-end text-center"><strong className="mb-2 text-[18px] font-black tabular-nums text-ink-strong">{item.total}</strong><span className="relative mx-auto block w-full max-w-[120px] overflow-hidden rounded-t-xl" style={{ height: `${Math.max(item.total ? 18 : 4, (item.total / max) * 100)}%`, background: `${item.color}25` }}><span className="absolute inset-x-0 bottom-0 rounded-t-xl" style={{ height: `${item.total ? (item.done / item.total) * 100 : 0}%`, background: item.color }} /></span><span className="mt-3 block truncate text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{item.label}</span><small className="mt-1 text-[10.5px] font-semibold text-ink-subtle">{item.done} done</small></div>)}</div>;
}

function ProjectSummary({ project }: { project: PlanRow }) {
  const milestones = childCompletion(project, "milestone");
  const percent = toPercent(nodeFraction(project));

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-hairline-strong bg-white px-4 py-3">
      <Stat label="Milestones" value={String(milestones.total)} />
      <Stat label="Milestone completion" value={formatCompletion(milestones)} />
      <Stat label="Progress" value={`${percent}%`} />
      <Stat label="Start" value={formatPlanDate(project.startsAt) || "—"} />
      <Stat label="End" value={formatPlanDate(project.endsAt) || "—"} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-black tabular-nums text-ink-strong">{value}</span>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── One line ─ */

/**
 * One row of the tree, at any of the five levels.
 *
 * WHICH CELLS FILL IN is decided by `LEVEL_FIELDS[kind]`, not by markup
 * conditionals scattered through the row: a Result shows no Start Time, no End
 * Time and no hours duration, and that is one table entry rather than three
 * places to keep in step. A cell that does not apply renders EMPTY so the grid
 * stays aligned with every other level.
 */
function TreeLine({
  row,
  columns,
  grid,
  onToggle,
  onOpenNode,
  attachmentCount,
}: {
  row: TreeRow<PlanRow>;
  /** The columns being drawn this render — the header's own answer, passed down
   *  rather than recomputed, so a row can never fall out of step with it. */
  columns: ReadonlySet<ColumnKey>;
  grid: string;
  onToggle: (id: string) => void;
  onOpenNode: (node: PlanRow) => void;
  attachmentCount: number;
}) {
  const n = row.node;
  const kind = row.kind;
  const fields = LEVEL_FIELDS[kind];
  const rollupKind = childOf(kind);
  const rollup = childCompletion(n, rollupKind);
  const hasChildren = row.childCount > 0;

  return (
    <li
      className="grid items-center gap-x-3 px-4 py-2 transition-colors hover:bg-surface-soft/60"
      style={{ gridTemplateColumns: grid }}
    >
      {/* ── Name: the indent, the chevron, the ref, the title ─────────────
          The indent is inline because it is data (depth), not a design token,
          and Tailwind cannot generate a class per level. */}
      <div
        className="flex min-w-0 items-center gap-2"
        style={{ paddingLeft: row.depth * 22 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(n.id)}
            aria-expanded={row.expanded}
            aria-label={`${row.expanded ? "Collapse" : "Expand"} ${n.name}`}
            title={`${row.expanded ? "Hide" : "Show"} ${row.childCount} ${KIND_LABEL[rollupKind].toLowerCase()}${row.childCount === 1 ? "" : "s"}`}
            className="grid size-5 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-hairline-soft hover:text-ink-strong"
          >
            <ChevronRight
              size={14}
              strokeWidth={2.7}
              aria-hidden
              className={`transition-transform ${row.expanded ? "rotate-90 text-altus-red" : ""}`}
            />
          </button>
        ) : (
          // A leaf keeps the chevron's width so its name still lines up with
          // the names of the siblings that do open.
          <span className="grid size-5 shrink-0 place-items-center" aria-hidden>
            <span className="size-1.5 rounded-full bg-hairline-strong" />
          </span>
        )}

        <Ref>{row.ref}</Ref>

        <button
          type="button"
          onClick={() => onOpenNode(n)}
          style={levelTextStyle(kind)}
          className="min-w-0 truncate text-left text-ink-strong transition-colors hover:text-altus-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
          title={`${row.fullRef} · ${KIND_LABEL[kind]} — ${n.name}`}
        >
          {n.name}
        </button>
      </div>

      {/* Status — the same picker and the same server-enforced rule as every
          other Project surface. `linkedToTask` tells the cell the change will
          land on the WMS task, which is true only for executable rows. */}
      <div className="min-w-0">
        <ReadOnlyStatus status={nodeStatus(n)} />
      </div>

      {/* Target date — every level keeps this one. */}
      {columns.has("target") && (
        <Cell>{fields.targetDate ? formatPlanDate(n.targetDate) || "—" : ""}</Cell>
      )}

      {/* Start / End TIME and an hours duration: actions and sub-actions only.
          A Result is deliberately excluded (brief §5) and so is every container
          above it — see LEVEL_FIELDS. A container still renders the cell when
          the column is up, because some row below it earned the column and the
          grid has to stay square. */}
      {columns.has("start") && (
        <Cell>
          {fields.clockTimes
            ? n.startsAt
              ? `${formatPlanDate(n.startsAt)} ${toHm(n.startsAt)}`
              : "—"
            : ""}
        </Cell>
      )}
      {columns.has("end") && (
        <Cell>
          {fields.clockTimes
            ? n.endsAt
              ? `${formatPlanDate(n.endsAt)} ${toHm(n.endsAt)}`
              : "—"
            : ""}
        </Cell>
      )}
      {/* Completion. A container reports its own percent and its children's
          rollup; an executable row is measured by its status chip instead, which
          is why PlanProgressCell renders a dash for one. */}
      {columns.has("progress") && (
        <div className="min-w-0 overflow-hidden">
          {!fields.wmsTask ? <ReadOnlyProgress percent={toPercent(nodeFraction(n))} /> : null}
        </div>
      )}
      {columns.has("children") && (
        <Cell>
          {!fields.wmsTask
            ? rollup.total === 0
              ? "—"
              : `${formatCompletion(rollup)} ${KIND_LABEL[rollupKind].toLowerCase()}s`
            : ""}
        </Cell>
      )}

      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-subtle" title={`${attachmentCount} file${attachmentCount === 1 ? "" : "s"}`}><Paperclip size={13} aria-hidden />{attachmentCount || "—"}</span>
      </div>

      {/* The WMS record. Only executable rows have one; a row that has not been
          scheduled yet has no task, so it says so rather than offering a button
          that would 404. The Start/Stop control is the same one the WMS list
          and the hierarchy board carry, writing the same session ledger. */}
      {columns.has("task") && (
        <div className="flex min-w-0 items-center gap-1.5">
          {fields.wmsTask ? (
            n.task ? (
              <button
                type="button"
                onClick={() => onOpenNode(n)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                title="Open the WMS task — schedule, repeat, timer, approvals"
              >
                <SquareArrowOutUpRight size={13} strokeWidth={2.3} aria-hidden />
                View task
              </button>
            ) : (
              <span
                className="text-[11.5px] font-medium text-ink-subtle"
                title="No WMS task yet — give the row an owner and a date to schedule it"
              >
                Not scheduled
              </span>
            )
          ) : null}
        </div>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- bits */

function ReadOnlyStatus({ status }: { status: PlanStatus }) {
  return <span className="inline-flex max-w-full items-center rounded-md px-2 py-1 text-[11px] font-bold" style={{ color: PLAN_STATUS_TONE[status], background: `${PLAN_STATUS_TONE[status]}18` }}>{PLAN_STATUS_LABEL[status]}</span>;
}

function ReadOnlyProgress({ percent }: { percent: number }) {
  return <span className="flex min-w-[112px] items-center gap-2"><span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-altus-red" style={{ width: `${percent}%` }} /></span><span className="w-8 text-right text-[11.5px] font-bold tabular-nums text-ink-strong">{percent}%</span></span>;
}

/** A plain read-only grid cell. Empty children render an empty cell, which is
 *  how a level that has no business carrying a field keeps the grid aligned. */
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-[12px] font-semibold tabular-nums text-ink-strong">
      {children}
    </span>
  );
}

function Ref({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-surface-soft px-1.5 py-0.5 text-[11px] font-black tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline-strong bg-white px-6 py-16 text-center">
      <span className="mx-auto mb-3 inline-grid size-12 place-items-center rounded-full bg-surface-soft text-ink-muted">
        <FolderKanban size={24} strokeWidth={2.1} />
      </span>
      <p className="text-[15px] font-bold text-ink-strong">{title}</p>
      <p className="mx-auto mt-1 max-w-[420px] text-[13.5px] font-medium text-ink-muted">{body}</p>
    </div>
  );
}

/** The kind one level down — what a row of this kind contains. */
function childOf(kind: PlanKind): PlanKind {
  switch (kind) {
    case "project": return "milestone";
    case "milestone": return "result";
    case "result": return "action";
    case "action": return "sub_action";
    default: return "sub_sub_action";
  }
}
