"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { formatDate } from "@/lib/format";
import {
  Loader2,
  Archive,
  Flag,
  Tag,
  Building2,
  CalendarDays,
  AlignLeft,
  User,
  Check,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
  type StatusColorToken,
} from "@/db/enums";
import { ARCHIVE_COL, type ColId } from "@/lib/kanban-columns";
import { NoResults } from "./task-table";
import {
  useSectionSearch,
  matchesSearch,
  setSectionSearch,
} from "@/lib/client/section-search";
import { setTaskStatus, archiveTask, unarchiveTask } from "@/app/(app)/tasks/actions";
import { setBoardColumnOrder } from "@/app/(admin)/admin/settings/actions";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { LateBadge } from "@/components/ui/late-badge";
import { WeeklyGoalBadge } from "@/components/weekly-goals/weekly-goal-badge";
import { isDoneLate } from "@/lib/task-late";
import type { BoardTask } from "@/lib/queries/tasks";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";

// Priority → colour token + label for the hover-card badge.
const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

interface Props {
  tasks: BoardTask[];
  /** This week's goals (design §10), injected as badged, non-draggable
   *  link-out cards into their matching status column. Never tasks. */
  weeklyGoals?: VirtualTaskRow[];
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  isAdmin: boolean;
  /** Ordered column ids to render (statuses + the synthetic Archive column).
   *  Admins can drag column headers to reorder; the new order is persisted. */
  columnOrder: ColId[];
}

/** Columns whose entry is an approval decision rather than a status change. */
function isApprovalTarget(col: string): boolean {
  return col === "not_approved" || col === "approved";
}

// Cards rendered per column before "Show more"; each tap reveals 10 more.
const COL_STEP = 10;

// How long the "Task moved to …  Undo" toast stays actionable.
const UNDO_MS = 10_000;

/** What a card looked like when its drag began — everything Undo needs to put
 *  it back in the exact column AND the exact slot it came from. */
interface DragOrigin {
  id: string;
  col: ColId;
  /** Index within `col` before the drag. */
  index: number;
  /** The whole source column's id order, card included — restored verbatim on
   *  Undo so its neighbours land back exactly as they were. */
  colOrder: string[];
  status: TaskStatus;
  archived: boolean;
  /** Optimistic-lock token to ship with the status write. */
  updatedAt: Date;
}

// ── Per-column card order ───────────────────────────────────────────────────
// The board query orders tasks `desc(createdAt)` and there is no per-task board
// position in the schema, so an exact drop index has to be remembered on the
// client — otherwise the reconcile refresh that follows every drop
// (`scheduleReconcile`) re-sorts the column and the card snaps back down.
// Shape: `columnId → ordered task ids`; only columns the user has actually
// arranged get an entry. localStorage rather than the DB for the same reason as
// display-scale: it is one person's arrangement of their own board, and sharing
// it would need a schema migration plus a conflict story.
const KANBAN_ORDER_KEY = "altus.kanbanOrder.v1";
type BoardOrder = Record<string, string[]>;

function readBoardOrder(): BoardOrder {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KANBAN_ORDER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: BoardOrder = {};
    for (const [col, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) out[col] = ids.filter((id): id is string => typeof id === "string");
    }
    return out;
  } catch {
    return {};
  }
}

function writeBoardOrder(order: BoardOrder): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KANBAN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Private mode / quota — the board still works, the arrangement is just
    // session-only.
  }
}

/**
 * Sort one column's cards by the user's arrangement.
 *
 * Ids the arrangement doesn't mention (a task created since, or one that just
 * landed here from the list view) stay at the TOP, where the server's
 * newest-first order would have put them — so a new task is never buried at the
 * bottom of a column that happens to have been arranged once. Stale ids (cards
 * that have since moved elsewhere) simply never match and are ignored.
 */
function applyBoardOrder<T extends { id: string }>(list: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0 || list.length === 0) return list;
  const rank = new Map<string, number>();
  order.forEach((id, i) => rank.set(id, i));
  const arranged: T[] = [];
  const fresh: T[] = [];
  for (const item of list) (rank.has(item.id) ? arranged : fresh).push(item);
  if (arranged.length === 0) return list;
  arranged.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return fresh.length === 0 ? arranged : [...fresh, ...arranged];
}

function accentFor(col: ColId, tones: Record<TaskStatus, StatusColorToken>) {
  const isArchive = col === ARCHIVE_COL;
  const tone = isArchive ? null : tones[col as TaskStatus];
  /* Archived is the one column with no status token behind it — it is a
     synthetic column (ARCHIVE_COL), so there is no `status_settings` row and
     no `--color-<token>` to read. Its three values are therefore literals.
     Slate, one step darker than Not Read's grey at every position, so the two
     neutral columns stay apart: Not Read is the quiet start of the board and
     Archived is the closed end of it. */
  return {
    isArchive,
    accent: isArchive ? "#94a3b8" : `var(--color-${tone})`,       // slate-400
    accentDeep: isArchive ? "#1e293b" : `var(--color-${tone}-deep)`, // slate-800
    accentBgLight: isArchive ? "#e2e8f0" : `var(--color-${tone}-bg)`, // slate-200
  };
}

/**
 * Status Kanban (Manan #25), rebuilt on dnd-kit for buttery pointer-based
 * drag: drag a card between columns to change its status (or into Archived to
 * archive / out to restore), and — as an admin — drag a column header to
 * reorder the whole board (persisted globally). A DragOverlay renders the
 * floating preview; dnd-kit handles auto-scroll, keyboard a11y and animation.
 */
