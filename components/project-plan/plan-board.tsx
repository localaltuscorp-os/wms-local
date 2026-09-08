"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Copy, ArrowUp, ArrowDown,
  Loader2, CalendarCheck2, CircleDashed, FolderPlus, SlidersHorizontal,
  Maximize2, Minimize2, X, Layers, Search, Download, ArrowUpDown,
  Columns3, Check, GripVertical, Pencil, ChevronUp, Eye, List, LayoutGrid, Table2, Link2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  KIND_LABEL, CHILD_KIND, KIND_DEPTH, refFor, fullRefFor, isExecutable, hasSchedule,
  combineDateTime, toHm, toYmd,
  levelTextStyle, formatPlanDate, durationDays, type PlanKind,
} from "@/lib/project-plan/levels";
import { describeProgress, toPercent, nodeFraction, formatCompletion, milestoneCompletion } from "@/lib/project-plan/progress";
import { PLAN_STATUS_LABEL, effectivePlanStatus } from "@/lib/project-plan/status";
import {
  createPlanNode, updatePlanNode, deletePlanNode, duplicatePlanNode,
  movePlanNode, planDeleteImpact,
} from "@/app/(app)/project-plan/actions";
import { PRIORITY_LABELS, TASK_PRIORITIES, type TaskStatus, type TaskPriority } from "@/db/enums";
// The SAME three cells the WMS task table renders. Reused rather than restyled
// so a status chip, a priority flag and a doer name look and behave identically
// in both places — and so an edit here writes through the same actions.
import { InlineDoerCell, InlinePriorityCell, PriorityPill } from "@/components/tasks/inline-edit-cells";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { BulkActionBar } from "@/components/tasks/bulk-action-bar";
import { PlanKanban, kanbanCards } from "./plan-kanban";
import { NewNodeDialog } from "./new-node-dialog";
import { NewItemButtons, usePlanCreateShortcuts } from "./new-item-buttons";
import { PlanBulkUpload } from "./plan-bulk-upload";
import { useRememberPlanNode } from "./use-recent-plan";
import { PlanStatusCell, planActorFor } from "./plan-status-cell";
import { PlanAttachmentPanel } from "./plan-attachment-cell";
import { normaliseUrl } from "./plan-links-cell";
import { PlanProgressCell } from "./plan-progress-cell";

/**
 * Project Plan — the hierarchy table.
 *
 * One compact enterprise table carrying six levels (Project → Milestone →
 * Result → Action → Sub-Action → Sub-Sub-Action). The REF column is DERIVED on
 * every render from each row's position among its siblings, never stored, so a
 * delete or a move renumbers the whole branch without a write.
 *
 * Only expanded branches are flattened into rows, so a project with thousands
 * of descendants costs nothing until you open the branch that holds them.
 */

/** Serialised shape — dates cross the server boundary as strings. */
export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  /** Initiator Notes, on a CONTAINER row. An executable row keeps its own on
   *  the linked task below — one record, not two copies of it. */
  notes: string | null;
  kind: PlanKind;
  parentId: string | null;
  /** Working-flow status on a container row — an executable row's lives on its
   *  task. Null until someone sets one (and on every row without migration
   *  0204, which the read side degrades to rather than failing). */
  status: string | null;
  /** The owner/admin verdict, layered OVER `status` rather than replacing it. */
  approvalStatus: string | null;
  /** Recorded partial completion 0–100; null = derive it from the work below. */
  progressPercent: number | null;
  /** The CONTAINER row's own priority (migration 0213). Null on an executable
   *  row, whose priority of record is its task's. */
  priority: TaskPriority | null;
  /** Reference links (migration 0214). Empty when there are none. */
  links: string[];
  /** "YYYY-MM-DD" */
  targetDate: string | null;
  durationMinutes: number | null;
  /** ISO instants */
  startsAt: string | null;
  endsAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  task: {
    id: string;
    status: TaskStatus;
    statusLabel: string;
    /** Needed by the Doer cell, which writes through to the task. */
    doerId: string;
    doerName: string | null;
    priority: TaskPriority;
    /** ISO — the optimistic-lock token setTaskStatus needs. */
    updatedAt: string;
    onCalendar: boolean;
    /** A work session is open right now — the Start/Stop control's state. */
    timerRunning: boolean;
    /** The WMS list's Client / Subject labels. */
    client: string | null;
    subject: string | null;
    /** Initiator Notes — the task IS the record on an executable row. */
    notes: string | null;
    /** ISO — "Age" counts days from here, as the WMS list does. */
    createdAt: string;
    /** ISO — the WMS list's Due column. */
    dueAt: string;
  } | null;
  children: PlanRow[];
}

export interface EmployeeOption {
  id: string;
  name: string;
}

interface Props {
  /** Which of the five level views this route is — see LEVEL_VIEWS. The level
   *  lives in the URL, not in state, so the sidebar and the pill agree. */
  level: PlanLevel;
  tree: PlanRow[];
  employees: EmployeeOption[];
  canManage: boolean;
  /** Admin-editable status labels, straight from `status_settings` — the same
   *  map the WMS table reads, so a renamed status changes on both screens at
   *  once. Used by the bulk bar's status dropdown; the per-row chips get their
   *  own vocabulary from lib/project-plan/status.ts. */
  labels: Record<TaskStatus, string>;
  isAdmin: boolean;
  /** The viewer, and everyone who reports to them — the two inputs the status
   *  picker needs to work out what this person may set on a given row. Exactly
   *  what `actorFor()` assembles on the server before it validates a write. */
  me: { id: string; isAdmin: boolean };
  downline: string[];
  /** Which view the route lands on. The List / Kanban toggle then takes over —
   *  this only decides where you START, so /project-plan/kanban opens on the
   *  board and every level route opens on the table. */
  initialView?: "list" | "kanban";
}

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const ACCENT_SOFT = "#F8C8C7";

/**
 * A multiplier over the brief's own font sizes (12 / 12 / 10 / 10 / 9).
 *
 * 1 = exactly what the brief specifies, which is what ships. It exists as a
 * named constant rather than as the number 1 sprinkled through the render so
 * that if those sizes ever read too small against the rest of the app's
 * chrome, ONE edit here rescales every level at once and keeps the steps the
 * brief spaced between them — rather than six numbers drifting apart.
 */
const TYPE_SCALE = 1;

/**
 * Every column, in default order. All of them can be DRAGGED; the three marked
 * `fixed` cannot be HIDDEN — a table with no name, no controls and no reference
 * is a dead end the user then has to work out how to escape.
 *
 * The row indent (and the expand caret) travels with `ref`, so dragging that
 * column moves the hierarchy's visual spine with it rather than stranding the
 * indent on whatever happens to be leftmost.
 */
const ALL_COLUMNS = [
  { key: "ref", label: "Ref", width: "w-[124px]", fixed: true },
  { key: "controls", label: "Controls", width: "w-[156px]", fixed: true },
  { key: "name", label: "Result / Action", width: "", fixed: true },
  { key: "owner", label: "Owner", width: "w-[176px]", fixed: false },
  // Status and Progress work on EVERY level — one vocabulary for the module,
  // per brief §6/§8. Where the value lands differs by level, but that is
  // `setPlanNodeStatus`'s business, not this table's.
  { key: "status", label: "Status", width: "w-[188px]", fixed: false },
  { key: "progress", label: "Progress", width: "w-[136px]", fixed: false },
  // The two task-side columns. They render only on executable rows, because a
  // Project or a Milestone has no task to carry a doer or a flag.
  //
  // There is deliberately NO "Doer Status" column here. The Status column above
  // already IS the row's status at every level: on an executable row it reads
  // and writes the linked task's status (see setPlanNodeStatus), so a second
  // chip showed the same value twice with two different vocabularies — the
  // module's eleven statuses beside WMS's six. The WMS column below still says
  // whether a row is scheduled at all.
  { key: "doer", label: "Doer", width: "w-[180px]", fixed: false },
  { key: "priority", label: "Priority", width: "w-[148px]", fixed: false },
  // NO TIMER COLUMN. Start / Stop lived here and was removed — an executable
  // row IS a WMS task, so its timer is one click away in the task drawer (the
  // WMS chip) and on the WMS list itself, both driving the same session ledger.
  // A plan is read here far more often than a stopwatch is pressed.
  { key: "target", label: "Target date", width: "w-[156px]", fixed: false },
  // Start / End / Days — brief §4. The dates are the DAY part of starts_at /
  // ends_at (the From / To columns edit the time of day on the same two
  // columns), and Days is derived from the pair so it can never disagree with
  // its own endpoints.
  { key: "startDate", label: "Start date", width: "w-[150px]", fixed: false },
  { key: "endDate", label: "End date", width: "w-[150px]", fixed: false },
  // DUE DATE, beside End date. Read-only, and read from whichever record owns
  // it: the linked task on an executable row — that is the date WMS lists and
  // the calendar honours — and the row's own target date on a container, which
  // has no task. The two agree while the plan drives the task; they part only
  // when someone moves a due date in WMS without touching the plan, and seeing
  // that is the point of the column. The editable "Target date" column above is
  // the plan side of the same idea, so on containers the two read alike — hide
  // one from the Columns menu if that is noise.
  { key: "due", label: "Due date", width: "w-[150px]", fixed: false },
  { key: "days", label: "Days", width: "w-[84px]", fixed: false },
  // NO DURATION COLUMN. The effort estimate ("2h 30m") was a column here and
  // was removed: Days already answers "how long does this run for" from the two
  // dates beside it, and the estimate is still edited in the row's Edit dialog
  // and on the task itself. It remains on `project_nodes.duration_minutes` —
  // this drops a column, not a field.
  { key: "from", label: "From", width: "w-[144px]", fixed: false },
  { key: "to", label: "To", width: "w-[144px]", fixed: false },
  { key: "wms", label: "WMS", width: "w-[148px]", fixed: false },
  { key: "description", label: "Description", width: "w-[280px]", fixed: false },
] as const;

type ColKey = (typeof ALL_COLUMNS)[number]["key"];

/** The hideable ones — what the Columns menu's tick boxes actually control. */
const OPTIONAL_COLUMNS = ALL_COLUMNS.filter((c) => !c.fixed);

const ALL_COLS = new Set<ColKey>(OPTIONAL_COLUMNS.map((c) => c.key));

/**
 * Off on arrival — everything the Columns menu can bring back in one click.
 *
 * The table now carries the whole of brief §4 (status, progress, both dates,
 * days, description) plus the task-side columns, which is more than fits on any
 * screen at once. These four are the refinements rather than the headline: the
 * time-of-day pair narrows dates people mostly read as days, and Description is
 * a paragraph in a row of short cells. Everything the brief asks to SEE —
 * Project No, Name, Status, Start, End, Days, Progress, Milestone completion —
 * is visible without opening a menu.
 */
const HIDDEN_BY_DEFAULT: ReadonlySet<ColKey> = new Set<ColKey>([
  "from", "to", "description", "wms",
]);

const DEFAULT_COLS = new Set<ColKey>(
  [...ALL_COLS].filter((k) => !HIDDEN_BY_DEFAULT.has(k)),
);
const DEFAULT_COL_ORDER: ColKey[] = ALL_COLUMNS.map((c) => c.key);
const COL_META = new Map<ColKey, (typeof ALL_COLUMNS)[number]>(
  ALL_COLUMNS.map((c) => [c.key, c]),
);

type SortKey = "position" | "name" | "target" | "owner";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "position", label: "Plan order" },
  { value: "name", label: "Name A–Z" },
  { value: "target", label: "Target date" },
  { value: "owner", label: "Owner" },
];

/**
 * Keep a row when it matches, or when anything beneath it does — otherwise a
 * filter would hide the very parents that give a hit its context. Returns new
 * node objects rather than mutating, so the original tree stays intact.
 */
function pruneBy(nodes: PlanRow[], keep: (n: PlanRow) => boolean): PlanRow[] {
  const out: PlanRow[] = [];
  for (const n of nodes) {
    const kids = pruneBy(n.children, keep);
    if (keep(n) || kids.length > 0) out.push({ ...n, children: kids });
  }
  return out;
}

/** The header chips: what each one counts, and what clicking it narrows to. */
const CHIPS = [
  { key: "total", label: "Total", tone: "#334155", match: () => true },
  { key: "project", label: "Projects", tone: "#E10600", match: (n: PlanRow) => n.kind === "project" },
  { key: "milestone", label: "Milestones", tone: "#7C3AED", match: (n: PlanRow) => n.kind === "milestone" },
  { key: "result", label: "Results", tone: "#0891B2", match: (n: PlanRow) => n.kind === "result" },
  { key: "actions", label: "Actions", tone: "#16A34A", match: (n: PlanRow) => isExecutable(n.kind) },
  { key: "inWms", label: "In WMS", tone: "#15803D", match: (n: PlanRow) => isExecutable(n.kind) && !!n.task },
  { key: "unscheduled", label: "Not scheduled", tone: "#94A3B8", match: (n: PlanRow) => isExecutable(n.kind) && !n.task },
] as const;

type ChipKey = (typeof CHIPS)[number]["key"];

/**
 * The five level views, one per sidebar item — and the SAME five the segmented
 * pill offers, because they are one concept with two controls.
 *
 * The level lives in the URL rather than in component state. That is what lets
 * the sidebar, the pill and the browser's Back button agree, and it means a
 * link to "the results view" is a link someone can send.
 *
 * `kind` is what the level narrows the tree to; `null` on projects means the
 * whole plan, since a project view with its milestones hidden is just a list.
 */
export type PlanLevel = "projects" | "milestones" | "results" | "actions" | "sub-actions";

const LEVEL_VIEWS: Array<{
  level: PlanLevel;
  label: string;
  href: string;
  kind: PlanKind | null;
}> = [
  { level: "projects",    label: "Project",    href: "/project-plan",              kind: null },
  { level: "milestones",  label: "Milestone",  href: "/project-plan/milestones",   kind: "milestone" },
  { level: "results",     label: "Results",    href: "/project-plan/results",      kind: "result" },
  { level: "actions",     label: "Actions",    href: "/project-plan/actions",      kind: "action" },
  { level: "sub-actions", label: "Sub-Actions", href: "/project-plan/sub-actions", kind: "sub_action" },
];

const LEVEL_KIND: Record<PlanLevel, PlanKind | null> = Object.fromEntries(
  LEVEL_VIEWS.map((v) => [v.level, v.kind]),
) as Record<PlanLevel, PlanKind | null>;

