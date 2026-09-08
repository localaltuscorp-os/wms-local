"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, Search, X, Target, Trash2, List, Columns3, LayoutDashboard, Plus, Download, ArrowUpDown, ChevronDown, Check, Maximize2, Minimize2, GripVertical } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ViewingSelect } from "@/components/goals/shared/viewing-select";
import { QuarterWindowNav } from "./quarter-window-nav";
import { MonthWindowNav, monthWindowQuarters } from "./month-window-nav";
import { fireToast } from "@/lib/toast";

/** Progress-band quick filter shown next to the level heading. */
type ProgressFilter = "all" | "done" | "p75" | "p50" | "p25" | "below25" | "unstarted";
import { goalPolicy } from "@/lib/goals/policy";
import {
  quartersOfFy,
  fyStartYearOf,
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  quarterKey,
  quarterWindow,
  quarterKeyOfMonthKey,
  monthKey,
  monthsOfQuarterKey,
  shiftQuarterKey,
  type GoalPeriod,
} from "@/lib/goals/types";
import {
  type GoalDTO,
  effectiveGoalPct,
  periodKeyLabel,
  fyLabel,
  parentPeriodKeyOf,
  categoryStyle,
  childLevelOf,
  goalCode,
} from "@/components/goals/cascade/util";
import { useOptimisticGoals } from "@/components/goals/canvas/optimistic";
import {
  moveGoalToPeriod,
  moveGoalToLevel,
  copyGoalToPeriod,
  archiveGoal,
  reorderGoals,
  moveWeeklyToWeek,
} from "@/app/(app)/goals/cascade/actions";
import { GoalBoardCard, ProgressRing, type SharedCardProps } from "./goal-board-card";
import { GoalTableView, QUARTER_TYPE_OPTIONS, ALL_VISIBLE_COLS, REORDERABLE_COLUMNS, reconcileColOrder } from "./goal-table-view";
import { GOAL_TYPE_LABELS, type GoalType } from "@/db/enums";
import { LEVEL_TABLE_ACTIONS } from "./level-table-actions";
import { PersonalStartPrompt } from "./personal-start-prompt";
import { BoardQuickAdd, type BoardQuickAddHandle } from "./board-quick-add";
import { GoalCaptureBox } from "@/components/goals/capture/goal-capture-box";
import { GoalsBulkUpload } from "./goals-bulk-upload";
import { HierarchyKanban } from "./hierarchy-kanban";
import { GoalsDashboard } from "./goals-dashboard";
import { DEFAULT_DASHBOARD_FILTERS, type DashboardFilters } from "./dashboard-model";
import type { GoalsLevelBoardProps } from "./types";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const BUCKET_DROP_PREFIX = "bucket:";

/** localStorage key for the List ⇄ Kanban preference (shared by the level pages). */
const VIEW_STORE_KEY = "goals-board-view";

/** localStorage key for the table's column drag-order (shared by every board
 *  that renders GoalTableView + ColumnsPicker — level boards + Weekly).
 *  Bumped to "-v2" once (Sr No/Area/Goal joined the reorderable set): a "-v1"
 *  save predates them and reconcileColOrder's position-aware merge only
 *  fires on THIS key going forward — a fresh key sidesteps needing it for
 *  that one-time gap too. */
const COL_ORDER_STORE_KEY = "goals-board-col-order-v4";

/** Loads/persists the table's column drag-order. A stored order missing a
 *  since-added column (or naming one that no longer exists) is reconciled
 *  against REORDERABLE_COLUMNS' declared order (reconcileColOrder — inserted
 *  at its declared position, not appended past everything else) on load, so
 *  a stale save never hides, loses, or misplaces a column. SSR renders the
 *  declared default; the stored order (if any) applies after mount, same
 *  pattern as the List/Kanban view preference. */
export function useColOrder(): [string[], (next: string[]) => void] {
  const [order, setOrder] = React.useState<string[]>(() => reconcileColOrder(undefined));
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COL_ORDER_STORE_KEY);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(stored) || !stored.every((k) => typeof k === "string")) return;
      setOrder(reconcileColOrder(stored));
    } catch {
      /* storage unavailable — stay on the declared default */
    }
  }, []);
  const persist = React.useCallback((next: string[]) => {
    setOrder(next);
    try {
      window.localStorage.setItem(COL_ORDER_STORE_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, []);
  return [order, persist];
}

/** Stable empty-children identity — keeps React.memo effective for the
 *  (majority of) cards that have no children. */
const EMPTY_CHILDREN: GoalDTO[] = [];

/** Stable empty period-key list — a fresh `[]` in a memo dep would rebuild the
 *  quarter buckets on every render. */
const EMPTY_KEYS: string[] = [];

/** Sort modes for the rendered list. Sr. No. keeps the drag-reorder line alive;
 *  every other key is a read-only projection (drag is paused while it's on). */
export type SortKey = "position" | "score-desc" | "score-asc" | "risk" | "az";
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "position", label: "Sr. No." },
  { value: "score-desc", label: "Score high → low" },
  { value: "score-asc", label: "Score low → high" },
  { value: "risk", label: "At-risk first" },
  { value: "az", label: "A → Z" },
];

/** Status band for the risk sort / export status column (0 behind → 2 done). */
export function statusBand(pct: number): 0 | 1 | 2 {
  return pct >= 100 ? 2 : pct >= 50 ? 1 : 0;
}

/** CSV field escape — quote anything with a comma, quote or newline. */
export function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}


/**
 * Goals LEVEL BOARD - the weekly-goals-board design (header + score card,
 * filter command bar, one card list, quick-add, drawers) applied to the GOALS
 * table for one level. Period pills double as ALWAYS-ON drop targets: drag a
 * card onto Q2 to re-quarter it (moveGoalToPeriod), drag within the list to
 * reorder (reorderGoals) - both optimistic through useOptimisticGoals.
 */
