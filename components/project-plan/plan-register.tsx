"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { Route } from "next";
import { Search, X, FolderPlus, ArrowUpDown, Rows3, SquareArrowOutUpRight, Pencil, Copy, Loader2 } from "lucide-react";
import {
  KIND_LABEL,
  levelTextStyle,
  formatPlanDate,
  durationDays,
  isExecutable,
  hasSchedule,
  type PlanKind,
} from "@/lib/project-plan/levels";
import {
  nodeFraction,
  toPercent,
  formatCompletion,
  formatCompleted,
  type Completion,
} from "@/lib/project-plan/progress";
import {
  buildRegisterRows,
  ANCESTOR_KINDS,
  LEVEL_KIND,
  ROLLUP_KIND,
  type RegisterLevel,
} from "@/lib/project-plan/register";
import { PlanStatusCell, planActorFor } from "./plan-status-cell";
import { PlanProgressCell } from "./plan-progress-cell";
import { PlanAttachmentCell } from "./plan-attachment-cell";
import { PlanLinksCell } from "./plan-links-cell";
import { BulkActionBar } from "@/components/tasks/bulk-action-bar";
import { fireToast } from "@/lib/toast";
import { deletePlanNode, duplicatePlanNode } from "@/app/(app)/project-plan/actions";
import type { TaskStatus } from "@/db/enums";
import {
  EditDialog, BarButton, countBelow,
  type PlanRow, type EmployeeOption, type DetailTarget,
} from "./plan-board";
import { NewNodeDialog } from "./new-node-dialog";
import { NewItemButtons, usePlanCreateShortcuts } from "./new-item-buttons";
import { PlanBulkUpload } from "./plan-bulk-upload";
import { useRememberPlanNode } from "./use-recent-plan";

/**
 * Project Plan — the Milestones and Results REGISTERS.
 *
 * A flat, columnar view of one level: every milestone in the plan on its own
 * row, each carrying the project it belongs to. The hierarchy board answers
 * "what is under this project?"; this answers "what milestones exist, and where
 * do they stand?" — which is a different question and wants a different shape.
 *
 * ONE SOURCE OF TRUTH. It is handed the SAME `PlanRow` tree the board renders,
 * built by `listPlanTree()` from `project_nodes` + the linked `tasks`. Nothing
 * here is fetched separately, denormalised or cached: flattening a tree is the
 * whole of the "register", so a milestone cannot say one thing here and another
 * on the board.
 *
 * REFERENCES. Short refs only — P1, M2, RA — derived from sibling position by
 * the same `refFor` the board uses, so the numbering matches across screens.
 * The long traceability path (P3M3RD) is never a column; it rides along as the
 * row's `title` for copying into an email, exactly as brief §3 asks.
 *
 * BOTH LEVELS, ONE COMPONENT. Milestones and Results differ only in which
 * ancestors they show and what their two completion columns count, so they are
 * one table with a level switch rather than two files to keep in step.
 */

/**
 * The flattening rule — which rows this level lists, how they are numbered and
 * what each one's rollup counts — lives in `lib/project-plan/register.ts`, so
 * it can be unit-tested against the brief's own examples without rendering a
 * table. This file is the table; that file is the rule.
 */
export type { RegisterLevel };

type SortKey = "plan" | "name" | "start" | "end" | "days" | "own" | "rollup";

/**
 * The widths of the identity columns, in pixels.
 *
 * Module scope on purpose: these are numbers the table declares, not state, and
 * a fresh object each render would drag every memo that reads them along too.
 *
 * They are pinned three ways on the cell (see `idCol`) because a `w-[…]` class
 * is only a suggestion in a table — and because the freeze offsets below are
 * CUMULATIVE SUMS of exactly these numbers. A sticky cell is positioned against
 * the scroll box, not against the cell before it, so nothing recomputes them
 * from the real layout: let one identity column size to its content and every
 * column after it lands in the wrong place.
 */
const ID_W = { tick: 40, ref: 92, name: 190, ownName: 230 } as const;

