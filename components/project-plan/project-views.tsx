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
import { PlanStatusCell, planActorFor } from "./plan-status-cell";
import { PlanProgressCell } from "./plan-progress-cell";
import { PlanAttachmentCell } from "./plan-attachment-cell";
import { TaskTimerCell } from "@/components/tasks/task-timer-cell";
import type { PlanRow } from "./plan-board";

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
  me,
  downline,
}: {
  /** The whole plan — the same tree the board and registers receive. */
  tree: PlanRow[];
  /** Where an old drill-down URL says we are. Stale ids are dropped by
   *  resolveViewPath before they are turned into expanded branches. */
  initialSelection: ViewSelection;
  /** nodeId → attached file count, batched by the server in one query. */
  attachmentCounts: Record<string, number>;
  me: { id: string; isAdmin: boolean };
  downline: string[];
}) {
  const router = useRouter();

  const downlineSet = React.useMemo(() => new Set(downline), [downline]);
  const projects = React.useMemo(() => tree.filter((n) => n.kind === "project"), [tree]);

  // The arriving URL is resolved against the REAL tree first, so a bookmark
  // naming a milestone that has since moved opens the project and stops there
  // rather than opening a branch it no longer belongs to.
  const arriving = React.useMemo(
    () => resolveViewPath(tree, initialSelection).selection,
    [tree, initialSelection],
  );

  const [rootId, setRootId] = React.useState<string | null>(arriving.projectId);
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() =>
    // Nothing named in the URL? Open the projects themselves, so the screen
    // never opens on a wall of collapsed one-liners with the work hidden.
    expansionForSelection(arriving).size > 0
      ? expansionForSelection(arriving)
      : new Set(tree.filter((n) => n.kind === "project").map((n) => n.id)),
  );

  const rows = React.useMemo(
    () => flattenPlanTree(tree, expanded, { rootId, query }),
    [tree, expanded, rootId, query],
  );

  // Recomputed as rows open and close: expand down to an Action and the Start /
  // End / Duration / Task columns appear alongside it; collapse back to the
  // projects and they go again rather than sitting there empty.
  const columns = React.useMemo(() => activeColumns(rows), [rows]);
  const shown = React.useMemo(
    () => COLUMN_SPEC.filter((c) => columns.has(c.key)),
    [columns],
  );
  const grid = React.useMemo(() => shown.map((c) => c.width).join(" "), [shown]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Keep the project filter in the URL — it is the one piece of this screen's
   *  state worth sharing, and `replaceState` avoids a refetch of rows we hold. */
  function pickProject(id: string) {
    const next = id || null;
    setRootId(next);
    if (next) setExpanded((prev) => new Set(prev).add(next));
    window.history.replaceState(null, "", next ? `?project=${next}` : window.location.pathname);
  }

  /** Open the real WMS task record for an executable row. */
  function openTask(taskId: string) {
    const q = new URLSearchParams();
    if (rootId) q.set("project", rootId);
    q.set("task", taskId);
    router.push(`/project-plan/views?${q.toString()}` as Route);
  }

  const project = rootId ? projects.find((p) => p.id === rootId) ?? null : null;
  const scope = React.useMemo(
    () => (project ? [project] : tree),
    [project, tree],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Title + controls ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-black tracking-tight text-ink-strong">Project Views</h1>
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

          <select
            value={rootId ?? ""}
            onChange={(e) => pickProject(e.target.value)}
            aria-label="Filter by project"
            className="min-w-[200px] rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-bold text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-altus-red/30"
          >
            <option value="">All projects</option>
            {projects.map((p, i) => (
              <option key={p.id} value={p.id}>
                P{i + 1} · {p.name}
              </option>
            ))}
          </select>

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

      {project && <ProjectSummary project={project} />}

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          body="Add a project from the hierarchy board and its tree will open here."
        />
      ) : rows.length === 0 ? (
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
          className="overflow-auto rounded-xl border border-hairline-strong bg-white"
          style={{ maxHeight: "calc(100vh - 300px)", minHeight: 220 }}
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
              {shown.map((c) => (
                <span
                  key={c.key}
                  className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
                >
                  {c.label}
                </span>
              ))}
            </div>

            <ul className="divide-y divide-hairline-soft">
              {rows.map((row) => (
                <TreeLine
                  key={row.node.id}
                  row={row}
                  columns={columns}
                  grid={grid}
                  onToggle={toggle}
                  onOpenTask={openTask}
                  attachmentCount={attachmentCounts[row.node.id] ?? 0}
                  me={me}
                  downlineSet={downlineSet}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── Summary ─ */

/** The filtered project's own line: what it contains and where it stands. */
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
  onOpenTask,
  attachmentCount,
  me,
  downlineSet,
}: {
  row: TreeRow<PlanRow>;
  /** The columns being drawn this render — the header's own answer, passed down
   *  rather than recomputed, so a row can never fall out of step with it. */
  columns: ReadonlySet<ColumnKey>;
  grid: string;
  onToggle: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  attachmentCount: number;
  me: { id: string; isAdmin: boolean };
  downlineSet: ReadonlySet<string>;
}) {
  const n = row.node;
  const kind = row.kind;
  const fields = LEVEL_FIELDS[kind];
  const actor = planActorFor(n, me, downlineSet);
  const rollupKind = childOf(kind);
  const rollup = childCompletion(n, rollupKind);
  const hasChildren = row.childCount > 0;
  // The same authority setPlanNodeProgress enforces server-side.
  // Open to anyone: `setPlanNodeProgress` no longer tests who is asking, so a
  // gate here would only hide a control the server would accept. STATUS is the
  // one guarded action in this module.
  const canRecord = true;

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

        <span
          style={levelTextStyle(kind)}
          className="min-w-0 truncate text-ink-strong"
          title={`${row.fullRef} · ${KIND_LABEL[kind]} — ${n.name}`}
        >
          {n.name}
        </span>
      </div>

      {/* Status — the same picker and the same server-enforced rule as every
          other Project surface. `linkedToTask` tells the cell the change will
          land on the WMS task, which is true only for executable rows. */}
      <div className="min-w-0">
        <PlanStatusCell node={n} actor={actor} linkedToTask={Boolean(n.task)} />
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
          {!fields.wmsTask ? (
            // No child count here: the Children column beside this one is that
            // number, and two copies in adjacent columns is what overlapped.
            <PlanProgressCell node={n} canRecord={canRecord} showChildCount={false} />
          ) : null}
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
        <PlanAttachmentCell nodeId={n.id} initialCount={attachmentCount} canManage />
      </div>

      {/* The WMS record. Only executable rows have one; a row that has not been
          scheduled yet has no task, so it says so rather than offering a button
          that would 404. The Start/Stop control is the same one the WMS list
          and the hierarchy board carry, writing the same session ledger. */}
      {columns.has("task") && (
        <div className="flex min-w-0 items-center gap-1.5">
          {fields.wmsTask && n.task && (
            <TaskTimerCell taskId={n.task.id} running={n.task.timerRunning} canOperate />
          )}
          {fields.wmsTask ? (
            n.task ? (
              <button
                type="button"
                onClick={() => onOpenTask(n.task!.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                title="Open the WMS task — schedule, repeat, timer, approvals"
              >
                <SquareArrowOutUpRight size={13} strokeWidth={2.3} aria-hidden />
                Task
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