export function GoalsLevelBoard(props: GoalsLevelBoardProps) {
  const router = useRouter();
  const { goals, mutation } = useOptimisticGoals(props.goals);
  const fy = props.fyStartYear;

  // PER-LEVEL layout switch. `props.level` maps 1:1 onto a route - "year" only
  // ever arrives from /goals/yearly, "quarter" from /goals/quarterly, "month"
  // from /goals/monthly - so gating on it re-skins one page at a time.
  //
  // ALL THREE levels now share one shape: the band is just
  // `heading · [FY] [Viewing]`, and whatever bucket nav a level has renders on
  // its OWN row under the band (quarters for Quarterly, quarter-grouped months
  // for Monthly; Yearly has no buckets at all). That is why the former
  // `bandOnly` switch is gone - the "pills inside the band" layout it guarded
  // was Monthly's twelve-chip row, and nothing renders it any more. The board is
  // also a growing flex column, which is what pins the footer: otherwise its
  // gradient surface stops at the last row and leaves a strip of bare page
  // background above the bar.
  const isQuarterly = props.level === "quarter";
  const isMonthly = props.level === "month";

  // Option-A policy for the VIEWED person's board (one owner per board view).
  const policy = React.useMemo(
    () =>
      goalPolicy({
        isAdmin: props.isAdmin,
        isManagerOfOwner: props.managesViewed,
        isOwner: props.viewedEmployeeId === props.myEmployeeId,
      }),
    [props.isAdmin, props.managesViewed, props.viewedEmployeeId, props.myEmployeeId],
  );
  const canWrite = props.canWrite;

  // Week-lane cards (weekly_goals rows) for the Monthly hierarchy Kanban live
  // OUTSIDE the goals-table optimistic spine (different table), so they get a
  // small local optimistic layer of their own: a drag re-homes `week_start`
  // instantly, reconciled from the server on success (router.refresh) or
  // reverted + toasted on failure.
  const [weekCards, setWeekCards] = React.useState<GoalDTO[]>(props.weekCards);
  React.useEffect(() => setWeekCards(props.weekCards), [props.weekCards]);

  /** Query-param navigation on the page's own path (shareable URLs). */
  const go = React.useCallback(
    (params: { emp?: string; fy?: number; period?: string }) => {
      const sp = new URLSearchParams();
      const emp = params.emp ?? props.viewedEmployeeId;
      if (emp && emp !== props.myEmployeeId) sp.set("emp", emp);
      const fyNext = params.fy ?? fy;
      if (fyNext !== fyStartYearOf(new Date())) sp.set("fy", String(fyNext));
      // Keep the selected bucket across person hops; an FY hop DROPS it (the
      // page re-defaults the bucket inside the new FY's keys).
      const period =
        params.period ?? (params.fy === undefined && props.level !== "year" ? props.periodKey : undefined);
      if (period) sp.set("period", period);
      const qs = sp.toString();
      router.push(`${props.basePath}${qs ? `?${qs}` : ""}` as Route);
    },
    // `props.periodKey` and `props.level` are READ above, so they must be
    // deps: without them the callback keeps the closure from the render that
    // first created it, and a person hop after a quarter change re-sends the
    // PREVIOUS quarter - silently snapping the board back to it.
    [
      router,
      props.basePath,
      props.viewedEmployeeId,
      props.myEmployeeId,
      props.level,
      props.periodKey,
      fy,
    ],
  );

  // ── Quarter navigation: a ROLLING WINDOW of the live quarter plus the next
  //    three, which crosses the FY boundary by design (in Aug 2026 that reads
  //    FY 2026–27 · Q2 Q3 Q4, then FY 2027–28 · Q1). Replaces the old "Q1–Q4 of
  //    the viewed FY, past ones hidden" row, which in August led with a quarter
  //    that ended in June and pushed next year's Q1 behind the FY stepper.
  //
  //    Nothing below names a month, a quarter or a year: the anchor comes from
  //    `quarterKey(new Date())` and the window from `shiftQuarterKey`, whose
  //    absolute-quarter arithmetic owns the FY rollover. ──────────────────────
  const [showPast, setShowPast] = React.useState(false);
  const currentQuarterKey = React.useMemo(() => quarterKey(new Date()), []);

  // The window normally sits on the LIVE quarter, and re-anchors only when the
  // selection lands outside it - an FY hop, or a `?period=` deep link. So
  // clicking a quarter inside the window never reshuffles the row under the
  // pointer, while a quarter reached any other way is still shown and selected.
  const quarterAnchorKey = React.useMemo(
    () =>
      quarterWindow(currentQuarterKey).includes(props.periodKey)
        ? currentQuarterKey
        : props.periodKey,
    [currentQuarterKey, props.periodKey],
  );

  // Quarters of the LOADED FY that sit behind the window. The window only looks
  // forward, so without this the FY's earlier quarters would be unreachable
  // except by stepping the FY - the "Show past" reveal adds them back in place.
  const hiddenPastQuarters = React.useMemo(() => {
    if (!isQuarterly) return EMPTY_KEYS;
    const inWindow = new Set(quarterWindow(quarterAnchorKey));
    return quartersOfFy(fy).filter((k) => k < quarterAnchorKey && !inWindow.has(k));
  }, [isQuarterly, fy, quarterAnchorKey]);
  const revealedQuarters = showPast ? hiddenPastQuarters : EMPTY_KEYS;

  // ── Month navigation: the SAME rolling-window idea one level down - the live
  //    quarter and the next one, six months, each under the quarter that owns
  //    it. Replaces the strip of twelve identical chips, where the month you
  //    actually work in had to be found by reading every label and half the row
  //    was already closed.
  //
  //    Only the ANCHOR is a clock read (`monthKey`/`quarterKey` of today); the
  //    window, its months and their FYs are all derived from the keys, so a
  //    January board renders `FY 2026–27 · Q4` beside `FY 2027–28 · Q1` without
  //    anything here knowing where a financial year starts or ends. ───────────
  const currentMonthKey = React.useMemo(() => monthKey(new Date()), []);

  // Anchored on the LIVE quarter, re-anchored only when the selected month sits
  // outside the window (an FY hop or a `?m=`/`?period=` deep link) - so clicking
  // a month inside the window never reshuffles the row under the pointer.
  const monthAnchorQuarterKey = React.useMemo(() => {
    if (!isMonthly) return currentQuarterKey;
    const selectedQuarter = quarterKeyOfMonthKey(props.periodKey);
    return monthWindowQuarters(currentQuarterKey).includes(selectedQuarter)
      ? currentQuarterKey
      : selectedQuarter;
  }, [isMonthly, currentQuarterKey, props.periodKey]);

  // The single quarter behind the window - what "Show past" reveals. Unlike the
  // quarterly row this isn't clipped to the loaded FY: stepping back from April
  // is a legitimate look at the closing year, and picking one of its months hops
  // the FY with it.
  const pastQuarterKeys = React.useMemo(
    () => (isMonthly ? [shiftQuarterKey(monthAnchorQuarterKey, -1)] : EMPTY_KEYS),
    [isMonthly, monthAnchorQuarterKey],
  );
  const revealedPastQuarters = showPast ? pastQuarterKeys : EMPTY_KEYS;

  // ── Buckets at this level: what the nav row shows, which is also what the
  //    Kanban lays out in columns. ──────────────────────────────────────
  const buckets = React.useMemo<string[]>(() => {
    if (props.level === "year") return [String(fy)];
    if (props.level === "quarter") {
      return Array.from(new Set([...quarterWindow(quarterAnchorKey), ...revealedQuarters])).sort();
    }
    return [...revealedPastQuarters, ...monthWindowQuarters(monthAnchorQuarterKey)]
      .sort()
      .flatMap(monthsOfQuarterKey);
  }, [
    props.level,
    fy,
    quarterAnchorKey,
    revealedQuarters,
    monthAnchorQuarterKey,
    revealedPastQuarters,
  ]);

  const levelGoals = React.useMemo(
    () => goals.filter((g) => g.period === props.level),
    [goals, props.level],
  );
  const countByBucket = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const g of levelGoals) m.set(g.periodKey, (m.get(g.periodKey) ?? 0) + 1);
    return m;
  }, [levelGoals]);

  // The board loads ONE FY of goals, so a quarter from the window's other FY has
  // no count here - report `null` (unknown) rather than a confident 0, which the
  // pill would otherwise announce as "0 goals" for a quarter that may be full.
  const quarterCountOf = React.useCallback(
    (periodKey: string): number | null =>
      fyStartYearOfKey(periodKey) === fy ? countByBucket.get(periodKey) ?? 0 : null,
    [countByBucket, fy],
  );

  /** Same rule for the month window, which straddles FYs the same way - a month
   *  the loader never fetched reports `null` (unknown), not 0. */
  const monthCountOf = React.useCallback(
    (monthKeyStr: string): number | null =>
      fyStartYearOfMonthKey(monthKeyStr) === fy ? countByBucket.get(monthKeyStr) ?? 0 : null,
    [countByBucket, fy],
  );

  /** This bucket's goals in Sr.-No. order - the list the board renders. */
  const inBucket = React.useMemo(
    () =>
      levelGoals
        .filter((g) => g.periodKey === props.periodKey)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    [levelGoals, props.periodKey],
  );

  // ── View: classic list ⇄ HIERARCHICAL Kanban (persisted). EVERY level now
  //    gets a Kanban - including Yearly (Year → Quarter). SSR renders "list";
  //    the stored preference applies after mount so hydration stays clean. ──
  const [view, setView] = React.useState<"list" | "kanban" | "dashboard">("list");
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORE_KEY);
      if (stored === "kanban" || stored === "dashboard") setView(stored);
    } catch {
      /* storage unavailable - stay on list */
    }
  }, []);
  const pickView = React.useCallback((v: "list" | "kanban" | "dashboard") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORE_KEY, v);
    } catch {
      /* non-fatal */
    }
  }, []);
  const kanban = view === "kanban";
  const dashboard = view === "dashboard";
  // The frozen-parent Kanban's own level → its child lane level lives one below.
  const parentLevel: "year" | "quarter" | "month" =
    props.level === "year" ? "year" : props.level === "quarter" ? "quarter" : "month";

  // ── Header "+ New goal" → fires the SAME BoardQuickAdd composer (one create
  //    path). In Kanban the board-level quick-add isn't mounted, so hop to List
  //    first and open once it commits (pendingCompose effect). ──────────
  const quickAddRef = React.useRef<BoardQuickAddHandle>(null);
  const [pendingCompose, setPendingCompose] = React.useState(false);
  React.useEffect(() => {
    if (pendingCompose && view === "list") {
      quickAddRef.current?.open();
      setPendingCompose(false);
    }
  }, [pendingCompose, view]);
  const openComposer = React.useCallback(() => {
    // The board-level quick-add is only mounted in List view - hop there first
    // from Kanban/Dashboard, then open once it commits (pendingCompose effect).
    if (view !== "list") {
      pickView("list");
      setPendingCompose(true);
    } else {
      quickAddRef.current?.open();
    }
  }, [view, pickView]);

  // ── Hotkey: press "G" anywhere on a Goals board to open "+ New goal". Never
  //    hijacks real typing - bails inside form fields, the spreadsheet grid
  //    (where a letter seeds an inline cell edit), contenteditable, or any open
  //    dialog/drawer - and ignores modifier combos (⌘G / Ctrl-G stay native). ─
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "g" && e.key !== "G") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
          t.closest('[role="grid"], [role="dialog"], [contenteditable="true"]'))
      ) {
        return;
      }
      e.preventDefault();
      openComposer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openComposer]);

  // ── Filters (search + quick chips) ──────────────────────────────────
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [completion, setCompletion] = React.useState<ProgressFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("position");
  // Area / Type filters - empty set = no restriction (matches every goal).
  const [areaFilter, setAreaFilter] = React.useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = React.useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = React.useState<Set<string>>(() => new Set(ALL_VISIBLE_COLS));
  const [colOrder, setColOrder] = useColOrder();
  const [rowsPerPage, setRowsPerPage] = React.useState<number | "all">(25);
  const [fullscreen, setFullscreen] = React.useState(false);

  // ── Dashboard view's OWN filter set (Area/Type/Owner/Delegate/Status) -
  //    separate from the List view's search/quick-chip filters above; drives
  //    every chart on the Dashboard tab.
  const [dashboardFilters, setDashboardFilters] = React.useState<DashboardFilters>(DEFAULT_DASHBOARD_FILTERS);

  // Esc exits full screen (mirrors the Tasks module's own fullscreen mode).
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  /** A goal's Type as it reads in the simplified table's own fixed list
   *  (built-in code → its label; admin-added custom type → its raw value) -
   *  the same resolution goal-table-view.tsx's Type column already uses. */
  const goalTypeLabel = React.useCallback(
    (g: GoalDTO) => (g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""),
    [],
  );

  const filterGoal = React.useCallback(
    (g: GoalDTO) => {
      if (completion !== "all") {
        const p = effectiveGoalPct(g);
        if (completion === "done" && p < 100) return false;
        if (completion === "p75" && !(p >= 75 && p < 100)) return false;
        if (completion === "p50" && !(p >= 50 && p < 75)) return false;
        if (completion === "p25" && !(p >= 25 && p < 50)) return false;
        if (completion === "below25" && !(p > 0 && p < 25)) return false;
        if (completion === "unstarted" && p > 0) return false;
      }
      if (areaFilter.size > 0 && !areaFilter.has(g.area ?? "")) return false;
      if (typeFilter.size > 0 && !typeFilter.has(goalTypeLabel(g))) return false;
      const q = deferredSearch.trim().toLowerCase();
      if (q) {
        const hay = `${g.title} ${g.area ?? ""} ${g.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [deferredSearch, completion, areaFilter, typeFilter, goalTypeLabel],
  );

  // Sort comparator - Sr. No. keeps the position order (drag stays live); every
  // other key sorts a COPY (drag paused). Ties fall back to Sr. No. for stability.
  const sortCmp = React.useCallback(
    (a: GoalDTO, b: GoalDTO): number => {
      const posTie = a.position - b.position || a.title.localeCompare(b.title);
      switch (sortKey) {
        case "score-desc":
          return effectiveGoalPct(b) - effectiveGoalPct(a) || posTie;
        case "score-asc":
          return effectiveGoalPct(a) - effectiveGoalPct(b) || posTie;
        case "risk":
          return (
            statusBand(effectiveGoalPct(a)) - statusBand(effectiveGoalPct(b)) ||
            effectiveGoalPct(a) - effectiveGoalPct(b) ||
            posTie
          );
        case "az":
          return a.title.localeCompare(b.title) || posTie;
        default:
          return 0; // "position" - inBucket is already Sr.-No. ordered
      }
    },
    [sortKey],
  );

  const displayed = React.useMemo(() => {
    const list = inBucket.filter((g) => filterGoal(g));
    return sortKey === "position" ? list : [...list].sort(sortCmp);
  }, [inBucket, filterGoal, sortKey, sortCmp]);

  /** Kanban: every bucket's (filtered, Sr.-No.-sorted) goals in one pass. */
  const goalsByBucket = React.useMemo(() => {
    const m = new Map<string, GoalDTO[]>();
    for (const k of buckets) m.set(k, []);
    for (const g of levelGoals) {
      if (!filterGoal(g)) continue;
      m.get(g.periodKey)?.push(g);
    }
    for (const list of m.values())
      list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    return m;
  }, [buckets, levelGoals, filterGoal]);

  // The hierarchy Kanban's lane cards live at the CHILD level (Year→Quarter,
  // Quarter→Month, Month→Week) under the selected parent bucket - scope the
  // quick-chips to exactly those so the counts match the cards on screen.
  const kanbanChildScope = React.useMemo(() => {
    if (!kanban) return EMPTY_CHILDREN;
    const child = childLevelOf(parentLevel);
    return goals.filter((g) => {
      if (g.period !== child) return false;
      if (parentLevel === "year") return fyStartYearOfKey(g.periodKey) === fy;
      if (parentLevel === "quarter") return quarterKeyOfMonthKey(g.periodKey) === props.periodKey;
      return g.periodKey.slice(0, 7) === props.periodKey; // week's Monday-month === selected month
    });
  }, [kanban, parentLevel, goals, fy, props.periodKey]);

  // Chip counts scope with the view: the selected bucket in list view, the
  // child lanes in Kanban (the chips filter every lane).
  const chipScope = kanban ? kanbanChildScope : inBucket;
  const chipCounts = React.useMemo<Record<ProgressFilter, number>>(() => {
    const c: Record<ProgressFilter, number> = {
      all: chipScope.length,
      done: 0,
      p75: 0,
      p50: 0,
      p25: 0,
      below25: 0,
      unstarted: 0,
    };
    for (const g of chipScope) {
      const p = effectiveGoalPct(g);
      if (p >= 100) c.done++;
      else if (p >= 75) c.p75++;
      else if (p >= 50) c.p50++;
      else if (p >= 25) c.p25++;
      else if (p > 0) c.below25++;
      else c.unstarted++;
    }
    return c;
  }, [chipScope]);

  const visibleCount = kanban
    ? [...goalsByBucket.values()].reduce((n, l) => n + l.length, 0)
    : displayed.length;
  const scopeTotal = kanban ? levelGoals.length : inBucket.length;

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (completion !== "all" ? 1 : 0) +
    (areaFilter.size > 0 ? 1 : 0) +
    (typeFilter.size > 0 ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setCompletion("all");
    setAreaFilter(new Set());
    setTypeFilter(new Set());
  };

  // Rows-per-page - a plain slice of the already-filtered/sorted list view;
  // Kanban and Dashboard show every matching goal, unpaged (they lay out by
  // bucket/lane, not a scrolling row list).
  const pagedGoals = React.useMemo(
    () => (rowsPerPage === "all" ? displayed : displayed.slice(0, rowsPerPage)),
    [displayed, rowsPerPage],
  );

  // ── Export the CURRENTLY-VISIBLE goals to CSV (client-side Blob) ──────
  const exportCsv = React.useCallback(() => {
    const header = [
      "Sr", "Goal", "Area", "Category", "% done", "Status", "Incentive", "Monthly-Master", "Origin",
    ];
    const body = displayed.map((g, i) => {
      const pct = effectiveGoalPct(g);
      const status = pct >= 100 ? "Done" : pct >= 50 ? "On track" : "At risk";
      const incentive = g.incentiveEnabled
        ? `Yes${g.incentiveAmount ? ` ₹${g.incentiveAmount}` : ""}${g.incentiveKind ? ` (${g.incentiveKind})` : ""}`
        : "No";
      return [
        String(i + 1),
        g.title,
        g.area ?? "",
        categoryStyle(g.category, false).label,
        String(pct),
        status,
        incentive,
        g.monthlyMasterRef?.label ?? "",
        g.source === "cascade" ? "Auto" : "Manual",
      ];
    });
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    // Title-cased export name (capital letters, per Sir): "Yearly-Goals-FY2026-27.csv".
    const levelSlug = props.level === "year" ? "Yearly" : props.level === "quarter" ? "Quarterly" : "Monthly";
    const fyName = `FY${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${levelSlug}-Goals-${fyName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [displayed, props.level, fy]);

  // ── Quick-add parent: the level-above goal OWNING a bucket (per-bucket
  //    so the Kanban columns each resolve their own). ──────────────────
  const parentOf = React.useCallback(
    (bucketKey: string): { id: string; title: string } | null => {
      const parentKey = parentPeriodKeyOf(bucketKey);
      if (!parentKey) return null;
      const parentLevel = props.level === "quarter" ? "year" : "quarter";
      const owner = goals
        .filter((g) => g.period === parentLevel && g.periodKey === parentKey)
        .sort((a, b) => a.position - b.position)[0];
      return owner ? { id: owner.id, title: owner.title } : null;
    },
    [goals, props.level],
  );
  const parentGoal = React.useMemo(() => parentOf(props.periodKey), [parentOf, props.periodKey]);

  // Area dropdown options: the managed base+custom set (from the loader) FIRST,
  // then any area found on an existing goal that isn't already listed.
  const areaOptions = React.useMemo(() => {
    const seen = new Set(props.areaOptions.map((a) => a.toLowerCase()));
    const extra = [...new Set(goals.map((g) => g.area).filter((a): a is string => !!a))]
      .filter((a) => !seen.has(a.toLowerCase()))
      .sort();
    return [...props.areaOptions, ...extra];
  }, [props.areaOptions, goals]);
  const measureOptions = props.measureOptions;
  const typeOptions = props.typeOptions;
  const goaltypeOptions = props.goaltypeOptions;
  const customLookups = props.customLookups;

  /** Direct children of every goal (the payload holds ALL levels) - feeds the
   *  drawer's allocation strip + Rebalance without any extra fetch. */
  const childrenByParent = React.useMemo(() => {
    const m = new Map<string, GoalDTO[]>();
    for (const g of goals) {
      if (!g.parentGoalId) continue;
      const list = m.get(g.parentGoalId);
      if (list) list.push(g);
      else m.set(g.parentGoalId, [g]);
    }
    return m;
  }, [goals]);

  // ── Drag & drop (always on): reorder in-bucket + drop on a period pill ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Drag-reorder is only coherent in Sr.-No. order - a custom sort would fight
  // the persisted position, so pause drag whenever a sort (or filter) is active.
  const dragDisabled =
    !canWrite || !policy.canReorder || activeFilterCount > 0 || sortKey !== "position";
  const [activeDrag, setActiveDrag] = React.useState<GoalDTO | null>(null);
  // Stable, SSR-safe DndContext id. Without it dnd-kit falls back to a
  // module-global counter that drifts between the server render (fresh) and the
  // client (StrictMode double-mount / prior instances) → the accessibility
  // `aria-describedby="DndDescribedBy-N"` mismatches and React logs a hydration
  // error. useId() produces the identical value on both sides.
  const dndId = React.useId();

  /** POINTER-FIRST collision detection. The board rows are full-width, so any
   *  rect-based algorithm (closestCorners/-Center) lets a sibling ROW out-score
   *  a small period pill or a Kanban column even when the cursor is dead-centre
   *  on it - drops silently no-op'd ("DnD feels absent"). Whatever droppable is
   *  actually UNDER the cursor wins; the rect math stays as the fallback for
   *  the keyboard sensor (which has no pointer). */
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const underPointer = pointerWithin(args);
    return underPointer.length > 0 ? underPointer : closestCorners(args);
  }, []);

  const onDragStart = React.useCallback(
    (e: DragStartEvent) => {
      setActiveDrag(levelGoals.find((g) => g.id === String(e.active.id)) ?? null);
    },
    [levelGoals],
  );

  /** Same-level re-bucket (pill drop, Kanban column drop, cross-column card
   *  drop) - the owner-open `canReQuarter` line, optimistic, with live Undo.
   *  Cross-LEVEL moves stay in the "Move to…" drawer (canRehomeLevel). */
  const moveToBucket = React.useCallback(
    (g: GoalDTO, key: string) => {
      if (!policy.canReQuarter) return; // server re-derives the same line
      if (key === g.periodKey) return;
      const from = { periodKey: g.periodKey, position: g.position };
      void mutation
        .mutate(
          { type: "update", id: g.id, fields: { periodKey: key, position: 9_999 } },
          () => moveGoalToPeriod({ id: g.id, periodKey: key }),
        )
        .then((ok) => {
          if (!ok) return;
          fireToast({
            message: `Moved to ${periodKeyLabel(key)}`,
            type: "success",
            actionLabel: "Undo",
            action: () => {
              void mutation
                .mutate(
                  { type: "update", id: g.id, fields: { periodKey: from.periodKey, position: from.position } },
                  () => moveGoalToPeriod({ id: g.id, periodKey: from.periodKey }),
                )
                .then((undone) => {
                  if (undone)
                    fireToast({ message: `Moved back to ${periodKeyLabel(from.periodKey)}`, type: "success" });
                });
            },
          });
        });
    },
    [mutation, policy.canReQuarter],
  );

  /** Cross-LEVEL drag re-home (roll-up → any quarter / any month). Same-level
   *  targets fall through to `moveToBucket`; a different level re-parents via
   *  moveGoalToLevel (server handles parent re-linking + orphan detach), fully
   *  optimistic with an Undo toast - the same recipe as the "Move to…" drawer. */
  const rehomeToLevel = React.useCallback(
    (g: GoalDTO, targetPeriod: GoalPeriod, targetPeriodKey: string) => {
      if (targetPeriod === g.period) return moveToBucket(g, targetPeriodKey);
      if (!policy.canRehomeLevel) return;
      if (targetPeriodKey === g.periodKey) return;
      const from = { period: g.period, periodKey: g.periodKey, position: g.position };
      void mutation
        .mutate(
          { type: "update", id: g.id, fields: { period: targetPeriod, periodKey: targetPeriodKey, position: 9_999 } },
          () => moveGoalToLevel({ id: g.id, targetPeriod, targetPeriodKey }),
        )
        .then((ok) => {
          if (!ok) return;
          fireToast({
            message: `Moved to ${periodKeyLabel(targetPeriodKey)}`,
            type: "success",
            actionLabel: "Undo",
            action: () => {
              void mutation
                .mutate(
                  { type: "update", id: g.id, fields: { period: from.period, periodKey: from.periodKey, position: from.position } },
                  () => moveGoalToLevel({ id: g.id, targetPeriod: from.period, targetPeriodKey: from.periodKey }),
                )
                .then((undone) => {
                  if (undone) fireToast({ message: `Moved back to ${periodKeyLabel(from.periodKey)}`, type: "success" });
                });
            },
          });
        });
    },
    [mutation, moveToBucket, policy.canRehomeLevel],
  );

  /** Kanban parent→child CASCADE: drag a frozen roll-up goal (e.g. a Year goal)
   *  onto a child lane (a Quarter) → create a NEW linked child goal in that
   *  bucket, KEEPING the parent. Uses copyGoalToPeriod with `asChild` so the copy
   *  rolls up to the source; the board re-fetches to surface it. */
  const cascadeToChild = React.useCallback(
    (g: GoalDTO, targetPeriod: GoalPeriod, targetPeriodKey: string) => {
      if (targetPeriod === g.period) return; // only a cross-level (parent→child) cascade
      if (!policy.canRehomeLevel) return; // same structure gate as move-across
      void copyGoalToPeriod({ id: g.id, targetLevel: targetPeriod, targetKey: targetPeriodKey, asChild: true })
        .then((res) => {
          if (!res.ok) {
            fireToast({ message: res.error, type: "error" });
            return;
          }
          fireToast({ message: `Cascaded "${g.title}" into ${periodKeyLabel(targetPeriodKey)}`, type: "success" });
          router.refresh();
        })
        .catch(() => fireToast({ message: "Couldn't cascade that goal.", type: "error" }));
    },
    [policy.canRehomeLevel, router],
  );

  /** Persist a reordered Sr.-No. line for a hierarchy Kanban LANE (child-level
   *  drag-within-a-lane). Reuses the same reorder path as the list/onDragEnd. */
  const reorderChildIds = React.useCallback(
    (ids: string[]) => {
      if (!policy.canReorder || ids.length === 0) return;
      void mutation.mutate({ type: "reorder", ids }, () => reorderGoals(ids));
    },
    [mutation, policy.canReorder],
  );

  /** Re-home a WEEK-lane card (weekly_goals row) to another week on the Monthly
   *  board - writes `week_start` via moveWeeklyToWeek. Optimistic + Undo, then
   *  router.refresh reconciles the re-fetched week cards from the server. */
  const rehomeWeekCard = React.useCallback(
    (g: GoalDTO, weekStart: string) => {
      if (!policy.canReQuarter) return; // same owner-open gate as sibling re-home
      if (weekStart === g.periodKey) return;
      const from = g.periodKey;
      const patch = (cards: GoalDTO[], key: string) =>
        cards.map((c) => (c.id === g.id ? { ...c, periodKey: key } : c));
      setWeekCards((cards) => patch(cards, weekStart));
      void moveWeeklyToWeek({ id: g.id, weekStart })
        .then((res) => {
          if (!res.ok) {
            setWeekCards((cards) => patch(cards, from));
            fireToast({ message: res.error, type: "error" });
            return;
          }
          fireToast({
            message: `Moved to ${periodKeyLabel(weekStart)}`,
            type: "success",
            actionLabel: "Undo",
            action: () => {
              setWeekCards((cards) => patch(cards, from));
              void moveWeeklyToWeek({ id: g.id, weekStart: from }).then((undone) => {
                if (undone.ok) {
                  fireToast({ message: `Moved back to ${periodKeyLabel(from)}`, type: "success" });
                  router.refresh();
                }
              });
            },
          });
          router.refresh();
        })
        .catch(() => {
          setWeekCards((cards) => patch(cards, from));
          fireToast({ message: "Couldn't move the week goal. Try again.", type: "error" });
        });
    },
    [policy.canReQuarter, router],
  );

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = e;
      if (!over) return;
      const g = levelGoals.find((x) => x.id === String(active.id));
      if (!g) return;
      const overId = String(over.id);

      // 1) Dropped on a period PILL (list view) or a Kanban COLUMN → re-bucket.
      if (overId.startsWith(BUCKET_DROP_PREFIX)) {
        moveToBucket(g, overId.slice(BUCKET_DROP_PREFIX.length));
        return;
      }

      if (overId === g.id) return;
      const target = levelGoals.find((x) => x.id === overId);
      if (!target) return;

      // 2) Dropped on a card in ANOTHER bucket (Kanban cross-column) → re-bucket.
      if (target.periodKey !== g.periodKey) {
        moveToBucket(g, target.periodKey);
        return;
      }

      // 3) Dropped on a sibling card → persist the new Sr.-No. order.
      if (!policy.canReorder) return; // server re-derives the same line
      const bucket = levelGoals
        .filter((x) => x.periodKey === g.periodKey)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
      const oldIndex = bucket.findIndex((x) => x.id === g.id);
      const newIndex = bucket.findIndex((x) => x.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      const ids = arrayMove(bucket, oldIndex, newIndex).map((x) => x.id);
      void mutation.mutate({ type: "reorder", ids }, () => reorderGoals(ids));
    },
    [levelGoals, mutation, moveToBucket, policy.canReorder],
  );

  // ── ARIA-LIVE narration for the drag (screen-reader parity) ─────────
  // dnd-kit renders these through its own hidden aria-live region; the
  // keyboard path is the SAME DndContext - space lifts, arrows walk sibling
  // cards AND the period pills (droppables count as targets), space drops.
  const nameDropTarget = React.useCallback(
    (id: string | number | undefined): string | null => {
      if (id == null) return null;
      const s = String(id);
      if (s.startsWith(BUCKET_DROP_PREFIX))
        return `the ${periodKeyLabel(s.slice(BUCKET_DROP_PREFIX.length))} period`;
      const g = levelGoals.find((x) => x.id === s);
      return g ? `“${g.title}”` : null;
    },
    [levelGoals],
  );
  const dndAnnouncements = React.useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const name = nameDropTarget(active.id) ?? "the goal";
        return `Picked up ${name}. Use the arrow keys to reorder or to reach a period pill, space to drop, escape to cancel.`;
      },
      onDragOver({ active, over }) {
        const name = nameDropTarget(active.id) ?? "the goal";
        const target = nameDropTarget(over?.id);
        return target ? `${name} is over ${target}.` : `${name} is no longer over a drop target.`;
      },
      onDragEnd({ active, over }) {
        const name = nameDropTarget(active.id) ?? "the goal";
        const target = nameDropTarget(over?.id);
        if (!target) return `Dropped ${name}. No changes made.`;
        const overId = String(over?.id ?? "");
        if (overId.startsWith(BUCKET_DROP_PREFIX)) return `Moved ${name} to ${target}.`;
        // Kanban cross-column drop ON a card actually re-buckets - say so.
        const a = levelGoals.find((x) => x.id === String(active.id));
        const o = levelGoals.find((x) => x.id === overId);
        if (a && o && a.periodKey !== o.periodKey)
          return `Moved ${name} to ${periodKeyLabel(o.periodKey)}.`;
        return `Dropped ${name} next to ${target}.`;
      },
      onDragCancel({ active }) {
        return `Cancelled - ${nameDropTarget(active.id) ?? "the goal"} returned to its place.`;
      },
    }),
    [nameDropTarget, levelGoals],
  );
  const dndInstructions = React.useMemo<ScreenReaderInstructions>(
    () => ({
      draggable:
        "To pick up a goal, press space or enter on its drag handle. Use the arrow keys to reorder it among its neighbours, or keep going to reach a period pill and re-period it. Press space or enter again to drop, escape to cancel. Cross-level moves live in the card's Move to… menu.",
    }),
    [],
  );

  // ── Archive (soft-delete → Recycle Bin) ─────────────────────────────
  const [archiveTarget, setArchiveTarget] = React.useState<GoalDTO | null>(null);
  const requestArchive = React.useCallback((g: GoalDTO) => setArchiveTarget(g), []);

  // ── Stable DENSE goal numbering - ONE source for every view ──────────
  // The code (Y1 / AQ1 / AprM1) and Sr. No. come from the goal's RANK within
  // its bucket (goals sorted by stored position → 1..N), never the raw stored
  // `position` (which goes sparse after reorders/deletes - the "16,17,18" and
  // duplicate-"AQ1" bugs). Computed once over ALL goals so the list, Kanban and
  // cards always agree, stay sequential, and never gap or collide.
  const rankById = React.useMemo(() => {
    const byBucket = new Map<string, GoalDTO[]>();
    for (const g of goals) {
      const k = `${g.period}:${g.periodKey}`;
      let arr = byBucket.get(k);
      if (!arr) {
        arr = [];
        byBucket.set(k, arr);
      }
      arr.push(g);
    }
    const map = new Map<string, number>();
    for (const arr of byBucket.values()) {
      arr.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
      arr.forEach((g, i) => map.set(g.id, i + 1));
    }
    return map;
  }, [goals]);
  const rankOf = React.useCallback((g: GoalDTO) => rankById.get(g.id) ?? g.position, [rankById]);
  /** Owner display name for the shared goal-details view. Reads the roster the
   *  board already loaded - no extra query, and null when the owner is off it. */
  const ownerNameOf = React.useCallback(
    (g: GoalDTO) => props.roster.find((r) => r.id === g.employeeId)?.name ?? null,
    [props.roster],
  );
  const codeOf = React.useCallback(
    (g: GoalDTO) => goalCode({ period: g.period, periodKey: g.periodKey, position: rankById.get(g.id) ?? g.position, id: g.id }),
    [rankById],
  );

  const sharedCardProps = React.useMemo<SharedCardProps>(
    () => ({
      policy,
      canWrite,
      roster: props.roster,
      areaOptions,
      measureOptions,
      typeOptions,
      customLookups,
      isAdmin: props.isAdmin,
      fyStartYear: fy,
      mutation,
      onRequestArchive: requestArchive,
      dragDisabled,
      codeOf,
      rankOf,
    }),
    [policy, canWrite, props.roster, areaOptions, measureOptions, typeOptions, customLookups, props.isAdmin, fy, mutation, requestArchive, dragDisabled, codeOf, rankOf],
  );

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-auto bg-surface-soft px-7 pt-4 pb-10 max-md:px-4 max-md:pt-3"
          : "relative mx-auto w-full min-w-0 max-w-[1560px] px-7 pt-4 pb-16 max-md:px-4 max-md:pt-3"
      }
      style={{ color: "var(--color-ink-strong)" }}
    >
      <div className="relative flex flex-col">
        {/* ── HEADER - ONE unified command bar: identity + tabs · overview
            (dial + donut) · person + FY, all in a single creative band. ── */}
        {/* ── Every level (Yearly / Quarterly / Monthly) gets the SAME
            Tasks-page treatment: a slim title+stat-chip header, then a
            compact glass-strip control row for search / bucket nav / FY /
            Viewing. Only the bucket-nav control inside the strip changes
            per level (quarters, months, or nothing for Yearly). ── */}
        <header className="wg-rise relative mb-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap min-w-0">
            <h1
              className="text-ink-strong shrink-0"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(20px, 1.8vw, 25px)",
                letterSpacing: "-0.028em",
                lineHeight: 1,
              }}
            >
              {props.heading}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <GoalStatChip
                label="Total"
                value={chipCounts.all}
                tone="slate"
                active={completion === "all"}
                onClick={() => setCompletion("all")}
              />
              <GoalStatChip
                label="Done"
                value={chipCounts.done}
                tone="green"
                active={completion === "done"}
                onClick={() => setCompletion(completion === "done" ? "all" : "done")}
              />
              <GoalStatChip
                label="75-100%"
                value={chipCounts.p75}
                tone="blue"
                active={completion === "p75"}
                onClick={() => setCompletion(completion === "p75" ? "all" : "p75")}
              />
              <GoalStatChip
                label="50-75%"
                value={chipCounts.p50}
                tone="yellow"
                active={completion === "p50"}
                onClick={() => setCompletion(completion === "p50" ? "all" : "p50")}
              />
              <GoalStatChip
                label="25-50%"
                value={chipCounts.p25}
                tone="orange"
                active={completion === "p25"}
                onClick={() => setCompletion(completion === "p25" ? "all" : "p25")}
              />
              <GoalStatChip
                label="<25%"
                value={chipCounts.below25}
                tone="red"
                active={completion === "below25"}
                onClick={() => setCompletion(completion === "below25" ? "all" : "below25")}
              />
              <GoalStatChip
                label="Not Started"
                value={chipCounts.unstarted}
                tone="slate"
                active={completion === "unstarted"}
                onClick={() => setCompletion(completion === "unstarted" ? "all" : "unstarted")}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              className={`inline-flex shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all cursor-pointer ${FOCUS_RING}`}
            >
              {fullscreen ? <Minimize2 size={14} strokeWidth={2.4} /> : <Maximize2 size={14} strokeWidth={2.4} />}
              {fullscreen ? "Exit" : "Full screen"}
            </button>
          </div>
        </header>

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
          <div className="relative min-w-[180px] max-w-[360px] flex-1 shrink-0">
            <Search size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Local search - goals, areas, notes"
              title="Local search - filters only the list on this page"
              aria-label="Local search - goals, areas, notes - this page only"
              className={`w-full h-9 rounded-pill border border-hairline bg-surface-card pl-9 pr-9 text-[13.5px] font-medium text-ink-strong transition-colors focus:border-altus-red ${FOCUS_RING}`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full text-ink-subtle hover:text-ink-strong ${FOCUS_RING}`}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Bucket nav - quarters (Quarterly), months (Monthly), nothing (Yearly). */}
          {isQuarterly && (
            <QuarterWindowNav
              anchorKey={quarterAnchorKey}
              extraKeys={revealedQuarters}
              selectedKey={props.periodKey}
              currentKey={currentQuarterKey}
              countOf={quarterCountOf}
              onPick={(k) => go({ fy: fyStartYearOfKey(k), period: k })}
            />
          )}
          {isMonthly && (
            <MonthWindowNav
              anchorQuarterKey={monthAnchorQuarterKey}
              extraQuarterKeys={revealedPastQuarters}
              selectedKey={props.periodKey}
              currentMonthKey={currentMonthKey}
              countOf={monthCountOf}
              // A month in the window's other FY (Apr, viewed from a January
              // board) needs the LOADER moved with it, not just the selection
              // - the fy hop is what fetches its goals.
              onPick={(k) => go({ fy: fyStartYearOfMonthKey(k), period: k })}
            />
          )}

          {isQuarterly && hiddenPastQuarters.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              aria-pressed={showPast}
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong ${FOCUS_RING}`}
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
            >
              {showPast ? "Hide past" : `Show past (${hiddenPastQuarters.length})`}
            </button>
          )}
          {isMonthly && pastQuarterKeys.length > 0 && (
            // `self-stretch` - MonthWindowNav beside it is a multi-row bracket
            // box (FY legend + quarter caption + month pills), so it's taller
            // than a one-line button. Stretching to match its height (instead
            // of floating short at `items-center`) is what keeps the two
            // boxes reading as the same height in the row.
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              aria-pressed={showPast}
              className={`shrink-0 self-stretch inline-flex items-center gap-1 rounded-lg px-2.5 text-[13px] font-bold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong ${FOCUS_RING}`}
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
            >
              {showPast ? "Hide past" : "Show past"}
            </button>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
              <button
                type="button"
                aria-label="Previous financial year"
                onClick={() => go({ fy: fy - 1 })}
                className={`cursor-pointer px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red ${FOCUS_RING}`}
              >
                <ChevronLeft size={15} strokeWidth={2.4} />
              </button>
              <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[13px] font-bold tabular-nums text-ink-strong">
                {fyLabel(fy)}
              </span>
              <button
                type="button"
                aria-label="Next financial year"
                onClick={() => go({ fy: fy + 1 })}
                className={`cursor-pointer px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red ${FOCUS_RING}`}
              >
                <ChevronRight size={15} strokeWidth={2.4} />
              </button>
            </div>

            {canWrite && (
              <button
                type="button"
                onClick={openComposer}
                title="New Goal - press G"
                aria-keyshortcuts="G"
                className={`pastel-cta wg-btn inline-flex shrink-0 items-center gap-1.5 h-9 rounded-pill px-3.5 text-[13px] font-bold transition-all hover:-translate-y-px cursor-pointer ${FOCUS_RING}`}
              >
                <Plus size={14} strokeWidth={2.8} /> New Goal
              </button>
            )}

            {props.roster.length > 1 && (
              <ViewingSelect
                people={props.roster}
                value={props.viewedEmployeeId}
                viewedName={props.viewedName}
                onChange={(v) => go({ emp: v })}
                myEmployeeId={props.myEmployeeId}
              />
            )}
          </div>
        </div>

        {/* ── Feature toolbar - Sort · Export · Bulk upload · filters ·
            Columns · Full screen · view toggle, all in one glass instrument
            strip (matches the Tasks table's own toolbar). New Goal now lives
            in the row above, right after the FY stepper. Search sits on its
            own row, directly above the table. Shown on ALL levels (Yearly
            included). ── */}
        <div
          className="wg-rise mb-3 flex flex-wrap items-center gap-1.5 rounded-section border border-hairline px-3 py-2 max-md:px-3"
          style={{
            animationDelay: "30ms",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
          }}
        >
          {/* View toggle - List | Kanban. Now on EVERY level: the Yearly board
              gets a Year→Quarter hierarchical Kanban too. */}
          <div
            role="group"
            aria-label="Board view"
            className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-pill border border-hairline-strong bg-surface-soft"
          >
            <ViewToggleButton
              active={!kanban && !dashboard}
              label="List"
              icon={<List size={14} strokeWidth={2.4} />}
              onClick={() => pickView("list")}
            />
            <ViewToggleButton
              active={kanban}
              label="Kanban"
              icon={<Columns3 size={14} strokeWidth={2.4} />}
              onClick={() => pickView("kanban")}
            />
            <ViewToggleButton
              active={dashboard}
              label="Dashboard"
              icon={<LayoutDashboard size={14} strokeWidth={2.4} />}
              onClick={() => pickView("dashboard")}
            />
          </div>

          {/* Sort - premium Select inside a pill shell (matches the toolbar row). */}
          <div className="relative inline-flex h-9 shrink-0 items-center rounded-pill border border-hairline bg-surface-card pl-7 pr-3 transition-colors focus-within:border-altus-red hover:border-hairline-strong">
            <ArrowUpDown size={13} strokeWidth={2.4} className="pointer-events-none absolute left-2.5 text-ink-subtle" />
            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
              ariaLabel="Sort goals"
              unstyled
              className="flex min-w-[5.5rem] cursor-pointer items-center gap-1 text-[13px] font-bold text-ink-soft"
              options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>

          {/* Area / Type filters - Goals' own dimensions (no Client/Department
              concept here), same checklist-popover pattern as the rest of the
              toolbar. */}
          {!kanban && !dashboard && (
            <>
              <MultiPickFilter label="Areas" options={areaOptions} selected={areaFilter} onChange={setAreaFilter} />
              <MultiPickFilter
                label="Types"
                options={QUARTER_TYPE_OPTIONS}
                selected={typeFilter}
                onChange={setTypeFilter}
              />

              {/* Rows per page */}
              <div className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3 transition-colors focus-within:border-altus-red hover:border-hairline-strong">
                <span className="text-[13px] font-semibold text-ink-subtle">Rows</span>
                <Select
                  value={String(rowsPerPage)}
                  onValueChange={(v) => setRowsPerPage(v === "all" ? "all" : Number(v))}
                  ariaLabel="Rows per page"
                  unstyled
                  className="flex min-w-[2.5rem] cursor-pointer items-center gap-1 text-[13px] font-bold text-ink-strong"
                  options={[
                    { value: "25", label: "25" },
                    { value: "50", label: "50" },
                    { value: "100", label: "100" },
                    { value: "all", label: "All" },
                  ]}
                />
              </div>

              {/* Columns - show/hide the optional columns; Area, Goal, Target,
                  % Done stay structural and are never in this list. */}
              <ColumnsPicker
                visibleCols={visibleCols}
                onChange={setVisibleCols}
                colOrder={colOrder}
                onReorder={setColOrder}
              />
            </>
          )}

          {/* Export */}
          <button
            type="button"
            onClick={exportCsv}
            disabled={displayed.length === 0}
            aria-label="Export visible goals to CSV"
            className={`inline-flex shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
          >
            <Download size={14} strokeWidth={2.4} /> Export
          </button>

          {/* Bulk upload */}
          {canWrite && (
            <GoalsBulkUpload
              employeeId={props.viewedEmployeeId}
              level={props.level}
              periodKey={props.periodKey}
              areaOptions={areaOptions}
              measureOptions={measureOptions}
              typeOptions={typeOptions}
              roster={props.roster}
              existingTitles={levelGoals
                .filter((g) => g.periodKey === props.periodKey)
                .map((g) => g.title)}
            />
          )}
        </div>

        {/* Sort pauses drag-reorder - tell the user how to get it back. */}
        {canWrite && policy.canReorder && sortKey !== "position" && view === "list" && (
          <p className="wg-rise -mt-3 mb-4 text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
            Sorted by {SORT_OPTIONS.find((o) => o.value === sortKey)?.label} - drag-to-reorder is paused.
            Switch back to <button type="button" onClick={() => setSortKey("position")} className="cursor-pointer font-bold text-altus-red underline underline-offset-2">Sr. No.</button> to reorder.
          </p>
        )}

        {/* First-run: empty PERSONAL space → offer to copy from Professional. */}
        {props.space === "personal" && goals.length === 0 && <PersonalStartPrompt />}

        {/* ── The board body - HIERARCHICAL frozen-parent Kanban, or the
            classic inline-editable list. The Kanban owns its OWN DndContext
            (its draggables are CHILD-level cards, re-homed via the shared
            moveToBucket); the list keeps the board's period-pill DndContext. ── */}
        {dashboard ? (
          <GoalsDashboard
            allGoals={goals}
            level={props.level}
            fyStartYear={fy}
            roster={props.roster}
            weekCards={weekCards}
            viewedName={props.viewedName}
            viewedEmployeeId={props.viewedEmployeeId}
            childrenByParent={childrenByParent}
            managesViewed={props.managesViewed}
            isAdmin={props.isAdmin}
            filters={dashboardFilters}
            onFiltersChange={setDashboardFilters}
          />
        ) : kanban ? (
          <HierarchyKanban
            onRehomeLevel={rehomeToLevel}
            onCascadeChild={cascadeToChild}
            parentLevel={parentLevel}
            fyStartYear={fy}
            selectedKey={props.periodKey}
            goals={goals}
            filterGoal={filterGoal}
            filtersActive={activeFilterCount > 0}
            cardProps={sharedCardProps}
            childrenByParent={childrenByParent}
            roster={props.roster}
            viewedEmployeeId={props.viewedEmployeeId}
            viewedName={props.viewedName}
            canWrite={canWrite}
            policy={policy}
            onRehome={moveToBucket}
            onReorder={reorderChildIds}
            weekCards={weekCards}
            onRehomeWeek={rehomeWeekCard}
            focusId={props.focusId ?? null}
          />
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            accessibility={{ announcements: dndAnnouncements, screenReaderInstructions: dndInstructions }}
          >
            <div className="flex flex-col gap-3.5">
              {inBucket.length === 0 ? (
                <EmptyState periodLabel={periodKeyLabel(props.periodKey)} />
              ) : displayed.length === 0 ? (
                <div className="rounded-2xl border border-hairline-strong bg-surface-card px-6 py-8 text-center">
                  <p className="text-[15px] font-bold text-ink-strong">No goals match these filters</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`mt-3 cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-altus-red px-4 py-2 text-[13px] font-bold text-white ${FOCUS_RING}`}
                  >
                    <X size={14} strokeWidth={2.6} /> Clear filters
                  </button>
                </div>
              ) : (
                /* The goals LIST is now a prominent inline-editable TABLE
                   (Area · Goal · Measure · Target/Actual · %Done · Team% ·
                   Members · Share · Type + bulk bar). */
                <GoalTableView
                  ownerNameOf={ownerNameOf}
                  goals={pagedGoals}
                  canWrite={canWrite}
                  isAdmin={props.isAdmin}
                  roster={props.roster}
                  projects={props.projects}
                  vendors={props.vendors}
                  areaOptions={areaOptions}
                  measureOptions={measureOptions}
                  typeOptions={typeOptions}
                  goaltypeOptions={goaltypeOptions}
                  customLookups={customLookups}
                  fyStartYear={fy}
                  codeOf={codeOf}
                  level={props.level}
                  actions={LEVEL_TABLE_ACTIONS}
                  visibleCols={visibleCols}
                  colOrder={colOrder}
                  onColOrderChange={setColOrder}
                />
              )}

              {rowsPerPage !== "all" && displayed.length > pagedGoals.length && (
                <button
                  type="button"
                  onClick={() => setRowsPerPage("all")}
                  className={`mt-3 self-start cursor-pointer rounded-full border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong ${FOCUS_RING}`}
                >
                  Show all ({displayed.length - pagedGoals.length} more)
                </button>
              )}

              {/* Capture goals with AI + Add New Goal - side by side. */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {canWrite && props.captureEnabled && (
                  <GoalCaptureBox
                    employeeId={props.viewedEmployeeId}
                    level={props.level}
                    periodKey={props.periodKey}
                    voiceEnabled={props.voiceEnabled}
                    levelLabel={
                      { year: "Yearly", quarter: "Quarterly", month: "Monthly", week: "Weekly", day: "Daily" }[
                        props.level
                      ] ?? props.level
                    }
                  />
                )}

                {canWrite && (
                  <BoardQuickAdd
                    ref={quickAddRef}
                    compact
                    employeeId={props.viewedEmployeeId}
                    level={props.level}
                    periodKey={props.periodKey}
                    parent={parentGoal}
                    areaOptions={areaOptions}
                    measureOptions={measureOptions}
                    typeOptions={typeOptions}
                    customLookups={customLookups}
                    isAdmin={props.isAdmin}
                    roster={props.roster}
                    projects={props.projects}
                    vendors={props.vendors}
                    currentCount={inBucket.length}
                    mutation={mutation}
                    existingTitles={levelGoals
                      .filter((g) => g.periodKey === props.periodKey)
                      .map((g) => g.title)}
                  />
                )}
              </div>
            </div>

            {/* Drag ghost - a lean copy of the row being carried. The overlay
                wrapper defaults to the ACTIVE node's size (a full-width row!),
                which looked like a giant white bar sweeping the page - size it
                to the ghost's own content instead. */}
            <DragOverlay
              dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2,0,0,1)" }}
              style={{ width: "max-content", height: "auto" }}
            >
              {activeDrag && (
                <div
                  className="flex items-center gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card)), var(--color-surface-card))",
                    borderColor: "color-mix(in srgb, var(--color-altus-red) 48%, transparent)",
                    boxShadow:
                      "0 28px 64px -14px rgba(225,6,0,0.4), 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.6)",
                    transform: "rotate(-2.5deg) scale(1.04)",
                    cursor: "grabbing",
                  }}
                >
                  <ProgressRing pct={effectiveGoalPct(activeDrag)} tone="slate" />
                  <span className="max-w-[320px] truncate text-[14.5px] font-bold" style={{ color: "var(--color-ink-strong)" }}>
                    {activeDrag.title}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* One shared archive dialog for the whole board. */}
      <ArchiveGoalDialog
        goal={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={(g) => {
          setArchiveTarget(null);
          void mutation
            .mutate({ type: "remove", id: g.id }, () => archiveGoal({ id: g.id }))
            .then((ok) => {
              if (ok) fireToast({ message: "Moved to the Recycle Bin.", type: "success" });
            });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View toggle - List ⇄ Kanban segmented control                       */
/* ------------------------------------------------------------------ */

function ViewToggleButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      className={`cursor-pointer inline-flex h-full items-center gap-1.5 px-3 text-[12.5px] font-bold transition-colors ${FOCUS_RING}`}
      style={
        active
          ? {
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              color: "#fff",
              boxShadow: "0 6px 14px -8px var(--color-altus-red-deep)",
            }
          : { background: "transparent", color: "var(--color-ink-subtle)" }
      }
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* GoalStatChip - a light, flat stat chip for the Quarterly header,     */
/* modeled 1:1 on the Tasks page's own StatChip (task-list-page.tsx):   */
/* tone dot · bold number · label, no shadows, no icon tiles. Clicking  */
/* toggles the board's existing `completion` quick-chip filter.         */
/* ------------------------------------------------------------------ */

export function GoalStatChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "slate" | "green" | "amber" | "red" | "blue" | "yellow" | "orange";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? "Remove" : "Add"} ${label.toLowerCase()} filter`}
      className="group inline-flex items-center gap-2 rounded-xl transition-colors cursor-pointer"
      style={{
        padding: "5px 10px",
        background: active
          ? `color-mix(in srgb, var(--color-${tone}) 8%, var(--color-surface-card))`
          : "var(--color-surface-card)",
        boxShadow: active
          ? `inset 0 0 0 1.5px var(--color-${tone}-deep)`
          : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <span
        aria-hidden
        className="inline-block size-2 rounded-full shrink-0"
        style={{ background: `var(--color-${tone})` }}
      />
      <span
        className="tabular-nums leading-none text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 16,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span
        className="font-semibold leading-none"
        style={{ fontSize: 11.5, color: active ? `var(--color-${tone}-deep)` : "var(--color-ink-soft)" }}
      >
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* MultiPickFilter - a checklist popover pill, shared by the toolbar's   */
/* Area / Type filters. Empty selection reads as "All <noun>".          */
/* ------------------------------------------------------------------ */

export function MultiPickFilter({
  label,
  options,
  selected,
  onChange,
  compact,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Tighter pill - for toolbars with many controls (e.g. Weekly's, which
   *  also carries the ritual chips + bulk upload on the same line). */
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const active = selected.size > 0;
  const summary =
    selected.size === 0
      ? `All ${label}`
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} ${label}`;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center rounded-pill border font-bold transition-all cursor-pointer ${
            compact ? "h-7 gap-1 px-2 text-[11px]" : "h-9 gap-1.5 px-3.5 text-[13px]"
          } ${FOCUS_RING}`}
          style={
            active
              ? {
                  borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
                  background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }
              : { borderColor: "var(--color-hairline)", background: "var(--color-surface-card)", color: "var(--color-ink-soft)" }
          }
        >
          {summary}
          <ChevronDown size={compact ? 11 : 14} strokeWidth={2.4} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1.5">
        <div className="max-h-[280px] overflow-auto">
          {options.length === 0 && (
            <p className="px-2 py-2 text-[12.5px] text-ink-subtle">No {label.toLowerCase()} yet.</p>
          )}
          {options.map((o) => {
            const checked = selected.has(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
              >
                <span
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded border"
                  style={
                    checked
                      ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" }
                      : { borderColor: "var(--color-hairline-strong)" }
                  }
                >
                  {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o}</span>
              </button>
            );
          })}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className={`mt-1 flex w-full cursor-pointer items-center justify-center rounded-md py-1.5 text-[12px] font-bold text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong ${FOCUS_RING}`}
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* ColumnsPicker - show/hide + drag-reorder the table's columns.        */
/* ------------------------------------------------------------------ */

export function ColumnsPicker({
  visibleCols,
  onChange,
  colOrder,
  onReorder,
  compact,
}: {
  visibleCols: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Left-to-right column order (Target/% Done included - they can move,
   *  just never hide). Omitted → REORDERABLE_COLUMNS' declared order and the
   *  list renders without drag handles (order becomes fixed). */
  colOrder?: string[];
  onReorder?: (next: string[]) => void;
  /** Tighter pill - for toolbars with many controls (e.g. Weekly's). */
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [dragKey, setDragKey] = React.useState<string | null>(null);
  const declared = React.useMemo(() => REORDERABLE_COLUMNS.map((c) => c.key), []);
  const order = colOrder ?? declared;
  const byKey = React.useMemo(() => new Map(REORDERABLE_COLUMNS.map((c) => [c.key, c])), []);
  const draggable = !!onReorder;

  // Pointer-based reorder, NOT the native HTML5 draggable attribute - native
  // drag-start never reliably fires from inside a Radix Popover's portal
  // (its pointer-down handling swallows the gesture before dragstart can
  // begin), so a plain draggable/onDragStart version silently did nothing.
  // This tracks the button held down on the grip handle and re-sorts live as
  // the pointer crosses another row, ending on the next pointerup anywhere.
  const orderRef = React.useRef(order);
  React.useEffect(() => {
    orderRef.current = order;
  }, [order]);
  const dragKeyRef = React.useRef<string | null>(null);

  function startDrag(key: string) {
    if (!draggable) return;
    dragKeyRef.current = key;
    setDragKey(key);
  }
  function crossRow(targetKey: string) {
    const from0 = dragKeyRef.current;
    if (!onReorder || !from0 || from0 === targetKey) return;
    const cur = orderRef.current;
    const from = cur.indexOf(from0);
    const to = cur.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    const next = [...cur];
    next.splice(from, 1);
    next.splice(to, 0, from0);
    orderRef.current = next;
    onReorder(next);
  }
  React.useEffect(() => {
    if (!draggable) return;
    function endDrag() {
      dragKeyRef.current = null;
      setDragKey(null);
    }
    window.addEventListener("pointerup", endDrag);
    return () => window.removeEventListener("pointerup", endDrag);
  }, [draggable]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center rounded-pill border border-hairline bg-surface-card font-bold text-ink-soft transition-all hover:border-hairline-strong hover:text-ink-strong cursor-pointer ${
            compact ? "h-7 gap-1 px-2 text-[11px]" : "h-9 gap-1.5 px-3.5 text-[13px]"
          } ${FOCUS_RING}`}
        >
          <Columns3 size={compact ? 11 : 14} strokeWidth={2.2} /> Columns
          <ChevronDown size={compact ? 11 : 14} strokeWidth={2.4} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1.5">
        {draggable && (
          <p className="px-2 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
            Drag to reorder
          </p>
        )}
        {order.map((key) => {
          const c = byKey.get(key);
          if (!c) return null;
          const checked = visibleCols.has(key);
          return (
            <div
              key={key}
              onPointerEnter={() => crossRow(key)}
              onPointerUp={() => crossRow(key)}
              className={`flex w-full select-none items-center gap-1 rounded-md transition-opacity ${dragKey === key ? "opacity-40" : ""}`}
            >
              {draggable && (
                <span
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startDrag(key);
                  }}
                  className="shrink-0 cursor-grab touch-none text-ink-subtle/60 active:cursor-grabbing"
                  aria-hidden="true"
                >
                  <GripVertical size={13} strokeWidth={2.2} />
                </span>
              )}
              <button
                type="button"
                disabled={!c.pickable}
                onClick={() => {
                  if (!c.pickable) return; // structural - position moves, visibility doesn't
                  const next = new Set(visibleCols);
                  if (checked) next.delete(key);
                  else next.add(key);
                  onChange(next);
                }}
                className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-surface-soft disabled:cursor-default disabled:hover:bg-transparent ${
                  c.pickable ? "cursor-pointer" : "cursor-default"
                } ${FOCUS_RING}`}
              >
                {c.pickable ? (
                  <span
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded border"
                    style={
                      checked
                        ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" }
                        : { borderColor: "var(--color-hairline-strong)" }
                    }
                  >
                    {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                  </span>
                ) : (
                  <span className="inline-flex size-4 shrink-0" aria-hidden="true" />
                )}
                {c.label}
              </button>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({ periodLabel }: { periodLabel: string }) {
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <span
        className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
      >
        <Target size={30} strokeWidth={2.2} />
      </span>
      <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
        No goals in {periodLabel} yet
      </h3>
      <p className="mx-auto mt-2 max-w-[46ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
        Add the first goal below - or drag a card here from another period. Goals added
        here land in this exact bucket.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Archive confirmation (soft-delete → Recycle Bin, recoverable)        */
/* ------------------------------------------------------------------ */

function ArchiveGoalDialog({
  goal,
  onClose,
  onConfirm,
}: {
  goal: GoalDTO | null;
  onClose: () => void;
  onConfirm: (g: GoalDTO) => void;
}) {
  const open = goal != null;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6"
          style={{ border: "1px solid var(--color-hairline-strong)", boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red)" }}
            >
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-bold text-ink-strong" style={{ fontSize: 19, letterSpacing: "-0.01em" }}>
                Move to the Recycle Bin?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                “{goal?.title ?? ""}” is archived, not deleted - restore it any time from
                Goals → Recycle Bin.
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`cursor-pointer rounded-pill border border-hairline-strong px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => goal && onConfirm(goal)}
              className={`inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px ${FOCUS_RING}`}
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              Move to Recycle Bin
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