export function PlanRegister({
  level,
  tree,
  attachmentCounts,
  me,
  downline,
  employees,
  canManage,
  labels,
}: {
  level: RegisterLevel;
  tree: PlanRow[];
  /** nodeId → number of attached files, batched by the server in one query. */
  attachmentCounts: Record<string, number>;
  me: { id: string; isAdmin: boolean };
  downline: string[];
  /** Roster for the create dialog's Owner / Doer pickers. */
  employees: EmployeeOption[];
  /** Admins and managers own the structure — the same rule /projects uses. */
  canManage: boolean;
  /**
   * Admin-editable WMS status labels. The bar's own status menus are off here
   * (see the selection bar below), but `BulkActionBar` requires the map, and
   * passing the real one keeps a renamed status reading the same everywhere if
   * they are ever turned back on.
   */
  labels: Record<TaskStatus, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("plan");
  const [asc, setAsc] = React.useState(true);
  /** Which level the create dialog is opening on, or null when it is closed. */
  const [creating, setCreating] = React.useState<PlanKind | null>(null);
  /** …and which level the BULK upload is open on. */
  const [bulkKind, setBulkKind] = React.useState<PlanKind | null>(null);
  /**
   * Ticked rows, by node id.
   *
   * Kept as ids rather than rows so a `router.refresh()` — which rebuilds every
   * row object — doesn't silently drop the selection, and so a row filtered out
   * by the search box stays ticked when the search is cleared.
   */
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
  /** The row the Edit button opened, or null when the dialog is closed. */
  const [editing, setEditing] = React.useState<DetailTarget | null>(null);
  /** Which bulk action is in flight — drives the spinner on the bar. */
  const [busy, setBusy] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  /**
   * WHERE YOU ARE, remembered — the register's half of the same memory the
   * board keeps. Ticking a row here and then pressing Bulk Upload should land
   * the import in that row's branch, not in whatever the board saw last.
   */
  const remember = useRememberPlanNode(tree);

  /** P · M · R · T · S, held back while this screen's own dialogs are up. */
  usePlanCreateShortcuts(setCreating, !creating && !bulkKind && !editing);

  const downlineSet = React.useMemo(() => new Set(downline), [downline]);
  const kind = LEVEL_KIND[level];
  const rollupKind = ROLLUP_KIND[level];

  const allRows = React.useMemo(() => buildRegisterRows(tree, level), [tree, level]);

  const projects = React.useMemo(
    () => tree.filter((n) => n.kind === "project").map((p) => ({ id: p.id, name: p.name })),
    [tree],
  );

  /** Project filter → text search → sort. */
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = allRows;

    if (projectId !== "all") {
      const project = tree.find((p) => p.id === projectId);
      const ids = new Set<string>();
      const walk = (n: PlanRow) => {
        ids.add(n.id);
        n.children.forEach(walk);
      };
      if (project) walk(project);
      r = r.filter((row) => ids.has(row.node.id));
    }

    if (q) {
      // Searches the row AND the project it belongs to, because "AICL" is how
      // people look for a milestone whose own name they don't remember.
      r = r.filter(
        (row) =>
          row.node.name.toLowerCase().includes(q) ||
          (row.node.description ?? "").toLowerCase().includes(q) ||
          row.ownRef.toLowerCase().includes(q) ||
          // Every ancestor, by name AND by ref — "AICL" is how people look for
          // an action whose own name they don't remember, and so is "M2".
          row.ancestors.some(
            (a) =>
              a.name.toLowerCase().includes(q) || a.ref.toLowerCase().includes(q),
          ),
      );
    }

    if (sortKey === "plan") return r;

    const dir = asc ? 1 : -1;
    // Copied before sorting — the memo's input array must not be reordered.
    return [...r].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.node.name.localeCompare(b.node.name);
        case "start":
          return dir * cmpDate(a.node.startsAt, b.node.startsAt);
        case "end":
          return dir * cmpDate(a.node.endsAt, b.node.endsAt);
        case "days":
          return dir * cmpNum(daysOf(a.node), daysOf(b.node));
        case "own":
          return dir * cmpNum(toPercent(nodeFraction(a.node)), toPercent(nodeFraction(b.node)));
        case "rollup":
          return dir * cmpNum(a.rollup.fraction, b.rollup.fraction);
        default:
          return 0;
      }
    });
  }, [allRows, tree, projectId, search, sortKey, asc]);

  /**
   * Open the linked WMS record. `?task=` is the SAME contract /tasks uses, and
   * the page mounts the same drawer, so this is a navigation into an existing
   * screen rather than a second task editor.
   */
  function openTask(taskId: string, nodeId: string) {
    // Same signal the hierarchy board records — see `remember` above.
    remember(nodeId);
    router.push(`${pathname}?task=${taskId}` as Route);
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      // Third click on the same column goes back to plan order, so there is
      // always a way back to the hierarchy's own sequence.
      if (!asc) {
        setSortKey("plan");
        setAsc(true);
        return;
      }
      setAsc(false);
      return;
    }
    setSortKey(key);
    setAsc(true);
  }

  // Which parent columns this level carries — one entry per level above it,
  // outermost first. The table's width and colspan follow from its length, so
  // adding a level never means hunting for a hard-coded number.
  const ancestorKinds = ANCESTOR_KINDS[level];
  /**
   * Does this level own a schedule? Projects and Milestones do not — they are
   * dated by the work underneath them (SCHEDULED_KINDS in
   * lib/project-plan/levels.ts), so Start Date / End Date / Duration are not
   * columns on their registers rather than three columns of dashes. The same
   * table drives the create form's Schedule section and the edit dialog's.
   */
  const showsSchedule = hasSchedule(kind);

  /**
   * FROZEN COLUMNS — the whole identity block, pinned to the left edge.
   *
   * The tick, then every ancestor's No + Name, then this level's own No + Name.
   * Scroll sideways and all of that holds while the dates, counts, files and
   * links move underneath it, so a row never becomes a wall of numbers
   * belonging to nobody.
   *
   * THE LINE FALLS AFTER RESULT NAME on the executable registers.
   *
   * Projects, Milestones and Results freeze their whole identity block — at
   * most two ancestor pairs and their own, which fits. Actions and Sub-Actions
   * carry three and four pairs, and freezing all of them plus the level's own
   * pair pinned 1200–1500px: most of the screen held still, with a sliver left
   * to scroll in. So those two freeze the plan trail — the tick, Project,
   * Milestone and Result — and let their OWN No / Name scroll with everything
   * else, along with the Action pair a Sub-Action carries above itself.
   */
  const freezeThrough = React.useMemo(() => {
    // Non-executable levels: every ancestor pair, and the level's own.
    if (!isExecutable(kind)) return { ancestors: ancestorKinds.length, own: true };
    // Executable levels: up to and including the Result pair, nothing after.
    const afterResult = ancestorKinds.indexOf("result");
    return {
      ancestors: afterResult >= 0 ? afterResult + 1 : ancestorKinds.length,
      own: false,
    };
  }, [kind, ancestorKinds]);

  /** Left offset of every frozen column, in render order — cumulative widths. */
  const freezeLeft = React.useMemo(() => {
    const out = { tick: 0, ancestors: [] as Array<{ ref: number; name: number }>, ownRef: 0, ownName: 0 };
    let x = ID_W.tick;
    for (let i = 0; i < ancestorKinds.length; i++) {
      out.ancestors.push({ ref: x, name: x + ID_W.ref });
      x += ID_W.ref + ID_W.name;
    }
    out.ownRef = x;
    out.ownName = x + ID_W.ref;
    return out;
  }, [ancestorKinds.length]);

  /**
   * One identity column, shared by the <th> and the <td> so the two can never
   * disagree about where the column sits.
   *
   * The offset travels as a CUSTOM PROPERTY and the pinning itself lives in a
   * `min-width: 768px` rule in globals.css — not inline — which is how the WMS
   * task table does it, and for the same reason: the header row is ALREADY
   * `sticky top-0` at every width for the vertical freeze, so an inline `left`
   * would take effect on a phone too, where the body cells are deliberately not
   * frozen. The headers would slide sideways while their own columns stayed
   * put. One media query keeps both halves in step, and below `md` the block
   * falls back to normal flow — a 900px frozen group leaves a phone nothing to
   * scroll into.
   */
  const idCol = (
    left: number,
    width: number,
    /** Is THIS column on the frozen side of the line? */
    frozen = true,
  ): { className: string; style: React.CSSProperties } => ({
    className: frozen ? "plan-frozen-cell" : "",
    style: {
      width,
      minWidth: width,
      maxWidth: width,
      // Only the frozen variant needs an offset and a background of its own. A
      // scrolling cell painting an opaque box would just cover the row tint.
      ...(frozen
        ? {
            ["--frozen-left" as string]: `${left}px`,
            // `inherit` takes the ROW's background, so a hovered or ticked row
            // stays one colour across the freeze line instead of showing a
            // notch. It only works while that background is OPAQUE — see the
            // row's className.
            background: "inherit",
          }
        : {}),
    },
  });

  /** Ticked rows that are still visible under the current filters. */
  const pickedRows = React.useMemo(
    () => rows.filter((r) => picked.has(r.node.id)),
    [rows, picked],
  );
  const allPicked = rows.length > 0 && pickedRows.length === rows.length;

  function togglePick(id: string) {
    remember(id);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Header tick — selects/clears every row the filters currently show. */
  function toggleAll() {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allPicked) rows.forEach((r) => next.delete(r.node.id));
      else rows.forEach((r) => next.add(r.node.id));
      return next;
    });
  }

  /**
   * The tasks behind the selection — what every shared dropdown on the bulk bar
   * writes to. Rows that are containers, or executable but not scheduled yet,
   * have no task and are simply absent here; they stay selected for the
   * plan-side actions, which act on the row.
   */
  const selectedTaskIds = React.useMemo(
    () => pickedRows.flatMap((r) => (r.node.task ? [r.node.task.id] : [])),
    [pickedRows],
  );

  /**
   * Run a per-row plan action across the selection, then report once.
   *
   * The plan actions are single-row on purpose — each re-checks its own
   * permission — so a batch is a loop, not a second set of bulk endpoints with
   * a second copy of the rules. Failures are counted rather than thrown, so one
   * row a person may not touch doesn't abandon the other nine.
   */
  function bulk(
    label: string,
    fn: (id: string) => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ) {
    const ids = pickedRows.map((r) => r.node.id);
    if (ids.length === 0) return;
    setBusy(label);
    startTransition(async () => {
      let failed = 0;
      for (const id of ids) {
        try {
          const res = await fn(id);
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
      }
      setBusy(null);
      setPicked(new Set());
      fireToast({
        message: failed
          ? `${done} — ${failed} of ${ids.length} could not be saved.`
          : `${done} (${ids.length}).`,
        type: failed ? "error" : "success",
      });
      router.refresh();
    });
  }

  /** Delete = archive the row, everything under it, and their linked tasks. */
  function bulkDelete() {
    const n = pickedRows.length;
    const kids = pickedRows.reduce((a, r) => a + countBelow(r.node), 0);
    const lines = [`Delete ${n} selected row${n === 1 ? "" : "s"}?`];
    if (kids > 0) {
      lines.push(
        `This also removes ${kids} row${kids === 1 ? "" : "s"} beneath them, and archives any linked WMS tasks.`,
      );
    }
    if (!window.confirm(lines.join("\n\n"))) return;
    bulk("delete", (id) => deletePlanNode(id), "Deleted");
  }

  /** The shape EditDialog wants, built from the row the flatten pass produced. */
  function targetFor(row: (typeof rows)[number]): DetailTarget {
    return {
      node: row.node,
      ref: row.ownRef,
      fullRef: row.fullRef,
      path: row.ancestors.map((a) => a.name),
    };
  }

  // An action / sub-action IS a WMS task: it has no completion percentage of
  // its own (its status is the measure) but it does have a record to open.
  const executable = isExecutable(kind);
  // Built as plain strings: a template literal cast straight to `Route` makes
  // TS expand the whole typed-routes union (TS2590).
  const HIERARCHY_HREF: Record<RegisterLevel, string> = {
    projects: "/project-plan?view=tree",
    milestones: "/project-plan/milestones?view=tree",
    results: "/project-plan/results?view=tree",
    actions: "/project-plan/actions?view=tree",
    "sub-actions": "/project-plan/sub-actions?view=tree",
  };
  const hierarchyHref = HIERARCHY_HREF[level];
  const levelLabel = KIND_LABEL[kind];
  const rollupLabel = `${KIND_LABEL[rollupKind]}s Completion`;
  // The tick column, two columns per ancestor (No + Name), then: own No, own
  // Name, Description, Status, the level-dependent column (own Completion on a
  // container / Task on an executable row), the rollup, Attachments, Links and
  // Initiator Notes — plus Start / End / Duration on the scheduled levels.
  const colCount =
    1 + ancestorKinds.length * 2 + 9 + (showsSchedule ? 3 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Title + level switch ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-black tracking-tight text-ink-strong">
            {levelLabel}s
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-ink-muted">
            {ancestorKinds.length === 0
              ? `Every ${levelLabel.toLowerCase()} in the plan, with its status, progress and milestone rollup.`
              : `Every ${levelLabel.toLowerCase()} in the plan, with the ${ancestorKinds
                  .map((k) => KIND_LABEL[k].toLowerCase())
                  .join(" › ")} it belongs to.`}
          </p>
        </div>
        {/* The hierarchy view of this same level is one click away — the
            register replaces the tree on this route, it does not remove it. */}
        <Link
          href={hierarchyHref as Route}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
        >
          <Rows3 size={14} strokeWidth={2.2} aria-hidden />
          Hierarchy view
        </Link>
      </div>

      {/* ── Search + project filter ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-xl border border-hairline-strong bg-white px-3 py-2">
          <Search size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${levelLabel.toLowerCase()}s, projects, references…`}
            aria-label={`Search ${levelLabel.toLowerCase()}s`}
            className="w-full min-w-0 bg-transparent text-[13.5px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="shrink-0 text-ink-subtle hover:text-ink-strong"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {/* Redundant on the Projects register — the rows ARE the projects, and
            the search box already narrows that same column. */}
        <select
          value={projectId}
          // Narrowing the register to one project says which project you are
          // in, so the create dialogs open pointing at it.
          onChange={(e) => { setProjectId(e.target.value); if (e.target.value !== "all") remember(e.target.value); }}
          aria-label="Filter by project"
          hidden={level === "projects"}
          className="rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong outline-none"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* The create boxes and Bulk Upload — shared with the hierarchy board,
            so both surfaces offer the same levels under the same rule. */}
        <NewItemButtons onPick={setCreating} onBulkUpload={setBulkKind} bulkKind={kind ?? "project"} />

        <span className="ml-auto text-[12.5px] font-semibold text-ink-muted">
          {rows.length} {rows.length === 1 ? levelLabel.toLowerCase() : `${levelLabel.toLowerCase()}s`}
        </span>
      </div>

      {/* ── Selection bar ────────────────────────────────────────────────────
          PLAN ACTIONS ONLY — Edit, Duplicate, Delete. The six task-side
          dropdowns the WMS list carries (Doer Status, Priority, Reassign,
          Subject, Client, Manager Status) are off here, and so is the bulk
          Owner: every one of them writes a record only SOME of these rows have.
          Tick three projects and a Client set from this bar would reach none of
          them; tick a mixed page and it would reach an arbitrary subset. The
          hierarchy board still offers them — go there, or open the row's task.

          Wired as the board wires it, and for the same reasons:

            count             ROWS are ticked, but `selectedIds` carries the
                              TASKS behind them — a container has none, so the
                              chip would read "0 selected" while rows are lit.
            showArchive=false Delete here already archives the row AND its task
                              (`deletePlanNode`), so Archive would duplicate it.
            onDeleteOverride  the task-only delete would strand the plan rows.

          EDIT TAKES ONE ROW: the dialog edits a single node's own name,
          description, owner and dates, and no field on it means the same thing
          applied to five rows at once. */}
      {pickedRows.length > 0 && (
        <BulkActionBar
          selectedIds={selectedTaskIds}
          count={pickedRows.length}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          isAdmin={canManage}
          statusLabels={labels}
          onClear={() => setPicked(new Set())}
          showArchive={false}
          showTaskActions={false}
          onDeleteOverride={bulkDelete}
          extras={
            <>
              {pickedRows.length === 1 && (
                <BarButton
                  icon={<Pencil size={14} strokeWidth={2.2} />}
                  onClick={() => pickedRows[0] && setEditing(targetFor(pickedRows[0]))}
                >
                  Edit
                </BarButton>
              )}

              <BarButton
                icon={<Copy size={14} strokeWidth={2.2} />}
                onClick={() => bulk("duplicate", (id) => duplicatePlanNode(id), "Duplicated")}
              >
                Duplicate
              </BarButton>

              {busy && <Loader2 size={15} className="animate-spin text-ink-subtle" />}
            </>
          }
        />
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="overflow-auto rounded-xl border border-hairline-strong bg-white max-h-[calc(100vh-300px)]">
        {/* Width grows with the ancestor chain rather than being one of two
            hard-coded values — Sub-Actions carries four parents, Milestones one. */}
        <table
          className="w-full border-collapse text-left"
          style={{ minWidth: (showsSchedule ? 1200 : 884) + 44 + 240 + ancestorKinds.length * 280 }}
        >
          <thead className="sticky top-0 z-[2]">
            <tr className="border-b border-hairline-strong bg-surface-soft [&>th]:bg-[color:var(--color-surface-soft,#eef2f7)]">
              {/* Tick-all — every row the current filters show. Indeterminate
                  while only some of them are ticked, so the header reports the
                  state instead of guessing at it. */}
              <Th className={`pl-3 z-[3] ${idCol(freezeLeft.tick, ID_W.tick).className}`} style={idCol(freezeLeft.tick, ID_W.tick).style}>
                <input
                  type="checkbox"
                  checked={allPicked}
                  ref={(el) => {
                    if (el) el.indeterminate = pickedRows.length > 0 && !allPicked;
                  }}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                  aria-label={allPicked ? "Clear selection" : `Select all ${rows.length} rows`}
                  className="size-3.5 cursor-pointer accent-[#E10600] disabled:cursor-not-allowed"
                />
              </Th>
              {/* One No + Name pair per level above this one. */}
              {ancestorKinds.map((k, i) => (
                <React.Fragment key={k}>
                  <Th className={`z-[3] ${idCol(freezeLeft.ancestors[i]!.ref, ID_W.ref, i < freezeThrough.ancestors).className}`} style={idCol(freezeLeft.ancestors[i]!.ref, ID_W.ref, i < freezeThrough.ancestors).style}>
                    {KIND_LABEL[k]} No
                  </Th>
                  <Th className={`z-[3] ${idCol(freezeLeft.ancestors[i]!.name, ID_W.name, i < freezeThrough.ancestors).className}`} style={idCol(freezeLeft.ancestors[i]!.name, ID_W.name, i < freezeThrough.ancestors).style}>
                    {KIND_LABEL[k]} Name
                  </Th>
                </React.Fragment>
              ))}
              <Th className={`z-[3] ${idCol(freezeLeft.ownRef, ID_W.ref, freezeThrough.own).className}`} style={idCol(freezeLeft.ownRef, ID_W.ref, freezeThrough.own).style}>
                {levelLabel} No
              </Th>
              <SortTh
                className={`z-[3] ${idCol(freezeLeft.ownName, ID_W.ownName, freezeThrough.own).className}`}
                style={idCol(freezeLeft.ownName, ID_W.ownName, freezeThrough.own).style}
                active={sortKey === "name"}
                asc={asc}
                onClick={() => sortBy("name")}
              >
                {levelLabel} Name
              </SortTh>
              <Th className="w-[240px]">{levelLabel} Description</Th>
              <Th className="w-[150px]">{levelLabel} Status</Th>
              {/* Only on the levels that own a schedule — see `showsSchedule`. */}
              {showsSchedule && (
                <>
                  <SortTh className="w-[112px]" active={sortKey === "start"} asc={asc} onClick={() => sortBy("start")}>
                    Start Date
                  </SortTh>
                  <SortTh className="w-[112px]" active={sortKey === "end"} asc={asc} onClick={() => sortBy("end")}>
                    End Date
                  </SortTh>
                  <SortTh className="w-[92px]" active={sortKey === "days"} asc={asc} onClick={() => sortBy("days")}>
                    Duration
                  </SortTh>
                </>
              )}
              {/* NO Client / Subject / Doer / Due / Age / Action columns. The
                  executable registers used to mirror six of the WMS list's own
                  columns, on the reasoning that an Action IS a task and should
                  show what the task list shows. In practice a plan row is
                  mostly not scheduled yet, so the block read as six columns of
                  dashes across the width of the screen. The record is one click
                  away in the WMS Task column beside this, which opens the same
                  drawer with all six fields and more. */}
              {executable ? (
                <Th className="w-[104px]">WMS Task</Th>
              ) : (
                <SortTh className="w-[136px]" active={sortKey === "own"} asc={asc} onClick={() => sortBy("own")}>
                  {levelLabel} Completion
                </SortTh>
              )}
              <SortTh className="w-[150px]" active={sortKey === "rollup"} asc={asc} onClick={() => sortBy("rollup")}>
                {rollupLabel}
              </SortTh>
              <Th className="w-[104px]">Attachments</Th>
              {/* Last column, on every register — the links the create form
                  collected, opened straight from the row. */}
              <Th className="w-[92px]">Links</Th>
              {/* Last column. Read from whichever record actually holds them —
                  see the cell below. */}
              <Th className="w-[240px] pr-3">Initiator Notes</Th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-16 text-center">
                  <span className="mx-auto mb-3 inline-grid size-11 place-items-center rounded-full bg-surface-soft text-ink-muted">
                    <FolderPlus size={22} strokeWidth={2.2} />
                  </span>
                  <p className="text-[15px] font-bold text-ink-strong">
                    {search || projectId !== "all"
                      ? `No ${levelLabel.toLowerCase()}s match that.`
                      : `No ${levelLabel.toLowerCase()}s yet.`}
                  </p>
                  <p className="mt-1 text-[13.5px] font-medium text-ink-muted">
                    {search || projectId !== "all"
                      ? "Try a different word, or clear the filters to see them all."
                      : `Add a ${levelLabel.toLowerCase()} from the hierarchy view to see it here.`}
                  </p>
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const n = row.node;
              const days = daysOf(n);
              const actor = planActorFor(n, me, downlineSet);
              // Same authority setPlanNodeProgress enforces server-side.
              // Open to anyone — setPlanNodeProgress no longer tests who is asking.
              const canRecord = true;

              return (
                <tr
                  key={n.id}
                  title={row.fullRef}
                  data-picked={picked.has(n.id) || undefined}
                  // bg-white is load-bearing: the frozen cells take their
                  // colour from the row (`background: inherit`), and a
                  // transparent row would let the scrolling columns show
                  // through them. Hover and the ticked tint still win over it.
                  //
                  // `last:[&>td]:border-b-0` matters as much: a frozen cell
                  // paints over the row's own bottom border and has to redraw
                  // it, so without this the LAST row keeps a stub of divider
                  // under the identity columns and nowhere else.
                  //
                  // EVERY ONE OF THESE BACKGROUNDS IS OPAQUE. The hover tint
                  // used to be `bg-surface-soft/60` — 60% alpha — and a frozen
                  // cell inheriting it was 60% alpha as well, so the columns
                  // sliding underneath showed straight through whichever row
                  // the pointer was on. Nothing translucent may go here.
                  className="border-b border-hairline-soft bg-white transition-colors last:border-0 last:[&>td]:border-b-0 hover:bg-surface-soft data-[picked]:bg-[color:var(--color-altus-red-wash,#fdf0f0)]"
                >
                  <Td className={`pl-3 z-[1] border-b border-hairline-soft ${idCol(freezeLeft.tick, ID_W.tick).className}`} style={idCol(freezeLeft.tick, ID_W.tick).style}>
                    <input
                      type="checkbox"
                      checked={picked.has(n.id)}
                      onChange={() => togglePick(n.id)}
                      aria-label={`Select ${n.name || row.ownRef}`}
                      className="size-3.5 cursor-pointer accent-[#E10600]"
                    />
                  </Td>
                  {/* One No + Name pair per ancestor, each keeping ITS OWN
                      level's typography — so a Sub-Action row still reads as
                      "this sub-action, inside that action, inside that result"
                      rather than as five names of equal weight. */}
                  {row.ancestors.map((a, i) => (
                    <React.Fragment key={a.kind}>
                      <Td
                        className={`z-[1] border-b border-hairline-soft ${idCol(freezeLeft.ancestors[i]!.ref, ID_W.ref, i < freezeThrough.ancestors).className}`}
                        style={idCol(freezeLeft.ancestors[i]!.ref, ID_W.ref, i < freezeThrough.ancestors).style}
                      >
                        <Ref>{a.ref}</Ref>
                      </Td>
                      <Td
                        className={`z-[1] border-b border-hairline-soft ${idCol(freezeLeft.ancestors[i]!.name, ID_W.name, i < freezeThrough.ancestors).className}`}
                        style={idCol(freezeLeft.ancestors[i]!.name, ID_W.name, i < freezeThrough.ancestors).style}
                      >
                        <span
                          style={levelTextStyle(a.kind)}
                          className="block truncate text-ink-strong"
                          title={a.name}
                        >
                          {a.name}
                        </span>
                      </Td>
                    </React.Fragment>
                  ))}

                  <Td className={`z-[1] border-b border-hairline-soft ${idCol(freezeLeft.ownRef, ID_W.ref, freezeThrough.own).className}`} style={idCol(freezeLeft.ownRef, ID_W.ref, freezeThrough.own).style}>
                    <Ref>{row.ownRef}</Ref>
                  </Td>
                  <Td className={`z-[1] border-b border-hairline-soft ${idCol(freezeLeft.ownName, ID_W.ownName, freezeThrough.own).className}`} style={idCol(freezeLeft.ownName, ID_W.ownName, freezeThrough.own).style}>
                    {/* The level's own typography — Milestone bold + CAPS,
                        Result italic — from the one LEVEL_STYLE table. */}
                    <span
                      style={levelTextStyle(n.kind)}
                      className="block truncate text-ink-strong"
                      title={n.name}
                    >
                      {n.name}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className="block max-w-[260px] truncate text-[12.5px] font-medium text-ink-muted"
                      title={n.description ?? ""}
                    >
                      {n.description || <span className="text-ink-subtle">—</span>}
                    </span>
                  </Td>

                  <Td>
                    <PlanStatusCell node={n} actor={actor} linkedToTask={false} />
                  </Td>

                  {showsSchedule && (
                    <>
                      <Td>
                        <DateText value={n.startsAt} />
                      </Td>
                      <Td>
                        <DateText value={n.endsAt} />
                      </Td>
                      <Td>
                        {/* Always derived from the two dates — never stored, so it
                            cannot disagree with its own endpoints. */}
                        {days == null ? (
                          <span className="text-[12px] font-medium text-ink-subtle">—</span>
                        ) : (
                          <span
                            className="text-[12.5px] font-semibold tabular-nums text-ink-strong"
                            title={`${formatPlanDate(n.startsAt)} → ${formatPlanDate(n.endsAt)}, both days counted`}
                          >
                            {days} {days === 1 ? "day" : "days"}
                          </span>
                        )}
                      </Td>
                    </>
                  )}

                  {/* An action / sub-action has no completion percentage —
                      PlanProgressCell renders a dash for one, because its
                      STATUS is its completion. That column would be a column of
                      dashes, so the executable registers show the WMS record
                      instead: the same task WMS lists, opened in the same
                      drawer, carrying Start/End time, Repeat, the timer and the
                      approval trail. Nothing is reimplemented here. */}
                  {executable ? (
                    <Td>
                      {n.task ? (
                        <button
                          type="button"
                          onClick={() => openTask(n.task!.id, n.id)}
                          title="Open the WMS task — schedule, repeat, timer, approvals"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2 py-1 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                        >
                          <SquareArrowOutUpRight size={12} strokeWidth={2.3} aria-hidden />
                          Open
                        </button>
                      ) : (
                        <span
                          className="text-[11.5px] font-medium text-ink-subtle"
                          title="No WMS task yet — give the row an owner and a date to schedule it"
                        >
                          Not scheduled
                        </span>
                      )}
                    </Td>
                  ) : (
                    <Td>
                      {/* The rollup column to the right IS the child count,
                          so the cell does not repeat it. */}
                      <PlanProgressCell node={n} canRecord={canRecord} showChildCount={false} />
                    </Td>
                  )}

                  <Td>
                    <RollupCell completion={row.rollup} childLabel={`${KIND_LABEL[rollupKind].toLowerCase()}s`} />
                  </Td>

                  <Td>
                    <PlanAttachmentCell
                      nodeId={n.id}
                      initialCount={attachmentCounts[n.id] ?? 0}
                      canManage
                    />
                  </Td>

                  <Td>
                    <PlanLinksCell
                      links={n.links ?? []}
                      label={n.name || row.ownRef}
                      nodeId={n.id}
                      canManage={canManage}
                    />
                  </Td>

                  {/* Initiator Notes, from the ONE record that holds them: the
                      linked task on an executable row, the plan row itself on a
                      container. Never both — an action's notes live on the task
                      because the task IS the record, and a plan-side copy would
                      be free to disagree with the task drawer showing the same
                      field. Truncated with the full text on hover, like
                      Description. */}
                  <Td className="pr-3">
                    {(() => {
                      const notes = n.task ? n.task.notes : n.notes;
                      return notes ? (
                        <span
                          className="block max-w-[260px] truncate text-[12.5px] font-medium text-ink-muted"
                          title={notes}
                        >
                          {notes}
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium text-ink-subtle">—</span>
                      );
                    })()}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ONE dialog, reopened on whichever level was clicked. `key` remounts it
          per level so its internal kind/parent state starts clean rather than
          carrying the previous level's half-filled chain. */}
      {creating && (
        <NewNodeDialog
          key={creating}
          tree={tree}
          employees={employees}
          canManage={canManage}
          initialKind={creating}
          open
          onOpenChange={(v) => !v && setCreating(null)}
          onCreated={() => { setCreating(null); router.refresh(); }}
        />
      )}
      {/* Bulk upload, opening on the level this register lists — the table you
          are looking at is the answer to "fifty of what?". */}
      {bulkKind && (
        <PlanBulkUpload
          key={bulkKind}
          tree={tree}
          employees={employees}
          initialKind={bulkKind}
          open
          onOpenChange={(v) => !v && setBulkKind(null)}
          onDone={() => { setBulkKind(null); router.refresh(); }}
        />
      )}

      {/* The SAME edit dialog the hierarchy board opens, not a second one — so
          a milestone edited from the register and one edited from the tree go
          through one `updatePlanNode` call with one set of rules. */}
      {editing && (
        <EditDialog
          target={editing}
          employees={employees}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setPicked(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}


/* ---------------------------------------------------------------- helpers */

/**
 * The rollup cell — "3.5/10" over "3.5 out of 10 results are completed".
 *
 * The decimal is never rounded away: `formatCompleted` trims to at most two
 * places, so 2.25 stays 2.25 rather than collapsing to 2.3 or 2.
 */
function RollupCell({ completion, childLabel }: { completion: Completion; childLabel: string }) {
  if (completion.total === 0) {
    return <span className="text-[12px] font-medium text-ink-subtle">No {childLabel} yet</span>;
  }
  // ONE LINE, not two stacked ones. The fraction and the sentence say the
  // same thing at two levels of detail, so they read fine side by side — and
  // stacked they were the tallest cell in the table, setting the height of
  // every row whether or not it had a rollup.
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[13px] font-bold tabular-nums text-ink-strong">
        {formatCompletion(completion)}
      </span>
      <span className="text-[11px] font-medium text-ink-muted">
        {formatCompleted(completion.completed)} of {completion.total} {childLabel} done
      </span>
    </span>
  );
}

/** A plain WMS-record field — the label, or a dash when the row has no task. */
/** DD-MMM-YYYY, blank when the date isn't set. */
function DateText({ value }: { value: string | null }) {
  const text = formatPlanDate(value);
  return text ? (
    <span className="text-[12.5px] font-semibold tabular-nums text-ink-strong">{text}</span>
  ) : (
    <span className="text-[12px] font-medium text-ink-subtle">—</span>
  );
}

/** A short reference chip — P1, M2, RA. Never the long traceability path. */
function Ref({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-soft px-1.5 py-0.5 text-[11.5px] font-black tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

function Th({
  children, className = "", style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className={`${className} px-2.5 py-2 text-left text-[11px] font-bold uppercase leading-tight tracking-[0.09em] text-ink-subtle`}
      style={style}
    >
      {children}
    </th>
  );
}

function SortTh({
  children,
  className = "",
  style,
  active,
  asc,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <th className={`${className} px-2.5 py-2 text-left`} style={style}>
      <button
        type="button"
        onClick={onClick}
        title={active ? (asc ? "Sorted ascending — click for descending" : "Sorted descending — click for plan order") : "Sort by this column"}
        className={`inline-flex items-start gap-1 text-left text-[11px] font-bold uppercase leading-tight tracking-[0.09em] transition-colors ${
          active ? "text-ink-strong" : "text-ink-subtle hover:text-ink-strong"
        }`}
      >
        {children}
        <ArrowUpDown size={11} className={active ? "opacity-90" : "opacity-40"} aria-hidden />
      </button>
    </th>
  );
}

function Td({
  children, className = "", style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`${className} whitespace-nowrap px-2.5 py-1.5 align-middle`} style={style}>
      {children}
    </td>
  );
}

/** Whole days between the row's two dates, inclusive — or null. */
function daysOf(n: PlanRow): number | null {
  return durationDays(n.startsAt, n.endsAt);
}

/** Nulls sort last in both directions — an unset date is not "earliest". */
function cmpDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

function cmpNum(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}
