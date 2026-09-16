"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import {
  CalendarDays,
  ChevronLeft,
  Search,
  X,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
  History,
  Layers,
  ListTodo,
  Loader2,
  Sunrise,
  Plus,
} from "lucide-react";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { autoPunch } from "@/components/attendance/auto-punch";
import { blockLabel } from "@/lib/goals/plan-time";
import {
  PLAN_SORT_DEFAULT,
  PLAN_SORT_LABELS,
  sortPlanItems,
  type PlanSort,
} from "@/lib/goals/plan-sort";
import { SourceCard } from "./source-card";
import { DayColumn, DAY_DROP } from "./day-column";
import { PlanQuickDock } from "./plan-quick-dock";
import { DayReview } from "./day-review";
import { SourceTag } from "./source-tag";
import { HoverTip } from "@/components/ui/hover-tip";
import {
  DEFAULT_WMS_FILTER,
  OVERDUE_LABEL,
  OVERDUE_OPTIONS,
  applyWmsFilter,
  isFilterActive,
  sortByAttention,
  type OverdueFilter,
  type PriorityFilter,
  type WmsFilter,
} from "./wms-filters";
import {
  GHOST_ID,
  PLAN_DEFAULT_SPAN,
  type PlanDayColumn,
  type PlanDayPayload,
  type PlanDayTab,
  type PlanItem,
  type PlanSources,
  type SourceItem,
  type SourceKind,
} from "./types";
import {
  addWeeklyGoalToPlan,
  addCascadeGoalToPlan,
  addTaskToPlan,
  addUnfinishedToPlan,
  addAdhocToPlan,
  abandonTask,
  reorderPlan,
  abandonPlanItem,
  duplicatePlanItem,
  renamePlanItem,
  setItemProgress,
  setPlanItemPending,
  setPlanItemTime,
  startMyDay,
  transferPlanItem,
} from "@/app/(app)/goals/plan/actions";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { Route } from "next";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";

/** Sources that de-dupe against the plan (flip to "planned" once pulled). */
const DEDUPE_KINDS: SourceKind[] = ["weekly", "task", "unfinished"];

/** Who this board is planning for — see lib/goals/plan-target.ts. */
export interface PlanTargetProp {
  employeeId: string;
  name: string;
  isDelegated: boolean;
  roster: { id: string; name: string }[];
}

interface Props {
  /** Whose day is on screen + everyone the viewer may plan for. */
  target: PlanTargetProp;
  /** The whole planning window, assembled server-side. */
  payload: PlanDayPayload;
  /**
   * Where the header's "Dashboard" button points — the Daily Goals Dashboard.
   *
   * OPT-IN, and off unless a caller passes it. The board is mounted on two
   * surfaces: the Daily Goals page (app/(app)/my-day/page.tsx), which passes
   * this, and the Goals canvas day drawer (components/goals/canvas/
   * child-planner.tsx), which does not. The dashboard belongs to Daily Goals
   * ONLY, so defaulting to "no button" is what keeps it out of the Goals module
   * — and out of anywhere else this board is ever embedded.
   */
  dashboardHref?: Route;
  /**
   * Pin the floating Add Commitment + Start My Day dock to the viewport.
   *
   * OPT-IN for the same reason `dashboardHref` is: this board is also embedded
   * in the Goals canvas day drawer, and a `position: fixed` bar belongs to a
   * PAGE — inside a drawer it would break out of its container and hang over
   * the canvas. The Daily Goals page passes it; nothing else does.
   */
  quickDock?: boolean;
}

const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

/** Drop-target id prefix for the day tabs — `daytab:<offset>`. */
const DAY_TAB_DROP = "daytab:";

/** The span the board opens on — one shared definition, see types.ts. */
const DEFAULT_SPAN = PLAN_DEFAULT_SPAN;

const nonGhost = (items: PlanItem[]) => items.filter((i) => i.id !== GHOST_ID);

/**
 * PLAN MY DAY — a 3-day kanban with the work you can pull into it on the right.
 *
 * The screen answers four questions and nothing else (Sir):
 *   What do I have to do? · When do I have to do it? · Did I complete it? ·
 *   If not, where should it move?
 *
 * Everything on it is therefore either a day column, a piece of work, or one of
 * the four decisions (Done / → tomorrow / → day after / Pending). There is no
 * percentage anywhere: a commitment was delivered or it wasn't.
 */
