"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
  type SortingState,
  type RowSelectionState,
  type Updater,
  type Table as TableInstance,
} from "@tanstack/react-table";
import { differenceInCalendarDays } from "date-fns";

// Classic numbered pagination: a rows-per-page selector (default 25) with
// First « · Prev · 1 2 3 … N · Next · Last » controls.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
// Progressive disclosure replaces paging: the grid opens at 13 rows and grows
// by 13 on each Load More. TanStack's pagination row model still does the
// slicing — pageIndex is pinned at 0 and pageSize IS the visible count — so
// sorting, grouping and the phone card list all stay on the same slice for free.
const INITIAL_ROWS = 13;
const LOAD_MORE_STEP = 13;


// date-fns `format()` throws RangeError on a null/invalid Date — which would
// crash the ENTIRE table render. Guard every cell so one bad row degrades to
// "—" instead of taking down the whole list.
function safeFormat(value: unknown): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "—" : formatDate(d);
}

// Due-date urgency for the list. Terminal/finished tasks never read as overdue
// — only open work is "on fire". `soon` = due within the next 2 days.
const URGENCY_TERMINAL = new Set<TaskStatus>([
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
]);
type Urgency = { level: "overdue" | "today" | "soon" | "none"; label: string };
function taskUrgency(dueAt: Date | null, status: TaskStatus): Urgency {
  if (!dueAt || URGENCY_TERMINAL.has(status)) return { level: "none", label: "" };
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt as unknown as string);
  if (Number.isNaN(d.getTime())) return { level: "none", label: "" };
  const days = differenceInCalendarDays(d, new Date()); // <0 past, 0 today, >0 future
  if (days < 0) return { level: "overdue", label: `${Math.abs(days)}d overdue` };
  if (days === 0) return { level: "today", label: "Due today" };
  if (days <= 2) return { level: "soon", label: `in ${days}d` };
  return { level: "none", label: "" };
}
// Tone token per urgency level, for the chip + the row's left accent.
const URGENCY_COLOR: Record<Urgency["level"], string> = {
  overdue: "var(--color-red-deep)",
  today: "var(--color-orange-deep)",
  soon: "var(--color-ink-soft)",
  none: "var(--color-ink-muted)",
};
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  SlidersHorizontal,
  Check,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  ChevronDown,
  Search,
  SearchX,
  X,
  Building2,
  Tag,
  CircleDot,
  User,
  Flag,
  Ban,
  Group as GroupIcon,
  type LucideIcon,
  GripVertical,
} from "lucide-react";

// Group-by options for the Tasks table. "none" = flat list (default).
type GroupKey = "none" | "client" | "subject" | "status" | "employee" | "priority";
const GROUP_OPTIONS: { key: GroupKey; label: string; Icon: LucideIcon }[] = [
  { key: "none", label: "None", Icon: Ban },
  { key: "client", label: "Client", Icon: Building2 },
  { key: "subject", label: "Subject", Icon: Tag },
  { key: "status", label: "Doer Status", Icon: CircleDot },
  { key: "employee", label: "Employee", Icon: User },
  { key: "priority", label: "Priority", Icon: Flag },
];

// The section label a row falls under for the current grouping. NULL/empty
// values collapse into a single explicit "—" bucket rather than vanishing;
// status/priority groups use the human label (admin-overridable for status).
function groupValue(
  row: TaskListRow,
  by: Exclude<GroupKey, "none">,
  statusLabels: Record<TaskStatus, string>,
): string {
  if (by === "status") return statusLabels[row.status] ?? row.status;
  if (by === "priority") return PRIORITY_LABELS[row.priority];
  if (by === "employee") {
    const v = row.doerName?.trim();
    return v && v.length > 0 ? v : "— Unassigned";
  }
  const raw = by === "client" ? row.client : row.subject;
  const v = raw?.trim();
  return v && v.length > 0 ? v : by === "client" ? "— No client" : "— No subject";
}
import { CriticalBadge } from "@/components/ui/critical-badge";
import { PRIORITY_LABELS, TASK_STATUSES, TASK_PRIORITIES } from "@/db/enums";
import type { TaskStatus, StatusColorToken, TaskPriority } from "@/db/enums";

// Canonical status order (Not Read → … → Done → Approved → …) so grouping /
// sorting by status follows the workflow rather than alphabetical by label.
const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  TASK_STATUSES.map((s, i) => [s, i]),
);

// Priority rank (Critical → Important → Urgent → Normal) so grouping/sorting
// by priority follows severity, not the enum's alphabetical string order.
const PRIORITY_RANK: Record<string, number> = Object.fromEntries(
  TASK_PRIORITIES.map((p, i) => [p, i]),
);
import type { TaskListRow } from "@/lib/types";
import { TaskRowActions } from "./task-row-actions";
import { TaskTimerCell } from "./task-timer-cell";
import { BulkActionBar } from "./bulk-action-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { LateBadge } from "@/components/ui/late-badge";
import { isDoneLate } from "@/lib/task-late";
import { InlineStatusCell } from "./inline-status-cell";
import { canEditTaskFields } from "@/lib/auth/task-permissions";
import {
  InlineDoerCell,
  InlinePriorityCell,
  InlineDueCell,
} from "./inline-edit-cells";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
  formatDate,
} from "@/lib/format";
import {
  useSectionSearch,
  matchesSearch,
  setSectionSearch,
} from "@/lib/client/section-search";

// Friendly labels for the column show/hide menu (#11).
const COLUMN_LABELS: Record<string, string> = {
  timer: "Action",
  taskNo: "ID No.",
  client: "Client",
  doerName: "Doer",
  priority: "Priority",
  status: "Doer Status",
  subject: "Subject",
  createdAt: "Created",
  dueAt: "Due",
  ageDays: "Age",
};

// Columns hidden on a fresh install. Both stay in the Columns menu — this is
// a DEFAULT, not a removal — so anyone who wants the task number or the created
// date ticks it back on and the choice persists.
//
// They lead the table today but answer almost nothing: the ID is an internal
// handle nobody quotes, and "Created" is the one date that never drives a
// decision (Due and Age both do). Hiding them hands their width to the columns
// people actually read.
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  taskNo: false,
  createdAt: false,
};

// v2, bumped deliberately. The persist effect below writes on EVERY mount, so
// every existing user already has a v1 blob saying "{}" = show everything. Read
// under the old key and that blob would immediately overwrite the defaults
// above and nobody would ever see this change. Bumping the key retires those
// entries; a v2 blob only exists once someone has actually opened the Columns
// menu, and that choice is theirs to keep.
const COLUMN_VIS_STORAGE_KEY = "altus.tasks.columnVisibility.v2";

type StatusLabels = Record<TaskStatus, string>;
type StatusTones = Record<TaskStatus, StatusColorToken>;

// Per-column display hints. `mobileHide` collapses low-priority columns at
// ≤768px; `align` centers the date/age columns; `narrow` caps the Subject
// width so it stays compact.
type TaskCol = ColumnDef<TaskListRow> & {
  meta?: { mobileHide?: boolean; align?: "center" | "right"; narrow?: boolean; wide?: boolean };
};

/**
 * A column's stable id. TanStack derives it from `id` when present and from
 * `accessorKey` otherwise; the persisted order has to key off the SAME string
 * or a saved layout will not match the live columns after a reload.
 */
function colId(c: TaskCol): string {
  const anyCol = c as { id?: string; accessorKey?: string };
  return anyCol.id ?? anyCol.accessorKey ?? "";
}

/** Columns that stay put: the select checkbox and the row-actions rail are
 *  positional furniture, not data, and both are sticky-pinned to an edge. */
const UNMOVABLE_COLUMNS = new Set(["select", "actions"]);