export function KanbanBoard({ tasks, weeklyGoals = [], labels, tones, isAdmin, columnOrder }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [visibleByCol, setVisibleByCol] = React.useState<Record<string, number>>({});
  // Column order is local state so an admin's drag-reorder is instant.
  const [columns, setColumns] = React.useState<ColId[]>(columnOrder);
  // The active drag (card or column) — drives the DragOverlay + drop targeting.
  const [active, setActive] = React.useState<{ id: string; type: "card" | "column" } | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);
  // Where the user has arranged each column's cards (see BoardOrder above).
  const [order, setOrder] = React.useState<BoardOrder>({});
  const orderHydrated = React.useRef(false);

  React.useEffect(() => setItems(tasks), [tasks]);
  React.useEffect(() => setColumns(columnOrder), [columnOrder]);

  // Persist the arrangement. Declared BEFORE the hydrate effect on purpose: on
  // mount this one runs first and bails (not hydrated yet), so the empty
  // initial state can never clobber a saved order.
  React.useEffect(() => {
    if (orderHydrated.current) writeBoardOrder(order);
  }, [order]);
  React.useEffect(() => {
    orderHydrated.current = true;
    const saved = readBoardOrder();
    if (Object.keys(saved).length > 0) setOrder(saved);
  }, []);

  // ── Canvas-style panning (Figma/Linear feel) ───────────────────────
  // The board scrolls horizontally from ANYWHERE (wheel), dragging its bare
  // surface pans it like a canvas, and holding Space turns the pointer into a
  // grab-hand even over the cards.
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const spaceHeld = React.useRef(false);
  const panState = React.useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);
  const dragPan = React.useRef<{ startX: number; left: number } | null>(null);
  // Read inside the (mount-only) listeners below - arrow keys must stay out of
  // dnd-kit's way while a card/column drag is in flight.
  const draggingRef = React.useRef(false);
  React.useEffect(() => {
    draggingRef.current = !!active;
  }, [active]);

  /* THE BOARD CATCHES UP WHEN YOU COME BACK TO IT.
     The auto-archive sweep (lib/tasks/auto-archive.ts) runs once a day and can
     move an approved card into Archive while this board sits open on a second
     monitor. Refetching on RETURN OF FOCUS is what keeps the columns and their
     counters honest without a polling loop — a timer would hit the server all
     day for a change that happens once, usually while nobody is looking.

     Guarded on `draggingRef`: a refresh mid-drag would swap the rows out from
     under dnd-kit and drop the card being held. */
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (draggingRef.current) return;
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  React.useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const isTypingTarget = (t: EventTarget | null) => {
      const n = t instanceof HTMLElement ? t : null;
      return (
        !!n &&
        (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable)
      );
    };
    // Anything the pointer can act on itself - a drag-pan must never start here,
    // or it would fight dnd-kit's card/column drag and swallow clicks.
    const isInteractive = (t: EventTarget | null) => {
      const n = t instanceof HTMLElement ? t : null;
      return (
        !!n &&
        (isTypingTarget(n) ||
          !!n.closest("[data-kanban-card], button, a, input, textarea, select, [role='dialog']"))
      );
    };
    const canPan = () => el.scrollWidth > el.clientWidth + 1;
    // Can this column card-list still absorb the wheel IN THIS DIRECTION?
    const absorbsVertical = (n: HTMLElement, delta: number) => {
      const max = n.scrollHeight - n.clientHeight;
      if (max <= 1) return false;
      return delta > 0 ? n.scrollTop < max - 1 : n.scrollTop > 1;
    };

    // Wheel anywhere over the board maps vertical delta -> horizontal scroll,
    // both ways: positive delta walks the columns right, negative walks them
    // left. 2.5x so one notch of a mouse wheel covers real ground.
    const WHEEL_SPEED = 2.5;
    const onWheel = (e: WheelEvent) => {
      if (!canPan()) return;
      // A REAL two-finger horizontal swipe: hand it straight to the browser.
      // This used to run `scrollLeft += deltaX` + preventDefault, which replaced
      // the platform's inertial scroll with one discrete jump per wheel tick -
      // no momentum, no rubber-band, and it fought the container's own smooth
      // scrolling. Returning without preventDefault lets the native scroller
      // consume deltaX on `overflow-x: auto`, which is what makes trackpad
      // panning feel right.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // deltaMode 1 = lines (Firefox mouse wheels), so normalise to pixels
      // before the multiplier or a Firefox tick would crawl.
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * WHEEL_SPEED;
      if (!delta) return;
      // Shift+wheel is the MOUSE convention for horizontal - always ours.
      if (!e.shiftKey) {
        // Over a column card-list that can still scroll THE WAY THE WHEEL IS
        // GOING: leave it alone, that's normal vertical card scrolling. The
        // direction check matters - a column pinned at its top used to swallow
        // every upward tick, which is what made right-to-left (scroll-up)
        // panning feel dead over a tall column.
        const colList = (e.target instanceof HTMLElement ? e.target : null)?.closest<HTMLElement>(
          "[data-col-scroll]",
        );
        if (colList && absorbsVertical(colList, delta)) return;
      }
      // Instant, per-frame write (no smooth) so high-frequency trackpad deltas
      // never queue up behind an easing animation.
      el.scrollLeft += delta;
      e.preventDefault();
    };

    // Arrow keys step one column at a time - the ONE place easing belongs, so
    // a discrete jump reads as movement instead of a teleport.
    const columnStep = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(el).columnGap || "16") || 16;
      return (first?.offsetWidth ?? 320) + gap;
    };
    const onArrowKey = (e: KeyboardEvent) => {
      if (!canPan() || draggingRef.current) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (isTypingTarget(t) || t?.closest("[data-kanban-card]")) return;
      // Only when the board (or nothing in particular) has focus - never hijack
      // arrows aimed at some other widget on the page.
      const a = document.activeElement;
      if (a && a !== document.body && !el.contains(a)) return;
      const step = columnStep();
      el.scrollTo({ left: el.scrollLeft + (e.code === "ArrowRight" ? step : -step), behavior: "smooth" });
      e.preventDefault();
    };

    // Hold Space -> grab cursor + drag-to-pan. Never triggers while typing, and
    // never steals Space from buttons/links/cards (keeps dnd-kit keyboard
    // pick-up/drop and normal button activation intact).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") return onArrowKey(e);
      if (e.code !== "Space") return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (isTypingTarget(t) || t?.closest("button, a, [role='button']")) return;
      e.preventDefault(); // keep the page itself from scrolling
      if (!spaceHeld.current) {
        spaceHeld.current = true;
        el.style.cursor = "grab";
      }
    };
    const releaseSpace = () => {
      spaceHeld.current = false;
      panState.current = null;
      el.style.cursor = "";
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") releaseSpace();
    };
    // Swallow mousedown in capture while Space is held so dnd-kit's
    // MouseSensor never starts a card/column drag mid-pan.
    const onMouseDown = (e: MouseEvent) => {
      if (!spaceHeld.current) return;
      e.preventDefault();
      e.stopPropagation();
    };

    // Click-and-drag the bare board surface (whitespace, column padding, the
    // empty tail of a short column) to pan. 1.5x so a short flick of the wrist
    // crosses several columns.
    const DRAG_SPEED = 1.5;
    const endDragPan = () => {
      if (!dragPan.current) return;
      dragPan.current = null;
      el.classList.remove("is-panning");
      el.style.userSelect = "";
      el.style.cursor = spaceHeld.current ? "grab" : "";
    };
    const onPointerDown = (e: PointerEvent) => {
      if (spaceHeld.current) {
        panState.current = { startX: e.clientX, startY: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        el.style.cursor = "grabbing";
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Touch is left to the native scroller - it already has inertia and
      // rubber-banding that a hand-rolled drag can only make worse.
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (!canPan() || isInteractive(e.target)) return;
      dragPan.current = { startX: e.clientX, left: el.scrollLeft };
      el.classList.add("is-panning");
      el.style.userSelect = "none";
      el.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      const d = dragPan.current;
      if (d) {
        el.scrollLeft = d.left - (e.clientX - d.startX) * DRAG_SPEED;
        e.preventDefault();
        return;
      }
      const p = panState.current;
      if (!p) return;
      el.scrollLeft = p.left - (e.clientX - p.startX);
      el.scrollTop = p.top - (e.clientY - p.startY);
    };
    const onPointerUp = () => {
      endDragPan();
      if (!panState.current) return;
      panState.current = null;
      el.style.cursor = spaceHeld.current ? "grab" : "";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    // Pointer leaving the WINDOW ends the pan; merely leaving the board must
    // not, because dragging past its edge is how you reach the far columns.
    document.addEventListener("pointerleave", endDragPan);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerleave", endDragPan);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, []);

  const sensors = useSensors(
    // Mouse: a 6px move starts a drag, so clicking a card's link still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to drag, so normal swipes still scroll the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Coarse filtering happens server-side via the page's FilterBar. The bar's
  // free-text search is CLIENT-side and lands here: it narrows `items` before
  // the columns are built below, so every column — including Archived —
  // re-slices live as you type, and each column's header count reflects the
  // matches rather than the unfiltered total. Optimistic drag still mutates
  // `items`.
  const sectionQuery = useSectionSearch();
  // `null` = no search running (everything matches). A Set rather than a
  // filtered list so the arranged column order below stays the source of truth
  // and search only decides what is *rendered* out of it.
  const matchIds = React.useMemo(() => {
    if (!sectionQuery) return null;
    const qNum = sectionQuery.replace(/^#/, ""); // "#1042" and "1042" both hit
    const hits = new Set<string>();
    for (const t of items) {
      if (
        (t.taskNo != null && String(t.taskNo).includes(qNum)) ||
        matchesSearch(sectionQuery, t.title, t.description, t.subject, t.client, t.doerName)
      ) {
        hits.add(t.id);
      }
    }
    return hits;
  }, [items, sectionQuery]);

  // Every column's FULL card list (search-independent), in the arranged order.
  // Drop maths runs against these so an insert lands in the right slot even
  // when a search or the "Show more" limit is hiding some of the neighbours.
  const colTasks = React.useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const col of columns) {
      const list =
        col === ARCHIVE_COL
          ? items.filter((t) => t.archived)
          : items.filter((t) => !t.archived && t.status === col);
      m.set(col, applyBoardOrder(list, order[col]));
    }
    return m;
  }, [items, columns, order]);

  /** Which column a card currently sits in — also the "is this id a card?" test. */
  const colOfCard = React.useMemo(() => {
    const m = new Map<string, ColId>();
    for (const [col, list] of colTasks) for (const t of list) m.set(t.id, col as ColId);
    return m;
  }, [colTasks]);

  const idsOf = React.useCallback(
    (col: ColId) => (colTasks.get(col) ?? []).map((t) => t.id),
    [colTasks],
  );

  async function persistOrder(next: ColId[]) {
    const prev = columns;
    setColumns(next);
    const res = await setBoardColumnOrder(next as string[]);
    if (!res.ok) {
      setColumns(prev);
      fireToast({ message: res.error || "Couldn't save the column order." });
    }
  }

  /** Put a card back exactly where its drag started — column, slot, neighbours. */
  const restoreOrigin = React.useCallback((o: DragOrigin, landedIn: ColId) => {
    setItems((cur) =>
      cur.map((t) => (t.id === o.id ? { ...t, status: o.status, archived: o.archived } : t)),
    );
    setOrder((prev) => {
      const next = { ...prev };
      if (landedIn !== o.col) next[landedIn] = (next[landedIn] ?? []).filter((id) => id !== o.id);
      next[o.col] = o.colOrder;
      return next;
    });
  }, []);

  // ── Server commits ────────────────────────────────────────────────────────
  // The card has ALREADY moved (and been slotted) optimistically by the drag,
  // so these only talk to the server, roll back on failure, and offer Undo.

  async function commitArchive(o: DragOrigin) {
    setSavingId(o.id);
    const res = await archiveTask(o.id);
    setSavingId(null);
    if (!res.ok) {
      restoreOrigin(o, ARCHIVE_COL);
      fireToast({ message: res.error || "Couldn't archive the task." });
      router.refresh();
      return;
    }
    fireToast({
      message: "Task moved to Archived",
      actionLabel: "Undo",
      duration: UNDO_MS,
      action: async () => {
        restoreOrigin(o, ARCHIVE_COL);
        setSavingId(o.id);
        const undone = await unarchiveTask(o.id);
        setSavingId(null);
        if (!undone.ok) {
          fireToast({ message: undone.error || "Couldn't undo the move." });
          router.refresh();
          return;
        }
        fireToast({ message: "Move undone." });
        scheduleReconcile(() => router.refresh());
      },
    });
    // Card already moved to Archived optimistically — reconcile counts/derived
    // fields in one coalesced background refresh (Operation Butter P1).
    scheduleReconcile(() => router.refresh());
  }

  async function commitRestore(o: DragOrigin) {
    setItems((cur) => cur.map((t) => (t.id === o.id ? { ...t, archived: false } : t)));
    setOrder((prev) => ({
      ...prev,
      [ARCHIVE_COL]: (prev[ARCHIVE_COL] ?? o.colOrder).filter((id) => id !== o.id),
    }));
    setSavingId(o.id);
    const res = await unarchiveTask(o.id);
    setSavingId(null);
    if (!res.ok) {
      restoreOrigin(o, o.status);
      fireToast({ message: res.error || "Couldn't restore the task." });
      router.refresh();
      return;
    }
    fireToast({
      message: `Task moved to ${labels[o.status]}`,
      actionLabel: "Undo",
      duration: UNDO_MS,
      action: async () => {
        restoreOrigin(o, o.status);
        setSavingId(o.id);
        const undone = await archiveTask(o.id);
        setSavingId(null);
        if (!undone.ok) {
          fireToast({ message: undone.error || "Couldn't undo the move." });
          router.refresh();
          return;
        }
        fireToast({ message: "Move undone." });
        scheduleReconcile(() => router.refresh());
      },
    });
    scheduleReconcile(() => router.refresh());
  }

  async function commitStatus(o: DragOrigin, status: TaskStatus) {
    setSavingId(o.id);
    const res = await setTaskStatus(o.id, status, o.updatedAt.toISOString());
    setSavingId(null);
    if (!res.ok) {
      restoreOrigin(o, status);
      fireToast({
        message:
          res.error === "forbidden"
            ? // Approval columns get their own wording. "You can't move this
              // task to that status" is true but unhelpful here: the reason is
              // always the same one, and naming it saves the reader guessing
              // whether they picked the wrong card or lack the rights.
              isApprovalTarget(status)
              ? "Approval requires Manager or Admin authorization."
              : "You can't move this task to that status."
            : res.error === "invalid"
              ? res.message ?? "That move isn't allowed from here."
              : res.error === "stale"
                ? "Task changed elsewhere - refreshing."
                : "Couldn't update the task.",
      });
      router.refresh();
      return;
    }
    // Advance the moved card's lock token so a second drag of the SAME card —
    // or the Undo below — doesn't ship a stale `updatedAt` (Operation Butter P1).
    const token = new Date(res.updatedAt);
    setItems((cur) => cur.map((t) => (t.id === o.id ? { ...t, updatedAt: token } : t)));
    fireToast({
      message: `Task moved to ${labels[status]}`,
      actionLabel: "Undo",
      duration: UNDO_MS,
      action: async () => {
        restoreOrigin(o, status);
        setSavingId(o.id);
        const undone = await setTaskStatus(o.id, o.status, token.toISOString());
        setSavingId(null);
        if (!undone.ok) {
          fireToast({ message: "Couldn't undo the move." });
          router.refresh();
          return;
        }
        const back = new Date(undone.updatedAt);
        setItems((cur) => cur.map((t) => (t.id === o.id ? { ...t, updatedAt: back } : t)));
        fireToast({ message: `Task moved back to ${labels[o.status]}` });
        scheduleReconcile(() => router.refresh());
      },
    });
    // Card already moved columns optimistically — coalesce the server-derived
    // reconcile (late badge, counts) into one background refresh.
    scheduleReconcile(() => router.refresh());
  }

  // ── Drag targeting ────────────────────────────────────────────────────────

  /** The column an `over` id belongs to — a card resolves to its column. */
  const columnOf = React.useCallback(
    (id: string | null | undefined): ColId | null => {
      if (id == null) return null;
      return colOfCard.get(id) ?? (columns.includes(id as ColId) ? (id as ColId) : null);
    },
    [colOfCard, columns],
  );

  /**
   * Cards win over columns. This is what stops the append-to-end behaviour:
   * plain `closestCorners` reports the COLUMN whenever the pointer sits in the
   * gap between two cards, and a column target can only ever mean "add to the
   * end". Resolving to the nearest CARD instead yields a real target index.
   */
  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      if (args.active.data.current?.type === "column") {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => c.data.current?.type === "column",
          ),
        });
      }
      const isCard = (id: string | number) => colOfCard.has(String(id));
      const pointer = pointerWithin(args);
      const onCards = pointer.filter((c) => isCard(c.id));
      if (onCards.length > 0) return onCards;

      const corners = closestCorners(args);
      const hoveredCol = pointer.find((c) => !isCard(c.id))?.id;
      if (hoveredCol != null) {
        const inCol = corners.filter((c) => colOfCard.get(String(c.id)) === hoveredCol);
        if (inCol.length > 0) return inCol;
        const col = corners.filter((c) => c.id === hoveredCol);
        if (col.length > 0) return col;
      }
      return corners.length > 0 ? corners : pointer;
    },
    [colOfCard],
  );

  const originRef = React.useRef<DragOrigin | null>(null);

  function onDragStart(e: DragStartEvent) {
    const type = (e.active.data.current?.type as "card" | "column") ?? "card";
    const id = String(e.active.id);
    setActive({ id, type });
    originRef.current = null;
    if (type !== "card") return;
    const col = colOfCard.get(id);
    const card = items.find((t) => t.id === id);
    if (!col || !card) return;
    const ids = idsOf(col);
    originRef.current = {
      id,
      col,
      index: ids.indexOf(id),
      colOrder: ids,
      status: card.status,
      archived: card.archived,
      updatedAt: card.updatedAt,
    };
  }

  /**
   * Live re-homing. Moving a card to a DIFFERENT column is spliced in here at
   * the hovered index — never appended — so the destination's cards physically
   * shift apart and the card's slot (a dashed outline) previews the exact
   * insertion point. Re-ordering WITHIN a column is deliberately not committed
   * here: `verticalListSortingStrategy` already animates that preview, and
   * mutating state on every hover would fight it.
   */
  function onDragOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (a.data.current?.type === "column") {
      setOverCol(over ? String(over.id) : null);
      return;
    }
    const to = columnOf(over ? String(over.id) : null);
    setOverCol(to);
    const activeId = String(a.id);
    const from = colOfCard.get(activeId);
    if (!to || !from || from === to) return;

    const card = items.find((t) => t.id === activeId);
    if (!card) return;
    // Restoring an archived card keeps its own status, so it can't be previewed
    // into the hovered column — the column highlight is the affordance there.
    if (card.archived && to !== ARCHIVE_COL) return;

    // Target index: before or after the hovered card depending on which half of
    // it the dragged card has crossed. Only a drop on bare column space (an
    // empty column) falls through to the end.
    const destIds = idsOf(to).filter((id) => id !== activeId);
    let targetIndex = destIds.length;
    const overId = over ? String(over.id) : null;
    if (overId && colOfCard.get(overId) === to) {
      const translated = a.rect.current.translated;
      const below =
        !!translated && !!over && translated.top > over.rect.top + over.rect.height / 2;
      targetIndex = destIds.indexOf(overId) + (below ? 1 : 0);
    }
    // Splice at the target — every other card keeps its exact relative order.
    destIds.splice(Math.max(0, Math.min(targetIndex, destIds.length)), 0, activeId);

    setItems((cur) =>
      cur.map((t) =>
        t.id !== activeId
          ? t
          : to === ARCHIVE_COL
            ? { ...t, archived: true }
            : { ...t, archived: false, status: to as TaskStatus },
      ),
    );
    setOrder((prev) => ({
      ...prev,
      [from]: idsOf(from).filter((id) => id !== activeId),
      [to]: destIds,
    }));
  }

  function onDragEnd(e: DragEndEvent) {
    const a = active;
    const o = originRef.current;
    setActive(null);
    setOverCol(null);
    originRef.current = null;
    const { over } = e;

    if (a?.type === "column") {
      const overId = over ? String(over.id) : null;
      if (!overId || !isAdmin || overId === a.id) return;
      const from = columns.indexOf(a.id as ColId);
      const to = columns.indexOf(overId as ColId);
      if (from < 0 || to < 0) return;
      void persistOrder(arrayMove(columns, from, to));
      return;
    }

    if (!a || !o) return;
    // Released outside any column — undo the live preview, change nothing.
    if (!over) {
      restoreOrigin(o, colOfCard.get(a.id) ?? o.col);
      return;
    }

    const overId = String(over.id);
    const dropCol = columnOf(overId);

    // Archived → a status column restores the card and KEEPS its status (the
    // board's long-standing rule), so it lands in its own column, not this one.
    if (o.archived && dropCol && dropCol !== ARCHIVE_COL) {
      void commitRestore(o);
      return;
    }

    // Commit the final slot. Cross-column placement was already spliced in
    // during the drag; this is the within-column `arrayMove` the sorting
    // strategy has been previewing — a pure reposition that leaves every other
    // card's relative order untouched.
    const landedIn = colOfCard.get(a.id) ?? o.col;
    let ids = idsOf(landedIn);
    if (overId !== a.id && colOfCard.get(overId) === landedIn) {
      const from = ids.indexOf(a.id);
      const to = ids.indexOf(overId);
      if (from >= 0 && to >= 0 && from !== to) ids = arrayMove(ids, from, to);
    }
    setOrder((prev) => {
      const next = { ...prev, [landedIn]: ids };
      if (landedIn !== o.col) next[o.col] = idsOf(o.col).filter((id) => id !== a.id);
      return next;
    });
    // Dropped below the destination's "Show more" cut-off — reveal enough of
    // the column that the card the user just placed stays on screen.
    const landedIdx = ids.indexOf(a.id);
    if (landedIdx >= (visibleByCol[landedIn] ?? COL_STEP)) {
      setVisibleByCol((m) => ({
        ...m,
        [landedIn]: Math.ceil((landedIdx + 1) / COL_STEP) * COL_STEP,
      }));
    }

    if (landedIn === o.col) {
      // Same column — a pure re-order. Nothing to persist server-side, but the
      // slot is still undoable.
      if (landedIdx === o.index) return;
      fireToast({
        message: "Task reordered",
        actionLabel: "Undo",
        duration: UNDO_MS,
        action: () => setOrder((prev) => ({ ...prev, [o.col]: o.colOrder })),
      });
      return;
    }
    if (landedIn === ARCHIVE_COL) {
      void commitArchive(o);
      return;
    }
    void commitStatus(o, landedIn as TaskStatus);
  }

  const activeCard = active?.type === "card" ? items.find((t) => t.id === active.id) ?? null : null;

  // Search matched no card in ANY column — show the answer instead of eight
  // empty columns. Only when a search is active; an unfiltered empty board
  // still renders its columns so you can see the workflow and drop into it.
  if (sectionQuery && matchIds != null && matchIds.size === 0) {
    return (
      <NoResults
        query={sectionQuery}
        noun="cards"
        onClear={() => setSectionSearch("")}
      />
    );
  }

  return (
    <Tooltip.Provider delayDuration={550} skipDelayDuration={0}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        // A little vertical threshold too, so dragging to the top/bottom of a
        // long column scrolls that column into range mid-drag.
        autoScroll={{ threshold: { x: 0.28, y: 0.12 }, acceleration: 16 }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          const o = originRef.current;
          if (o) restoreOrigin(o, colOfCard.get(o.id) ?? o.col);
          originRef.current = null;
          setActive(null);
          setOverCol(null);
        }}
      >
        <div>
          <div
            ref={boardRef}
            /* One horizontal scroller for all ten columns. Fixed-width columns
               (below) rather than flex-grown ones is what keeps the last column
               a real card instead of a stretched remainder. */
            className="kanban-palette kanban-board-container kanban-scroll cursor-grab flex flex-row items-stretch gap-4 overflow-x-auto overflow-y-hidden p-4 max-sm:snap-x max-sm:snap-mandatory"
            style={{ height: "calc(100dvh - 208px)", minHeight: 460, scrollBehavior: "auto" }}
          >
            <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
              {columns.map((col) => {
                const { isArchive, accent, accentDeep, accentBgLight } = accentFor(col, tones);
                // Arranged order first, then the live search decides what of
                // it is rendered — so a search never disturbs the arrangement.
                const arranged = colTasks.get(col) ?? [];
                const visible = matchIds ? arranged.filter((t) => matchIds.has(t.id)) : arranged;
                // This week's goals whose task-status maps to this column.
                // Never shown in the Archive column.
                const colGoals = isArchive
                  ? []
                  : weeklyGoals.filter((g) => g.status === col);
                const limit = visibleByCol[col] ?? COL_STEP;
                // A card dragged past the "Show more" cut-off must still render
                // — otherwise its drop indicator would vanish exactly when the
                // user is aiming at the bottom of a long column.
                const activeIdx =
                  active?.type === "card" ? visible.findIndex((t) => t.id === active.id) : -1;
                const shownTasks = visible.slice(0, Math.max(limit, activeIdx + 1));
                const hiddenCount = visible.length - shownTasks.length;
                const label = isArchive ? "Archived" : labels[col as TaskStatus];
                const isCardOver = active?.type === "card" && overCol === col;
                return (
                  <KanbanColumn
                    key={col}
                    col={col}
                    isAdmin={isAdmin}
                    isArchive={isArchive}
                    label={label}
                    count={visible.length}
                    accent={accent}
                    accentDeep={accentDeep}
                    accentBgLight={accentBgLight}
                    isCardOver={isCardOver}
                  >
                    {isArchive && visible.length === 0 && (
                      <div
                        className="rounded-chip px-3 py-6 text-center"
                        style={{ border: "1.5px dashed var(--color-hairline-strong)" }}
                      >
                        <p className="text-[14px] font-semibold leading-relaxed text-ink-subtle">
                          Drag a card here to archive it.
                        </p>
                      </div>
                    )}
                    {!isArchive && visible.length === 0 && colGoals.length === 0 && (
                      <div
                        className="rounded-chip px-3 py-6 text-center"
                        style={{ border: "1.5px dashed var(--color-hairline-strong)" }}
                      >
                        <p className="text-[13.5px] font-semibold text-ink-subtle">
                          Nothing here - drop a card to move it.
                        </p>
                      </div>
                    )}
                    {/* Pinned weekly-goal cards at the top of the column —
                        badged, distinct accent, link out to the workspace. */}
                    {colGoals.map((g) => (
                      <KanbanGoalCard key={g.id} g={g} />
                    ))}
                    {/* One sortable list per column: this is what makes the
                        neighbours slide apart and the dragged card's slot land
                        exactly where the pointer is, instead of at the end. */}
                    <SortableContext
                      items={shownTasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {shownTasks.map((t) => (
                        <KanbanCard
                          key={t.id}
                          t={t}
                          labels={labels}
                          tones={tones}
                          saving={savingId === t.id}
                          accent={accent}
                          accentBgLight={accentBgLight}
                          dragging={active !== null}
                        />
                      ))}
                    </SortableContext>
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleByCol((m) => ({ ...m, [col]: limit + COL_STEP }))
                        }
                        className="mt-1 w-full rounded-chip py-2.5 text-[14px] font-bold transition-colors text-ink-soft hover:bg-surface-card"
                        style={{ border: "1px dashed var(--color-hairline-strong)" }}
                      >
                        Show {Math.min(COL_STEP, hiddenCount)} more ({hiddenCount} hidden)
                      </button>
                    )}
                  </KanbanColumn>
                );
              })}
            </SortableContext>
          </div>
        </div>

        {/* Floating drag preview. */}
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
          {activeCard ? (
            <div
              /* `kanban-palette` again, and not by accident: DragOverlay
                 renders as a SIBLING of the board container, so the scoped
                 tokens below it do not reach here. Without the class the
                 floating card would paint its status stripe from the global
                 palette and the pink would reappear for exactly as long as a
                 drag lasts — the hardest kind of colour bug to catch. */
              className="kanban-palette relative w-[300px] rotate-2 cursor-grabbing rounded-chip border border-slate-300 bg-white p-3.5 pl-4 shadow-2xl"
              style={{
                // Neutral slate, not the red-tinted drop shadow this carried
                // (rgba(225,6,0,0.25)) — a red glow under the lifted card is
                // the same peach cast in shadow form.
                boxShadow:
                  "0 24px 60px -16px rgba(15,23,42,0.35), 0 8px 20px -8px rgba(15,23,42,0.20)",
              }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                style={{
                  background: `linear-gradient(180deg, var(--color-${tones[activeCard.status] ?? "slate"}), var(--color-${tones[activeCard.status] ?? "slate"}-deep))`,
                }}
              />
              <span
                className="block text-[15.5px] font-semibold text-ink-strong leading-snug"
                style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {activeCard.description || activeCard.title}
              </span>
              <div className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-subtle">
                {activeCard.taskNo != null && <span className="font-bold tabular-nums">#{activeCard.taskNo}</span>}
                {activeCard.doerName && <span>· {activeCard.doerName}</span>}
              </div>
            </div>
          ) : active?.type === "column" ? (
            <div className="kanban-palette rounded-section border border-hairline-strong bg-surface-soft px-4 py-3 shadow-2xl">
              <span className="text-[15.5px] font-bold text-ink-strong">
                {active.id === ARCHIVE_COL ? "Archived" : labels[active.id as TaskStatus]}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Tooltip.Provider>
  );
}

// ── Column (sortable for admin reorder + drop target for cards) ─────────────
function KanbanColumn({
  col,
  isAdmin,
  isArchive,
  label,
  count,
  accent,
  accentDeep,
  accentBgLight,
  isCardOver,
  children,
}: {
  col: ColId;
  isAdmin: boolean;
  isArchive: boolean;
  label: string;
  count: number;
  accent: string;
  accentDeep: string;
  accentBgLight: string;
  isCardOver: boolean;
  children: React.ReactNode;
}) {
  // Disable only the column DRAG for non-admins — the column must stay a drop
  // target so anyone can still drag cards between columns.
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: col,
    disabled: { draggable: !isAdmin, droppable: false },
    data: { type: "column" },
  });

  return (
    <div
      ref={setNodeRef}
      /* Every column is the SAME width at every breakpoint: no flex-grow, so a
         board with few columns can't stretch them across the viewport and one
         with ten can't squeeze them unevenly. */
      className="relative flex flex-col overflow-hidden w-[320px] min-w-[300px] max-w-[340px] shrink-0 max-sm:snap-center rounded-section p-3.5 transition-colors"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        background: isCardOver ? accentBgLight : "var(--color-surface-soft)",
        border: `1px solid ${isCardOver ? accent : "var(--color-hairline)"}`,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -22px rgba(15,23,42,0.22)",
        touchAction: "manipulation",
      }}
    >
      {/* Status accent strip along the column top. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-30 pointer-events-none"
        style={{
          height: 3,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: `linear-gradient(90deg, ${accent}, ${accentDeep})`,
        }}
      />
      {/* Column header — a fixed (non-scrolling) top block so the status is
          FROZEN and always visible; only the cards list below scrolls. The grip
          is the admin reorder handle. */}
      <div
        className="shrink-0 z-20 flex items-center justify-between gap-2 -mx-3.5 -mt-3.5 mb-3 px-3.5 pt-4 pb-2.5"
        style={{
          background: "inherit",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <span className="inline-flex items-center gap-2 min-w-0" style={{ color: accentDeep }}>
          {isAdmin && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${label} column`}
              className="shrink-0 cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink-strong touch-none"
            >
              <GripVertical size={15} strokeWidth={2.2} aria-hidden />
            </button>
          )}
          {isArchive ? (
            <Archive size={16} strokeWidth={2.4} className="shrink-0" style={{ color: accent }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accent }} />
          )}
          <span
            className="font-black truncate"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 15.5,
              letterSpacing: "-0.005em",
            }}
          >
            {label}
          </span>
        </span>
        <span
          className="rounded-pill px-2.5 py-0.5 text-[13px] font-black tabular-nums shrink-0"
          style={{
            color: accentDeep,
            background: `color-mix(in srgb, ${accent} 13%, white)`,
            border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
          }}
        >
          {count}
        </span>
      </div>

      {/* Only this cards list scrolls — the header above stays frozen. */}
      <div data-col-scroll className="kanban-scroll flex-1 min-h-[40px] overflow-y-auto overflow-x-hidden flex flex-col gap-2 -mr-2 pr-2">{children}</div>
    </div>
  );
}

// ── Card (draggable) ─────────────────────────────────────────────────────────
function KanbanCard({
  t,
  labels,
  tones,
  saving,
  accent,
  accentBgLight,
  dragging,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  saving: boolean;
  /** Host column's accent — colours this card's slot while it's being dragged. */
  accent: string;
  accentBgLight: string;
  /** A drag is in flight anywhere on the board (suppresses hover cards). */
  dragging: boolean;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: t.id,
    data: { type: "card" },
  });

  const statusTone = tones[t.status] ?? "slate";
  // Effective due already (revised ?? original) from the query; an open task
  // past it reads as overdue on the due chip.
  const overdue =
    !t.archived && !t.completedAt && t.status !== "done" && t.dueAt.getTime() < Date.now();
  const meta = [t.client?.trim(), t.subject?.trim()].filter((p): p is string => !!p);

  return (
    <div
      ref={setNodeRef}
      data-kanban-card
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
      style={{
        // The sorting strategy slides every card — including this one — into
        // the arrangement the drop would produce, so the outline below always
        // sits at the real insertion point and the neighbours have already
        // shifted out of the way.
        transform: CSS.Translate.toString(transform),
        transition,
        // While dragging, the card itself rides in the DragOverlay and its slot
        // becomes the drop indicator: an accent dashed outline the exact size
        // of the card. `outline` (not `border`) so it costs no layout, and the
        // contents stay mounted-but-hidden to hold the slot's height.
        ...(isDragging
          ? {
              borderRadius: "var(--radius-chip)",
              background: accentBgLight,
              outline: `2px dashed ${accent}`,
              outlineOffset: -2,
            }
          : null),
      }}
    >
      <Tooltip.Root delayDuration={550} {...(dragging ? { open: false } : null)}>
        <Tooltip.Trigger asChild>
          <div
            /* The hover edge is a token (--kanban-hover-edge, app/globals.css)
               rather than `hover:border-altus-red/40`. Brand red at 40% on
               white is a salmon pink, and it was the glow under every card on
               the board. Neutral slate leaves the hover legible as a lift
               without tinting the card. */
            className="group relative rounded-chip bg-white border border-hairline p-3.5 pl-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-[var(--kanban-hover-edge)]"
            style={{
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              // Hidden, not unmounted — the slot keeps this card's exact height
              // so the placeholder is the same size as what will land in it.
              ...(isDragging ? { visibility: "hidden" as const } : null),
            }}
          >
            {/* Status accent stripe. */}
            <span
              aria-hidden
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
              style={{
                background: t.archived
                  ? "#94a3b8"
                  : `linear-gradient(180deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
              }}
            />
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/tasks/${t.id}/focus` as Route}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                className="text-[15.5px] font-semibold text-ink-strong leading-snug hover:underline group-hover:text-altus-red-deep transition-colors"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description || t.title}
              </Link>
              {saving && (
                <Loader2 size={14} className="animate-spin text-ink-subtle shrink-0 mt-0.5" />
              )}
            </div>

            {/* Badge row — task no · priority · due (red when overdue) · late. */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              {t.taskNo != null && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[12px] font-black tabular-nums text-ink-subtle"
                  style={{
                    background: "var(--color-surface-soft)",
                    border: "1px solid var(--color-hairline)",
                  }}
                >
                  #{t.taskNo}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold whitespace-nowrap"
                style={{
                  color: `var(--color-${PRIORITY_TONE[t.priority] ?? "slate"}-deep)`,
                  background: `color-mix(in srgb, var(--color-${PRIORITY_TONE[t.priority] ?? "slate"}) 12%, white)`,
                  border: `1px solid color-mix(in srgb, var(--color-${PRIORITY_TONE[t.priority] ?? "slate"}) 26%, transparent)`,
                }}
              >
                <Flag size={11} strokeWidth={2.6} />
                {PRIORITY_LABELS[t.priority]}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums whitespace-nowrap ${
                  overdue ? "" : "text-ink-subtle"
                }`}
                style={
                  overdue
                    ? {
                        color: "var(--color-red-deep)",
                        background: "color-mix(in srgb, var(--color-red) 10%, white)",
                        border: "1px solid color-mix(in srgb, var(--color-red) 28%, transparent)",
                      }
                    : {
                        background: "var(--color-surface-soft)",
                        border: "1px solid var(--color-hairline)",
                      }
                }
                title={overdue ? "Past its due date" : "Due date"}
              >
                <CalendarDays size={11} strokeWidth={2.4} />
                {formatDate(t.dueAt)}
                {overdue ? " · overdue" : ""}
              </span>
              {isDoneLate({ status: t.status, completedAt: t.completedAt, dueAt: t.dueAt }) && (
                <LateBadge />
              )}
            </div>

            {/* Footer — client · subject + doer chip. */}
            {(meta.length > 0 || t.doerName) && (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold text-ink-subtle">
                  {meta.join(" · ")}
                </span>
                {t.doerName && (
                  <span
                    className="inline-flex items-center gap-1.5 min-w-0 shrink-0"
                    title={t.doerName}
                  >
                    <EmployeeAvatar name={t.doerName} size="sm" />
                    <span className="max-w-[110px] truncate text-[12.5px] font-semibold text-ink-subtle">
                      {t.doerName.split(" ")[0]}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="kanban-hovercard z-[80]"
          >
            <TaskHoverCard t={t} labels={labels} tones={tones} />
            <Tooltip.Arrow width={14} height={7} style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

// ── Weekly-goal card (design §10) ───────────────────────────────────────────
// A read-only, non-draggable card surfaced inside its status column. Visually
// distinct (Altus accent + "Weekly Goal" badge) and links out to the Weekly
// Goals workspace — the single edit/review surface. Never a real task.
function KanbanGoalCard({ g }: { g: VirtualTaskRow }) {
  const meta = [g.client?.trim(), g.subject?.trim(), g.doerName?.trim()].filter(
    (p): p is string => !!p,
  );
  return (
    <Link
      href={g.href as Route}
      className="group block rounded-chip p-3.5 pl-[15px] transition-colors duration-200 hover:bg-surface-soft"
      style={{
        background: "var(--color-surface-card)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
        borderLeft: "3px solid var(--color-altus-red)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <WeeklyGoalBadge />
        <span
          className="tabular-nums font-bold shrink-0"
          style={{ fontSize: 12.5, color: "var(--color-altus-red-deep)" }}
        >
          {g.pct}%
        </span>
      </div>
      <span
        className="mt-2 block text-[15px] font-semibold text-ink-strong leading-snug group-hover:text-altus-red-deep transition-colors"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {g.title}
      </span>
      {meta.length > 0 && (
        <span className="mt-1.5 block truncate text-[12.5px] text-ink-subtle">
          {meta.join(" · ")}
        </span>
      )}
      {/* Effective-% progress bar. */}
      <span
        aria-hidden
        className="mt-2.5 block rounded-full overflow-hidden"
        style={{ height: 5, background: "var(--color-hairline)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, g.pct))}%`,
            background: "var(--color-altus-red)",
          }}
        />
      </span>
    </Link>
  );
}

// ── Hover preview ─────────────────────────────────────────────────────────
function Pill({
  tone,
  icon,
  children,
}: {
  tone: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap"
      style={{
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function FieldHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-1.5 text-ink-subtle"
      style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
    >
      {icon}
      {children}
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <FieldHead icon={icon}>{label}</FieldHead>
      <div className="mt-1 truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
        {value && value.trim() ? value : "-"}
      </div>
    </div>
  );
}

function TaskHoverCard({
  t,
  labels,
  tones,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
}) {
  const statusTone = tones[t.status] ?? "blue";
  const prioTone = PRIORITY_TONE[t.priority] ?? "slate";
  const desc = t.description?.trim();
  const DELAY = ["40ms", "95ms", "150ms", "205ms", "260ms"] as const;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface-card"
      style={{
        width: 384,
        maxWidth: "calc(100vw - 32px)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
      }}
    >
      <span
        aria-hidden
        className="hc-accent absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
        }}
      />

      <div className="p-5 pt-6">
        <div className="hc-item flex items-center gap-2 flex-wrap" style={{ animationDelay: DELAY[0] }}>
          <Pill
            tone={statusTone}
            icon={<span className="h-2 w-2 rounded-full" style={{ background: `var(--color-${statusTone})` }} />}
          >
            {labels[t.status]}
          </Pill>
          <Pill tone={prioTone} icon={<Flag size={12} strokeWidth={2.6} />}>
            {PRIORITY_LABELS[t.priority]}
          </Pill>
          {t.archived && (
            <Pill tone="slate" icon={<Archive size={12} strokeWidth={2.4} />}>
              Archived
            </Pill>
          )}
        </div>

        <h3
          className="hc-item mt-3.5 text-ink-strong"
          style={{ animationDelay: DELAY[1], fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}
        >
          {t.taskNo != null && <span className="text-ink-subtle tabular-nums">#{t.taskNo} · </span>}
          {t.title}
        </h3>

        <div className="hc-item mt-3" style={{ animationDelay: DELAY[2] }}>
          <FieldHead icon={<AlignLeft size={14} strokeWidth={2.2} />}>Description</FieldHead>
          {desc ? (
            <p
              className="mt-1.5 whitespace-pre-wrap text-ink-soft"
              style={{ fontSize: 14.5, lineHeight: 1.6, maxHeight: 208, overflowY: "auto" }}
            >
              {desc}
            </p>
          ) : (
            <p className="mt-1.5 italic text-ink-subtle" style={{ fontSize: 14 }}>
              No description added.
            </p>
          )}
        </div>

        <div className="hc-item my-4 h-px bg-hairline" style={{ animationDelay: DELAY[3] }} />

        <div className="hc-item grid grid-cols-2 gap-x-4 gap-y-4" style={{ animationDelay: DELAY[4] }}>
          <Meta icon={<Building2 size={14} strokeWidth={2.2} />} label="Client" value={t.client} />
          <Meta icon={<Tag size={14} strokeWidth={2.2} />} label="Subject" value={t.subject} />
          <Meta
            icon={<CalendarDays size={14} strokeWidth={2.2} />}
            label="Due"
            value={t.dueAt ? formatDate(t.dueAt) : null}
          />
          <div className="min-w-0">
            <FieldHead icon={<User size={14} strokeWidth={2.2} />}>Doer</FieldHead>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              {t.doerName ? (
                <>
                  <EmployeeAvatar name={t.doerName} size="sm" />
                  <span className="truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {t.doerName}
                  </span>
                </>
              ) : (
                <span className="text-ink-subtle" style={{ fontSize: 14.5 }}>
                  Unassigned
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