export function PlanBoard({ target, payload, dashboardHref, quickDock }: Props) {
  const [phase, setPhase] = React.useState(payload.initialPhase);
  const [starting, setStarting] = React.useState(false);
  const [days, setDays] = React.useState<PlanDayColumn[]>(payload.days);
  const [src, setSrc] = React.useState<PlanSources>(payload.sources);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // The pull rail folds away like the app sidebar does, giving the three day
  // columns the whole width when you're only reading the plan (Sir).
  const [railOpen, setRailOpen] = React.useState(true);
  // "Change Plan" from the day-started screen: show the BOARD again while the
  // day keeps running, so the header offers Review My Day rather than Start.
  const [adjusting, setAdjusting] = React.useState(false);
  // Free-text filter over everything on screen. Client-side on purpose: the
  // board already holds the whole window, so typing filters instantly with no
  // round-trip and no spinner.
  const [query, setQuery] = React.useState("");
  // How each day column is ordered. ALWAYS opens on Oldest → Newest, and is
  // deliberately NOT persisted to the URL or storage: the default is the
  // product rule, so a stale "newest" must never be what greets you tomorrow.
  const [sort, setSort] = React.useState<PlanSort>(PLAN_SORT_DEFAULT);
  const [active, setActive] = React.useState<
    | { type: "source"; title: string; kind: SourceKind }
    | { type: "plan"; item: PlanItem }
    | null
  >(null);
  const [, startTransition] = React.useTransition();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * ROUTER ACTIONS ONLY WHILE WE'RE STILL HERE.
   *
   * Nearly every write on this board finishes with a refresh so the server's
   * truth replaces the optimistic copy. Those land asynchronously — and if the
   * page went away in the meantime (the idle-timer hard-navigates to /login, or
   * the user clicked through to another route), the refresh arrives to find no
   * router mounted and Next throws "Router action dispatched before
   * initialization". Guarding on a mounted ref makes a late refresh a no-op
   * instead of an uncaught error.
   */
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const refresh = React.useCallback(() => {
    if (mounted.current) router.refresh();
  }, [router]);

  // A FRESH SERVER PAYLOAD WINS. Day navigation, a person switch or a
  // router.refresh() hands us new truth, and the optimistic copy is discarded.
  // Done during render (React's "adjusting state when a prop changes" pattern)
  // rather than in an effect, so there is no extra paint of stale columns.
  const [seen, setSeen] = React.useState(payload);
  if (seen !== payload) {
    setSeen(payload);
    setDays(payload.days);
    setSrc(payload.sources);
    // Follow the server's lifecycle only when it actually CHANGED — otherwise
    // sliding the day window would knock the user out of the review they just
    // opened (the review always concerns today, whatever days are on screen).
    if (seen.initialPhase !== payload.initialPhase) setPhase(payload.initialPhase);
  }

  const { windowStart, maxWindowStart, minWindowStart, windowDays, todayYmd, minItems, hierarchy } = payload;
  const firstDay = days[0];

  /* ── search ──────────────────────────────────────────────────────────── */
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = React.useCallback(
    (...text: (string | null | undefined)[]) =>
      !q || text.some((t) => (t ?? "").toLowerCase().includes(q)),
    [q],
  );
  /**
   * The kanban as it is DRAWN — filtered by the search box, then ordered by the
   * sort control.
   *
   * A VIEW, never the stored plan. `days` keeps the server's own order (which
   * is `position` — what drag-to-reorder writes), so dragging still persists
   * exactly what it always did and the ghost/reorder handlers keep working off
   * the real list. Sorting only decides what you look at.
   */
  const shownDays = React.useMemo(() => {
    const filtered = searching
      ? days.map((d) => ({ ...d, items: d.items.filter((i) => matches(i.title)) }))
      : days;
    return filtered.map((d) => ({ ...d, items: sortPlanItems(d.items, sort) }));
  }, [days, searching, matches, sort]);

  /**
   * Jump to writing a commitment — used by the toolbar button AND the "C"
   * shortcut. It targets the FIRST visible day (Today, unless the window has
   * been moved on), scrolls the composer into view and puts the cursor in it.
   */
  const focusAddCommitment = React.useCallback(() => {
    const offset = days[0]?.offset ?? 0;
    const el = document.getElementById(`plan-add-${offset}`) as HTMLInputElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.focus();
  }, [days]);

  // "C" = add a commitment. Ignored while you're already typing somewhere, and
  // while a dialog owns the screen — otherwise typing "c" into a task would
  // fling the cursor across the board.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      focusAddCommitment();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusAddCommitment]);

  /* ── navigation ──────────────────────────────────────────────────────── */

  const goToWindow = React.useCallback(
    (start: number, empId: string = target.employeeId, days: number = payload.windowDays) => {
      const qs = new URLSearchParams();
      // `!== 0`, not `> 0` — the window can start in the PAST now.
      if (start !== 0) qs.set("d", String(start));
      if (days !== DEFAULT_SPAN) qs.set("v", String(days));
      if (empId && target.roster.length > 1) qs.set("emp", empId);
      const q = qs.toString();
      router.push((q ? `${pathname}?${q}` : pathname) as Route);
    },
    [router, pathname, target.employeeId, target.roster.length, payload.windowDays],
  );

  /* ── day mutations ───────────────────────────────────────────────────── */

  /** Replace the items of one day column. */
  const setDayItems = React.useCallback(
    (offset: number, fn: (items: PlanItem[]) => PlanItem[]) =>
      setDays((prev) => prev.map((d) => (d.offset === offset ? { ...d, items: fn(d.items) } : d))),
    [],
  );

  /** Drop an item from whichever column currently holds it. */
  const dropItemEverywhere = React.useCallback(
    (id: string) => setDays((prev) => prev.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }))),
    [],
  );

  const findItem = React.useCallback(
    (id: string): { day: PlanDayColumn; item: PlanItem } | null => {
      for (const d of days) {
        const item = d.items.find((i) => i.id === id);
        if (item) return { day: d, item };
      }
      return null;
    },
    [days],
  );

  /**
   * MOVE a commitment to another planner day. It leaves its old column and
   * appears in the new one immediately; a failure refreshes to restore truth.
   * An item lives on exactly one day, so this is a move, never a copy (rule 11).
   */
  const onTransfer = React.useCallback(
    (id: string, toOffset: number) => {
      const found = findItem(id);
      if (!found || found.day.offset === toOffset) return;
      const moved = { ...found.item, pending: false };
      setDays((prev) =>
        prev.map((d) =>
          d.offset === found.day.offset
            ? { ...d, items: d.items.filter((i) => i.id !== id) }
            : d.offset === toOffset
              ? { ...d, items: [...d.items, moved] }
              : d,
        ),
      );
      void transferPlanItem(id, toOffset).then((r) => {
        if (!r.ok) {
          fireToast({ message: r.error, type: "error" });
          refresh();
        } else {
          const tab = payload.tabs.find((x) => x.offset === toOffset);
          fireToast({ message: `Moved to ${tab ? `${tab.word} · ${tab.date}` : "that day"}.` });
          // Off-window destination: the row is gone from every visible column,
          // which is exactly what the optimistic update already did.
          if (!days.some((d) => d.offset === toOffset)) refresh();
        }
      });
    },
    [findItem, days, router, payload.tabs],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Stable SSR-safe DndContext id — avoids the dnd-kit hydration mismatch on
  // `aria-describedby` (module-global counter drifts server↔client).
  const dndId = React.useId();

  /** "Start my day" — persist the started stamp, then flip to the active phase. */
  const plannedToday = days.find((d) => d.offset === 0)?.items.length ?? 0;
  const met = plannedToday >= minItems;
  const onStartDay = React.useCallback(() => {
    if (!met || starting) return;
    setStarting(true);
    void startMyDay()
      .then((r) => {
        if (r.ok) {
          setAdjusting(false);
          setPhase("active");
          // Starting the day IS clocking in — no second trip to Attendance.
          // Recognises a manual check-in rather than duplicating it, and a
          // refusal (geofence, office network) never un-starts the day.
          void autoPunch("in");
        }
        else fireToast({ message: r.error, type: "error" });
      })
      .finally(() => setStarting(false));
  }, [met, starting]);

  /** Persist one day's visual order (fire-and-forget, toast on failure). */
  const persistOrder = React.useCallback(
    (offset: number, items: PlanItem[]) => {
      const ids = nonGhost(items)
        .map((i) => i.id)
        .filter((id) => !id.startsWith("temp:"));
      if (ids.length === 0) return;
      startTransition(async () => {
        const res = await reorderPlan(ids, offset, target.employeeId);
        if (!res.ok) fireToast({ message: res.error });
      });
    },
    [target.employeeId],
  );

  /** Flip a dedupe-able source (weekly/task/unfinished) to "planned". */
  const markSource = React.useCallback((kind: SourceKind, id: string, added: boolean) => {
    setSrc((prev) => ({ ...prev, [kind]: prev[kind].map((s) => (s.id === id ? { ...s, added } : s)) }));
  }, []);

  /** Remove a source card entirely from its column (an unfinished item is MOVED
   *  onto a day, so it must leave "Unfinished", not just dim). */
  const removeSource = React.useCallback((kind: SourceKind, id: string) => {
    setSrc((prev) => ({ ...prev, [kind]: prev[kind].filter((s) => s.id !== id) }));
  }, []);

  /** Shared add path — used by BOTH drag-drop and the `+` buttons. */
  const commitAdd = React.useCallback(
    async (
      kind: SourceKind,
      sourceId: string,
      title: string,
      subtitle: string | null,
      toOffset: number,
      atIndex?: number,
    ) => {
      const tempId = `temp:${crypto.randomUUID()}`;
      const optimistic: PlanItem = {
        id: tempId,
        title,
        subtitle,
        origin: kind === "weekly" ? "goal_related" : "standalone",
        kind,
        done: false,
      };
      setDays((prev) =>
        prev.map((d) => {
          const base = nonGhost(d.items);
          if (d.offset !== toOffset) return { ...d, items: base };
          const idx = atIndex == null ? base.length : Math.min(atIndex, base.length);
          const next = [...base];
          next.splice(idx, 0, optimistic);
          return { ...d, items: next };
        }),
      );
      if (DEDUPE_KINDS.includes(kind)) markSource(kind, sourceId, true);

      const res =
        kind === "weekly"
          ? await addWeeklyGoalToPlan(sourceId, toOffset, target.employeeId)
          : kind === "task"
            ? await addTaskToPlan(sourceId, toOffset, target.employeeId)
            : kind === "unfinished"
              ? await addUnfinishedToPlan(sourceId, toOffset)
              : await addCascadeGoalToPlan(sourceId, toOffset, target.employeeId);

      if (!res.ok) {
        setDayItems(toOffset, (items) => items.filter((i) => i.id !== tempId));
        if (DEDUPE_KINDS.includes(kind)) markSource(kind, sourceId, false);
        fireToast({ message: res.error });
        return;
      }
      // GONE FROM THE RAIL, not dimmed (Sir).
      //
      // An unfinished item was MOVED onto the day, so it must leave
      // "Unfinished" for good — whether the server moved it (res.item) or
      // deleted a redundant duplicate (res.item == null).
      //
      // A WMS task leaves for a different reason: the server already drops it.
      // `listOpenTasksForChecklist` is called with `excludePlannedAnyDay`, so a
      // planned task is absent from the very next payload. Leaving the card
      // greyed with a PLANNED chip therefore showed a row that no longer
      // existed server-side, and it vanished on the next refresh anyway —
      // pulled work should just be gone.
      //
      // Weekly and cascade GOALS stay, deliberately: the server still lists
      // them (`added: plannedGoalIds.has(...)`), so removing them here would
      // only make them reappear on the next read.
      if (kind === "unfinished" || kind === "task") removeSource(kind, sourceId);
      if (!res.item) {
        // No-op (already on that day) — drop the optimistic row silently and
        // re-read, since the truth lives on a row we didn't create.
        setDayItems(toOffset, (items) => items.filter((i) => i.id !== tempId));
        refresh();
        return;
      }
      // Filed onto a day the kanban isn't showing (a drop on an out-of-window
      // day tab). There is no column to settle it into, so say where it went.
      const column = days.find((d) => d.offset === toOffset);
      if (!column) {
        const tab = payload.tabs.find((t) => t.offset === toOffset);
        fireToast({ message: `Added to ${tab ? `${tab.word} · ${tab.date}` : "that day"}.` });
        return;
      }
      const real = res.item;
      let settled: PlanItem[] = [];
      setDays((prev) =>
        prev.map((d) => {
          if (d.offset !== toOffset) return d;
          settled = d.items.map((i) => (i.id === tempId ? real : i));
          return { ...d, items: settled };
        }),
      );
      persistOrder(toOffset, settled);
    },
    [markSource, removeSource, persistOrder, setDayItems, target.employeeId, router, days, payload.tabs],
  );

  /** `+` on a source card → file it onto the FIRST column of the window (Today,
   *  unless the user has navigated the window forward). */
  const onAddSource = React.useCallback(
    (item: SourceItem) => void commitAdd(item.kind, item.id, item.title, item.subtitle, firstDay?.offset ?? 0),
    [commitAdd, firstDay?.offset],
  );

  /** The Today / Tomorrow / Day after chooser on a source card. Same optimistic
   *  add, rollback and rail-removal as a drag — `commitAdd` is the one path, so
   *  the button and the drag cannot drift apart. The offset is absolute (days
   *  from today), which is what the server files against. */
  const onAddSourceOn = React.useCallback(
    (item: SourceItem, offset: number) =>
      void commitAdd(item.kind, item.id, item.title, item.subtitle, offset),
    [commitAdd],
  );

  /**
   * COMPLETE — the only path that sets `done`. Explicit, labelled, and never
   * fired by a drag (rule 10). Uses the SAME `setItemProgress` the close-out
   * screen and My Day use, so ticking anywhere runs one reflect-to-source
   * pipeline (origin WMS task flips done, origin weekly goal hits 100%).
   */
  const onToggleDone = React.useCallback(
    (item: PlanItem) => {
      if (item.id.startsWith("temp:")) return; // not persisted yet
      const done = !item.done;
      setDays((prev) =>
        prev.map((d) => ({
          ...d,
          items: d.items.map((i) => (i.id === item.id ? { ...i, done, pending: false } : i)),
        })),
      );
      setBusyId(item.id);
      void setItemProgress(item.id, { done, pct: done ? 100 : 0 })
        .then((r) => {
          if (!r.ok) {
            setDays((prev) =>
              prev.map((d) => ({
                ...d,
                items: d.items.map((i) => (i.id === item.id ? { ...i, done: !done } : i)),
              })),
            );
            fireToast({ message: r.error, type: "error" });
          }
        })
        .finally(() => setBusyId(null));
    },
    [],
  );

  /** PENDING — not done, not moved: it stays on its day and joins Unfinished. */
  const onPending = React.useCallback((item: PlanItem) => {
    if (item.id.startsWith("temp:")) return;
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        items: d.items.map((i) => (i.id === item.id ? { ...i, pending: true, done: false } : i)),
      })),
    );
    setBusyId(item.id);
    void setPlanItemPending(item.id)
      .then((r) => {
        if (!r.ok) {
          setDays((prev) =>
            prev.map((d) => ({
              ...d,
              items: d.items.map((i) => (i.id === item.id ? { ...i, pending: false } : i)),
            })),
          );
          fireToast({ message: r.error, type: "error" });
        } else {
          fireToast({ message: "Kept as pending - it's in Unfinished." });
          refresh();
        }
      })
      .finally(() => setBusyId(null));
  }, [router]);

  /**
   * WHEN a commitment happens. Optimistic, and it re-labels the card in the same
   * breath so the person sees the time they just typed. A failure reverts.
   *
   * Writes ONLY the planner's own time — the linked WMS task's own calendar
   * block is left alone (see setPlanItemTime).
   */
  const onSetTime = React.useCallback(
    (item: PlanItem, time: { startMin: number | null; durationMin: number | null }) => {
      if (item.id.startsWith("temp:")) return; // not persisted yet
      const before = { startMin: item.startMin ?? null, durationMin: item.durationMin ?? null };
      const apply = (t: { startMin: number | null; durationMin: number | null }) =>
        setDays((prev) =>
          prev.map((d) => ({
            ...d,
            items: d.items.map((i) =>
              i.id === item.id
                ? { ...i, ...t, timeLabel: blockLabel(t.startMin, t.durationMin) }
                : i,
            ),
          })),
        );
      apply(time);
      void setPlanItemTime(item.id, time).then((r) => {
        if (!r.ok) {
          apply(before);
          fireToast({ message: r.error, type: "error" });
        }
      });
    },
    [],
  );

  /**
   * DUPLICATE a commitment onto a CHOSEN day. The copy is standalone — see
   * duplicatePlanItem for why the goal/task link is deliberately not cloned.
   *
   * `ymd` comes from the card's date picker. The optimistic insert only applies
   * when the destination is a day currently on screen: `days` holds the three
   * columns in the window, so a copy sent to next Tuesday has no list to push
   * into and is picked up by the refresh instead. Pushing it into the source
   * day's list "for now" would show the copy on the wrong day until the server
   * answered, which is worse than showing it a moment late.
   */
  const onDuplicate = React.useCallback(
    (item: PlanItem, ymd?: string) => {
      const found = findItem(item.id);
      if (!found) return;
      startTransition(async () => {
        const res = await duplicatePlanItem(item.id, ymd);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        const dest = ymd ? days.find((d) => d.ymd === ymd) : found.day;
        if (dest) setDayItems(dest.offset, (list) => [...list, res.item]);
        fireToast({
          message: dest ? "Duplicated." : "Duplicated onto that day.",
        });
        refresh();
      });
    },
    [findItem, setDayItems, days, refresh],
  );

  /** Abandon a task → Recycle Bin. Optimistically drop it from its source list. */
  const onAbandon = React.useCallback((item: SourceItem) => {
    if (!item.taskId) return;
    setSrc((prev) => ({ ...prev, [item.kind]: prev[item.kind].filter((s) => s.id !== item.id) }));
    startTransition(async () => {
      const res = await abandonTask(item.taskId!);
      if (!res.ok) fireToast({ message: res.error });
    });
  }, []);

  /**
   * The card's × — off the plan, and BACK TO WHATEVER OWNS IT. A WMS task
   * returns to Tasks, a goal to Goals → Pull Tasks, and only a typed commitment
   * goes to the Recycle Bin (see `abandonPlanItem`, which decides). The toast
   * names the destination, because "removed" alone leaves the one question that
   * matters — where did my task go? — unanswered.
   *
   * The refresh afterwards is what re-offers the freed task or goal in the pull
   * rail: both source lists exclude anything already filed on a planner day, so
   * dropping the row is exactly what puts the card back.
   */
  const onRemove = React.useCallback(
    (item: PlanItem) => {
      dropItemEverywhere(item.id);
      startTransition(async () => {
        const res = await abandonPlanItem(item.id);
        if (!res.ok) {
          fireToast({ message: res.error });
          refresh();
          return;
        }
        fireToast({
          message:
            res.destination === "tasks"
              ? "Off your day - the task is back in Tasks."
              : res.destination === "goals"
                ? "Off your day - the goal is back under Pull Work."
                : "Moved to the Recycle Bin.",
        });
        refresh();
      });
    },
    [dropItemEverywhere, router],
  );

  // Rename a commitment (fix a typo). Optimistic; reverts on failure. A still-
  // saving optimistic row (temp: id) can't be renamed server-side yet, so skip.
  const onRename = React.useCallback((id: string, title: string) => {
    if (id.startsWith("temp:")) return;
    let prevTitle = "";
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        items: d.items.map((i) => {
          if (i.id === id) prevTitle = i.title;
          return i.id === id ? { ...i, title } : i;
        }),
      })),
    );
    startTransition(async () => {
      const res = await renamePlanItem(id, title);
      if (!res.ok) {
        setDays((prev) =>
          prev.map((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, title: prevTitle } : i)) })),
        );
        fireToast({ message: res.error });
      }
    });
  }, []);

  /** DAILY COMMITMENT typed onto a specific day, optionally at a time (rule 8). */
  const onAddCommitment = React.useCallback(
    async (offset: number, title: string, time?: { startMin: number | null; durationMin: number | null }) => {
      const tempId = `temp:${crypto.randomUUID()}`;
      setDayItems(offset, (items) => [
        ...nonGhost(items),
        {
          id: tempId,
          title,
          subtitle: null,
          origin: "standalone",
          kind: "adhoc",
          done: false,
          startMin: time?.startMin ?? null,
          durationMin: time?.durationMin ?? null,
          timeLabel: blockLabel(time?.startMin ?? null, time?.durationMin ?? null),
        },
      ]);
      const res = await addAdhocToPlan(title, offset, target.employeeId, time);
      if (!res.ok) {
        setDayItems(offset, (items) => items.filter((i) => i.id !== tempId));
        fireToast({ message: res.error });
        return;
      }
      setDayItems(offset, (items) => items.map((i) => (i.id === tempId ? res.item : i)));
    },
    [setDayItems, target.employeeId],
  );

  /* ── drag lifecycle ──────────────────────────────────────────────────── */

  /**
   * Which planner day an over-id means — a kanban column, a card sitting on one,
   * or a tab in the day strip. Tabs can name a day that is NOT one of the three
   * columns, which is exactly why they're worth dropping onto.
   */
  const dayOffsetOfOver = React.useCallback(
    (overId: string): number | null => {
      const prefix = overId.startsWith(DAY_DROP)
        ? DAY_DROP
        : overId.startsWith(DAY_TAB_DROP)
          ? DAY_TAB_DROP
          : null;
      if (prefix) {
        const n = Number(overId.slice(prefix.length));
        return Number.isFinite(n) ? n : null;
      }
      const found = days.find((d) => d.items.some((i) => i.id === overId));
      return found ? found.offset : null;
    },
    [days],
  );

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current;
    if (data?.type === "source") {
      setActive({ type: "source", title: data.title, kind: data.kind });
    } else {
      const found = findItem(String(e.active.id));
      if (found) setActive({ type: "plan", item: found.item });
    }
  }

  /** Live placeholder while a SOURCE card hovers a day column. */
  function onDragOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (a.data.current?.type !== "source") return; // plan moves settle on end
    const offset = over ? dayOffsetOfOver(String(over.id)) : null;
    if (offset == null) {
      setDays((prev) => prev.map((d) => ({ ...d, items: nonGhost(d.items) })));
      return;
    }
    setDays((prev) =>
      prev.map((d) => {
        const base = nonGhost(d.items);
        if (d.offset !== offset) return { ...d, items: base };
        const overId = String(over!.id);
        // Over a column or a day TAB ⇒ append; over a specific card ⇒ insert there.
        const at =
          overId.startsWith(DAY_DROP) || overId.startsWith(DAY_TAB_DROP)
            ? base.length
            : Math.max(0, base.findIndex((x) => x.id === overId));
        const ghost: PlanItem = {
          id: GHOST_ID,
          ghost: true,
          title: a.data.current?.title ?? "New commitment",
          subtitle: null,
          origin: "standalone",
          kind: a.data.current?.kind ?? "adhoc",
          done: false,
        };
        const next = [...base];
        next.splice(at, 0, ghost);
        return { ...d, items: next };
      }),
    );
  }

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    setActive(null);
    const overId = over ? String(over.id) : "";
    const toOffset = overId ? dayOffsetOfOver(overId) : null;

    // A SOURCE card dropped on a day → file it onto that day.
    if (a.data.current?.type === "source") {
      const ghostAt = days
        .map((d) => ({ offset: d.offset, idx: d.items.findIndex((i) => i.id === GHOST_ID) }))
        .find((x) => x.idx >= 0);
      setDays((prev) => prev.map((d) => ({ ...d, items: nonGhost(d.items) })));
      if (toOffset != null) {
        void commitAdd(
          a.data.current.kind,
          a.data.current.sourceId,
          a.data.current.title,
          a.data.current.subtitle ?? null,
          toOffset,
          ghostAt?.offset === toOffset ? ghostAt.idx : undefined,
        );
      }
      return;
    }

    // A PLANNED card: another day → re-date it; same day → reorder.
    const found = findItem(String(a.id));
    if (!found || toOffset == null) return;
    if (toOffset !== found.day.offset) {
      onTransfer(String(a.id), toOffset);
      return;
    }
    if (overId !== String(a.id) && !overId.startsWith(DAY_DROP) && !overId.startsWith(DAY_TAB_DROP)) {
      const items = found.day.items;
      const oldIndex = items.findIndex((i) => i.id === a.id);
      const newIndex = items.findIndex((i) => i.id === overId);
      if (oldIndex >= 0 && newIndex >= 0) {
        const next = arrayMove(items, oldIndex, newIndex);
        setDayItems(found.day.offset, () => next);
        persistOrder(found.day.offset, next);
      }
    }
  }

  function onDragCancel() {
    setActive(null);
    setDays((prev) => prev.map((d) => ({ ...d, items: nonGhost(d.items) })));
  }

  /* ── render ──────────────────────────────────────────────────────────── */

  // Past "plan" the DAY owns the page: active shows "your day is planned",
  // close-out shows the review list. The board is for arranging a day, not for
  // sitting behind the screen that says you've committed to it.
  const started = phase !== "plan";
  // The day strip stays up on the active screen (you can still look ahead), but
  // steps aside during close-out, which is strictly about today.
  const reviewing = phase === "closeout" || phase === "closed";
  const header = (
    <PlannerBar
      target={target}
      hierarchy={hierarchy}
      windowStart={windowStart}
      onPerson={(empId) => goToWindow(windowStart, empId)}
      phase={phase}
      // The review is strictly about TODAY, so the day window controls step
      // aside while it's open — sliding the view underneath a review would
      // silently change which day's list you were ticking off.
      reviewing={reviewing}
      isManager={payload.isManager}
      starting={starting}
      met={met}
      minItems={minItems}
      onStart={onStartDay}
      query={query}
      onQuery={setQuery}
      onAddCommitment={focusAddCommitment}
      onCloseout={() => setPhase("closeout")}
      dashboardHref={dashboardHref}
    />
  );

  // The day strip sits INSIDE the DndContext on purpose: every tab is a drop
  // target, so a card can be dragged straight onto a day the kanban isn't
  // currently showing. It steps aside during the review, which is today-only.
  const dayStrip = (
    <DaySwitcher
      tabs={payload.tabs}
      windowStart={windowStart}
      windowOffsets={days.map((d) => d.offset)}
      maxWindowStart={maxWindowStart}
      minWindowStart={minWindowStart}
      windowDays={windowDays}
      // The review is TODAY-only, so a "how many columns" control has nothing
      // to act on there (Sir) — it would change a board that isn't on screen.
      showSpan={!reviewing}
      sort={sort}
      onSort={setSort}
      railOpen={railOpen}
      onToggleRail={() => setRailOpen((v) => !v)}
      onPick={(off) => goToWindow(Math.min(off, maxWindowStart))}
      // Switching span re-clamps the start, so going 3 → 7 near the far end
      // can't leave the board beginning past the last planner day.
      // Switching span re-clamps the start, so widening near the far end can
      // not leave the board beginning past the last planner day.
      onSpan={(d) => goToWindow(Math.min(windowStart, Math.max(0, 28 - d)), target.employeeId, d)}
    />
  );

  // A started day shows its own screen — UNLESS you asked to adjust the plan,
  // in which case the board comes back with the day still running.
  const onReviewScreen = started && !(phase === "active" && adjusting);

  const reviewScreen =
    phase === "plan" ? null : (
    <DayReview
          phase={phase}
          items={days.find((d) => d.offset === 0)?.items ?? []}
          // The day being reviewed — the duplicate picker opens on it, the same
          // way the planner card's picker opens on the day its card sits in.
          dayYmd={days.find((d) => d.offset === 0)?.ymd ?? ""}
          onBackToPlan={() => {
            setAdjusting(false);
            setPhase("plan");
          }}
          onToCloseout={() => setPhase("closeout")}
          onAdjust={() => setAdjusting(true)}
          onClosed={() => setPhase("closed")}
          onReopened={() => setPhase("plan")}
          onToggleDone={onToggleDone}
          onPending={onPending}
          onTransfer={onTransfer}
          onDuplicate={onDuplicate}
          // The review row's × means "not today", so it parks the row in
          // UNFINISHED rather than sending it to the Recycle Bin. Same handler
          // the Pending button uses; the board's own × (onRemove) is unchanged.
          onRemove={onPending}
      onAddCommitment={(title, time) => void onAddCommitment(0, title, time)}
      busyId={busyId}
    />
    );

  /**
   * ONE DndContext for BOTH screens.
   *
   * There used to be two — a 1-handler one for the review and a 4-handler one
   * for the board. Sitting at the same position in the tree, React reconciles
   * them as the SAME instance, and dnd-kit builds a layout-effect dependency
   * array out of its handler props. Swapping one context for the other changed
   * that array's LENGTH between renders, which React refuses:
   * "The final argument passed to useLayoutEffect changed size between renders."
   *
   * The review never needed its own handler: `onDragEnd` already re-dates a
   * planned card dropped on a day tab, which is exactly the review's gesture.
   */
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {header}
      {dayStrip}
      {onReviewScreen ? (
        reviewScreen
      ) : (
        // The kanban is the page. The pull panels sit in a narrow right rail so
        // the three days get the width they need (rule 16).
          <div
            className={
              "grid gap-4 max-lg:grid-cols-1 " +
            (railOpen ? "grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1")
          }
        >
          {/* One column per chosen day. Up to 3 they share the width evenly; at
              4 and 7 each column keeps a 210px floor and the row SCROLLS sideways
              (Sir), so a wide view stays readable instead of shrinking every card
              to a sliver. */}
          <div
            className="grid min-w-0 gap-3 max-md:grid-cols-1"
            style={{
              gridTemplateColumns:
                shownDays.length > 3
                  ? `repeat(${shownDays.length}, minmax(210px, 1fr))`
                  : `repeat(${Math.max(1, shownDays.length)}, minmax(0, 1fr))`,
              overflowX: shownDays.length > 3 ? "auto" : undefined,
            }}
          >
            {shownDays.map((d) => (
              <DayColumn
                key={d.ymd}
                day={d}
                isToday={d.ymd === todayYmd}
                busyId={busyId}
                onToggleDone={onToggleDone}
                onPending={onPending}
                onDuplicate={onDuplicate}
                onRemove={onRemove}
                onRename={onRename}
                onTransfer={onTransfer}
                onSetTime={onSetTime}
                searching={searching}
                onAddCommitment={onAddCommitment}
              />
            ))}
          </div>

          {railOpen ? (
            <SourceRail
              sources={src}
              today={todayYmd}
              addDayLabel={firstDay?.offset === 0 ? "Today" : (firstDay?.date ?? "Today")}
              onAdd={onAddSource}
              onAddOn={onAddSourceOn}
              onAbandon={onAbandon}
              onCollapse={() => setRailOpen(false)}
              matches={matches}
              searching={searching}
            />
          ) : null}
        </div>
      )}

      {/* THE FLOATING DAY ACTIONS (Daily Goals page only — see `quickDock`).
          Both controls delegate to the handlers the header already uses, so
          Start My Day keeps its attendance automation and a commitment typed
          down here is the same row the column composer files. It follows the
          board's FIRST VISIBLE day, which is the day those buttons are about. */}
      {quickDock && firstDay && !onReviewScreen ? (
        <PlanQuickDock
          dayLabel={`${firstDay.word} ${firstDay.date}`}
          onAdd={(title) => void onAddCommitment(firstDay.offset, title)}
          phase={phase}
          isToday={firstDay.offset === 0}
          met={met}
          minItems={minItems}
          starting={starting}
          onStart={onStartDay}
          onCloseout={() => setPhase("closeout")}
        />
      ) : null}

      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2,0,0,1)" }}>
        {active ? (
          <div className="flex max-w-[280px] items-center gap-2 rounded-chip border border-hairline-strong bg-surface-card px-3 py-2.5 shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
            <SourceTag kind={active.type === "source" ? active.kind : active.item.kind} />
            <span className="truncate text-[13px] font-medium text-ink-strong">
              {active.type === "source" ? active.title : active.item.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ----------------------------------------------------------------------- */
/* The one control bar: who · which days · the day's lifecycle             */
/* ----------------------------------------------------------------------- */

function PlannerBar({
  target,
  hierarchy,
  windowStart,
  onPerson,
  phase,
  reviewing,
  isManager,
  starting,
  met,
  minItems,
  onStart,
  query,
  onQuery,
  onAddCommitment,
  onCloseout,
  dashboardHref,
}: {
  target: PlanTargetProp;
  hierarchy: PlanDayPayload["hierarchy"];
  /** Which day the kanban starts on — the lifecycle button is today-only. */
  windowStart: number;
  onPerson: (empId: string) => void;
  phase: PlanDayPayload["initialPhase"];
  /** True while the end-of-day review owns the page. */
  reviewing: boolean;
  /** Managers get the Recycle Bin link (it used to sit on the page header). */
  isManager: boolean;
  starting: boolean;
  met: boolean;
  minItems: number;
  onStart: () => void;
  /** The header search box. */
  query: string;
  onQuery: (q: string) => void;
  /** Put the cursor in the first visible day's composer. */
  onAddCommitment: () => void;
  /** Header route into the close-out, once the day is running. */
  onCloseout: () => void;
  /** Daily Goals → Dashboard. Absent on every surface but Daily Goals. */
  dashboardHref?: Route;
}) {
  const reportsTo = [hierarchy.manager, hierarchy.managerManager].filter(Boolean) as string[];
  return (
    <div className="mb-2 flex flex-nowrap items-center gap-x-3">
      {/* NO TITLE HERE. The global top bar already names this page — it said
          "Daily Goals" while this row said "Daily Goals & Commitments" directly
          underneath, which is the same page named twice. The bar's name is the
          one that is on every screen in every module, so it is the one that
          stays; this row is now controls only, and they start at the left edge
          instead of after a heading. */}
      {/* WHOSE day. The caption is gone — the selected name says it, and the
          "Reports to …" line beside it gives the org context (rule 9). */}
      {target.roster.length > 1 ? (
        <select
          value={target.employeeId}
          onChange={(e) => onPerson(e.target.value)}
          aria-label="Whose day to plan"
          className="max-w-[190px] shrink-0 rounded-xl border border-hairline bg-surface-card px-2 py-1.5 text-[12.5px] font-bold text-ink-strong outline-none hover:border-hairline-strong focus:border-altus-red"
        >
          {target.roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : null}

      {reportsTo.length > 0 ? (
        // The first thing to give way when the header gets tight — so it needs
        // a way to be read in full once it has given way (Sir). HoverTip is the
        // app's own tooltip for truncated labels: it wraps, and it portals out
        // so the header's overflow can't clip it.
        <HoverTip text={`Reports to ${reportsTo.join(" → ")}`}>
          <span className="hidden shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-ink-muted xl:inline">
            Reports to{" "}
            <span className="text-ink-soft">
              {reportsTo[0]}
              {reportsTo.length > 1 ? " → …" : ""}
            </span>
          </span>
        </HoverTip>
      ) : null}

      {/* SEARCH — filters the columns AND the pull rail as you type. Sits after
          the reporting line and before the day's own buttons (Sir). */}
      <CollapsibleSearch scope="tasks" className="relative -top-[3px] size-9">
      <label className="relative -top-[3px] inline-flex min-w-0 shrink items-center">
        <Search size={14} className="pointer-events-none absolute left-2.5 shrink-0 text-ink-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          className="h-9 w-[560px] min-w-0 max-w-full rounded-xl border border-hairline bg-surface-card pl-9 pr-8 text-[13px] text-ink-strong outline-none placeholder:text-ink-muted/70 hover:border-hairline-strong focus:border-altus-red max-xl:w-[380px] max-lg:w-[250px] max-md:w-[160px]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 inline-flex size-6 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={13} />
          </button>
        ) : null}
      </label>
      </CollapsibleSearch>

      {/* The header's right-hand cluster — ONE ROW: Recycle Bin · Add ·
          Start/Review My Day · Dashboard.

          It was a column, so Dashboard sat on a second line under the others.
          That was to avoid lengthening a row that gives way first when the
          header gets tight — but it cost a whole extra line of header height on
          every load to place one chip, and a lone button hanging under a row of
          three reads as though it belongs to something else. Back on one line;
          `flex-wrap` on the row means a narrow window drops Dashboard to a
          second line by itself, which is the same outcome the column forced
          permanently, only now it happens when it is actually needed. */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">

      {/* The day's lifecycle — one button, whichever one applies now. Hidden
          while the window is parked on future days (starting and reviewing are
          both about TODAY, and a permanently-disabled button just reads broken)
          and while the review already owns the page. */}
      {isManager ? (
        <a
          href="/goals/recycle-bin"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline bg-surface-card px-2 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-hairline-strong"
        >
          <Trash2 size={12} /> Recycle Bin
        </a>
      ) : null}

      {/* ADD COMMITMENT — says what it does (Sir). A lone "C" only meant
          anything to someone who already knew the keyboard shortcut, which is
          the one person who did not need the button. It opens no dialog: it
          drops the cursor straight into the day column's own composer, which is
          where the commitment actually lands. Pressing C still does the same,
          and the key is named on the button so it can be discovered. */}
      {reviewing ? null : (
        <button
          type="button"
          onClick={onAddCommitment}
          title="Add a commitment (C)"
          aria-label="Add a commitment"
          aria-keyshortcuts="C"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-chip border px-2.5 text-[11.5px] font-bold transition-colors focus-visible:outline-2"
          style={{
            borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 32%, transparent)`,
            color: GOALS_ACCENT_DEEP,
            background: `color-mix(in srgb, ${GOALS_ACCENT} 6%, transparent)`,
            outlineColor: GOALS_ACCENT,
          }}
        >
          <Plus size={13} /> Add
        </button>
      )}

      {reviewing || windowStart !== 0 ? null : phase === "plan" ? (
        <button
          type="button"
          onClick={onStart}
          disabled={!met || starting}
          title={met ? "Start my day" : `Plan at least ${minItems} items on Today to start`}
          className="brand-btn wg-btn inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip px-3 text-[11.5px] font-bold text-white shadow-[0_8px_22px_rgba(124,45,18,0.24)] disabled:opacity-40 disabled:shadow-none focus-visible:outline-2"
          style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
        >
          {starting ? <Loader2 size={13} className="animate-spin" /> : <Sunrise size={13} />} Start My Day
        </button>
      ) : (
        /* REVIEW MY DAY — the words are back (Sir). It is the day's closing
           action and the one thing on this header you must not have to guess at,
           so it says what it does rather than relying on the icon alone. */
        <button
          type="button"
          onClick={onCloseout}
          className="brand-btn wg-btn inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip px-3 text-[11.5px] font-bold text-white shadow-[0_8px_22px_rgba(124,45,18,0.24)] focus-visible:outline-2"
          style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
        >
          <ClipboardCheck size={13} /> Review My Day
        </button>
      )}

      {/* DAILY GOALS → DASHBOARD. Rendered only when a caller supplied the href
          — which is the Daily Goals page and nothing else (see the prop's note
          on Props). Deliberately the QUIET treatment: the outlined chip the
          Recycle Bin link already uses, not a second filled brand button, so
          the day's own closing action stays the one thing that draws the eye.

          h-8 and text-[11.5px] to match Add and Start My Day beside it. On its
          own line the old py-1.5/text-[12px] passed unnoticed; in the row it
          would have stood a couple of pixels taller than everything else. */}
      {dashboardHref ? (
        <Link
          href={dashboardHref}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border px-3 text-[11.5px] font-bold transition-colors focus-visible:outline-2"
          style={{
            borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 32%, transparent)`,
            color: GOALS_ACCENT_DEEP,
            background: `color-mix(in srgb, ${GOALS_ACCENT} 6%, transparent)`,
            outlineColor: GOALS_ACCENT,
          }}
        >
          <LayoutDashboard size={13} /> Dashboard
        </Link>
      ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* The day strip — every planner day, and a drop target for each            */
/* ----------------------------------------------------------------------- */

/**
 * One day tab — also a DROP TARGET, exactly as it has always been. Dragging a
 * card onto "Fri 21 AUG" files or re-dates it there, which matters most for the
 * days BEYOND the three kanban columns: the strip is the only way to reach them
 * without moving the window first.
 *
 * `lead` is the day the kanban starts on (the solid tab — the original "on"
 * look); `inWindow` marks the other two columns currently on screen.
 */
function DayTab({
  t,
  lead,
  inWindow,
  onPick,
}: {
  t: PlanDayTab;
  lead: boolean;
  inWindow: boolean;
  onPick: (off: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_TAB_DROP}${t.offset}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={lead}
      onClick={() => onPick(t.offset)}
      className={`flex min-w-[62px] shrink-0 flex-col items-center rounded-lg px-2.5 py-1 leading-tight transition-colors ${
        lead ? "text-white" : "text-ink-soft hover:bg-surface-soft hover:text-ink-strong"
      }`}
      style={
        isOver && !lead
          ? {
              background: `color-mix(in srgb, ${GOALS_ACCENT} 14%, transparent)`,
              outline: `2px dashed ${GOALS_ACCENT}`,
              outlineOffset: -2,
            }
          : lead
            ? { background: GOALS_GRADIENT }
            : inWindow
              ? {
                  background: `color-mix(in srgb, ${GOALS_ACCENT} 7%, transparent)`,
                  color: GOALS_ACCENT_DEEP,
                }
              : undefined
      }
    >
      <span className="text-[12.5px] font-bold">{t.word}</span>
      <span className={`text-[10.5px] font-semibold tabular-nums ${lead ? "opacity-85" : "text-ink-subtle"}`}>
        {t.date}
      </span>
    </button>
  );
}

/**
 * The strip of planner days. Picking one starts the 3-day kanban there, so
 * stepping a single day forward or back is just the neighbouring tab, and
 * "Today" is always the first tab (rule 14's Today shortcut).
 *
 * The last two tabs can't LEAD a 3-day window without running past the horizon,
 * so picking them clamps to the final window — they still light up as in-view,
 * and they remain drop targets in their own right.
 */
function DaySwitcher({
  tabs,
  windowStart,
  windowOffsets,
  maxWindowStart,
  minWindowStart,
  windowDays,
  showSpan,
  sort,
  onSort,
  railOpen,
  onPick,
  onSpan,
  onToggleRail,
}: {
  tabs: PlanDayTab[];
  windowStart: number;
  windowOffsets: number[];
  maxWindowStart: number;
  /** Negative — the strip pages four weeks back as well as forward. */
  minWindowStart: number;
  windowDays: number;
  /** Hidden during the review, which shows one day and no columns to span. */
  showSpan: boolean;
  /** How each day column is ordered — see lib/goals/plan-sort.ts. */
  sort: PlanSort;
  onSort: (s: PlanSort) => void;
  /** The pull rail's state — "Pull Work" only shows while it is folded away. */
  railOpen: boolean;
  onPick: (off: number) => void;
  onSpan: (days: number) => void;
  onToggleRail: () => void;
}) {
  /* ONE DAY PER CLICK, not one week.

     These arrows used to page by `stripDays` -- a whole week -- which made them
     the one control on the board that could not do the ordinary thing: move to
     tomorrow, or back to yesterday. Getting to Wednesday meant finding and
     clicking its tab, and the arrows only ever jumped clean over the week the
     tabs were showing.

     Nothing is lost by the change. The tabs are still one click to ANY day in
     the strip, which is the fast way across a week, and "Today" still snaps
     home from wherever you have wandered to -- so the week-sized jump the
     arrows used to make is the one motion the strip already did better. */
  const canPrev = windowStart > minWindowStart;
  const canNext = windowStart < maxWindowStart;
  const page = (delta: number) =>
    onPick(Math.max(minWindowStart, Math.min(maxWindowStart, windowStart + delta)));

  return (
    <div className="mb-2.5 flex items-stretch gap-1.5">
      <StripNavButton
        label="Previous day"
        disabled={!canPrev}
        onClick={() => page(-1)}
        icon={<ChevronLeft size={15} />}
      />

      {/* w-fit, NOT flex-1 — the strip used to stretch the full width and left
          a dead gap after the last tab, pushing › to the far edge (Sir). */}
      <div
        className="flex w-fit min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-hairline bg-surface-card p-0.5"
        role="tablist"
        aria-label="Choose which days to plan"
      >
        {tabs.map((t) => (
          <DayTab
            key={t.offset}
            t={t}
            lead={t.offset === windowStart}
            inWindow={windowOffsets.includes(t.offset)}
            onPick={onPick}
          />
        ))}
      </div>

      <StripNavButton
        label="Next day"
        disabled={!canNext}
        onClick={() => page(1)}
        icon={<ChevronRight size={15} />}
      />

      {/* OUTSIDE the strip, set apart from the arrow (Sir) — they control how
          many columns the board draws and what it points at, not which day the
          strip is on, so they should not look like part of the tab group.

          One flex-1 group: it fills whatever the strip leaves and runs to the
          end of the page, and `items-stretch` on the row above gives all three
          the strip's own height. Nothing here is a fixed size — a longer strip
          simply takes more of the row and these take less. */}
      <div className="ml-4 flex min-w-0 flex-1 items-stretch gap-1.5">
      {showSpan ? (
        <select
          value={windowDays}
          onChange={(e) => onSpan(Number(e.target.value))}
          aria-label="How many days to show"
          className="min-w-0 flex-1 rounded-xl border border-hairline bg-surface-card px-3 text-center text-[15px] font-bold text-ink-strong outline-none hover:border-hairline-strong focus:border-altus-red"
        >
          <option value={1}>1 day</option>
          <option value={2}>2 days</option>
          <option value={3}>3 days</option>
          <option value={4}>4 days</option>
          <option value={7}>7 days</option>
        </select>
      ) : null}

      {/* SORT — beside the day controls, because it is the same kind of thing:
          neither changes the plan, both change what of it you are looking at.
          It is a VIEW over each column (lib/goals/plan-sort.ts) — drag-to-reorder
          still writes the real order underneath, and is what breaks ties here. */}
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as PlanSort)}
        aria-label="Order the day's work"
        className="min-w-0 flex-1 rounded-xl border border-hairline bg-surface-card px-3 text-center text-[15px] font-bold text-ink-strong outline-none hover:border-hairline-strong focus:border-altus-red"
      >
        <option value="oldest">{PLAN_SORT_LABELS.oldest}</option>
        <option value="newest">{PLAN_SORT_LABELS.newest}</option>
      </select>

      <button
        type="button"
        onClick={() => onPick(0)}
        disabled={windowStart === 0}
        title="Back to today"
        className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[15px] font-bold transition-colors disabled:opacity-40"
        style={{
          borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 30%, transparent)`,
          color: GOALS_ACCENT_DEEP,
          background: `color-mix(in srgb, ${GOALS_ACCENT} 6%, transparent)`,
        }}
      >
        <CalendarDays size={16} /> Today
      </button>

      {/* PULL WORK — beside Today (Sir). It used to be a vertical spine pinned
          to the far right edge, which read as page furniture rather than a
          control. It is a TOGGLE: one click opens the rail, the next closes it,
          so the same button you reached for is the one that puts it away.
          Pressed state is shown, not just implied — the button stays lit while
          the rail is open so you can see which way the switch is thrown. */}
      <button
        type="button"
        onClick={onToggleRail}
        aria-expanded={railOpen}
        title={railOpen ? "Hide the work panel" : "Show WMS To-Do, Goals and Unfinished"}
        className={
          "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[15px] font-bold transition-colors " +
          (railOpen
            ? "border-hairline-strong bg-surface-soft text-ink-strong"
            : "border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong")
        }
      >
        <PanelRightOpen size={16} /> Pull Work
      </button>
      </div>
    </div>
  );
}

/** A quiet square arrow for paging the strip. */
function StripNavButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:opacity-30 disabled:hover:border-hairline"
    >
      {icon}
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/* Right rail — the work you can pull in, one panel at a time              */
/* ----------------------------------------------------------------------- */

type RailTab = "task" | "goal" | "unfinished";

/**
 * The three sources, as tabs rather than three permanently-open columns: you
 * pull from ONE of them at a time, and the space the other two were holding
 * goes back to the kanban (rule 16).
 */
/**
 * The Goals column's own filter (Sir): the four cascade levels the Goals rail
 * in the sidebar lists, so "show me the monthly goals" is one click rather than
 * scrolling a merged pile of all four.
 *
 * Ordered widest-horizon first — Yearly → Quarterly → Monthly → Weekly — which
 * is the order the sidebar uses and the direction the cascade actually flows.
 */
const GOAL_LEVELS = [
  { key: "yearly", label: "Yearly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "monthly", label: "Monthly" },
  { key: "weekly", label: "Weekly" },
] as const;

type GoalLevel = (typeof GOAL_LEVELS)[number]["key"];

function SourceRail({
  sources,
  today,
  addDayLabel,
  onAdd,
  onAddOn,
  onAbandon,
  onCollapse,
  matches,
  searching,
}: {
  sources: PlanSources;
  today: string;
  addDayLabel: string;
  onAdd: (item: SourceItem) => void;
  /** Explicit Today / Tomorrow / Day after, passed straight through to the
   *  cards. Offsets are days from today, not from the visible window. */
  onAddOn: (item: SourceItem, offset: number) => void;
  onAbandon: (item: SourceItem) => void;
  /** Fold the whole rail away. */
  onCollapse: () => void;
  /** The header search — the rail filters on the same query the board does. */
  matches: (...text: (string | null | undefined)[]) => boolean;
  searching: boolean;
}) {
  const [tab, setTab] = React.useState<RailTab>("task");
  const [filter, setFilter] = React.useState<WmsFilter>(DEFAULT_WMS_FILTER);
  // Weekly by default — the nearest horizon, and the one a day is actually
  // planned against.
  const [goalLevel, setGoalLevel] = React.useState<GoalLevel>("weekly");

  // Widest horizon first, matching the level buttons below. Still needed for
  // the tab's own count, which is every goal across the four levels.
  const goalItems = React.useMemo(
    () => [...sources.yearly, ...sources.quarterly, ...sources.monthly, ...sources.weekly],
    [sources],
  );
  const shownGoals = sources[goalLevel];
  /** Per-level counts, so a level with nothing in it says so before you click. */
  const goalCount = (key: GoalLevel) => sources[key].filter((i) => !i.added).length;
  const wmsItems = React.useMemo(
    () => sortByAttention(applyWmsFilter(sources.task, filter, today), today),
    [sources.task, filter, today],
  );
  const filtering = isFilterActive(filter);

  const tabs: { key: RailTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "task", label: "WMS To-Do", icon: <ListTodo size={13} />, count: sources.task.length },
    { key: "goal", label: "Goals", icon: <Layers size={13} />, count: goalItems.filter((i) => !i.added).length },
    {
      key: "unfinished",
      label: "Unfinished",
      icon: <History size={13} />,
      count: sources.unfinished.length,
    },
  ];

  const base = tab === "task" ? wmsItems : tab === "goal" ? shownGoals : sources.unfinished;
  // A rail card matches on its title OR its full description — the card only
  // shows three lines, so the words you remember may be further down.
  const shown = searching ? base.filter((i) => matches(i.title, i.description)) : base;
  const empty = searching
    ? "No tasks found"
    : tab === "task"
      ? filtering
        ? "No tasks match these filters."
        : "Nothing open in WMS."
      : tab === "goal"
        ? `No ${goalLevel} goals to pull in.`
        : "Nothing left unfinished.";

  return (
    <aside className="flex min-w-0 flex-col rounded-2xl border border-hairline bg-surface-card p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-lg:mt-1">
      <div className="mb-2 flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-surface-soft/70 p-1">
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={on}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11.5px] font-bold transition-colors"
              style={on ? { background: GOALS_GRADIENT, color: "#fff" } : { color: "var(--color-ink-soft)" }}
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
              <span className={"tabular-nums " + (on ? "opacity-85" : "text-ink-muted")}>{t.count}</span>
            </button>
          );
        })}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-expanded
          title="Hide this panel"
          aria-label="Hide the pull panel"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-hairline text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      {/* THE CASCADE LEVELS, and only on the Goals column (Sir) — click Monthly
          and the column is the monthly goals, nothing else. "All" keeps the
          merged view that used to be the only one. Wraps to two rows rather
          than shrinking: a 340px rail cannot hold five chips across. */}
      {tab === "goal" ? (
        <div className="mb-2 flex flex-wrap gap-1 rounded-xl bg-surface-soft/60 p-1.5">
          {GOAL_LEVELS.map((lv) => {
            const on = lv.key === goalLevel;
            return (
              <button
                key={lv.key}
                type="button"
                onClick={() => setGoalLevel(lv.key)}
                aria-pressed={on}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors"
                style={
                  on
                    ? {
                        borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 40%, transparent)`,
                        background: `color-mix(in srgb, ${GOALS_ACCENT} 10%, transparent)`,
                        color: GOALS_ACCENT_DEEP,
                      }
                    : { borderColor: "transparent", color: "var(--color-ink-soft)" }
                }
              >
                {lv.label}
                <span className={"tabular-nums " + (on ? "opacity-75" : "text-ink-muted")}>
                  {goalCount(lv.key)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* TWO FILTERS, and only on the WMS column: OVERDUE | PRIORITY (rule 2). */}
      {tab === "task" ? (
        <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-xl bg-surface-soft/60 p-2">
          <label className="min-w-0">
            <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Overdue
            </span>
            <select
              value={filter.overdue}
              onChange={(e) => setFilter((f) => ({ ...f, overdue: e.target.value as OverdueFilter }))}
              className={SELECT_CLASS}
              style={{ outlineColor: GOALS_ACCENT }}
            >
              {OVERDUE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {OVERDUE_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Priority
            </span>
            <select
              value={filter.priority}
              onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value as PriorityFilter }))}
              className={SELECT_CLASS}
              style={{ outlineColor: GOALS_ACCENT }}
            >
              <option value="all">All</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {filtering ? (
            <button
              type="button"
              onClick={() => setFilter(DEFAULT_WMS_FILTER)}
              className="col-span-2 text-left text-[11px] font-bold focus-visible:outline-2"
              style={{ color: GOALS_ACCENT_DEEP, outlineColor: GOALS_ACCENT }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="slim-scroll flex max-h-[calc(100vh-260px)] min-h-[180px] flex-col gap-1.5 overflow-y-auto pr-0.5 max-lg:max-h-[420px]">
        {shown.length === 0 ? (
          <p className="rounded-xl border border-hairline-strong px-3 py-6 text-center text-[12px] text-ink-muted/75">
            {empty}
          </p>
        ) : (
          shown.map((item) => (
            <SourceCard
              key={`${item.kind}:${item.id}`}
              item={item}
              today={today}
              onAdd={onAdd}
              onAddOn={onAddOn}
              onAbandon={item.taskId ? onAbandon : undefined}
              addDayLabel={addDayLabel}
            />
          ))
        )}
      </div>
    </aside>
  );
}

const SELECT_CLASS =
  "h-7 w-full min-w-0 rounded-lg border border-hairline bg-surface-card px-1 text-[11px] font-semibold text-ink-soft focus-visible:outline-2";