/**
 * LEFT-FROZEN COLUMNS and their widths in px (Sir).
 *
 * Client · Subject · Task stay visible while the table scrolls sideways, and
 * the Action (Start/Stop) rail rides with them so work can be started from any
 * row without scrolling back. `select` is in here too — it is not one of the
 * three, but leaving it behind would hide the checkboxes the moment you scrolled,
 * which quietly breaks every bulk action.
 *
 * The widths must be EXPLICIT. `left:` offsets are absolute, so they can only be
 * computed if each frozen column's width is known — with `auto` layout a column
 * sizes to its content and the offsets would drift row by row. This is also
 * where the Task column gets its ~2/3 width: it was `max-w-[64ch]` (≈560px) and
 * is now 360px, with ellipsis rather than wrapping so rows stay one line tall.
 *
 * Key order here is irrelevant — the running offset is computed from the LIVE
 * column order at render time, so a user who reorders columns still gets
 * correct positions.
 */
const FROZEN_LEFT_WIDTH: Record<string, number> = {
  select: 44,
  client: 150,
  subject: 150,
  title: 360,
  timer: 92,
};

/**
 * Cumulative `left` offset for each frozen column, in the order they are
 * actually rendered. A column's offset is the sum of the widths of the frozen
 * columns BEFORE it; anything not frozen scrolls underneath and contributes
 * nothing.
 */
function frozenLeftOffsets(orderedIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  let acc = 0;
  for (const id of orderedIds) {
    const w = FROZEN_LEFT_WIDTH[id];
    if (w === undefined) continue;
    out[id] = acc;
    acc += w;
  }
  return out;
}