/** How many rows of a given kind the whole tree holds — the pill's counts. */
function countKind(nodes: PlanRow[], kind: PlanKind | null): number {
  if (kind === null) return nodes.length;
  let n = 0;
  const walk = (list: PlanRow[]) => {
    for (const r of list) {
      if (r.kind === kind) n++;
      walk(r.children);
    }
  };
  walk(nodes);
  return n;
}

/**
 * Count over the WHOLE tree, not the rendered rows.
 *
 * This is the difference between a true number and a misleading one: results
 * start collapsed, so their actions are not rendered — counting rendered rows
 * reported "0 Actions" on a plan that had plenty. The chips describe the plan;
 * the table shows as much of it as you have opened.
 */
function countTree(nodes: PlanRow[]): Record<ChipKey, number> {
  const out = { total: 0, project: 0, milestone: 0, result: 0, actions: 0, inWms: 0, unscheduled: 0 };
  const walk = (ns: PlanRow[]) => {
    for (const n of ns) {
      for (const c of CHIPS) if (c.match(n)) out[c.key]++;
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Sort every sibling run, all the way down. "position" is the stored plan
 *  order, so it short-circuits and leaves the server's ordering alone. */
function sortTree(nodes: PlanRow[], key: SortKey): PlanRow[] {
  if (key === "position") return nodes;
  const cmp = (a: PlanRow, b: PlanRow): number => {
    if (key === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (key === "target") {
      // Undated rows sort last — they are the ones without a commitment yet,
      // and burying them under the dated work is the wrong way round.
      if (!a.targetDate && !b.targetDate) return 0;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    }
    return (a.ownerName ?? "\uffff").localeCompare(b.ownerName ?? "\uffff", undefined, { sensitivity: "base" });
  };
  return [...nodes].sort(cmp).map((n) => ({ ...n, children: sortTree(n.children, key) }));
}

/** RFC-4180 cell: quote when the value carries a comma, quote or newline. */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** What the detail dialog needs: the row plus the two things only the flatten
 *  pass knows — its derived REF and its ancestor names. */
export interface DetailTarget {
  node: PlanRow;
  ref: string;
  /** The concatenated ancestor path — P3M3RDA5SA1. Traceability only: it is
   *  shown in the detail dialog and the export, never in a table cell. */
  fullRef: string;
  path: string[];
}

/** One flattened, visible row: the node plus everything the render needs. */
interface FlatRow {
  node: PlanRow;
  depth: number;
  /** The SHORT label the table shows — P3, M1, RD, A5, SA5.1. */
  ref: string;
  /** The long unique path — P3M3RDA5SA1. Derived beside `ref` from the same
   *  sibling position, so the two can never describe different rows. Kept off
   *  the table on purpose (brief §3): a column of these is unreadable. */
  fullRef: string;
  hasChildren: boolean;
  /** Position among siblings, for the disabled state on the move buttons. */
  isFirst: boolean;
  isLast: boolean;
  /** Ancestor names, outermost first — the hover card's breadcrumb. */
  path: string[];
}

function flatten(
  nodes: PlanRow[],
  collapsed: Set<string>,
  parentRef: string | null,
  out: FlatRow[],
  parentPath: string[] = [],
  parentFullRef: string | null = null,
): void {
  nodes.forEach((node, i) => {
    const ref = refFor(node.kind, i + 1, parentRef);
    const fullRef = fullRefFor(node.kind, i + 1, parentFullRef);
    const hasChildren = node.children.length > 0;
    out.push({
      node,
      depth: KIND_DEPTH[node.kind],
      ref,
      fullRef,
      hasChildren,
      isFirst: i === 0,
      isLast: i === nodes.length - 1,
      path: parentPath,
    });
    if (hasChildren && !collapsed.has(node.id)) {
      flatten(node.children, collapsed, ref, out, [...parentPath, node.name], fullRef);
    }
  });
}

/**
 * What starts closed. Projects and milestones stay open, so the structural
 * skeleton is visible on arrival; everything from Result down starts collapsed.
 *
 * This is the guard against the brief's own worst case — a project with
 * hundreds of actions and thousands of sub-sub-actions. Rendering the whole
 * tree on first paint would put every one of those rows in the DOM before the
 * user has asked for a single one; collapsing at depth ≥ 2 bounds the initial
 * table to projects + milestones + results, and each branch costs nothing until
 * it is opened. Computed ONCE (useState initialiser): after that the set is the
 * user's, so a refresh from an edit can never re-close what they opened, and a
 * newly added row — absent from the set — is visible immediately.
 */
function initialCollapsed(nodes: PlanRow[]): Set<string> {
  const out = new Set<string>();
  const walk = (ns: PlanRow[]) => {
    for (const n of ns) {
      if (n.children.length > 0) {
        if (KIND_DEPTH[n.kind] >= 2) out.add(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export function PlanBoard({ level, tree, employees, canManage, labels, isAdmin, me, downline, initialView = "list" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  /** The viewer's downline as a set — rebuilt only when the list itself does,
   *  because every row's status picker asks it two questions on every render. */
  const downlineSet = React.useMemo(() => new Set(downline), [downline]);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => initialCollapsed(tree));
  const [busy, setBusy] = React.useState<string | null>(null);
  /**
   * `pending` matters, not just `startTransition`: it stays true through the
   * `router.refresh()` at the end of every write, which is the window the row
   * controls have to stay shut for. See `run` below.
   */
  const [pending, startTransition] = React.useTransition();
  /** One tree write at a time — see `run`. */
  const writeLock = React.useRef(false);

  // Toolbar state.
  const [projectId, setProjectId] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("position");
  const [cols, setCols] = React.useState<Set<ColKey>>(() => new Set(DEFAULT_COLS));
  const [colOrder, setColOrder] = React.useState<ColKey[]>(DEFAULT_COL_ORDER);
  const [chip, setChip] = React.useState<ChipKey | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // Default ALL: this is a tree, and silently hiding branches behind a page
  // size the user never chose is a good way to make a plan look incomplete.
  const [rowLimit, setRowLimit] = React.useState<number | "all">("all");

  /**
   * Column drag, shared by the Columns menu and the table header itself.
   *
   * Pointer events rather than native HTML5 drag: a `<th>` containing form-ish
   * children and living inside a scroll container does not start a native drag
   * reliably, and the native ghost image is unusable on a full-width header.
   * A ref mirrors the order so the move handler reads the live array, never the
   * one captured when the gesture began.
   */
  const [dragCol, setDragCol] = React.useState<ColKey | null>(null);
  const colOrderRef = React.useRef(colOrder);
  React.useEffect(() => { colOrderRef.current = colOrder; }, [colOrder]);
  const dragColRef = React.useRef<ColKey | null>(null);

  React.useEffect(() => {
    // End the drag wherever the pointer is released, so letting go outside the
    // table cannot leave a column stuck mid-move.
    const stop = () => { dragColRef.current = null; setDragCol(null); };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const startColDrag = React.useCallback((key: ColKey) => {
    dragColRef.current = key;
    setDragCol(key);
  }, []);

  const crossCol = React.useCallback((target: ColKey) => {
    const from = dragColRef.current;
    if (!from || from === target) return;
    const cur = colOrderRef.current;
    const i = cur.indexOf(from);
    const j = cur.indexOf(target);
    if (i < 0 || j < 0) return;
    const next = [...cur];
    next.splice(i, 1);
    next.splice(j, 0, from);
    colOrderRef.current = next;
    setColOrder(next);
  }, []);

  /** The columns actually rendered, in the user's chosen order. */
  const shownCols = React.useMemo(
    () => colOrder.filter((k) => COL_META.get(k)!.fixed || cols.has(k)),
    [colOrder, cols],
  );
  const [fullscreen, setFullscreen] = React.useState(false);
  const [detail, setDetail] = React.useState<DetailTarget | null>(null);
  const [editing, setEditing] = React.useState<DetailTarget | null>(null);
  /**
   * The rows the BULK editor is open over — a snapshot taken when Edit is
   * pressed, not a live read of `selected`. Ticking another row behind the
   * dialog must not silently widen what Save is about to write.
   */
  const [bulkEditing, setBulkEditing] = React.useState<DetailTarget[] | null>(null);
  const [view, setView] = React.useState<"list" | "kanban">(initialView);
  /**
   * Open the full WMS record for an executable row.
   *
   * `?task=` is the SAME contract /tasks, the registers and Project Views use,
   * and this page mounts the same drawer — so this is a navigation into an
   * existing screen, not a fourth task editor. `view=tree` is preserved so
   * closing the drawer leaves you on the hierarchy, where you started.
   */
  function onOpenTask(taskId: string, nodeId?: string) {
    // Opening the WMS record behind a row is about as clear a statement as
    // there is about which branch you are working in.
    remember(nodeId);
    router.push(`${pathname}?view=tree&task=${taskId}` as Route);
  }

  // This level's register — the same route without `?view=tree`. Built as a
  // plain string: a template literal cast straight to `Route` makes TS expand
  // the whole typed-routes union (TS2590).
  const registerHref: string =
    LEVEL_VIEWS.find((v) => v.level === level)?.href ?? "/project-plan";
  /** Which level the create dialog is opening on, or null when it is closed.
   *  Replaces the old boolean: the four New-Item boxes each name a level, and
   *  the dialog is seeded with it rather than always opening on Action. */
  const [creating, setCreating] = React.useState<PlanKind | null>(null);
  /** Which level the BULK upload is open on, or null when it is closed. */
  const [bulkKind, setBulkKind] = React.useState<PlanKind | null>(null);

  /**
   * WHERE YOU ARE, remembered.
   *
   * Called from the gestures that mean someone is working somewhere — opening a
   * row, expanding a branch, filtering to a project — and read back by both
   * create dialogs to pre-fill their destination. See lib/project-plan/recent.ts.
   */
  const remember = useRememberPlanNode(tree);

  /** Open a row's detail panel, and remember the branch it sits in. */
  const openDetail = React.useCallback(
    (t: DetailTarget | null) => {
      setDetail(t);
      remember(t?.node.id);
    },
    [remember],
  );

  /**
   * P · M · R · T · S open the matching create dialog. Held back while anything
   * of this board's own is up, so Escape-then-P is the way in rather than a
   * keystroke landing behind a dialog.
   */
  usePlanCreateShortcuts(
    setCreating,
    !creating && !bulkKind && !editing && !bulkEditing && !detail,
  );

  const query = search.trim().toLowerCase();

  /**
   * The tree the CHIPS describe: project filter → search prune → sibling sort.
   * Sorting last means the REF numbers the flatten pass derives always match
   * what is on screen, rather than the stored order.
   */
  const baseTree = React.useMemo(() => {
    let t = projectId === "all" ? tree : tree.filter((p) => p.id === projectId);
    if (query) t = pruneBy(t, (n) => n.name.toLowerCase().includes(query));
    return sortTree(t, sortKey);
  }, [tree, projectId, query, sortKey]);

  const counts = React.useMemo(() => countTree(baseTree), [baseTree]);

  /**
   * …and the tree actually rendered, once the LEVEL and then a chip narrow it.
   *
   * Level first, chip second, because they answer different questions: the
   * level is which view you are on (a route), the chip is a filter inside it.
   *
   * `pruneBy` keeps a row when it matches OR has a kept descendant, so the
   * Results view is not a flat list of results torn out of context — it is the
   * tree with everything below Result trimmed away, each result still sitting
   * under the milestone and project it belongs to. That is what makes the short
   * refs (RA, RB) readable without the full P3M3RD path.
   */
  const visibleTree = React.useMemo(() => {
    const kind = LEVEL_KIND[level];
    let t = kind ? pruneBy(baseTree, (n) => KIND_DEPTH[n.kind] <= KIND_DEPTH[kind]) : baseTree;
    if (chip && chip !== "total") {
      const match = CHIPS.find((c) => c.key === chip)!.match;
      t = pruneBy(t, match);
    }
    return t;
  }, [baseTree, chip, level]);

  const rows = React.useMemo(() => {
    const out: FlatRow[] = [];
    // A search or chip filter that left branches collapsed would hide its own
    // hits, so while one is active every branch is open regardless of the set.
    flatten(visibleTree, query || chip ? new Set<string>() : collapsed, null, out);
    return out;
  }, [visibleTree, collapsed, query, chip]);

  /** Kanban cards — the executable rows of whatever the filters left. */
  const cards = React.useMemo(() => kanbanCards(visibleTree), [visibleTree]);

  /** What actually renders, once the row cap is applied. */
  const shownRows = React.useMemo(
    () => (rowLimit === "all" ? rows : rows.slice(0, rowLimit)),
    [rows, rowLimit],
  );

  const selectedRows = React.useMemo(
    () => shownRows.filter((r) => selected.has(r.node.id)),
    [shownRows, selected],
  );

  /**
   * Tick a row: select it AND open its detail.
   *
   * Both, because the checkbox is asked to do both jobs — the selection bar
   * needs the selection, and the popup is what you wanted a tick to show. The
   * popup is dismissible and the selection survives behind it, so to select
   * several rows you close the popup and carry on ticking. Unticking a row also
   * closes its popup, so the two never disagree about which row is in focus.
   */
  function toggleSelect(id: string) {
    const wasSelected = selected.has(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (wasSelected) {
      setDetail((d) => (d?.node.id === id ? null : d));
      return;
    }
    const row = shownRows.find((r) => r.node.id === id);
    if (row) openDetail({ node: row.node, ref: row.ref, fullRef: row.fullRef, path: row.path });
  }

  /** Header tick: select everything on screen, or clear it. */
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size >= shownRows.length && shownRows.length > 0
        ? new Set()
        : new Set(shownRows.map((r) => r.node.id)),
    );
  }

  /**
   * Run one action over every selected row, in sequence.
   *
   * Sequential, not Promise.all: these writes renumber sibling runs and archive
   * subtrees, so firing them together would have them racing over the same
   * sort_order values. One refresh at the end rather than one per row.
   */
  function bulk(
    label: string,
    fn: (id: string) => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ) {
    const ids = selectedRows.map((r) => r.node.id);
    if (ids.length === 0) return;
    setBusy(`bulk:${label}`);
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
      setSelected(new Set());
      fireToast({
        message: failed
          ? `${done} — ${failed} of ${ids.length} could not be saved.`
          : `${done} (${ids.length}).`,
        type: failed ? "error" : "success",
      });
      router.refresh();
    });
  }

  /**
   * The tasks behind the selection — what every shared dropdown on the bulk bar
   * writes to. Rows that are containers, or executable but not scheduled yet,
   * have no task and are simply absent here; they stay selected for the
   * plan-side actions, which act on the row.
   */
  const selectedTaskIds = React.useMemo(
    () => selectedRows.flatMap((r) => (r.node.task ? [r.node.task.id] : [])),
    [selectedRows],
  );

  function bulkDelete() {
    const n = selectedRows.length;
    const kids = selectedRows.reduce((a, r) => a + countBelow(r.node), 0);
    const lines = [`Delete ${n} selected row${n === 1 ? "" : "s"}?`];
    if (kids > 0) lines.push(`This also removes ${kids} row${kids === 1 ? "" : "s"} beneath them, and archives any linked WMS tasks.`);
    if (!window.confirm(lines.join("\n\n"))) return;
    bulk("delete", (id) => deletePlanNode(id), "Deleted");
  }

  /** Collapse every row at or below `depth` — backs the "show down to…" select. */
  const collapseFrom = React.useCallback((depth: number) => {
    const out = new Set<string>();
    const walk = (ns: PlanRow[]) => {
      for (const n of ns) {
        if (n.children.length > 0) {
          if (KIND_DEPTH[n.kind] >= depth) out.add(n.id);
          walk(n.children);
        }
      }
    };
    walk(visibleTree);
    setCollapsed(out);
  }, [visibleTree]);

  // Esc leaves full screen — the expected way out of any takeover view.
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  function toggle(id: string) {
    // Opening a branch is the commonest "I am working in here" gesture on this
    // screen, and the one that most often precedes a bulk upload into it.
    remember(id);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Every mutation funnels through here: one busy row, one toast, one refresh.
   *
   * The try/catch is not decoration. This app signs you out after 15 minutes
   * idle (IdleTimerClient in the app layout); once that happens the middleware
   * redirects the action POST to /login, which answers with HTML instead of an
   * action payload, and the call REJECTS rather than returning `{ok:false}`.
   * Without this, that rejection escapes the transition and the error boundary
   * replaces the whole board with "An unexpected response was received from the
   * server" — the work is fine, but the screen looks broken and the real cause
   * (you are logged out) is nowhere on it. So: say what happened, then refresh,
   * which lets the middleware take them to the login page.
   */
  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMessage?: string,
  ) {
    // A ref, not the `busy` state: two clicks landing in the SAME tick both see
    // the old state and both fire, which is how one press of "+" produced two
    // rows. A ref is written synchronously, so the second click sees the lock
    // the first one set. The disabled prop is the visible half of this; the lock
    // is the half that cannot be raced.
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(key);
    startTransition(async () => {
      let res: { ok: boolean; error?: string };
      try {
        res = await fn();
      } catch {
        writeLock.current = false;
        setBusy((b) => (b === key ? null : b));
        fireToast({
          message: "Couldn't save — your session may have expired. Sign in again and retry.",
          type: "error",
        });
        router.refresh();
        return;
      }
      if (!res.ok) {
        writeLock.current = false;
        setBusy((b) => (b === key ? null : b));
        fireToast({ message: res.error ?? "Couldn't save.", type: "error" });
        return;
      }
      if (okMessage) fireToast({ message: okMessage, type: "success" });
      // REFRESH FIRST, then release the row.
      //
      // Clearing `busy` before this re-enabled every control the instant the
      // server answered — but the new row is not on screen until the refresh
      // lands, so the table still looked untouched. A second click in that gap
      // made a second row: press + once on P1, get two milestones. The refresh
      // runs inside this transition, so `pending` covers the same window for
      // anything gated on it.
      router.refresh();
      writeLock.current = false;
      setBusy((b) => (b === key ? null : b));
    });
  }

  function addChild(parent: PlanRow) {
    const kind = CHILD_KIND[parent.kind];
    if (!kind) return;
    // Opening the parent first means the new row is visible the moment it lands.
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parent.id);
      return next;
    });
    run(`add:${parent.id}`, () => createPlanNode({ kind, parentId: parent.id }));
  }

  /**
   * A new PROJECT — the one level the table itself could not add.
   *
   * Every row's "+" adds a CHILD, which is the right gesture for every level
   * that has a parent and no gesture at all for the level that does not: the
   * only way to a new project was the toolbar box above the table, which is
   * easy to miss when you are reading the rows. So the table gets the same
   * affordance for the root that each row already has for its children,
   * appended under the last project where the new row actually appears.
   *
   * Same inline create as "+", not the dialog — a project lands as an untitled
   * row you rename in place, exactly like a milestone added from its parent.
   */
  function addProject() {
    run("add:project", () => createPlanNode({ kind: "project" }));
  }

  /** Export exactly what is on screen — same filter, search, sort and columns.
   *  An export that quietly returned the whole tree would not match the table
   *  the user is looking at, which is the only thing they asked for. */
  const exportCsv = React.useCallback(() => {
    const csvCols = shownCols.filter((k) => k !== "controls");
    // Full Ref leads the export even though it is never a table column: a
    // spreadsheet is exactly where P3M3RDA5SA1 earns its keep, because a row
    // torn out of the tree has nothing else that identifies it uniquely.
    const header = ["Full Ref", "Level", "Path", ...csvCols.map((k) => COL_META.get(k)!.label)];
    const body = rows.map((r) => {
      const n = r.node;
      const hm = (iso: string | null) =>
        iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
      const val: Record<ColKey, string> = {
        ref: r.ref,
        controls: "",
        name: n.name,
        owner: n.ownerName ?? "",
        // Same fallback the Doer column draws: a container has no task, so the
        // person on it is its owner.
        doer: n.task?.doerName ?? n.ownerName ?? "",
        priority: n.task
          ? PRIORITY_LABELS[n.task.priority] ?? ""
          : n.priority
            ? PRIORITY_LABELS[n.priority] ?? ""
            : "",
        target: n.targetDate ? formatPlanDate(n.targetDate) : "",
        due: n.task
          ? formatPlanDate(n.task.dueAt)
          : n.targetDate
            ? formatPlanDate(n.targetDate)
            : "",
        from: hm(n.startsAt),
        to: hm(n.endsAt),
        wms: n.task ? n.task.statusLabel : isExecutable(n.kind) ? "Not scheduled" : "",
        // The same three derivations the screen shows, from the same functions
        // — so an exported number can never disagree with the cell it came from.
        status: PLAN_STATUS_LABEL[effectivePlanStatus(
          isExecutable(n.kind) && n.task ? n.task.status : n.status,
          n.approvalStatus,
          false,
        )],
        progress: isExecutable(n.kind)
          ? ""
          : n.kind === "project"
            ? `${describeProgress(n).percent}% (${formatCompletion(milestoneCompletion(n))})`
            : `${toPercent(nodeFraction(n))}%`,
        startDate: formatPlanDate(n.startsAt),
        endDate: formatPlanDate(n.endsAt),
        days: String(durationDays(n.startsAt, n.endsAt) ?? ""),
        description: n.description ?? "",
      };
      return [r.fullRef, KIND_LABEL[n.kind], r.path.join(" > "), ...csvCols.map((k) => val[k])];
    });
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    // Leading BOM so Excel opens UTF-8 names correctly rather than as mojibake.
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Project-Plan-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [rows, shownCols]);

  async function remove(node: PlanRow) {
    // This call sits OUTSIDE run(), so it needs the same guard: on an expired
    // session it rejects, and an unhandled rejection here would take the board
    // down before the confirmation dialog ever opened.
    let impact: Awaited<ReturnType<typeof planDeleteImpact>>;
    try {
      impact = await planDeleteImpact(node.id);
    } catch {
      fireToast({
        message: "Couldn't check what this delete affects — your session may have expired. Sign in again.",
        type: "error",
      });
      router.refresh();
      return;
    }
    const childCount = impact.ok ? impact.nodes : 0;
    const taskCount = impact.ok ? impact.tasks : 0;
    const parts = [`Delete ${KIND_LABEL[node.kind].toLowerCase()} “${node.name}”?`];
    if (childCount > 0) parts.push(`This also removes ${childCount} row${childCount === 1 ? "" : "s"} beneath it.`);
    if (taskCount > 0) parts.push(`${taskCount} linked task${taskCount === 1 ? "" : "s"} will be archived and removed from WMS and the calendar.`);
    if (!window.confirm(parts.join("\n\n"))) return;
    run(`del:${node.id}`, () => deletePlanNode(node.id), "Deleted.");
  }

  const board = (
    <section className={fullscreen ? "flex h-full flex-col" : "flex flex-col"}>
      {/* ── Title row — name, the shape of what is on screen, full screen. ── */}
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h1
          className="shrink-0 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.1 }}
        >
          Project Plan
        </h1>

        {/* Count chips — counted over the WHOLE filtered plan, not the rendered
            rows, so a collapsed branch never understates its contents. Click one
            to narrow the table to exactly those rows. */}
        {/* Project | Milestone | Results — the three hierarchy levels, drawn as
            one segmented pill. The remaining chips (Total, Actions, In WMS,
            Not scheduled) stay loose beside it; all of them drive the same
            `chip` filter, so only one narrowing is ever in force. */}
        <LevelTabs level={level} tree={tree} view={view} />

        <div className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((c) => (
            <CountChip
              key={c.key}
              label={c.label}
              n={counts[c.key]}
              tone={c.tone}
              active={chip === c.key}
              // Clicking a chip shows what is inside it; clicking the active one
              // (or Total) goes back to the whole plan.
              onClick={() => setChip((prev) => (prev === c.key || c.key === "total" ? null : c.key))}
            />
          ))}
        </div>

        <button
          onClick={() => setFullscreen((v) => !v)}
          aria-pressed={fullscreen}
          title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft"
        >
          {fullscreen ? <Minimize2 size={14} strokeWidth={2.2} /> : <Maximize2 size={14} strokeWidth={2.2} />}
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </header>

      {/* ── Search row — its own line, with the primary action opposite it. ── */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-hairline-strong bg-white px-3 py-2 transition-colors focus-within:border-[#E10600]">
          <Search size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Local search — projects, milestones, results, actions"
            aria-label="Search the plan"
            className="w-full min-w-0 bg-transparent text-[13.5px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="shrink-0 text-ink-subtle hover:text-ink-strong">
              <X size={14} strokeWidth={2.6} />
            </button>
          )}
        </label>

        {/* The four create boxes, beside the local search — the SAME component
            the register's toolbar renders, so both surfaces offer the same
            levels under the same per-kind permission rule. This replaces the
            old single "New Item" button, which opened this very dialog on
            Action: "+ Action" is that button, and the other three say out loud
            what used to be hidden behind a level picker. */}
        <NewItemButtons onPick={setCreating} onBulkUpload={setBulkKind} className="shrink-0" />
      </div>

      {/* ── Control bar ───────────────────────────────────────────────────────
          One white pill holding every view control: what you are looking at on
          the left, how much of it on the right. Filters narrow the tree, the
          level select drives the collapse set, and the count chip reports what
          is actually rendered — so the bar always describes the table below it. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-hairline-strong bg-white px-3 py-2">
        {/* View toggle — the same List / Kanban pair the Goals board uses. */}
        <div role="group" aria-label="Board view" className="inline-flex shrink-0 overflow-hidden rounded-lg border border-hairline-strong">
          <ViewTab active={view === "list"} onClick={() => setView("list")} icon={<List size={13} strokeWidth={2.4} />}>
            List
          </ViewTab>
          <ViewTab active={view === "kanban"} onClick={() => setView("kanban")} icon={<LayoutGrid size={13} strokeWidth={2.4} />}>
            Kanban
          </ViewTab>
        </div>

        {/* The way back to the REGISTER. The register has always linked here;
            without this the hierarchy was a one-way door — you could reach the
            tree but only the browser's Back button returned you to the table. */}
        <Link
          href={registerHref as Route}
          title={`See every ${LEVEL_KIND[level] ? KIND_LABEL[LEVEL_KIND[level]!].toLowerCase() : "row"} as a table`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
        >
          <Table2 size={13} strokeWidth={2.4} aria-hidden />
          Table view
        </Link>

        {/* NEW PROJECT, in the control bar as well as at the foot of the table.
            The footer button sits where the row appears, which is the right
            place once you are reading rows and the wrong place when the plan is
            long enough that the foot of the table is a scroll away. Both call
            the same `addProject`, and unlike the footer this one is never
            hidden by a filter — the bar is always on screen. */}
        <button
          type="button"
          onClick={addProject}
          disabled={pending}
          title="Add a project — or press P"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-50"
          style={{ borderColor: ACCENT_SOFT, color: ACCENT_DEEP, background: "#FDF0F0" }}
        >
          {busy === "add:project" ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <Plus size={13} strokeWidth={2.8} aria-hidden />
          )}
          New project
        </button>

        <span className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle" aria-hidden>
          <SlidersHorizontal size={16} strokeWidth={2.2} />
        </span>

        <BarSelect
          label="Project"
          value={projectId}
          // Narrowing the board to one project is the plainest statement there
          // is about which project you are in — so it is remembered too.
          onChange={(v) => { setProjectId(v); if (v !== "all") remember(v); }}
          options={[
            { value: "all", label: `All projects (${tree.length})` },
            ...tree.map((p) => ({ value: p.id, label: p.name || "Untitled project" })),
          ]}
        />

        <BarSelect
          label="Show down to"
          icon={<Layers size={14} strokeWidth={2.2} />}
          value=""
          placeholder="Show down to…"
          onChange={(v) => {
            if (v === "all") setCollapsed(new Set());
            else if (v !== "") collapseFrom(Number(v));
          }}
          options={[
            { value: "all", label: "All levels" },
            { value: "0", label: "Projects only" },
            { value: "1", label: "To milestone" },
            { value: "2", label: "To result" },
            { value: "3", label: "To action" },
          ]}
        />

        <BarSelect
          label="Sort"
          icon={<ArrowUpDown size={14} strokeWidth={2.2} />}
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />



        {/* Right-hand group. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view === "list" && <RowsPicker value={rowLimit} onChange={setRowLimit} total={rows.length} />}

          {/* Active-filter pill — tinted only when a filter is really on, and
              clicking it clears the filter rather than opening another menu. */}
          {projectId !== "all" && (
            <button
              onClick={() => setProjectId("all")}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold transition-opacity hover:opacity-80"
              style={{ background: ACCENT_SOFT, color: ACCENT_DEEP }}
              title="Clear the project filter"
            >
              Filtered — 1 <X size={13} strokeWidth={2.6} />
            </button>
          )}

          {view === "list" && (
            <ColumnsPicker visible={cols} onChange={setCols} order={colOrder} onReorder={setColOrder} />
          )}

          <BarButton onClick={exportCsv} icon={<Download size={14} strokeWidth={2.2} />}>
            Export
          </BarButton>


        </div>
      </div>

      {/* ── Selection bar — the SAME bar the WMS task list uses, so a batch
          edit looks and behaves identically in both places.

          It is fed the TASK ids behind the selected rows, because every shared
          dropdown on it (Doer Status, Priority, Reassign, Subject, Client,
          Manager Status) writes to `tasks`. A selected row that has no task yet
          simply contributes nothing to that list — it stays selected for the
          plan-side actions in `extras`, which work on the ROW.

          Archive is hidden and Delete is overridden: `deletePlanNode` already
          archives the row and its task together, so the stock task-only delete
          would leave the rows behind. ── */}
      {selectedRows.length > 0 && (
        <BulkActionBar
          selectedIds={selectedTaskIds}
          // ROWS selected, not tasks — see the prop's note. A ticked row with
          // no task yet must still be counted, or the chip reads "0 selected".
          count={selectedRows.length}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          // NO subjects / clients. The shared bar draws its Subject and Client
          // menus only when handed a roster for them, so leaving these off
          // removes both — which is what a plan wants: those two are WMS task
          // fields, and only SOME of the selected rows are tasks. Setting a
          // client here would reach the actions in the selection and silently
          // miss every project and milestone beside them. Set them from the WMS
          // list, or from the row's own task.
          isAdmin={canManage}
          statusLabels={labels}
          onClear={() => setSelected(new Set())}
          showArchive={false}
          onDeleteOverride={bulkDelete}
          extras={
            <>
              {/* View detail stays a single-row idea — there is one record to
                  show. Edit is not: one row opens the full row editor, several
                  open the BULK editor, which writes only the fields you tick
                  onto every selected row and leaves the rest as they were. */}
              {selectedRows.length === 1 && (
                <BarButton
                  icon={<Eye size={14} strokeWidth={2.2} />}
                  onClick={() => {
                    const r = selectedRows[0]!;
                    openDetail({ node: r.node, ref: r.ref, fullRef: r.fullRef, path: r.path });
                  }}
                >
                  View detail
                </BarButton>
              )}
              <BarButton
                icon={<Pencil size={14} strokeWidth={2.2} />}
                onClick={() => {
                  const targets = selectedRows.map((r) => ({
                    node: r.node, ref: r.ref, fullRef: r.fullRef, path: r.path,
                  }));
                  if (targets.length === 1) setEditing(targets[0]!);
                  else setBulkEditing(targets);
                }}
              >
                {selectedRows.length === 1 ? "Edit" : `Edit ${selectedRows.length} rows`}
              </BarButton>

              <BarButton
                icon={<Copy size={14} strokeWidth={2.2} />}
                onClick={() => bulk("duplicate", (id) => duplicatePlanNode(id), "Duplicated")}
              >
                Duplicate
              </BarButton>

              {/* Bulk owner — the PLAN's owner, which is what turns a row into a
                  WMS task in the first place. Distinct from Reassign above,
                  which moves an existing task's doer. */}
              <label className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 transition-colors focus-within:border-[#E10600]">
                <span className="text-[13px] font-bold text-ink-soft">Owner</span>
                <select
                  value=""
                  aria-label="Assign an owner to the selected rows"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    e.target.value = "";
                    bulk("owner", (id) => updatePlanNode({ id, ownerId: v === "clear" ? null : v }), "Owner set");
                  }}
                  className="cursor-pointer bg-transparent text-[13px] font-bold text-ink-strong outline-none"
                >
                  <option value="">Assign…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                  <option value="clear">— Clear owner —</option>
                </select>
              </label>

              {busy?.startsWith("bulk:") && <Loader2 size={15} className="animate-spin text-ink-subtle" />}
            </>
          }
        />
      )}

      {view === "kanban" ? (
        <PlanKanban cards={cards} me={me} downlineSet={downlineSet} />
      ) : (
      <>
      {/* ── Table ────────────────────────────────────────────────────────────
          Scrolls on BOTH axes inside its own box: sideways because the row is
          wider than most screens, and vertically so the page chrome (title,
          search, toolbar) stays put instead of scrolling away above a long
          plan. In full screen the box takes whatever height is left; otherwise
          it is capped against the viewport. */}
      <div
        className={`overflow-auto rounded-xl border border-hairline-strong bg-white ${
          fullscreen ? "min-h-0 flex-1" : "max-h-[calc(100vh-300px)] min-h-[220px]"
        }`}
      >
        {/* min-w is the sum of the fixed column widths (≈1730px with the
            checkbox gutter) plus room for the flexible Name column. Set below
            that, the browser squeezes the fixed widths instead of scrolling,
            which is what clipped the wider columns. */}
        <table className="w-full min-w-[1960px] border-collapse text-left">
          {/* Sticky header — it has to carry its own background, or rows would
              scroll visibly underneath a transparent one. */}
          <thead className="sticky top-0 z-[2]">
            <tr className="border-b border-hairline-strong bg-surface-soft [&>th]:bg-[color:var(--color-surface-soft,#eef2f7)]">
              <Th className="w-[40px] pl-3">
                <input
                  type="checkbox"
                  checked={shownRows.length > 0 && selected.size >= shownRows.length}
                  ref={(el) => {
                    // Partial selection reads as a dash, not an empty box — an
                    // empty box would claim nothing is selected.
                    if (el) el.indeterminate = selected.size > 0 && selected.size < shownRows.length;
                  }}
                  onChange={toggleSelectAll}
                  disabled={shownRows.length === 0}
                  className="size-[15px] cursor-pointer accent-[#E10600]"
                  aria-label="Select every row on screen"
                />
              </Th>
              {shownCols.map((k, i) => {
                const c = COL_META.get(k)!;
                const dragging = dragCol === k;
                return (
                  <th
                    key={k}
                    onPointerDown={(e) => {
                      // Left button only — a right-click or a middle-click on a
                      // header should not start dragging it.
                      if (e.button !== 0) return;
                      e.preventDefault();
                      startColDrag(k);
                    }}
                    onPointerEnter={() => crossCol(k)}
                    title={`${c.label} — drag to move this column`}
                    className={`${c.width}${i === shownCols.length - 1 ? " pr-3" : ""} cursor-grab touch-none select-none px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle transition-colors active:cursor-grabbing`}
                    style={{
                      background: dragging ? ACCENT_SOFT : undefined,
                      color: dragging ? ACCENT_DEEP : undefined,
                      opacity: dragCol && !dragging ? 0.6 : 1,
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <GripVertical size={11} className="shrink-0 opacity-40" aria-hidden />
                      {c.label}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + shownCols.length} className="px-4 py-16 text-center">
                  <span className="mx-auto mb-3 inline-grid size-11 place-items-center rounded-full" style={{ background: ACCENT_SOFT, color: ACCENT_DEEP }}>
                    <FolderPlus size={22} strokeWidth={2.2} />
                  </span>
                  <p className="text-[15px] font-bold text-ink-strong">
                    {query ? "Nothing matches that search." : "No projects yet."}
                  </p>
                  <p className="mt-1 text-[13.5px] font-medium text-ink-muted">
                    {query
                      ? "Try a different word, or clear the search to see the whole plan."
                      : "Add a project to start building the plan."}
                  </p>
                  {/* The empty table's own way in. Not gated: `createPlanNode`
                      tests nothing but that you are signed in, which is why the
                      toolbar's create boxes are ungated too — this used to say
                      an admin was needed, which was never what the server did. */}
                  {!query && (
                    <button
                      type="button"
                      onClick={addProject}
                      disabled={pending}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-50"
                      style={{ background: ACCENT }}
                    >
                      {busy === "add:project" ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : (
                        <Plus size={14} strokeWidth={2.8} aria-hidden />
                      )}
                      New project
                    </button>
                  )}
                </td>
              </tr>
            )}
            {shownRows.map((row) => (
              <Row
                key={row.node.id}
                row={row}
                collapsed={collapsed.has(row.node.id)}
                employees={employees}
                busyKey={busy}
                treeBusy={pending}
                onToggle={toggle}
                onAddChild={addChild}
                onRun={run}
                onDelete={remove}
                detailOpen={detail?.node.id === row.node.id}
                onOpenDetail={openDetail}
                shownCols={shownCols}
                selected={selected.has(row.node.id)}
                onToggleSelect={toggleSelect}
                onOpenTask={onOpenTask}
                isAdmin={isAdmin}
                canManage={canManage}
                me={me}
                downlineSet={downlineSet}
              />
            ))}

            {/* NEW PROJECT, under the last one — the root's answer to the "+"
                every row carries.

                Hidden while a search or a project filter is narrowing the
                table, because the row this creates is an untitled project that
                neither would match: the button would appear to do nothing. The
                toolbar box is still there for that case. */}
            {rows.length > 0 && !query && projectId === "all" && (
              <tr>
                <td colSpan={1 + shownCols.length} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={addProject}
                    disabled={pending}
                    title="Add a project — or press P"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-surface-soft disabled:opacity-50"
                    style={{ color: ACCENT_DEEP }}
                  >
                    {busy === "add:project" ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden />
                    ) : (
                      <Plus size={13} strokeWidth={2.8} aria-hidden />
                    )}
                    New project
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      </>
      )}

      {/* Never hide rows silently — say how many are held back and offer the
          one control that brings them back. */}
      {view === "list" && rowLimit !== "all" && rows.length > shownRows.length && (
        <p className="mt-2 text-[12.5px] font-medium text-ink-muted">
          Showing {shownRows.length} of {rows.length} rows.{" "}
          <button onClick={() => setRowLimit("all")} className="font-bold underline underline-offset-2" style={{ color: ACCENT_DEEP }}>
            Show all
          </button>
        </p>
      )}
    </section>
  );

  return (
    <>
      {fullscreen ? (
        // A fixed takeover rather than the native Fullscreen API: the API needs a
        // user-gesture-bound element request that silently fails in some embedded
        // browsers, and it would take the app chrome with it. This fills the
        // viewport, scrolls on its own, and Esc gets you out.
        <div className="fixed inset-0 z-[110] overflow-auto bg-surface-soft p-6 max-md:p-3">
          {board}
        </div>
      ) : (
        board
      )}
      {detail && (
        <DetailDialog
          target={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
        />
      )}
      {/* `key` remounts per level so the dialog's internal kind/parent state
          starts clean rather than carrying the previous level's half-filled
          chain of ancestor pickers. */}
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
      {/* Bulk upload — same `key` trick, same reason: a level change starts the
          destination and the parsed rows clean rather than carrying both over. */}
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
      {editing && (
        <EditDialog
          target={editing}
          employees={employees}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {bulkEditing && (
        <BulkEditDialog
          targets={bulkEditing}
          employees={employees}
          onClose={() => setBulkEditing(null)}
          onSaved={() => {
            setBulkEditing(null);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle ${className}`}>
      {children}
    </th>
  );
}

/* ────────────────────────────── One row ────────────────────────────── */

function Row({
  row, collapsed, employees, busyKey, treeBusy, onToggle, onAddChild, onRun, onDelete,
  detailOpen, onOpenDetail, shownCols, selected, onToggleSelect, onOpenTask,
  isAdmin, canManage, me, downlineSet,
}: {
  row: FlatRow;
  collapsed: boolean;
  employees: EmployeeOption[];
  busyKey: string | null;
  /**
   * ANY write on the tree is still settling — including its `router.refresh()`.
   * Only the add-child "+" reads it, because that is the one control whose
   * result you cannot see until the refresh paints, and so the one people press
   * twice. Move / duplicate / delete all change a row you are already looking
   * at, so `busyKey` alone is enough for them.
   */
  treeBusy: boolean;
  onToggle: (id: string) => void;
  onAddChild: (node: PlanRow) => void;
  onRun: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) => void;
  onDelete: (node: PlanRow) => void;
  detailOpen: boolean;
  onOpenDetail: (t: DetailTarget | null) => void;
  shownCols: ColKey[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
  /** Opens the linked WMS task record — executable rows only. */
  onOpenTask: (taskId: string, nodeId?: string) => void;
  isAdmin: boolean;
  canManage: boolean;
  me: { id: string; isAdmin: boolean };
  downlineSet: ReadonlySet<string>;
}) {
  const { node, depth, ref: rowRef, fullRef, hasChildren, isFirst, isLast, path } = row;
  const childKind = CHILD_KIND[node.kind];
  const executable = isExecutable(node.kind);
  /**
   * Does this level own a schedule? A Project and a Milestone do not — they are
   * dated by the work underneath them (SCHEDULED_KINDS in
   * lib/project-plan/levels.ts), which is why the create form hides its
   * Schedule section and the registers drop those columns for them.
   *
   * The board kept drawing the date and time INPUTS on those rows anyway, so
   * every project offered an empty "dd-mm-yyyy" box inviting a value nothing
   * would ever read. They render blank here instead — the column still exists
   * for the levels that use it, and those rows simply have nothing in it.
   */
  const scheduled = hasSchedule(node.kind);
  const rowBusy = busyKey?.endsWith(`:${node.id}`) ?? false;

  const patch = React.useCallback(
    (fields: Record<string, unknown>) =>
      onRun(`edit:${node.id}`, () => updatePlanNode({ id: node.id, ...fields })),
    [node.id, onRun],
  );

  /**
   * Hover card state — the anchor rect of the name cell, or null when hidden.
   *
   * Opened on a ~320ms delay so sweeping the cursor across the table on the way
   * to a control never flashes a card; cancelled the moment the pointer leaves
   * or the input takes focus. The timer is cleared on unmount so a row removed
   * mid-delay (a delete, a collapse) cannot call setState afterwards.
   */
  const [card, setCard] = React.useState<DOMRect | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // The card is positioned from a viewport rect captured on hover; once the page
  // scrolls that rect is stale and the card would hang over the wrong row.
  React.useEffect(() => {
    if (!card) return;
    const close = () => setCard(null);
    window.addEventListener("scroll", close, true); // capture: the table scrolls, not the window
    return () => window.removeEventListener("scroll", close, true);
  }, [card]);

  const openCard = React.useCallback((el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    const rect = el.getBoundingClientRect();
    timer.current = setTimeout(() => setCard(rect), 320);
  }, []);

  const closeCard = React.useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setCard(null);
  }, []);

  /**
   * How this level is SET — brief §5, straight from the one table in
   * lib/project-plan/levels.ts rather than a depth ramp invented here.
   *
   *   Project        bold + italic + CAPS   Milestone   bold
   *   Result         italic                 Action      normal
   *   Sub-Action     italic, a size down    Sub-Sub     one down again
   *
   * The sizes are the brief's own (12 / 12 / 10 / 10 / 9), through TYPE_SCALE
   * so all six move together if they ever need to. Caps is a CSS TRANSFORM, so
   * the stored name keeps the case the author typed — the edit box, the search
   * and the export all still show "AICL WMS" as written rather than a shouted
   * copy of it.
   */
  const emphasis = { ...levelTextStyle(node.kind), fontSize: levelTextStyle(node.kind).fontSize * TYPE_SCALE };

  /** The two things the status picker needs to know about this viewer. */
  const actor = React.useMemo(
    () => planActorFor(node, me, downlineSet),
    [node, me, downlineSet],
  );
  /** Recording a partial completion is an owner/admin ruling — the same rule
   *  `setPlanNodeProgress` enforces before it writes. */
  // Open to anyone — setPlanNodeProgress no longer tests who is asking.
  const canRecordProgress = true;

  return (
    <tr
      className="border-b border-hairline transition-colors last:border-b-0 hover:bg-[color:var(--color-surface-soft,#f6f8fb)]"
      style={depth === 0 ? { background: "color-mix(in srgb, #E10600 4%, transparent)" } : undefined}
    >
      {/* Tick to SELECT — the selection bar above then acts on the whole
          selection. The detail view moved to the REF badge (and to the bar's
          "View detail"), so one checkbox is not doing two different jobs. */}
      <td className="px-2 py-1.5 pl-3 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(node.id)}
          className="size-[15px] cursor-pointer accent-[#E10600]"
          aria-label={`Select ${node.name || KIND_LABEL[node.kind]}`}
        />
      </td>

      {/* Every cell, rendered in the user's column order — the three structural
          ones included, so Ref / Controls / Result can be dragged like the rest.
          Each is keyed, so reordering MOVES a cell rather than remounting it: an
          input mid-edit keeps its value and its focus. */}
      {shownCols.map((key) => {
        const last = key === shownCols[shownCols.length - 1];
        const pad = `px-2.5 py-1.5 text-left align-middle${last ? " pr-3" : ""}`;

        switch (key) {
          // REF — carries the indent and the expand caret, so the hierarchy's
          // visual spine travels with this column wherever it is dragged.
          case "ref":
            return (
              <td key={key} className={pad}>
                <div className="flex items-center" style={{ paddingLeft: depth * 15 }}>
                  {hasChildren ? (
                    <button
                      onClick={() => onToggle(node.id)}
                      className="mr-1 grid size-5 shrink-0 place-items-center rounded text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
                      aria-label={collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
                      aria-expanded={!collapsed}
                    >
                      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : (
                    <span className="mr-1 inline-block size-5 shrink-0" aria-hidden />
                  )}
                  <button
                    onClick={() => onOpenDetail(detailOpen ? null : { node, ref: rowRef, fullRef, path })}
                    className="rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums transition-opacity hover:opacity-75"
                    style={
                      detailOpen
                        ? { background: ACCENT, color: "white" }
                        : depth <= 2
                          ? { background: ACCENT_SOFT, color: ACCENT_DEEP }
                          : { background: "var(--color-surface-soft, #eef2f7)", color: "var(--color-ink-muted)" }
                    }
                    title={`${KIND_LABEL[node.kind]} — click for full detail`}
                    aria-label={`Full detail for ${node.name || KIND_LABEL[node.kind]}`}
                  >
                    {rowRef}
                  </button>
                </div>
              </td>
            );

          case "controls":
            return (
              <td key={key} className={pad}>
                <div className="flex items-center gap-0.5">
                  {childKind && (
                    <IconBtn
                      // Shut for the WHOLE write, refresh included — see
                      // `treeBusy`. One press, one row.
                      label={`Add ${KIND_LABEL[childKind].toLowerCase()}`}
                      onClick={() => onAddChild(node)}
                      disabled={rowBusy || treeBusy}
                      accent
                    >
                      <Plus size={13} strokeWidth={2.8} />
                    </IconBtn>
                  )}
                  <IconBtn label="Move up" onClick={() => onRun(`move:${node.id}`, () => movePlanNode({ id: node.id, direction: "up" }))} disabled={rowBusy || isFirst}>
                    <ArrowUp size={13} />
                  </IconBtn>
                  <IconBtn label="Move down" onClick={() => onRun(`move:${node.id}`, () => movePlanNode({ id: node.id, direction: "down" }))} disabled={rowBusy || isLast}>
                    <ArrowDown size={13} />
                  </IconBtn>
                  <IconBtn label="Duplicate" onClick={() => onRun(`dup:${node.id}`, () => duplicatePlanNode(node.id), "Duplicated.")} disabled={rowBusy}>
                    <Copy size={13} />
                  </IconBtn>
                  <IconBtn label="Delete" onClick={() => onDelete(node)} disabled={rowBusy} danger>
                    <Trash2 size={13} />
                  </IconBtn>
                  {rowBusy && <Loader2 size={13} className="ml-0.5 animate-spin text-ink-subtle" />}
                </div>
              </td>
            );

          case "name":
            return (
              <td key={key} className={pad}>
                <div onMouseEnter={(e) => openCard(e.currentTarget)} onMouseLeave={closeCard}>
                  <input
                    defaultValue={node.name}
                    key={`${node.id}:${node.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== node.name) patch({ name: v });
                      else e.target.value = node.name;
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    placeholder={
                      node.kind === "result"
                        ? "Result I am committing to produce"
                        : executable
                          ? "Action I am committing to take"
                          : `${KIND_LABEL[node.kind]} name`
                    }
                    className="w-full min-w-[220px] rounded border border-transparent bg-transparent px-1.5 py-1 text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white"
                    style={emphasis}
                    aria-label={`${KIND_LABEL[node.kind]} name`}
                    // Typing must not fight a popup sitting over the row.
                    onFocus={closeCard}
                  />
                </div>
                {card && (
                  <RowHoverCard
                    node={node}
                    rowRef={rowRef}
                    path={path}
                    anchor={card}
                    onClose={closeCard}
                  />
                )}
              </td>
            );

          // ── Status ────────────────────────────────────────────────────────
          // Every level, one vocabulary. The picker renders only what this
          // viewer may set; the server re-checks the same rule before writing,
          // so a hidden option is a courtesy, never the control.
          case "status":
            return (
              <td key={key} className={pad}>
                <PlanStatusCell node={node} actor={actor} linkedToTask={!!node.task} />
              </td>
            );

          // ── Progress ──────────────────────────────────────────────────────
          // Computed from this row's subtree on every render — a percent, and
          // on a project the partial milestone count (3.5/10) beneath it.
          case "progress":
            return (
              <td key={key} className={pad}>
                <PlanProgressCell node={node} canRecord={canRecordProgress} />
              </td>
            );

          // ── Start / End date ──────────────────────────────────────────────
          // The DAY part of starts_at / ends_at. The time of day lives on the
          // same two columns and is edited by From / To, so setting a date here
          // preserves whatever time was already on the row rather than
          // silently resetting it to midnight.
          case "startDate":
            return scheduled ? (
              <DateCell
                key={key}
                label="Start date"
                iso={node.startsAt}
                onChange={(iso) => patch({ startsAt: iso })}
                last={last}
              />
            ) : (
              <BlankCell key={key} className={pad} kind={node.kind} />
            );

          case "endDate":
            return scheduled ? (
              <DateCell
                key={key}
                label="End date"
                iso={node.endsAt}
                onChange={(iso) => patch({ endsAt: iso })}
                last={last}
              />
            ) : (
              <BlankCell key={key} className={pad} kind={node.kind} />
            );

          case "due":
            return (
              <td key={key} className={pad}>
                {node.task ? (
                  <span
                    className="text-[13px] font-medium text-ink-strong"
                    title="The linked WMS task's due date"
                  >
                    {formatPlanDate(node.task.dueAt)}
                  </span>
                ) : node.targetDate ? (
                  <span
                    className="text-[13px] font-medium text-ink-strong"
                    title="This row's target date — it has no WMS task yet"
                  >
                    {formatPlanDate(node.targetDate)}
                  </span>
                ) : (
                  <span className="text-[12px] font-medium text-ink-subtle">—</span>
                )}
              </td>
            );

          // ── Days ──────────────────────────────────────────────────────────
          // Start → end INCLUSIVE, so a one-day job reads 1 rather than 0.
          // Derived, never stored: a stored copy could disagree with its own
          // two endpoints the moment either one moved.
          case "days": {
            if (!scheduled) return <BlankCell key={key} className={pad} kind={node.kind} />;
            const d = durationDays(node.startsAt, node.endsAt);
            return (
              <td key={key} className={pad}>
                {d == null ? (
                  <span className="text-[12px] font-medium text-ink-subtle">—</span>
                ) : (
                  <span
                    className="text-[12.5px] font-bold tabular-nums text-ink-strong"
                    title={`${formatPlanDate(node.startsAt)} → ${formatPlanDate(node.endsAt)}, both days counted`}
                  >
                    {d}
                  </span>
                )}
              </td>
            );
          }

          case "description":
            return (
              <td key={key} className={pad}>
                <input
                  defaultValue={node.description ?? ""}
                  key={`${node.id}:desc:${node.description ?? ""}`}
                  placeholder="—"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (node.description ?? "")) patch({ description: v || null });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] font-medium text-ink-muted outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white focus:text-ink-strong"
                  aria-label="Description"
                  title={node.description ?? "Description"}
                />
              </td>
            );

          case "owner":
            return (
              <td key={key} className={pad}>
                <select
                  value={node.ownerId ?? ""}
                  onChange={(e) => patch({ ownerId: e.target.value || null })}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-[13px] font-medium text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white"
                  aria-label="Owner"
                >
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </td>
            );

          case "target":
            return (
              <td key={key} className={pad}>
                <input
                  type="date"
                  defaultValue={node.targetDate ?? ""}
                  key={`${node.id}:d:${node.targetDate ?? ""}`}
                  onChange={(e) => patch({ targetDate: e.target.value || null })}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-[13px] font-medium text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white"
                  aria-label="Target date"
                />
              </td>
            );

          case "from":
            return scheduled ? (
              <TimeCell
                key={key}
                label="From"
                iso={node.startsAt}
                ymd={node.targetDate}
                onChange={(iso) => patch({ startsAt: iso })}
                last={last}
              />
            ) : (
              <BlankCell key={key} className={pad} kind={node.kind} />
            );

          case "to":
            return scheduled ? (
              <TimeCell
                key={key}
                label="To"
                iso={node.endsAt}
                ymd={node.targetDate}
                onChange={(iso) => patch({ endsAt: iso })}
                last={last}
              />
            ) : (
              <BlankCell key={key} className={pad} kind={node.kind} />
            );

          // The three task-side columns. Each falls back to an em dash on a
          // container row and to a quiet hint on an executable row that has no
          // task yet — the same "give it an owner and a date" nudge the WMS
          // column shows, rather than an empty cell that looks like a bug.
          {/* DOER, from whichever record holds it.
                executable + task  the TASK's doer, edited in place through the
                                   same WMS control the task list uses.
                container          the row's OWNER. The create form asks a
                                   Project for a doer like everything else, and
                                   that person is stored as `owner_id` — a
                                   container has no task to carry a doer. This
                                   column used to print a dash there, so the
                                   name someone had just typed appeared to have
                                   been thrown away. Read-only: the Owner column
                                   is the editor for the same field. */}
          case "doer":
            return (
              <td key={key} className={pad}>
                {!executable ? (
                  node.ownerName ? (
                    <span
                      className="text-[13px] font-medium text-ink-strong"
                      title={`${node.ownerName} owns this ${KIND_LABEL[node.kind].toLowerCase()} — edit it in the Owner column`}
                    >
                      {node.ownerName}
                    </span>
                  ) : (
                    <span className="text-[12px] font-medium text-ink-subtle">—</span>
                  )
                ) : node.task ? (
                  <InlineDoerCell
                    taskId={node.task.id}
                    doerId={node.task.doerId}
                    doerName={node.task.doerName}
                    employees={employees.map((e) => ({ id: e.id, name: e.name }))}
                    editable={canManage}
                  />
                ) : (
                  <span className="text-[12px] font-medium text-ink-subtle">Not scheduled</span>
                )}
              </td>
            );

          {/* PRIORITY, from whichever record holds it.
                executable + task  the TASK's priority, edited in place through
                                   the same WMS control the task list uses.
                container          the row's own `priority` (migration 0213),
                                   which the create form has always collected
                                   and nothing used to read back.
              A container is not a task, so `InlinePriorityCell` — which POSTs a
              task id — cannot serve it; it gets the plain chip and the edit
              dialog's own Priority field. */}
          case "priority":
            return (
              <td key={key} className={pad}>
                {executable ? (
                  node.task ? (
                    <InlinePriorityCell
                      taskId={node.task.id}
                      priority={node.task.priority}
                      editable={canManage}
                    />
                  ) : (
                    <span className="text-[12px] font-medium text-ink-subtle">—</span>
                  )
                ) : node.priority ? (
                  // The same pill the task rows show — Critical gets its own
                  // badge there, so it gets it here too rather than reading as
                  // a quieter thing than it is.
                  node.priority === "imp_urgent" ? (
                    <CriticalBadge />
                  ) : (
                    <PriorityPill priority={node.priority} />
                  )
                ) : (
                  <span className="text-[12px] font-medium text-ink-subtle">—</span>
                )}
              </td>
            );

          case "wms":
            return (
              <td key={key} className={pad}>
                {!executable ? (
                  <span className="text-[12px] font-medium text-ink-subtle">—</span>
                ) : node.task ? (
                  // Clickable: this is the board's way into the FULL WMS record
                  // — repeat, custom repeat, the schedule, approvals, checklist.
                  // Without it the hierarchy was the one Project surface from
                  // which those fields could not be reached at all.
                  <button
                    type="button"
                    onClick={() => onOpenTask(node.task!.id, node.id)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-bold transition-opacity hover:opacity-80"
                    style={{ background: "color-mix(in srgb, #16a34a 13%, transparent)", color: "#15803d" }}
                    title={`Open the WMS task${node.task.onCalendar ? " · on the calendar" : ""} — schedule, repeat, timer, approvals`}
                  >
                    <CalendarCheck2 size={12} strokeWidth={2.5} />
                    {node.task.statusLabel}
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-subtle"
                    title="Set an owner and a target date to create the WMS task"
                  >
                    <CircleDashed size={12} /> Not scheduled
                  </span>
                )}
              </td>
            );
        }
      })}
    </tr>
  );
}

/* ───────────────────────────── Cell parts ──────────────────────────── */

/**
 * An empty schedule cell, on a level that has no schedule.
 *
 * Deliberately not a dash and not an input: a dash reads as "there is a value
 * and it is missing", and an input invites one. A Project is dated by the work
 * underneath it, so the honest thing is nothing at all — with the reason on
 * hover for anyone who wonders why the column is blank here and filled two rows
 * down.
 */
function BlankCell({ className, kind }: { className: string; kind: PlanKind }) {
  return (
    <td
      className={className}
      title={`A ${KIND_LABEL[kind].toLowerCase()} has no schedule of its own — it runs from the first action under it to the last.`}
    />
  );
}

/**
 * The DAY half of a `starts_at` / `ends_at` instant.
 *
 * The pairing with TimeCell below is the point: both edit the SAME column, one
 * the date and one the time of day, so neither can clobber what the other set.
 * Clearing the date clears the column outright — a time with no day is not an
 * instant, and storing one would put the row on an arbitrary date.
 *
 * A new date keeps the time already on the row, defaulting to 00:00 only when
 * there was no instant at all.
 */
function DateCell({
  label, iso, onChange, last,
}: {
  label: string;
  iso: string | null;
  onChange: (iso: string | null) => void;
  last?: boolean;
}) {
  const ymd = iso ? toYmd(new Date(iso)) : "";
  const hm = iso ? toHm(new Date(iso)) : "";

  return (
    <td className={`px-2 py-1.5 align-middle${last ? " pr-3" : ""}`}>
      <input
        type="date"
        defaultValue={ymd}
        key={`d:${iso ?? ""}`}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next ? (combineDateTime(next, hm)?.toISOString() ?? null) : null);
        }}
        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-[12.5px] font-medium text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white"
        aria-label={label}
        // The stored value in the brief's own format, since a native date input
        // renders in the browser's locale and cannot be told otherwise.
        title={iso ? formatPlanDate(iso) : label}
      />
    </td>
  );
}

function TimeCell({
  label, iso, ymd, onChange, last,
}: {
  label: string;
  iso: string | null;
  ymd: string | null;
  onChange: (iso: string | null) => void;
  last?: boolean;
}) {
  const hm = iso
    ? (() => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime())
          ? ""
          : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      })()
    : "";

  return (
    <td className={`px-2 py-1.5 align-middle${last ? " pr-3" : ""}`}>
      <input
        type="time"
        defaultValue={hm}
        key={`t:${iso ?? ""}`}
        // Without a target date there is no day to attach the time to, so the
        // input stays disabled rather than silently discarding what's typed.
        disabled={!ymd}
        title={ymd ? undefined : "Set a target date first"}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) { onChange(null); return; }
          const dt = combineDateTime(ymd ?? "", v);
          onChange(dt ? dt.toISOString() : null);
        }}
        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-[13px] font-medium tabular-nums text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[#E10600] focus:bg-white disabled:opacity-40"
        aria-label={label}
      />
    </td>
  );
}

/* ─────────────────────────────── Hover card ─────────────────────────────── */

const CARD_W = 420;

/**
 * The row, in full, on hover — a plain white card: the context in bold, the
 * complete text underneath.
 *
 * Deliberately just those two lines. The row already shows owner, dates,
 * duration and WMS state in their own columns, so repeating them here would
 * only make the card compete with the table. The one thing the table CANNOT
 * show is a long name in full, because the cell is a fixed-width input that
 * clips it — that is what this card is for.
 *
 * Rendered through a PORTAL to document.body rather than inside the cell: the
 * table lives in an `overflow-x-auto` scroller, which would clip an absolutely
 * positioned child and cut the card in half on any row near the edge. Position
 * comes from the anchor's viewport rect, clamped so the card never leaves the
 * screen, and flipped above the row when there is no room below.
 *
 * `pointer-events-none` is deliberate: this is a read-only summary, so it must
 * never swallow a click meant for the row underneath it.
 */
function RowHoverCard({
  node, path, anchor,
}: {
  node: PlanRow;
  rowRef: string;
  path: string[];
  anchor: DOMRect;
  onClose: () => void;
}) {
  // Bold line = where this sits. The outermost ancestor (the project) is the
  // most useful context for a deep row; a project itself has no ancestor, so it
  // falls back to naming its own level.
  const title = path[0] ?? KIND_LABEL[node.kind];

  const spaceBelow = window.innerHeight - anchor.bottom;
  const flipUp = spaceBelow < 140;
  const top = flipUp ? Math.max(8, anchor.top - 8) : anchor.bottom + 8;
  const left = Math.min(
    Math.max(8, anchor.left),
    Math.max(8, window.innerWidth - CARD_W - 8),
  );

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[120] rounded-2xl bg-white px-5 py-4"
      style={{
        width: CARD_W,
        left,
        top,
        transform: flipUp ? "translateY(-100%)" : undefined,
        boxShadow: "0 10px 30px -8px rgba(15,23,42,0.18), 0 2px 8px -2px rgba(15,23,42,0.10)",
      }}
    >
      <p className="text-[14px] font-bold leading-snug text-ink-strong">{title}</p>
      <p className="mt-2 text-[13.5px] font-normal leading-relaxed text-ink-soft">
        {node.name || <span className="text-ink-subtle">(no name yet)</span>}
      </p>
    </div>,
    document.body,
  );
}

/**
 * Header count chip — a tinted dot, the number, and what it counts. Clicking it
 * narrows the table to exactly those rows (with their parents kept for
 * context); the active chip is filled in its own colour so the table below is
 * never filtered without something on screen saying so.
 */
function CountChip({
  label, n, tone, active, onClick,
}: {
  label: string;
  n: number;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  const empty = n === 0;
  return (
    <button
      onClick={onClick}
      disabled={empty}
      aria-pressed={active}
      title={
        empty
          ? `No ${label.toLowerCase()} in this plan`
          : active
            ? "Showing these — click to clear"
            : `Show the ${label.toLowerCase()}`
      }
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        empty ? "cursor-default opacity-55" : "cursor-pointer hover:border-hairline-strong"
      }`}
      style={
        active
          ? { background: tone, borderColor: tone, color: "white" }
          : { background: "white", borderColor: "var(--color-hairline)", color: "var(--color-ink-soft)" }
      }
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: active ? "rgba(255,255,255,0.9)" : tone }}
        aria-hidden
      />
      <strong className={`font-bold tabular-nums ${active ? "" : "text-ink-strong"}`}>{n}</strong>
      {label}
    </button>
  );
}

/** One segment of the level pill. Declared at module scope on purpose —
 *  defining it inside LevelTabs hands React a new component type every render,
 *  which remounts the links instead of updating them. */
function LevelSeg({
  label, n, href, active,
}: {
  label: string;
  n: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href as Route}
      role="tab"
      aria-selected={active}
      title={`Show the ${label.toLowerCase()} level`}
      className="inline-flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-[13px] font-bold transition-colors"
      style={
        active
          ? {
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
              color: "white",
              boxShadow: `0 6px 14px -8px ${ACCENT_DEEP}`,
            }
          : { color: "var(--color-ink-soft)" }
      }
    >
      {label}
      <span
        className="tabular-nums font-mono"
        style={{ fontSize: 11, opacity: active ? 0.8 : 0.65 }}
      >
        {n}
      </span>
    </Link>
  );
}

/**
 * Project | Milestone | Results | Actions | Sub-Actions — the level switcher,
 * drawn as one segmented pill rather than five loose chips.
 *
 * These are LINKS, not buttons, and they mirror the sidebar exactly: the level
 * is a route, so the pill, the rail and Back can never disagree about which
 * view you are on, and a level view can be linked to.
 */
function LevelTabs({
  level, tree, view,
}: {
  level: PlanLevel;
  tree: PlanRow[];
  /** The board's CURRENT view, so switching level does not switch view too. */
  view: "list" | "kanban";
}) {
  return (
    <div
      role="tablist"
      aria-label="Plan level"
      className="inline-flex shrink-0 items-center gap-1 rounded-pill p-1"
      style={{
        background: "var(--color-surface-soft)",
        border: "1px solid var(--color-hairline-strong)",
      }}
    >
      {LEVEL_VIEWS.map((v) => (
        <LevelSeg
          key={v.level}
          label={v.label}
          // The CURRENT view is carried across: every level route defaults to
          // its register, so a bare href would silently drop someone out of the
          // hierarchy — or, from the kanban, out of the kanban — just for
          // changing level. Switching level changes the level, nothing else.
          href={`${v.href}?view=${view === "kanban" ? "kanban" : "tree"}`}
          n={countKind(tree, v.kind)}
          active={level === v.level}
        />
      ))}
    </div>
  );
}

/** One tab of the List / Kanban pair. */
function ViewTab({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-bold transition-colors"
      style={active
        ? { background: ACCENT, color: "white" }
        : { background: "white", color: "var(--color-ink-soft)" }}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Rows-per-view menu. A tick marks the active option, so the button and the
 * menu never disagree about what is in force.
 */
function RowsPicker({
  value, onChange, total,
}: {
  value: number | "all";
  onChange: (v: number | "all") => void;
  total: number;
}) {
  const [open, setOpen] = React.useState(false);
  const options: (number | "all")[] = [25, 50, 100, "all"];

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${total} row${total === 1 ? "" : "s"} match right now`}
        className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft"
      >
        Rows <strong className="font-bold tabular-nums text-ink-strong">{value === "all" ? "All" : value}</strong>
        {open ? <ChevronUp size={13} strokeWidth={2.4} /> : <ChevronDown size={13} strokeWidth={2.4} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[115]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-[116] mt-2 w-[128px] rounded-xl border border-hairline-strong bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]">
            {options.map((o) => {
              const on = o === value;
              return (
                <button
                  key={String(o)}
                  onClick={() => { onChange(o); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-surface-soft"
                  style={on ? { background: ACCENT_SOFT, color: ACCENT_DEEP } : { color: "var(--color-ink-soft)" }}
                >
                  <span className="w-3.5 shrink-0">{on && <Check size={13} strokeWidth={3} />}</span>
                  {o === "all" ? "All" : o}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── Control-bar parts ────────────────────────── */

function BarSelect({
  label, value, onChange, options, placeholder, icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2.5 py-1.5 transition-colors focus-within:border-[#E10600] hover:bg-surface-soft">
      {icon && <span className="text-ink-subtle">{icon}</span>}
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[190px] cursor-pointer truncate bg-transparent text-[13px] font-semibold text-ink-strong outline-none"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function BarButton({
  children, onClick, icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft"
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Show/hide the optional columns.
 *
 * A plain popover on a details/summary-free pattern: click to open, click the
 * backdrop to close. The last visible column cannot be unticked — a table that
 * has been emptied down to REF and a name is a dead end the user then has to
 * work out how to escape, so the control simply refuses that state.
 */
function ColumnsPicker({
  visible, onChange, order, onReorder,
}: {
  visible: Set<ColKey>;
  onChange: (next: Set<ColKey>) => void;
  order: ColKey[];
  onReorder: (next: ColKey[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [dragKey, setDragKey] = React.useState<ColKey | null>(null);

  // Pointer events, NOT the native HTML5 draggable attribute. Native dragstart
  // is unreliable when the grip lives inside a popover that already handles
  // pointerdown — the gesture gets swallowed and the drag silently never
  // begins. A ref mirrors the order so the move handler always reads the
  // current array rather than the one captured when the drag started.
  const orderRef = React.useRef(order);
  React.useEffect(() => { orderRef.current = order; }, [order]);
  const draggingRef = React.useRef<ColKey | null>(null);

  React.useEffect(() => {
    // The drag must end wherever the pointer is released, including outside the
    // menu — otherwise letting go off-target leaves the list stuck mid-drag.
    const stop = () => { draggingRef.current = null; setDragKey(null); };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  function crossRow(target: ColKey) {
    const from = draggingRef.current;
    if (!from || from === target) return;
    const cur = orderRef.current;
    const i = cur.indexOf(from);
    const j = cur.indexOf(target);
    if (i < 0 || j < 0) return;
    const next = [...cur];
    next.splice(i, 1);
    next.splice(j, 0, from);
    orderRef.current = next;
    onReorder(next);
  }

  function toggle(key: ColKey) {
    const next = new Set(visible);
    if (next.has(key)) {
      if (next.size === 1) return; // never hide the last one
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  }

  // `relative` here is load-bearing: the menu below is absolutely positioned, so
  // without a positioned ancestor it would anchor to the page (or, in full
  // screen, to the takeover) and land nowhere near its button.
  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft"
      >
        <Columns3 size={14} strokeWidth={2.2} />
        Columns <span className="tabular-nums text-ink-strong">{visible.size}/{OPTIONAL_COLUMNS.length}</span>
      </button>
      {open && (
        <>
          {/* Click-away layer, under the menu but over everything else. */}
          <div className="fixed inset-0 z-[115]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-[116] mt-2 w-[248px] rounded-xl border border-hairline-strong bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]">
            <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
              Drag to reorder
            </p>
            {order.map((key) => {
              const c = COL_META.get(key)!;
              // A fixed column is always on and cannot be unticked — it can
              // still be dragged, which is the whole point of listing it here.
              const on = c.fixed || visible.has(key);
              const locked = c.fixed;
              const last = !c.fixed && on && visible.size === 1;
              const dragging = dragKey === key;
              return (
                <div
                  key={key}
                  onPointerEnter={() => crossRow(key)}
                  className={`flex items-center gap-1 rounded-lg transition-colors ${dragging ? "bg-surface-soft" : "hover:bg-surface-soft"}`}
                  style={{ opacity: dragging ? 0.65 : 1 }}
                >
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      draggingRef.current = key;
                      setDragKey(key);
                    }}
                    className="cursor-grab touch-none px-1 py-1.5 text-ink-subtle active:cursor-grabbing"
                    title={`Drag to move ${c.label}`}
                    aria-label={`Drag to move ${c.label}`}
                  >
                    <GripVertical size={14} />
                  </button>
                  <button
                    onClick={() => toggle(key)}
                    disabled={locked || last}
                    title={
                      locked
                        ? `${c.label} always stays visible — drag it to move it`
                        : last
                          ? "At least one column has to stay visible"
                          : undefined
                    }
                    className={`flex flex-1 items-center gap-2 rounded-lg py-1.5 pr-2.5 text-left text-[13px] font-semibold text-ink-soft ${locked ? "cursor-default" : "disabled:opacity-40"}`}
                  >
                    <span
                      className="grid size-4 shrink-0 place-items-center rounded border"
                      style={on
                        ? locked
                          ? { background: "var(--color-hairline-strong)", borderColor: "var(--color-hairline-strong)", color: "white" }
                          : { background: ACCENT, borderColor: ACCENT, color: "white" }
                        : { borderColor: "var(--color-hairline-strong)" }}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    {c.label}
                    {locked && <span className="ml-auto text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">Fixed</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── Full detail view ─────────────────────────── */

// Dates are formatted by `formatPlanDate` (DD-MMM-YYYY, brief §4), which lives
// in lib/project-plan/levels.ts beside the rest of the module's date handling —
// one format, applied by the table, the dialogs, the kanban and the export.

/** "14:30" from an ISO instant. */
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Every descendant of a node — the dialog's "contains" line. */
export function countBelow(node: PlanRow): number {
  return node.children.reduce((n, c) => n + 1 + countBelow(c), 0);
}

/**
 * The whole row, in a modal — what ticking the checkbox opens.
 *
 * This is the deep view: the hover card stays a two-line glance, and everything
 * that did not fit there lives here instead. Rendered through a portal for the
 * same reason the hover card is (the table's overflow scroller would clip it),
 * and closes on Esc or a backdrop click like every other dialog in the app.
 */
function DetailDialog({
  target, onClose, onEdit,
}: {
  target: DetailTarget;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { node, ref: rowRef, fullRef, path } = target;
  const executable = isExecutable(node.kind);
  const below = countBelow(node);
  // The effective status — a restricted verdict outranks a progress report, so
  // a cancelled project reads "Cancelled" whatever its last report said.
  const status = effectivePlanStatus(
    executable && node.task ? node.task.status : node.status,
    node.approvalStatus,
    false,
  );
  const progress = node.kind === "project" ? describeProgress(node) : null;
  const days = durationDays(node.startsAt, node.endsAt);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${KIND_LABEL[node.kind]} detail`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-[720px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl max-md:p-4"
        // The module accent as a foot rule, the way the Goals dialog carries its
        // red — it tells you which module the dialog belongs to at a glance.
        style={{ borderBottom: `3px solid ${ACCENT}` }}
      >
        {/* Title row */}
        <div className="mb-4 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 truncate text-[20px] font-bold leading-snug text-ink-strong">
            {node.name || <span className="font-medium text-ink-subtle">(no name yet)</span>}
          </h2>
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* The fields, inside one bordered panel. */}
        <div className="rounded-xl border border-hairline-strong p-4 max-md:p-3">
          <ReadField label={KIND_LABEL[node.kind]} value={node.name} wide />

          {node.description && (
            <div className="mt-3.5">
              <ReadField label="Description" value={node.description} wide />
            </div>
          )}

          <div className="mt-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
            <ReadField label="Ref" value={rowRef} />
            {/* The ONLY place the long path is shown — brief §3 keeps it out of
                the table, but a detail panel is exactly where it belongs. */}
            <ReadField label="Full ref" value={fullRef} />
            <ReadField label="Owner" value={node.ownerName} />
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <ReadField label="Status" value={PLAN_STATUS_LABEL[status]} />
            <ReadField
              label={progress ? "Progress" : "Completion"}
              value={
                progress
                  ? progress.long
                  : executable
                    ? null
                    : `${toPercent(nodeFraction(node))}%${node.progressPercent != null ? " (recorded)" : ""}`
              }
              placeholder="Measured by its status"
            />
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
            <ReadField label="Target date" value={node.targetDate ? formatPlanDate(node.targetDate) : null} />
            {/* The DUE date of record — the task's on an executable row, this
                row's target date on a container, exactly as the column reads. */}
            <ReadField
              label="Due date"
              value={
                node.task
                  ? formatPlanDate(node.task.dueAt)
                  : node.targetDate
                    ? formatPlanDate(node.targetDate)
                    : null
              }
            />
            <ReadField
              label="Priority"
              value={
                node.task
                  ? PRIORITY_LABELS[node.task.priority] ?? null
                  : node.priority
                    ? PRIORITY_LABELS[node.priority] ?? null
                    : null
              }
              placeholder="None set"
            />
          </div>

          {/* SCHEDULE — omitted entirely on a Project or a Milestone. Those two
              are dated by the work underneath them, so a row of blank Start /
              End fields would be questions with no answers. */}
          {hasSchedule(node.kind) && (
            <>
              <div className="mt-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
                <ReadField label="Start date" value={formatPlanDate(node.startsAt) || null} />
                <ReadField label="End date" value={formatPlanDate(node.endsAt) || null} />
                <ReadField label="Duration (days)" value={days == null ? null : String(days)} />
              </div>

              <div className="mt-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
                <ReadField label="From" value={node.startsAt ? fmtTime(node.startsAt) : null} />
                <ReadField label="To" value={node.endsAt ? fmtTime(node.endsAt) : null} />
              </div>
            </>
          )}

          {/* Initiator Notes, from the record that holds them — the task on an
              executable row, this row on a container. */}
          <div className="mt-3.5">
            <ReadField
              label="Initiator Notes"
              value={(node.task ? node.task.notes : node.notes) || null}
              placeholder="None"
              wide
            />
          </div>

          {/* Links — openable here, the same list the register's cell shows. */}
          <div className="mt-3.5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
              Links
            </p>
            {node.links.length === 0 ? (
              <p className="text-[14px] font-medium text-ink-subtle">None</p>
            ) : (
              <ul className="space-y-1">
                {node.links.map((url, i) => (
                  <li key={`${url}-${i}`} className="flex items-center gap-2">
                    <Link2 size={12} className="shrink-0 text-ink-subtle" aria-hidden />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={url}
                      className="min-w-0 truncate text-[13.5px] font-semibold text-ink-strong hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <ReadField label="Sits under" value={path.length ? path.join("  ›  ") : null} placeholder="Top level" />
            <ReadField
              label="Contains"
              value={below > 0 ? `${below} row${below === 1 ? "" : "s"} beneath` : null}
              placeholder="Nothing yet"
            />
          </div>

          {/* The single shared task record — only the levels that have one. */}
          {executable && (
            <>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                WMS &amp; Calendar
              </p>
              {node.task ? (
                <div className="mt-2 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
                  <ReadField label="Status" value={node.task.statusLabel} />
                  <ReadField label="Assigned to" value={node.task.doerName} />
                  <ReadField
                    label="Calendar"
                    value={node.task.onCalendar ? "On the calendar" : null}
                    placeholder="Not synced yet"
                  />
                </div>
              ) : (
                <p className="mt-2 rounded-lg bg-surface-soft px-3 py-2.5 text-[13px] font-medium leading-relaxed text-ink-muted">
                  Not in WMS yet — give this row an <strong className="font-bold text-ink-strong">owner</strong> and a{" "}
                  <strong className="font-bold text-ink-strong">target date</strong> and it becomes a real task,
                  the same single record WMS lists and the calendar shows.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-4 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft"
          >
            <Pencil size={14} strokeWidth={2.4} /> Edit
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-6 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: ACCENT }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Edit one row, every field at once.
 *
 * The table already edits each cell inline; this is the same fields in one
 * place, for when you would rather fill a row in without hunting across a wide
 * table. It writes through the SAME `updatePlanNode` action the inline editors
 * use, so an edit here creates or updates the linked WMS task on exactly the
 * same terms — no second write path to keep in step.
 */
export function EditDialog({
  target, employees, canManage, onClose, onSaved,
}: {
  target: DetailTarget;
  employees: EmployeeOption[];
  /** Gates the file list's upload and delete, nothing else on this dialog. */
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { node, ref: rowRef } = target;
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: node.name,
    description: node.description ?? "",
    ownerId: node.ownerId ?? "",
    targetDate: node.targetDate ?? "",
    // The DAY of starts_at / ends_at; `from` / `to` below are the time on it.
    startDate: node.startsAt ? toYmd(node.startsAt) : "",
    endDate: node.endsAt ? toYmd(node.endsAt) : "",
    // Containers only — an executable row's priority and notes belong to its
    // task, and `updatePlanNode` refuses a node-side write for either.
    priority: node.priority ?? "",
    notes: node.notes ?? "",
    // A ROW PER LINK. It was one-per-line in a textarea, which round-trips
    // fine but hides the fact that this is a list: no way to see how many you
    // have without counting lines, and no way to drop one but to select it.
    links: node.links ?? [],
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      fireToast({ message: "A name is required.", type: "error" });
      return;
    }
    /**
     * Which DAY each instant lands on.
     *
     * The explicit Start date wins; with none, the row's target date stands in,
     * which is the behaviour this dialog had before those two fields existed —
     * a row that only ever had a target date keeps working exactly as it did.
     * End falls back to the start day, so "09:00 to 17:00" needs one date, not
     * two. No day at all means no instant: a time with nothing to pin it to
     * would be stored against an arbitrary date.
     */
    const startDay = form.startDate || form.targetDate || "";
    const endDay = form.endDate || startDay;
    /**
     * THE TIME OF DAY IS NOT EDITED HERE — the table's From / To columns own
     * it. So it is carried over from the row rather than rebuilt: moving a
     * start date in this dialog must move the day and leave "09:00" alone, and
     * a missing input would otherwise silently reset every instant to
     * midnight.
     */
    const from = startDay ? combineDateTime(startDay, toHm(node.startsAt)) : null;
    const to = endDay ? combineDateTime(endDay, toHm(node.endsAt)) : null;
    if (from && to && to < from) {
      fireToast({ message: "The end must be at or after the start.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const res = await updatePlanNode({
        id: node.id,
        name,
        description: form.description.trim() || null,
        ownerId: form.ownerId || null,
        // Omitted entirely on an executable row rather than sent as null, which
        // would read as "clear it" and be refused.
        ...(isExecutable(node.kind)
          ? {}
          : {
              priority: (form.priority || null) as TaskPriority | null,
              notes: form.notes.trim() || null,
            }),
        // Blank rows are the editor's own scaffolding — an empty box someone
        // added and never filled is not a link, and must not be stored as one.
        links: form.links.map((l) => normaliseUrl(l) ?? l.trim()).filter(Boolean),
        targetDate: form.targetDate || null,
        startsAt: from ? from.toISOString() : null,
        endsAt: to ? to.toISOString() : null,
      });
      setSaving(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Saved.", type: "success" });
      onSaved();
    } catch {
      setSaving(false);
      fireToast({
        message: "Couldn't save — your session may have expired. Sign in again and retry.",
        type: "error",
      });
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${KIND_LABEL[node.kind]}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-[620px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl max-md:p-4"
        style={{ borderBottom: `3px solid ${ACCENT}` }}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                style={{ background: ACCENT_SOFT, color: ACCENT_DEEP }}
              >
                {rowRef}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
                Edit {KIND_LABEL[node.kind]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-hairline-strong p-4 max-md:p-3">
          <EditField label={KIND_LABEL[node.kind]}>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={
                node.kind === "result"
                  ? "Result I am committing to produce"
                  : isExecutable(node.kind)
                    ? "Action I am committing to take"
                    : `${KIND_LABEL[node.kind]} name`
              }
              className={EDIT_INPUT}
            />
          </EditField>

          <EditField label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="What this covers — optional"
              className={`${EDIT_INPUT} resize-y`}
            />
          </EditField>

          <div className="mt-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <EditField label="Owner">
              <select
                value={form.ownerId}
                onChange={(e) => set("ownerId", e.target.value)}
                className={EDIT_INPUT}
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </EditField>
            <EditField label="Target date">
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
                className={EDIT_INPUT}
              />
            </EditField>
          </div>

          {/* PRIORITY, on containers only. An Action takes its priority from
              its task — change it from the Priority column, which edits the
              task in place, or from the task drawer. Two editors writing two
              columns for one row is exactly what this module avoids. */}
          {!isExecutable(node.kind) && (
            <div className="mt-3.5">
              <EditField label="Priority">
                <select
                  value={form.priority}
                  onChange={(e) => set("priority", e.target.value)}
                  className={EDIT_INPUT}
                >
                  <option value="">None</option>
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </EditField>
            </div>
          )}

          {/* INITIATOR NOTES — the register's last column, editable here.
              Containers only, for the same reason as Priority: an action's
              notes are its task's, and the task drawer edits them. */}
          {!isExecutable(node.kind) && (
            <div className="mt-3.5">
              <EditField label="Initiator Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  placeholder="Notes only the team sees — optional"
                  className={`${EDIT_INPUT} resize-y`}
                />
              </EditField>
            </div>
          )}

          {/* LINKS — the register's Links column, one row per link. Every
              level has them, because an action's links live on its plan row too
              (that is what the Links cell reads on every register). */}
          <div className="mt-3.5">
            <EditField label="Links">
              <LinkListEditor
                links={form.links}
                onChange={(next) => set("links", next)}
              />
            </EditField>
          </div>

          {/* ATTACHMENTS — the register's Files column, in the dialog.
              The SAME panel that column's popover draws, not a second uploader:
              one list, one delete, one 20 MB rule. Its writes land immediately
              (a file is not a draft you Save), which is why it sits in a box of
              its own rather than among the fields above — those only reach the
              row when you press Save. */}
          <div className="mt-3.5 border-t border-hairline pt-3.5">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              Attachments
            </p>
            <PlanAttachmentPanel nodeId={node.id} canManage={canManage} />
          </div>

          {/* SCHEDULE — only on the levels that own one. A Project or a
              Milestone is dated by the work underneath it (see SCHEDULED_KINDS
              in lib/project-plan/levels.ts), so offering it a start, an end and
              an effort here would invite a second opinion about a date the plan
              already knows. The state stays at whatever the row had, so nothing
              is cleared by the fields being out of sight. */}
          {hasSchedule(node.kind) && (
          <>
          <div className="mt-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
            <EditField label="Start date">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={EDIT_INPUT}
              />
            </EditField>
            <EditField label="End date">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className={EDIT_INPUT}
              />
            </EditField>
            {/* Derived, so it updates as the two dates above are typed and can
                never disagree with them. Read-only for the same reason. */}
            <EditField label="Duration (days)">
              <p className="px-1 py-2 text-[14px] font-bold tabular-nums text-ink-strong">
                {durationDays(
                  form.startDate || form.targetDate || null,
                  form.endDate || form.startDate || form.targetDate || null,
                ) ?? "—"}
              </p>
            </EditField>
          </div>

          </>
          )}

          {isExecutable(node.kind) && (
            <p className="mt-3.5 text-[12.5px] font-medium leading-relaxed text-ink-muted">
              {node.task
                ? "Saving updates the linked WMS task and its calendar entry."
                : "Set an owner and a target date and this becomes a real WMS task on save."}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-hairline-strong px-4 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}


/** Which fields the bulk editor can write. One name per ticked box. */
type BulkFieldName =
  | "ownerId" | "targetDate" | "priority" | "description" | "notes" | "links"
  | "startDate" | "endDate";

/**
 * Edit MANY rows at once — the same fields as EditDialog, applied to every
 * selected row.
 *
 * THE TICK IS THE POINT. A blank box in an ordinary form means "empty"; here it
 * would have to mean both "leave it alone" and "clear it", and those are
 * opposite writes. So every field carries a checkbox: an unticked field is left
 * out of the patch entirely, and `updatePlanNode` leaves that column alone,
 * while a TICKED field is written exactly as typed — empty included, which is
 * how you clear an owner or a target date across a whole selection.
 *
 * NAME IS DELIBERATELY ABSENT. Rows are told apart by their names; one name
 * across a selection would erase that. Rename from the row, or from Edit on it.
 *
 * WHAT A ROW WILL ACCEPT still decides what reaches it. Priority and Notes go
 * only to container rows — an action keeps both on its task, and the action
 * refuses a node-side write for either — and the schedule goes only to the
 * levels that own one. A mixed selection is fine: each row takes the part of
 * the patch that applies to it, and the dialog says how many rows that is
 * BEFORE Save, not after.
 *
 * Writes go through the SAME `updatePlanNode` as the inline cells and the
 * single-row dialog, one row at a time for the reason `bulk()` gives — these
 * writes re-sync linked WMS tasks, so they are not raced.
 */
export function BulkEditDialog({
  targets, employees, onClose, onSaved,
}: {
  targets: DetailTarget[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [apply, setApply] = React.useState<Set<BulkFieldName>>(new Set());
  const [form, setForm] = React.useState({
    ownerId: "", targetDate: "", priority: "", description: "", notes: "",
    startDate: "", endDate: "",
    links: [] as string[],
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const on = React.useCallback((f: BulkFieldName) => apply.has(f), [apply]);

  function toggle(f: BulkFieldName) {
    setApply((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // How much of the selection each restricted group can actually reach.
  const containers = targets.filter((t) => !isExecutable(t.node.kind)).length;
  const scheduled = targets.filter((t) => hasSchedule(t.node.kind)).length;
  const touchesSchedule = on("startDate") || on("endDate");

  /**
   * The patch for ONE row: `null` when nothing ticked applies to it, and
   * "invalid" when the schedule it would end up with runs backwards.
   */
  function patchFor(node: PlanRow): Record<string, unknown> | null | "invalid" {
    const container = !isExecutable(node.kind);
    const sched = hasSchedule(node.kind);
    const patch: Record<string, unknown> = { id: node.id };

    if (on("description")) patch.description = form.description.trim() || null;
    if (on("ownerId")) patch.ownerId = form.ownerId || null;
    if (on("targetDate")) patch.targetDate = form.targetDate || null;
    if (on("links")) {
      patch.links = form.links.map((l) => normaliseUrl(l) ?? l.trim()).filter(Boolean);
    }
    if (container && on("priority")) patch.priority = (form.priority || null) as TaskPriority | null;
    if (container && on("notes")) patch.notes = form.notes.trim() || null;

    if (sched && touchesSchedule) {
      /**
       * Only the DAY is set here. The TIME of day always comes from the row —
       * the table's From / To columns own it, and a selection that shared one
       * clock time would flatten work that deliberately runs at different
       * hours. So a new start date moves the day and every row keeps its own
       * "09:00".
       */
      const startDay =
        (on("startDate") ? form.startDate : toYmd(node.startsAt)) ||
        (on("targetDate") ? form.targetDate : node.targetDate ?? "");
      const endDay = (on("endDate") ? form.endDate : toYmd(node.endsAt)) || startDay;
      const fromTime = toHm(node.startsAt);
      const toTime = toHm(node.endsAt);
      const startsAt = startDay ? combineDateTime(startDay, fromTime) : null;
      const endsAt = endDay ? combineDateTime(endDay, toTime) : null;
      if (startsAt && endsAt && endsAt < startsAt) return "invalid";
      patch.startsAt = startsAt ? startsAt.toISOString() : null;
      patch.endsAt = endsAt ? endsAt.toISOString() : null;
    }

    return Object.keys(patch).length > 1 ? patch : null;
  }

  /** Rows this Save would actually change — the number on the button. */
  const willWrite = React.useMemo(
    () => targets.filter((t) => patchFor(t.node) !== null).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, apply, form],
  );

  async function save() {
    if (apply.size === 0) {
      fireToast({ message: "Tick at least one field to apply.", type: "error" });
      return;
    }
    setSaving(true);
    let ok = 0;
    let failed = 0;
    let skipped = 0;
    for (const t of targets) {
      const patch = patchFor(t.node);
      if (patch === null) { skipped++; continue; }
      if (patch === "invalid") { failed++; continue; }
      try {
        const res = await updatePlanNode(patch);
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setSaving(false);
    const tail = [
      failed ? `${failed} failed` : "",
      skipped ? `${skipped} unaffected` : "",
    ].filter(Boolean).join(", ");
    fireToast({
      message: tail
        ? `Updated ${ok} of ${targets.length} rows — ${tail}.`
        : `Updated ${ok} row${ok === 1 ? "" : "s"}.`,
      type: failed ? "error" : "success",
    });
    onSaved();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${targets.length} rows`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl max-md:p-4"
        style={{ borderBottom: `3px solid ${ACCENT}` }}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                style={{ background: ACCENT_SOFT, color: ACCENT_DEEP }}
              >
                {targets.length}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
                Edit {targets.length} rows
              </span>
            </div>
            <p className="text-[12.5px] font-medium leading-relaxed text-ink-muted">
              Tick a field to write it to every selected row. Anything left unticked stays exactly as it is.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* WHICH ROWS. Scrolls rather than growing, so a fifty-row selection
            does not push Save off the bottom of the screen. */}
        <div className="mb-4 max-h-[104px] overflow-y-auto rounded-xl border border-hairline bg-surface-soft px-3 py-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {targets.map((t) => (
              <span
                key={t.node.id}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft"
              >
                <span className="font-bold tabular-nums" style={{ color: ACCENT_DEEP }}>{t.ref}</span>
                <span className="max-w-[190px] truncate" title={t.node.name}>{t.node.name}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-hairline-strong p-4 max-md:p-3">
          <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <BulkField label="Owner" on={on("ownerId")} onToggle={() => toggle("ownerId")}>
              <select
                value={form.ownerId}
                onChange={(e) => set("ownerId", e.target.value)}
                className={EDIT_INPUT}
              >
                <option value="">Unassigned (clears the owner)</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </BulkField>
            <BulkField label="Target date" on={on("targetDate")} onToggle={() => toggle("targetDate")}>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
                className={EDIT_INPUT}
              />
            </BulkField>
          </div>

          <div className="mt-3.5">
            <BulkField label="Description" on={on("description")} onToggle={() => toggle("description")}>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Replaces the description on every selected row"
                className={`${EDIT_INPUT} resize-y`}
              />
            </BulkField>
          </div>

          {/* PRIORITY and NOTES — containers only, exactly as in EditDialog: an
              action's priority and notes ARE its task's, and `updatePlanNode`
              refuses a node-side write for either. Executable rows in the
              selection simply do not receive these two. */}
          <div className="mt-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <BulkField
              label="Priority"
              on={on("priority")}
              onToggle={() => toggle("priority")}
              hint={`Container rows only — ${containers} of ${targets.length} selected.`}
            >
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className={EDIT_INPUT}
              >
                <option value="">None (clears it)</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </BulkField>
          </div>

          <div className="mt-3.5">
            <BulkField
              label="Initiator Notes"
              on={on("notes")}
              onToggle={() => toggle("notes")}
              hint={`Container rows only — ${containers} of ${targets.length} selected. An action keeps its notes on its task.`}
            >
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="Replaces the notes on every container row"
                className={`${EDIT_INPUT} resize-y`}
              />
            </BulkField>
          </div>

          <div className="mt-3.5">
            <BulkField
              label="Links"
              on={on("links")}
              onToggle={() => toggle("links")}
              hint="Replaces the whole list on every selected row."
            >
              <LinkListEditor
                links={form.links}
                onChange={(next) => set("links", next)}
              />
            </BulkField>
          </div>

          {/* SCHEDULE — the two DAYS, and only those. The time of day stays
              on each row, edited from the table's From / To columns. */}
          <div className="mt-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <BulkField label="Start date" on={on("startDate")} onToggle={() => toggle("startDate")}>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={EDIT_INPUT}
              />
            </BulkField>
            <BulkField label="End date" on={on("endDate")} onToggle={() => toggle("endDate")}>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className={EDIT_INPUT}
              />
            </BulkField>
          </div>
          {touchesSchedule && (
            <p className="mt-2 text-[12px] font-medium leading-relaxed text-ink-muted">
              Schedule reaches scheduled levels only — {scheduled} of {targets.length} selected. A row
              with no start date of its own falls back to its target date, and each row keeps its
              own time of day.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
          <p className="text-[12.5px] font-semibold text-ink-muted">
            {apply.size === 0
              ? "Nothing ticked yet."
              : `${willWrite} of ${targets.length} rows will change.`}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-hairline-strong px-4 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || apply.size === 0 || willWrite === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
              {saving ? "Saving…" : `Apply to ${willWrite} row${willWrite === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * One bulk field: a tick, its label, and the input the tick governs.
 *
 * The `fieldset` does the work — unticked, it disables everything inside it, so
 * a field nobody armed cannot be typed into and then quietly not saved. Dimming
 * alone would leave that trap open.
 */
function BulkField({
  label, on, onToggle, hint, children,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={on}
          onChange={onToggle}
          className="size-3.5 shrink-0 cursor-pointer accent-[#E10600]"
        />
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: on ? ACCENT_DEEP : "var(--color-ink-subtle)" }}
        >
          {label}
        </span>
      </label>
      <fieldset disabled={!on} className={`min-w-0 border-0 p-0 ${on ? "" : "opacity-45"}`}>
        {children}
      </fieldset>
      {on && hint ? (
        <p className="mt-1 text-[11.5px] font-medium leading-snug text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}


/**
 * The Links field — one input per link, with a remove on each and one button to
 * add another.
 *
 * IT REPLACES A TEXTAREA of one-URL-per-line. That round-tripped a list, but it
 * did not look like one: no count without reading, no way to drop the third
 * entry but to select exactly its line, and a stray blank line silently became
 * nothing. Rows make all three obvious.
 *
 * THE VALUE STAYS RAW while you type — normalising on every keystroke would
 * rewrite "d" into "https://d" under the cursor. `normaliseUrl` runs once, on
 * Save, which is also where blank rows are dropped: an empty box someone added
 * and never filled is scaffolding, not a link.
 *
 * Shared by the single-row dialog and the bulk editor, because both write the
 * SAME `links` column and a list that behaved differently in the two would be a
 * trap the first time somebody used both.
 */
function LinkListEditor({
  links,
  onChange,
}: {
  links: string[];
  onChange: (next: string[]) => void;
}) {
  function set(i: number, v: string) {
    onChange(links.map((l, j) => (j === i ? v : l)));
  }

  return (
    <div className="space-y-1.5">
      {links.map((url, i) => (
        // The INDEX is the key on purpose: these are free-text boxes being
        // typed into, and keying by value would remount the input — losing the
        // caret — on every keystroke.
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={url}
            onChange={(e) => set(i, e.target.value)}
            placeholder="https://…"
            aria-label={`Link ${i + 1}`}
            className={`${EDIT_INPUT} font-mono text-[13px]`}
          />
          <button
            type="button"
            onClick={() => onChange(links.filter((_, j) => j !== i))}
            aria-label={`Remove link ${i + 1}`}
            title="Remove this link"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-hairline-strong text-ink-subtle transition-colors hover:border-[#E10600] hover:text-[#B4160E]"
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...links, ""])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-hairline-strong px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[#E10600] hover:text-ink-strong"
      >
        <Plus size={13} strokeWidth={2.6} aria-hidden />
        {links.length === 0 ? "Add a link" : "Add another link"}
      </button>
    </div>
  );
}

const EDIT_INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-[#E10600] disabled:bg-surface-soft disabled:opacity-60";

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</p>
      {children}
    </div>
  );
}

/**
 * One labelled, read-only field: a small caps label over a filled box.
 *
 * A box rather than bare text, matching the Goals dialog: it keeps an empty
 * value the same height as a filled one, so the grid never jumps around as
 * rows with different amounts of data are opened.
 */
function ReadField({
  label, value, placeholder = "—", wide,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  wide?: boolean;
}) {
  const empty = !value;
  return (
    <div className={wide ? "w-full" : "min-w-0"}>
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</p>
      <div
        className={`truncate rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[13.5px] ${
          empty ? "font-medium text-ink-subtle" : "font-semibold text-ink-strong"
        }`}
        title={value ?? undefined}
      >
        {value || placeholder}
      </div>
    </div>
  );
}

function IconBtn({
  children, label, onClick, disabled, accent, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid size-6 place-items-center rounded transition-colors disabled:opacity-25"
      style={
        accent
          ? { color: ACCENT_DEEP, background: ACCENT_SOFT }
          : danger
            ? { color: "var(--color-altus-red, #dc2626)" }
            : { color: "var(--color-ink-subtle)" }
      }
    >
      {children}
    </button>
  );
}