function buildColumns(
  employees: { id: string; name: string }[],
  me: { id: string; isAdmin: boolean; canChangeDoer?: boolean },
  statusLabels: StatusLabels,
  statusTones: StatusTones,
  /** Present only when the list opens records in the drawer. */
  onOpenTask?: (id: string) => void,
): TaskCol[] {
  return [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      meta: { narrow: true, align: "center" },
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(v) => table.toggleAllPageRowsSelected(v)}
          ariaLabel="Select all tasks on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onChange={(v) => row.toggleSelected(v)}
          ariaLabel="Select task"
        />
      ),
    },
    {
      accessorKey: "taskNo",
      header: "ID No.",
      meta: { narrow: true },
      cell: (info) => {
        const n = info.getValue<number | null>();
        return n == null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className="font-bold tabular-nums text-ink-soft" style={{ fontSize: 14 }}>
            #{n}
          </span>
        );
      },
    },
    {
      accessorKey: "client",
      header: "Client",
      meta: { narrow: true },
      // Sort nulls last and case-insensitively so "altus" and "Altus" cluster.
      sortingFn: (a, b) =>
        (a.original.client ?? "￿").localeCompare(b.original.client ?? "￿", undefined, {
          sensitivity: "base",
        }),
      cell: (info) => {
        const v = info.getValue<string | null>();
        return v ? (
          <span className="text-ink-strong font-semibold" style={{ fontSize: 15 }}>
            {v}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        );
      },
    },
    {
      accessorKey: "subject",
      header: "Subject",
      meta: { narrow: true },
      cell: (info) => (
        <span className="text-body-lg text-ink-muted">
          {info.getValue<string>() ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "title",
      header: "Task",
      meta: { wide: true },
      cell: ({ row }) => (
        <TaskTitleCell row={row.original} onOpen={onOpenTask} />
      ),
    },
    // TIMER — takes the slot the Start Time / End Time columns held. Those two
    // showed WHEN work happened; this lets you act on it, which is what the
    // leading column of a work queue is for. Both timestamps are still on the
    // row payload (and still stamped by the engine) — only their columns are
    // gone.
    {
      id: "timer",
      header: "Action",
      enableSorting: false,
      // `narrow` keeps it out of the flexible-width pool; the w-24/min-w-[90px]
      // box is applied on the cells themselves (see the th/td below) because
      // `meta` carries hints, not classes.
      meta: { narrow: true, align: "center" },
      cell: ({ row }) => (
        // Explicit flex centring rather than leaning on the td's text-center:
        // the button is the cell's only content and a fixed-width frozen column
        // is exactly where an off-centre control is most obvious.
        <div className="flex items-center justify-center">
        <TaskTimerCell
          taskId={row.original.id}
          running={row.original.timerRunning}
          // The engine allows admin, the doer, OR the doer's manager. The
          // manager leg needs the org chart, which the table does not have, so
          // the inline control shows for admin + doer and managers keep using
          // the drawer. Better a missing button than one that always errors.
          canOperate={me.isAdmin || me.id === row.original.doerId}
        />
        </div>
      ),
    },
    {
      accessorKey: "doerName",
      header: "Doer",
      cell: ({ row }) => (
        <InlineDoerCell
          taskId={row.original.id}
          doerId={row.original.doerId}
          doerName={row.original.doerName}
          employees={employees}
          // DOER = MANAN ONLY (Sir), not every admin. Optional prop, so a caller
          // that forgets to pass it renders a plain read-only name rather than
          // silently handing the control to the wrong person. The server action
          // enforces the same rule — this only hides the affordance.
          editable={me.canChangeDoer === true}
        />
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      meta: { mobileHide: true },
      sortingFn: (a, b) =>
        (PRIORITY_RANK[a.original.priority] ?? 99) - (PRIORITY_RANK[b.original.priority] ?? 99),
      cell: ({ row }) => (
        <InlinePriorityCell
          taskId={row.original.id}
          priority={row.original.priority as TaskPriority}
          editable={me.isAdmin}
        />
      ),
    },
    {
      accessorKey: "status",
      // "Doer Status", not "Status" — the column holds the WORKER's progress.
      // The manager's ruling is a separate thing, set from the bulk bar's
      // "Manager Status" control and stored in a different column entirely
      // (`approval_status`). Naming them both "Status" is what made the two
      // read as one control.
      header: "Doer Status",
      sortingFn: (a, b) =>
        (STATUS_ORDER[a.original.status] ?? 99) - (STATUS_ORDER[b.original.status] ?? 99),
      cell: (info) => {
        const row = info.row.original;
        const canEdit = canEditTaskFields({
          employee: me,
          task: {
            createdById: row.createdById,
            initiatorId: row.initiatorId,
            doerId: row.doerId,
            status: row.status,
          },
        });
        return (
          <span className="inline-flex items-center gap-1.5">
            <InlineStatusCell
              taskId={row.id}
              status={row.status}
              updatedAt={row.updatedAt}
              labels={statusLabels}
              tones={statusTones}
              isAdmin={me.isAdmin}
              editable={canEdit}
            />
            {isDoneLate({ status: row.status, completedAt: row.completedAt, dueAt: row.dueAt }) && (
              <LateBadge />
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      meta: { mobileHide: true, align: "center" },
      cell: (info) => (
        <span className="text-body-lg text-ink-muted tabular-nums">
          {safeFormat(info.getValue<Date>())}
        </span>
      ),
    },
    {
      accessorKey: "dueAt",
      header: "Due",
      meta: { align: "center" },
      cell: ({ row }) => (
        <InlineDueCell
          taskId={row.original.id}
          dueAt={row.original.dueAt}
          status={row.original.status}
          editable={me.isAdmin}
        />
      ),
    },
    {
      accessorKey: "ageDays",
      header: "Age",
      meta: { mobileHide: true, align: "center" },
      // `ageDays` is computed server-side in lib/queries/tasks.ts as
      // (today | day it closed) − effective due date. Positive = days late,
      // 0 = due today, negative = days still remaining.
      cell: (info) => {
        const d = info.getValue<number>();
        return (
          <span
            className={`text-body-lg tabular-nums ${
              // Late is the only state worth colouring. Everything else is
              // either on schedule or ahead of it, and tinting those competes
              // with the Due column's own urgency treatment right beside it.
              d > 0 ? "font-semibold text-red-600" : "text-ink"
            }`}
          >
            {/* Plain signed integer days. The old "< 1d" is gone: it existed
                for a created-relative age where 0 meant "less than a day old",
                and under this formula 0 means exactly "due today". */}
            {d}d
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <TaskRowActions row={row.original} employees={employees} me={me} />,
      enableSorting: false,
    },
  ];
}

export function TaskTable({
  rows,
  employees,
  me,
  statusLabels,
  statusTones,
  subjects,
  clients,
  openInDrawer = false,
  filterLabel = null,
}: {
  rows: TaskListRow[];
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean; canChangeDoer?: boolean };
  statusLabels?: StatusLabels;
  statusTones?: StatusTones;
  /** Bulk-set option rosters. When omitted, fall back to the distinct
   *  subject/client values present in the current rows. */
  subjects?: string[];
  clients?: string[];
  /** Open the record in the side drawer (`?task=`) instead of navigating away
   *  to /tasks/[id]. Modifier-clicks still open the full page in a new tab. */
  openInDrawer?: boolean;
  /** The active quick-filter pill's label ("Not Read", "Done", …), or null.
   *  Named in the footer count so "Showing all 175 tasks" says WHICH 175. */
  filterLabel?: string | null;
}) {
  const resolvedLabels = statusLabels ?? STATUS_LABELS_FALLBACK;
  const resolvedTones = statusTones ?? STATUS_TONES_FALLBACK;

  // Declared ahead of the `columns` memo below, which closes over `openTask`.
  const drawerRouter = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** Put the record on the URL so the drawer opens. Every existing filter
   *  param is preserved, which is what keeps the list underneath unchanged. */
  const openTask = React.useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("task", id);
      drawerRouter.push(`${pathname}?${next.toString()}` as never, {
        scroll: false,
      });
    },
    [drawerRouter, pathname, searchParams],
  );
  // Prefer the server-provided rosters; otherwise derive distinct values from
  // the loaded rows so bulk Subject/Client still works on pages that don't
  // pass the full picker lists (e.g. Archived).
  const subjectOptions = React.useMemo(
    () =>
      subjects ??
      Array.from(
        new Set(rows.map((r) => r.subject).filter((s): s is string => !!s)),
      ).sort((a, b) => a.localeCompare(b)),
    [subjects, rows],
  );
  const clientOptions = React.useMemo(
    () =>
      clients ??
      Array.from(
        new Set(rows.map((r) => r.client).filter((c): c is string => !!c)),
      ).sort((a, b) => a.localeCompare(b)),
    [clients, rows],
  );
  const columns = React.useMemo(
    () =>
      buildColumns(
        employees,
        me,
        resolvedLabels,
        resolvedTones,
        openInDrawer ? openTask : undefined,
      ),
    [employees, me, resolvedLabels, resolvedTones, openInDrawer, openTask],
  );

  // #11 — per-user column visibility, persisted in localStorage. Seeded from
  // the module-level DEFAULT, which is a static object — identical on the
  // server and on the first client render — so it carries no hydration risk
  // (the reason this used to start as `{}`). The saved choice loads after mount.
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_VIS_STORAGE_KEY);
      // Spread OVER the defaults rather than replacing them: a stored blob only
      // names the columns that existed when it was written, so a plain replace
      // would silently show any column added later that ships hidden.
      if (raw) {
        setColumnVisibility({
          ...DEFAULT_COLUMN_VISIBILITY,
          ...(JSON.parse(raw) as VisibilityState),
        });
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_VIS_STORAGE_KEY,
        JSON.stringify(columnVisibility),
      );
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [columnVisibility]);

  // ── Drag-to-reorder column order, saved PER USER ────────────────────────
  //
  // Keyed by employee id, not merely by browser: two people sharing a machine
  // must not inherit each other's layout. One person's arrangement is theirs
  // alone and never becomes the default for anyone else.
  //
  // localStorage rather than a new table: there is no general UI-preference
  // store in this schema, and the column-visibility setting above already
  // established this as the house pattern for task-table layout. The trade-off
  // is that the order does not follow a user to another browser or device.
  const orderKey = `altus.tasks.columnOrder.v1:${me.id}`;
  const defaultOrder = React.useMemo(() => columns.map((c) => colId(c)), [columns]);
  const [columnOrder, setColumnOrder] = React.useState<string[]>(defaultOrder);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(orderKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as string[];
      // RECONCILE, never trust wholesale: a stored order names the columns that
      // existed when it was written. Drop ids since removed and append columns
      // added since — otherwise a new column would be invisible to anyone who
      // had ever reordered, which is a silent data-loss bug.
      const known = new Set(defaultOrder);
      const kept = saved.filter((id) => known.has(id));
      const added = defaultOrder.filter((id) => !kept.includes(id));
      setColumnOrder([...kept, ...added]);
    } catch {
      /* ignore malformed storage */
    }
  }, [orderKey, defaultOrder]);
  React.useEffect(() => {
    try {
      localStorage.setItem(orderKey, JSON.stringify(columnOrder));
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [orderKey, columnOrder]);

  // Which header is being dragged, and where it would land. `null` = idle.
  const [dragCol, setDragCol] = React.useState<string | null>(null);
  const [dropCol, setDropCol] = React.useState<string | null>(null);

  /** Move `from` to sit where `to` currently is, preserving everything else. */
  const moveColumn = React.useCallback((from: string, to: string) => {
    if (from === to) return;
    setColumnOrder((prev) => {
      const next = prev.filter((id) => id !== from);
      const at = next.indexOf(to);
      if (at < 0) return prev;
      next.splice(at, 0, from);
      return next;
    });
  }, []);

  // Click-to-sort state (the user's chosen column) + group-by selection.
  // When grouped, the group column becomes the PRIMARY sort key so rows
  // cluster, and the user's sort applies within each group — see
  // `effectiveSorting`. We strip the group key out of `sorting` so toggling
  // grouping off restores exactly the user's manual sort.
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [groupBy, setGroupBy] = React.useState<GroupKey>("none");
  // Multi-select (bulk actions). Keyed by task id via getRowId, so selection
  // survives sorting, paging, and grouping.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  // Keyboard list navigation: J/K move a highlight, Enter opens, F → Focus
  // mode. Tracked by task id so it survives re-sorts.
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const router = useRouter();
  // How many rows are rendered. Grows on Load More; never shrinks except when
  // the underlying list changes (new search / grouping / filter).
  const [shown, setShown] = React.useState<number>(INITIAL_ROWS);

  // Free-text search across task no + the human-readable fields. Runs purely
  // client-side over the already-loaded rows (the list query returns the full
  // filtered set), so it's instant and needs no server round-trip.
  const [query, setQuery] = React.useState("");
  // The FilterBar's section search sits above this table. Both boxes narrow the
  // same set through the SAME matcher and AND together, so whichever you type
  // in behaves identically and neither silently overrides the other.
  const sectionQuery = useSectionSearch();

  const matchesRow = React.useCallback(
    (r: TaskListRow, q: string) => {
      if (!q) return true;
      const qNum = q.replace(/^#/, ""); // "#1042" or "1042" both match the No.
      if (r.taskNo != null && String(r.taskNo).includes(qNum)) return true;
      return matchesSearch(
        q,
        r.title,
        r.subject,
        r.client,
        r.doerName,
        r.initiatorName,
        resolvedLabels[r.status] ?? r.status,
      );
    },
    [resolvedLabels],
  );

  const visibleRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !sectionQuery) return rows;
    return rows.filter((r) => matchesRow(r, q) && matchesRow(r, sectionQuery));
  }, [rows, query, sectionQuery, matchesRow]);

  const groupColId =
    groupBy === "client" ? "client"
    : groupBy === "subject" ? "subject"
    : groupBy === "status" ? "status"
    : groupBy === "employee" ? "doerName"
    : groupBy === "priority" ? "priority"
    : null;

  const effectiveSorting = React.useMemo<SortingState>(() => {
    if (!groupColId) return sorting;
    return [{ id: groupColId, desc: false }, ...sorting.filter((s) => s.id !== groupColId)];
  }, [groupColId, sorting]);

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = typeof updater === "function" ? updater(effectiveSorting) : updater;
    // Persist only the user's part; the group key is re-applied each render.
    setSorting(groupColId ? next.filter((s) => s.id !== groupColId) : next);
  }

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { columnVisibility, columnOrder, sorting: effectiveSorting, rowSelection },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Used as a "first N rows" window, not as pages: pageIndex stays 0 and
    // pageSize tracks `shown`. Sorting/visibility still apply across the FULL
    // set before the slice, so Load More reveals the next rows in order rather
    // than re-sorting what is on screen.
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: INITIAL_ROWS } },
    autoResetPageIndex: false,
  });

  // The window is always the first `shown` rows.
  React.useEffect(() => {
    table.setPageSize(shown);
    table.setPageIndex(0);
  }, [shown, table]);

  // Total rows per group across the full (unpaginated) set, for the count
  // shown in each group header. Keyed by the same label `groupValue` renders.
  const groupCounts = React.useMemo(() => {
    if (groupBy === "none") return null;
    const m = new Map<string, number>();
    for (const r of visibleRows) {
      const k = groupValue(r, groupBy, resolvedLabels);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [groupBy, visibleRows, resolvedLabels]);

  // Regrouping reorders everything, so collapse back to the first 13 rather
  // than leaving a long expansion pointing at a list that no longer matches it.
  React.useEffect(() => {
    setShown(INITIAL_ROWS);
  }, [groupBy]);

  // A new search is a different list — start it at 13 again.
  React.useEffect(() => {
    setShown(INITIAL_ROWS);
  }, [query]);

  // Scroll the table back into view when the page changes, so the new rows are
  // visible without a manual scroll up.
  const listTopRef = React.useRef<HTMLDivElement>(null);

  // J/K/Enter/F — keyboard navigation over the current page's rows. Skips when
  // typing or when a modifier is held, so it never fights ⌘K, browser
  // shortcuts, or text entry. Coexists with the global G-sequences (different
  // keys).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const ids = table.getRowModel().rows.map((r) => r.original.id);
      if (ids.length === 0) return;
      const cur = focusedId ? ids.indexOf(focusedId) : -1;
      const k = e.key.toLowerCase();
      if (k === "j") {
        e.preventDefault();
        setFocusedId(ids[cur < 0 ? 0 : Math.min(ids.length - 1, cur + 1)] ?? null);
      } else if (k === "k") {
        e.preventDefault();
        setFocusedId(ids[cur < 0 ? 0 : Math.max(0, cur - 1)] ?? null);
      } else if (cur >= 0 && (e.key === "Enter" || k === "f")) {
        // Don't steal Enter from a focused button / link / menu item.
        const ae = document.activeElement as HTMLElement | null;
        if (e.key === "Enter" && ae && (ae.tagName === "BUTTON" || ae.tagName === "A")) {
          return;
        }
        e.preventDefault();
        router.push(`/tasks/${focusedId}${k === "f" ? "/focus" : ""}` as Route);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [table, focusedId, router]);

  // Keep the highlighted row visible while J/K-ing through a tall list.
  React.useEffect(() => {
    if (!focusedId) return;
    document
      .querySelector(`[data-task-row="${focusedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  // Pre-slice total = every row that survived filters + search. `rendered` is
  // what the window is actually showing, which is `shown` until the list runs
  // out. Both feed the footer's "Showing X of Y".
  const totalFiltered = table.getPrePaginationRowModel().rows.length;
  const rendered = Math.min(shown, totalFiltered);
  const hasMore = rendered < totalFiltered;

  /** Cell (body) alignment. Headers are ALWAYS left — see `headAlign` below. */
  function alignClass(c: TaskCol): string {
    const a = c.meta?.align;
    return a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
  }

  // Frozen-column offsets, from the LIVE order — so a user who has reordered
  // their columns still gets correct sticky positions. Recomputed only when the
  // visible set or its order changes, not on every row.
  const leafIds = table.getVisibleLeafColumns().map((c) => c.id);
  const frozenLeft = React.useMemo(
    () => frozenLeftOffsets(leafIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafIds.join("|")],
  );
  /** The right-hand edge of the frozen block — the only cell that draws the
   *  drop shadow, so the group reads as one slab rather than stacked cards. */
  const lastFrozenId = leafIds.filter((id) => id in FROZEN_LEFT_WIDTH).pop();

  /**
   * Sticky presentation for one column, shared by the <th> and the <td> so the
   * two can never disagree about where a frozen column sits.
   *
   * `md:sticky`, not `sticky`: the frozen block is ~790px wide, which on a phone
   * would leave no room for anything to scroll into. Below `md` the columns fall
   * back to normal flow. The `left` value is harmless while position is static.
   */
  function frozenCell(id: string): { className: string; style: React.CSSProperties } | null {
    const left = frozenLeft[id];
    if (left === undefined) return null;
    const w = FROZEN_LEFT_WIDTH[id];
    return {
      className: "task-frozen-cell",
      // The offset travels as a CUSTOM PROPERTY, and `position: sticky` + `left`
      // are applied by a min-width:768px rule in globals.css — not inline.
      //
      // It has to work that way because the header <th> is ALREADY
      // `sticky top-0` at every width for the vertical freeze. An inline `left`
      // would therefore also take effect on mobile, where the body <td>s are
      // deliberately NOT frozen — the headers would slide sideways while their
      // own columns stayed put. One media query keeps both halves in step.
      style: { ["--frozen-left" as string]: `${left}px`, width: w, minWidth: w, maxWidth: w },
    };
  }

  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);

  // The active pill's name, appended so the count says which set it counted.
  // "Showing all 175 tasks" and "Showing all 175 tasks (Not Read)" are the
  // difference between a number the reader has to take on trust and one they
  // can check against the pill they just clicked.
  const filterSuffix = filterLabel ? ` (${filterLabel})` : "";
  const countLabel =
    totalFiltered === 0
      ? `No tasks${filterSuffix}`
      : hasMore
        ? `Showing ${rendered.toLocaleString("en-IN")} of ${totalFiltered.toLocaleString("en-IN")}${filterSuffix}`
        : `Showing all ${totalFiltered.toLocaleString("en-IN")} ${totalFiltered === 1 ? "task" : "tasks"}${filterSuffix}`;

  return (
    <div ref={listTopRef} className="scroll-mt-6">
      {/* Toolbar — Group-by ▾ · Search · Columns. The pager and rows-per-page
          that used to sit here are gone; the row count and Load More live in
          the table's sticky footer instead, beside the rows they describe. */}
      <div
        className="wg-rise mb-3 flex items-center gap-2 flex-wrap rounded-section border border-hairline px-3 py-2 max-md:px-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          boxShadow:
            "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <GroupByControl value={groupBy} onChange={setGroupBy} />
          <div className="w-full sm:w-[220px] md:w-[260px] min-w-[150px]">
            <SearchBox value={query} onChange={setQuery} resultCount={visibleRows.length} />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* No numbered pager and no rows-per-page: the grid is a single
              growing list now, and both controls describe a page model that no
              longer exists. The count and the Load More that replaced them live
              in the table's own sticky footer, next to the rows they govern. */}
          <MobileSortControl table={table} className="hidden max-md:flex" />
          <ColumnsMenu table={table} />
        </div>
      </div>

      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          employees={employees}
          subjects={subjectOptions}
          clients={clientOptions}
          isAdmin={me.isAdmin}
          statusLabels={resolvedLabels}
          onClear={() => table.resetRowSelection()}
        />
      )}

      {/* CARD — border, radius and shadow only. It no longer scrolls itself: the
          scrolling moved to the inner div so the footer below can sit outside
          the scrollport and stay put while rows move under it. */}
      <div
        className="wg-rise bg-surface-card rounded-section border border-hairline overflow-hidden flex flex-col max-md:hidden"
        style={{
          animationDelay: "60ms",
          boxShadow:
            "0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px -24px rgba(15, 23, 42, 0.20)",
        }}
      >
      <div
        // The scroll container for BOTH axes:
        //   overflow-x-auto — columns size to their content, so wide data (Start
        //     Time, End Time, Client, Subject, Task, Doer …) scrolls sideways
        //     instead of being truncated. The Manage column is pinned with
        //     `sticky right-0`, which only works because the sticky ancestor is
        //     THIS element (an overflow container) — so the scrolling had to stay
        //     on one div rather than being split across the two axes.
        //   overflow-y-auto + max-h — the 13-row window. Rows are content-sized
        //     rather than a fixed height, so 560px is an APPROXIMATION of
        //     13 rows (~40px) plus the header (~40px); it is the cap that stops
        //     Load More growing the page instead of the scroller.
        // `max-h`, deliberately, NOT a fixed `h-`: a short list must shrink to
        // its rows rather than leave a tall empty box below the last one.
        // `overscroll-x-contain` stops a sideways fling from also triggering the
        // browser's back-navigation gesture.
        className="overflow-x-auto overflow-y-auto overscroll-x-contain max-h-[560px]"
      >
      <table className="min-w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-hairline-strong">
              {hg.headers.map((h) => {
                const col = h.column.columnDef as TaskCol;
                const hide = col.meta?.mobileHide;
                const isActions = h.column.id === "actions";
                const frozen = frozenCell(h.column.id);
                const canSort = h.column.getCanSort();
                const sorted = h.column.getIsSorted(); // false | "asc" | "desc"
                const headerNode = flexRender(h.column.columnDef.header, h.getContext());
                const movable = !UNMOVABLE_COLUMNS.has(h.column.id);
                const isDropTarget = dropCol === h.column.id && dragCol !== h.column.id;
                // Which edge to mark — the side the column would arrive from, so
                // the line sits where it will actually land.
                const fromLeft =
                  dragCol != null &&
                  columnOrder.indexOf(dragCol) < columnOrder.indexOf(h.column.id);
                return (
                  <th
                    key={h.id}
                    // `preventDefault` on dragover is what tells the browser a
                    // drop is allowed here at all.
                    onDragOver={
                      movable
                        ? (e) => {
                            if (!dragCol) return;
                            e.preventDefault();
                            setDropCol(h.column.id);
                          }
                        : undefined
                    }
                    onDragLeave={
                      movable
                        ? () => setDropCol((c) => (c === h.column.id ? null : c))
                        : undefined
                    }
                    onDrop={
                      movable
                        ? (e) => {
                            e.preventDefault();
                            if (dragCol) moveColumn(dragCol, h.column.id);
                            setDragCol(null);
                            setDropCol(null);
                          }
                        : undefined
                    }
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : undefined
                    }
                    /* py-1.5, down from py-2.5. The header has no margin to
                       trim — it is a sticky <th>, so its vertical padding IS
                       the gap the spec is asking to close. */
                    /* `w-full` on the wide column's header too: auto layout
                       resolves a column's width from the whole column, so the
                       th and td have to agree or the header lags the body. */
                    // z-30 for BOTH frozen columns: they must paint above the
                    // z-20 of the ordinary sticky headers, or a header scrolling
                    // under them shows through.
                    // HEADERS ARE ALWAYS LEFT-ALIGNED (Sir) — `alignClass` still
                    // governs the CELLS, so numeric columns keep their right-aligned
                    // values under a left-aligned label.
                    className={`group/head sticky top-0 px-4 py-1.5 text-table-head whitespace-nowrap max-md:px-3 max-md:py-3 text-left ${frozen ? `${frozen.className} z-30` : isActions ? "right-0 z-30" : "z-20"} ${!frozen && col.meta?.wide ? "w-full" : ""} ${hide ? "max-md:hidden" : ""}`}
                    style={{
                      ...(frozen?.style ?? {}),
                      // Crisp glass header strip — a near-opaque frosted
                      // gradient (blur catches the rows scrolling beneath)
                      // with a hairline seat drawn as an inset shadow so it
                      // stays put while the header is stuck.
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(244,246,249,0.90))",
                      backdropFilter: "blur(10px) saturate(140%)",
                      WebkitBackdropFilter: "blur(10px) saturate(140%)",
                      color: "var(--color-ink-soft)",
                      boxShadow: [
                        isActions
                          ? "inset 0 -1px 0 var(--color-hairline-strong), -10px 0 14px -10px rgba(15,23,42,0.14)"
                          : h.column.id === lastFrozenId
                            ? "inset 0 -1px 0 var(--color-hairline-strong), 10px 0 14px -10px rgba(15,23,42,0.14)"
                            : "inset 0 -1px 0 var(--color-hairline-strong)",
                        isDropTarget
                          ? `inset ${fromLeft ? "-3px" : "3px"} 0 0 var(--color-altus-red)`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(", "),
                      opacity: dragCol === h.column.id ? 0.45 : 1,
                    }}
                  >
                    {/* A separate GRIP, not a draggable <th>. Making the whole
                        header draggable competes with the sort button inside it:
                        a click that moves a few pixels becomes a drag and the
                        sort silently fails to fire. The grip owns dragging, the
                        button owns sorting, and neither swallows the other. */}
                    {movable && (
                      <span
                        draggable
                        onDragStart={(e) => {
                          setDragCol(h.column.id);
                          e.dataTransfer.effectAllowed = "move";
                          // Firefox refuses to start a drag without payload.
                          e.dataTransfer.setData("text/plain", h.column.id);
                        }}
                        onDragEnd={() => {
                          setDragCol(null);
                          setDropCol(null);
                        }}
                        role="button"
                        tabIndex={-1}
                        aria-label={`Reorder column ${
                          typeof headerNode === "string" ? headerNode : h.column.id
                        }`}
                        title="Drag to reorder this column"
                        className="mr-1 inline-flex cursor-grab align-middle text-ink-subtle opacity-0 transition-opacity hover:text-ink-strong active:cursor-grabbing group-hover/head:opacity-70"
                      >
                        <GripVertical size={12} strokeWidth={2.4} aria-hidden />
                      </span>
                    )}
                    {canSort ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={`group/sort inline-flex items-center gap-1.5 select-none transition-colors hover:text-ink-strong ${
                          col.meta?.align === "center" ? "mx-auto" : ""
                        } ${sorted ? "text-ink-strong" : ""}`}
                        title={`Sort by ${typeof headerNode === "string" ? headerNode : h.column.id}`}
                      >
                        {headerNode}
                        {sorted === "asc" ? (
                          <ArrowUp size={13} strokeWidth={2.6} />
                        ) : sorted === "desc" ? (
                          <ArrowDown size={13} strokeWidth={2.6} />
                        ) : (
                          // Always show a dim ⇅ so every column reads as
                          // clickable-to-sort; it brightens on hover. (Was
                          // opacity-0, which hid the affordance entirely.)
                          <ChevronsUpDown
                            size={13}
                            strokeWidth={2.4}
                            className="opacity-45 text-ink-subtle transition-opacity group-hover/sort:opacity-100"
                          />
                        )}
                      </button>
                    ) : (
                      headerNode
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i, arr) => {
          // Group mode: render a section header whenever the group label
          // changes from the previous row — and always at the top of a page
          // (i === 0) so you can see which group you're in mid-scroll.
          const label = groupBy === "none" ? null : groupValue(row.original, groupBy, resolvedLabels);
          const prev = i > 0 ? arr[i - 1] : undefined;
          const prevLabel =
            groupBy === "none" || !prev ? null : groupValue(prev.original, groupBy, resolvedLabels);
          const showHeader = label !== null && (i === 0 || label !== prevLabel);
          const visibleCols = table.getVisibleLeafColumns().length;
          // Left accent stripe for at-risk rows so overdue/today work is
          // impossible to miss without reading the date column.
          const rowUrgency = taskUrgency(row.original.dueAt, row.original.status);
          const rowAccent =
            rowUrgency.level === "overdue"
              ? "inset 3px 0 0 0 var(--color-red)"
              : rowUrgency.level === "today"
                ? "inset 3px 0 0 0 var(--color-orange)"
                : undefined;
          return (
            <React.Fragment key={row.id}>
              {showHeader && (
                <tr>
                  <td
                    colSpan={visibleCols}
                    className="px-5 py-2.5 max-md:px-3 border-b border-hairline"
                    style={{
                      background:
                        "linear-gradient(90deg, color-mix(in srgb, var(--color-altus-red) 4.5%, var(--color-surface-soft)), var(--color-surface-soft) 40%)",
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="inline-block h-4 w-[3px] rounded-full"
                        style={{
                          background:
                            "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
                        }}
                      />
                      <span
                        className="font-black tracking-[-0.01em] text-ink-strong"
                        style={{
                          fontFamily: "var(--font-display), system-ui, sans-serif",
                          fontSize: 16,
                        }}
                      >
                        {label}
                      </span>
                      <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-altus-red/10 text-altus-red font-bold tabular-nums text-[12px]">
                        {groupCounts?.get(label!) ?? 0}
                      </span>
                    </span>
                  </td>
                </tr>
              )}
            <tr
              data-task-row={row.original.id}
              // `is-focused` is mirrored in CSS onto the sticky Manage cell —
              // that cell paints its own opaque background, so it has to repeat
              // the row's tints or it reads as a mismatched block at the edge.
              /* Gmail-style separation: a visible grey rule between rows plus a
                 hover tint, instead of the near-invisible `--color-hairline`
                 (rgba(60,44,40,0.07)) that made the list read as one block.
                 `last:border-b-0` is dropped — a closing rule under the final
                 row is what makes the table look finished rather than cut off. */
              // Row click opens the drawer, so the whole row is the target and
              // not just the title link. Guarded below against clicks that
              // started on a control.
              onClick={
                openInDrawer
                  ? (e) => {
                      // Never hijack a click that belongs to something else:
                      // the select checkbox, the inline status editor, the
                      // Manage cluster, or the title link (which handles
                      // modifier-clicks to open a new tab itself).
                      const el = e.target as HTMLElement;
                      if (el.closest("a, button, input, select, textarea, [role='button'], [role='menuitem']"))
                        return;
                      // A drag-select of cell text should not open the record.
                      if (window.getSelection()?.toString()) return;
                      openTask(row.original.id);
                    }
                  : undefined
              }
              // border-l-4 transparent by default so turning it red on hover
              // costs no layout shift — a border that appears would push every
              // cell 4px right. See the note in globals.css for why this is a
              // border and not a box-shadow.
              className={`task-row border-b border-l-4 border-gray-200 border-l-transparent hover:border-l-red-600 ${
                openInDrawer ? "is-clickable" : ""
              } ${row.original.id === focusedId ? "is-focused bg-altus-red/[0.06]" : ""}`}
              style={{
                boxShadow:
                  [
                    rowAccent,
                    row.original.id === focusedId
                      ? "inset 0 0 0 2px var(--color-altus-red)"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || undefined,
              }}
            >
              {row.getVisibleCells().map((cell) => {
                const col = cell.column.columnDef as TaskCol;
                const hide = col.meta?.mobileHide;
                const isActions = cell.column.id === "actions";
                const frozen = frozenCell(cell.column.id);
                const isLastFrozen = cell.column.id === lastFrozenId;
                // Columns now size to their CONTENT and the table scrolls
                // sideways, rather than every value being squeezed to ~32ch and
                // truncated. The ONE exception is the free-text Task title: a
                // single 250-character title would otherwise stretch that column
                // past 2000px and make the horizontal scroll unusable, so it
                // keeps a generous cap — its full text is still available in the
                // cell's rich hover popover.
                //
                // Only a capped cell needs overflow/ellipsis; uncapped cells must
                // NOT clip, or the sideways scroll would reveal cut-off values.
                // The wide (Task) column is the table's ONE flexible column:
                // `w-full` makes auto table-layout hand it whatever width the
                // fixed, nowrap columns don't use, instead of spreading the
                // slack thinly across columns that had already sized to their
                // content and gained nothing from it. Hiding ID No. + Created
                // by default freed real width, and this is what spends it — on
                // the only column whose text was being ellipsized.
                // min-w-[280px] still guarantees a floor when the table is
                // scrolling; max-w-[64ch] (was 52ch) is the ceiling that keeps
                // one 250-character title from stretching the row past 2000px.
                // A FROZEN column has an exact width, so it always clips with an
                // ellipsis — that is what keeps a long Task title one line tall
                // instead of growing the row. Unfrozen columns keep the old
                // behaviour: size to content, never clip, and let the table scroll.
                const maxW = frozen
                  ? "overflow-hidden text-ellipsis"
                  : isActions
                    ? ""
                    : col.meta?.wide
                      ? "w-full max-w-[64ch] overflow-hidden text-ellipsis"
                      : "";
                return (
                  <td
                    key={cell.id}
                    className={`px-3 py-1 whitespace-nowrap max-md:px-3 max-md:py-2 ${maxW} ${alignClass(col)} ${hide ? "max-md:hidden" : ""} ${!frozen && col.meta?.wide ? "min-w-[280px]" : ""} ${frozen ? `${frozen.className} z-10` : ""} ${isActions ? "task-actions-cell sticky right-0 z-10" : ""}`}
                    style={
                      isActions
                        ? { boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" }
                        : frozen
                          ? {
                              ...frozen.style,
                              // The edge shadow is drawn ONLY by the last frozen
                              // column, so the block reads as one raised slab
                              // rather than five stacked cards with seams.
                              boxShadow: isLastFrozen
                                ? "10px 0 14px -10px rgba(15,23,42,0.14)"
                                : undefined,
                            }
                          : undefined
                    }
                  >
                    {flexRender(
                      cell.column.columnDef.cell ?? ((c) => c.getValue()),
                      cell.getContext(),
                    )}
                  </td>
                );
              })}
            </tr>
            </React.Fragment>
          );
          })}
        </tbody>
      </table>
      </div>

      {/* Sticky footer INSIDE the card but OUTSIDE the scrollport, so it never
          drifts sideways with a horizontal scroll the way a footer inside the
          overflow-x container would. `sticky bottom-0` is belt-and-braces —
          being the last child of the flex column already pins it. */}
      <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 border-t border-hairline bg-slate-50 px-3.5 py-2">
        <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
          {countLabel}
        </span>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShown((n) => n + LOAD_MORE_STEP)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-gray-200"
          >
            <ChevronDown size={14} strokeWidth={2.6} />
            Load More
          </button>
        )}
      </div>
      </div>

      {/* Phone card layout (< sm). Same rows as the table above so sort,
          group-by, and pagination apply identically. Shows every desktop
          field — parity. */}
      <div className="hidden max-md:flex max-md:flex-col max-md:gap-3">
        {table.getRowModel().rows.map((row, i, arr) => {
          const t = row.original;
          const label = groupBy === "none" ? null : groupValue(t, groupBy, resolvedLabels);
          const prevRow = i > 0 ? arr[i - 1] : undefined;
          const prevLabel =
            groupBy === "none" || !prevRow
              ? null
              : groupValue(prevRow.original, groupBy, resolvedLabels);
          const showHeader = label !== null && (i === 0 || label !== prevLabel);
          return (
            <React.Fragment key={row.id}>
              {showHeader && (
                <div className="flex items-center gap-2 pt-2">
                  <span
                    className="font-black tracking-[-0.01em] text-ink-strong"
                    style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 16 }}
                  >
                    {label}
                  </span>
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-altus-red/10 text-altus-red font-bold tabular-nums text-[12px]">
                    {groupCounts?.get(label!) ?? 0}
                  </span>
                </div>
              )}
              <TaskCard
                row={t}
                employees={employees}
                me={me}
                statusLabels={resolvedLabels}
                statusTones={resolvedTones}
                selected={row.getIsSelected()}
                onToggleSelect={(v) => row.toggleSelected(v)}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Phones get the same control as the desktop footer. The card list is
          not inside a scroll container, so this sits after it rather than
          sticking. */}
      <div className="mt-5 flex items-center justify-center gap-3 md:hidden">
        <p className="text-[13px] font-semibold text-ink-subtle tabular-nums">
          Showing {rendered.toLocaleString("en-IN")} of {totalFiltered.toLocaleString("en-IN")}
          {filterSuffix}
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShown((n) => n + LOAD_MORE_STEP)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
          >
            <ChevronDown size={14} strokeWidth={2.6} /> Load More
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shared "nothing matched your search" panel. Deliberately distinct from the
 * pages' "no tasks for the current filter" copy: this one names the term you
 * typed and offers to clear it, because the fix is one click rather than a
 * filter change.
 */
export function NoResults({
  query,
  onClear,
  noun = "tasks",
}: {
  query: string;
  onClear: () => void;
  noun?: string;
}) {
  return (
    <div
      className="wg-rise bg-surface-card rounded-section border border-hairline px-6 py-14 text-center"
      style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
    >
      <span
        aria-hidden
        className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl"
        style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
      >
        <SearchX size={24} strokeWidth={2.2} />
      </span>
      <p className="font-black text-ink-strong" style={{ fontSize: 20 }}>
        No results found
      </p>
      <p className="mx-auto mt-2 max-w-[46ch] font-semibold text-ink-muted" style={{ fontSize: 15 }}>
        No {noun} match “<span className="text-ink-strong">{query}</span>”. Try a
        different spelling, or widen the filters in the bar above.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-5 inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red"
      >
        <X size={14} strokeWidth={2.4} />
        Clear search
      </button>
    </div>
  );
}


// Search box for the task list. Matches the task No. (with or without the
// leading #) plus title / subject / client / doer / initiator / status —
// "search by task no or any other criteria".
function SearchBox({
  value,
  onChange,
  resultCount,
}: {
  value: string;
  onChange: (v: string) => void;
  resultCount: number;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative w-full max-w-md">
        <Search
          size={16}
          strokeWidth={2.2}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Local search — task no. (#1042), title, subject, client, doer"
          title="Local search — filters only the list on this page"
          aria-label="Local search — tasks on this page only"
          className="w-full h-10 pl-10 pr-9 rounded-pill border border-hairline bg-surface-card text-[15px] text-ink-strong placeholder:text-ink-subtle shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-all focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-strong transition-colors"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        )}
      </div>
      {value.trim() && (
        <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
          {resultCount} {resultCount === 1 ? "match" : "matches"}
        </span>
      )}
    </div>
  );
}


// "Group By" control — a single compact pill that reflects the current
// grouping (red-tinted + "Group: Client" when active), opening a rich menu
// with a leading icon per field and the active one checked in red. Grouping
// clusters the rows under that field and shows a count per section; the
// per-page paging still applies across the grouped order.
function GroupByControl({
  value,
  onChange,
}: {
  value: GroupKey;
  onChange: (v: GroupKey) => void;
}) {
  const active = GROUP_OPTIONS.find((o) => o.key === value) ?? GROUP_OPTIONS[0]!;
  const grouped = value !== "none";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Group tasks by"
          className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-pill text-[13px] font-bold border transition-all ${
            grouped
              ? "border-altus-red bg-altus-red/10 text-altus-red"
              : "border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong"
          }`}
        >
          <GroupIcon size={15} strokeWidth={2.3} />
          {grouped ? `Group: ${active.label}` : "Group By"}
          <ChevronDown size={14} strokeWidth={2.4} className="opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Group By</DropdownMenuLabel>
        {GROUP_OPTIONS.map((opt) => {
          const sel = opt.key === value;
          const Icon = opt.Icon;
          return (
            <DropdownMenuItem
              key={opt.key}
              onSelect={() => onChange(opt.key)}
              className={sel ? "font-bold text-altus-red" : ""}
            >
              <span className="inline-flex w-4 justify-center">
                {sel ? <Check size={14} strokeWidth={2.6} /> : null}
              </span>
              <Icon
                size={15}
                strokeWidth={2.2}
                className={sel ? "text-altus-red" : "text-ink-soft"}
              />
              {opt.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// #12 — task title with a hover-to-preview popover. After ~1s of hovering
// the title, a card shows the full title + description (the cell truncates
// at 32ch). Uses Radix Tooltip (portals out of the table's overflow,
// positions + delays for free). Shown whenever there's a description OR the
// title is long enough to be truncated — so hovering always reveals more
// than the few visible words. A truly short, description-less title (nothing
// extra to show) skips the popover.
/**
 * Label shown in the "Task" column. Imported rows frequently store the client
 * name as the title (so Client and Task look identical), while the real task
 * wording lives in `description`. Prefer the description — collapsed to a
 * single line — and fall back to the title only when there's no description.
 * The cell itself is capped at 32ch with an ellipsis, so this naturally shows
 * the first several words.
 */
function taskCellLabel(row: TaskListRow): string {
  const desc = row.description?.replace(/\s+/g, " ").trim();
  return desc && desc.length > 0 ? desc : row.title;
}

/**
 * MEMOISED. This cell owns the hover-preview tooltip, and it is rendered once
 * per row — so on a 300-row list it is 300 subtrees, each with a Radix
 * `Tooltip.Root`.
 *
 * The table re-renders whenever `focusedId` (j/k keyboard nav), row selection,
 * sorting or column visibility changes. Without `memo` every one of those
 * rebuilt all 300 tooltip subtrees even though not a single row's data moved.
 *
 * Both props are referentially stable, which is what makes this effective:
 * `row` comes from the memoised `visibleRows` array, and `onOpen` is the
 * `useCallback`-wrapped `openTask`. Memoising against unstable props would be
 * pure overhead, so if either of those ever stops being stable, this stops
 * helping and should be revisited rather than left as decoration.
 */
const TaskTitleCell = React.memo(function TaskTitleCell({
  row,
  onOpen,
}: {
  row: TaskListRow;
  /** When set, a plain click opens the drawer instead of navigating. */
  onOpen?: (id: string) => void;
}) {
  // Gmail's unread rule: never-opened tasks read heavier than the rest.
  // `firstReadAt` is the same column the NOT READ KPI counts, so the two
  // can't disagree.
  const unread = row.firstReadAt == null;
  const link = (
    <Link
      href={`/tasks/${row.id}` as Route}
      onClick={(e) => {
        // Let ⌘/Ctrl/middle-click and new-tab intents through untouched —
        // only a plain left click is rerouted into the drawer.
        if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen(row.id);
      }}
      className="task-title-link text-body underline-offset-2 transition-colors"
      style={{
        fontWeight: unread ? 900 : 700,
        color: unread ? "var(--color-ink-strong)" : "var(--color-ink-soft)",
      }}
    >
      {taskCellLabel(row)}
    </Link>
  );
  const desc = row.description?.trim();
  const subject = row.subject?.trim();
  // The title cell caps at ~32ch (max-md ~20ch); anything longer is clipped,
  // so a long title alone is worth expanding even without a description.
  const titleTruncated = row.title.trim().length > 30;
  const hasMore = Boolean(desc) || titleTruncated;
  if (!hasMore) return link;
  return (
    <Tooltip.Provider delayDuration={1000}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="z-[70]"
            style={{
              maxWidth: 440,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 14,
              boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
              padding: 16,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1.3,
                color: "var(--color-ink-strong)",
                marginBottom: desc ? 8 : 0,
              }}
            >
              {row.title}
            </div>
            {desc ? (
              <p
                className="whitespace-pre-wrap"
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "var(--color-ink-soft)",
                }}
              >
                {desc}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--color-ink-subtle)" }}>
                {subject ? `Subject — ${subject}` : "No description added yet."}
              </p>
            )}
            <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
});

// Phone-only sort dropdown — appears below sm breakpoint where the clickable
// column headers are hidden. Iterates all sortable columns and lets the user
// toggle asc/desc for each.
function MobileSortControl({
  table,
  className = "",
}: {
  table: TableInstance<TaskListRow>;
  className?: string;
}) {
  const sortable = table.getAllLeafColumns().filter((c) => c.getCanSort());
  const labelFor = (id: string) =>
    id === "title" ? "Task" : COLUMN_LABELS[id] ?? id;
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft"
          >
            <ChevronsUpDown size={14} strokeWidth={2.2} />
            Sort
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Sort By</DropdownMenuLabel>
          {sortable.map((c) => {
            const sorted = c.getIsSorted();
            return (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  c.toggleSorting(sorted === "asc");
                }}
              >
                <span className="inline-flex w-4 justify-center">
                  {sorted === "asc" ? (
                    <ArrowUp size={14} strokeWidth={2.6} />
                  ) : sorted === "desc" ? (
                    <ArrowDown size={14} strokeWidth={2.6} />
                  ) : null}
                </span>
                {labelFor(c.id)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// #11 — column show/hide menu. Lists the optional columns (everything
// except the always-on Task + Actions) with a check for visible ones.
// `onSelect → preventDefault` keeps the menu open for multiple toggles.
function ColumnsMenu({ table }: { table: TableInstance<TaskListRow> }) {
  const cols = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.id in COLUMN_LABELS);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong transition-all"
        >
          <SlidersHorizontal size={14} strokeWidth={2.2} />
          Columns
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Show Columns</DropdownMenuLabel>
        {cols.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={(e) => {
              e.preventDefault();
              c.toggleVisibility();
            }}
          >
            <span className="inline-flex w-4 justify-center">
              {c.getIsVisible() ? <Check size={14} strokeWidth={2.6} /> : null}
            </span>
            {COLUMN_LABELS[c.id]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Full-parity task card for phones (< sm). Every field shown in the desktop
// table is present here so the two views stay in sync.
function TaskCard({
  row,
  employees,
  me,
  statusLabels,
  statusTones,
  selected,
  onToggleSelect,
}: {
  row: TaskListRow;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean; canChangeDoer?: boolean };
  statusLabels: StatusLabels;
  statusTones: StatusTones;
  selected: boolean;
  onToggleSelect: (next: boolean) => void;
}) {
  const p = row.priority as keyof typeof PRIORITY_LABELS;
  const canEditStatus = canEditTaskFields({
    employee: me,
    task: {
      createdById: row.createdById,
      initiatorId: row.initiatorId,
      doerId: row.doerId,
      status: row.status,
    },
  });
  // Same at-risk accent stripe the desktop rows get, so overdue work is
  // impossible to miss on the phone card view too.
  const cardUrgency = taskUrgency(row.dueAt, row.status);
  const cardAccent =
    cardUrgency.level === "overdue"
      ? "inset 3px 0 0 0 var(--color-red)"
      : cardUrgency.level === "today"
        ? "inset 3px 0 0 0 var(--color-orange)"
        : null;
  return (
    <div
      className={`bg-surface-card rounded-section border p-4 transition-all ${
        selected ? "border-altus-red" : "border-hairline"
      }`}
      style={{
        boxShadow: [
          cardAccent,
          selected
            ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 14%, transparent), 0 10px 24px -16px rgba(225,6,0,0.35)"
            : "0 1px 2px rgba(15,23,42,0.04), 0 10px 24px -18px rgba(15,23,42,0.16)",
        ]
          .filter(Boolean)
          .join(", "),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="pt-0.5">
            <Checkbox checked={selected} onChange={onToggleSelect} ariaLabel="Select task" />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            {row.taskNo != null && (
              <span className="text-ink-subtle font-bold tabular-nums text-[12px]">
                #{row.taskNo}
              </span>
            )}
            <span className="text-ink-strong font-semibold truncate" style={{ fontSize: 15 }}>
              {row.client?.trim() ? row.client : "— No client"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isDoneLate({ status: row.status, completedAt: row.completedAt, dueAt: row.dueAt }) && (
            <LateBadge />
          )}
          <InlineStatusCell
            taskId={row.id}
            status={row.status}
            updatedAt={row.updatedAt}
            labels={statusLabels}
            tones={statusTones}
            isAdmin={me.isAdmin}
            editable={canEditStatus}
          />
          <TaskRowActions row={row} employees={employees} me={me} />
        </div>
      </div>

      <Link
        href={`/tasks/${row.id}` as Route}
        className="task-title-link mt-2 block text-body text-ink-strong line-clamp-2"
        style={{ fontWeight: 700, lineHeight: 1.3 }}
      >
        {taskCellLabel(row)}
      </Link>

      <div className="mt-3 flex items-center gap-2">
        {row.doerName ? (
          <>
            <EmployeeAvatar name={row.doerName} size="sm" />
            <span className="text-ink-strong font-bold" style={{ fontSize: 14 }}>
              {row.doerName}
            </span>
          </>
        ) : (
          <span className="text-ink-subtle">Unassigned</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted" style={{ fontSize: 13 }}>
        <span>{row.subject?.trim() ? row.subject : "—"}</span>
        <span aria-hidden>·</span>
        {p === "imp_urgent" ? <CriticalBadge /> : <span>{PRIORITY_LABELS[p]}</span>}
        <span aria-hidden>·</span>
        {(() => {
          const u = taskUrgency(row.dueAt, row.status);
          const color = URGENCY_COLOR[u.level];
          const strong = u.level === "overdue" || u.level === "today";
          return (
            <span
              className="tabular-nums"
              style={{ color, fontWeight: strong ? 700 : undefined }}
            >
              Due {safeFormat(row.dueAt)}
              {u.label ? ` · ${u.label}` : ""}
            </span>
          );
        })()}
        <span aria-hidden>·</span>
        <span className="tabular-nums">Created {safeFormat(row.createdAt)}</span>
        <span aria-hidden>·</span>
        {/* Wording tracks the sign: the number is due-relative now, so "old"
            would be wrong for anything not yet due. */}
        <span className="tabular-nums">
          {row.ageDays > 0
            ? `${row.ageDays}d late`
            : row.ageDays === 0
              ? "due today"
              : `${Math.abs(row.ageDays)}d left`}
        </span>
      </div>
    </div>
  );
}
