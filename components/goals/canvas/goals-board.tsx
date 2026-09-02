"use client";

/**
 * Goals Canvas — GOALS BOARD, the Phase-4 Kanban representation (design §2.5
 * + the ops dense-layout spec §4 — docs/superpowers/specs/
 * 2026-07-19-goals-ops-dense-layout-SPEC.md).
 *
 * A DOMAIN REBUILD informed by components/tasks/kanban-board.tsx (the 999-line
 * production board): we take its infinite-canvas mechanics — wheel-to-
 * horizontal panning, hold-Space grab-hand with a capture-phase mousedown
 * swallow, `flex-[1_0_280px]` viewport-auto-resizing columns, frozen lane
 * headers over per-column scroll, `.kanban-scroll` slim bars, dnd-kit
 * MouseSensor(6)/TouchSensor(220)/KeyboardSensor + autoScroll + rotate-2
 * DragOverlay, `.kanban-hovercard` staggered quick-peek — and rebuild the
 * DOMAIN for goals:
 *
 *   · Lanes are MEANINGFUL, never status theatre (spec §4):
 *       cascade stages (year/quarter): category (drop → setGoalCategory) ·
 *       health band (derived, grouping-only) · child period (drop →
 *       moveGoalToPeriod — drag a card between Q1/Q3 or Jul/Aug, bug #8);
 *       weekly stages (month/week/day): week (drop → moveWeeklyToWeek — every
 *       Monday the month owns gets a lane, even empty) · health ·
 *       adopted (drop → setWeeklyAdopted).
 *   · Cards carry the ring, inline effective %, contribution badge and — for
 *     writers (canWrite; the Exec/Ops split is gone) — an inline % micro-
 *     slider; everything richer lives in the staggered hovercard quick-peek.
 *     NO modals.
 *   · Available at EVERY zoom level; `r=board` is pure URL state orthogonal
 *     to zoom — switching NEVER refetches.
 *
 * Writes route per table (§4.3): cascade drops through the shell's
 * GoalMutationApi (goals actions), weekly drops through WeeklyMutationApi
 * (weekly actions ONLY — ritual stamps live on weekly_goals).
 *
 * HARD LAWS: zero queries; amber identity (brand-red forbidden — the only red
 * is semantic #b91c1c); grouping-only lanes SAY so and disable drag (no dead
 * affordances); pan/zoom are state+scroll — never CSS zoom/transform on a
 * wrapping element (Radix portals, globals.css:135).
 */

import * as React from "react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AlignLeft, CalendarRange, HeartPulse, Loader2, Lock, Move, Plus, Tag, X } from "lucide-react";
import {
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  monthKey as calMonthKeyOf,
  monthKeysOfQuarter,
  quarterKey as calQuarterKeyOf,
  quarterOfKey,
  quartersOfFy,
} from "@/lib/goals/types";
import { weeksOfMonth } from "@/lib/goals/fy-calendar";
import {
  categoryStyle,
  effectiveGoalPct,
  fmtNum,
  goalCode,
  isSpillover,
  originStyle,
  pctTone,
  periodKeyShort,
  GOAL_CATEGORIES,
  type GoalCategory,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, accentMix } from "./tokens";
import {
  asNum,
  deriveHealth,
  numericTarget,
  HEALTH_STYLE,
  type HealthBand,
} from "@/lib/goals/derive";
import {
  addChildGoal,
  createGoal,
  moveGoalToPeriod,
  moveWeeklyToWeek,
  setGoalCategory,
  setGoalPctDone,
} from "@/app/(app)/goals/cascade/actions";
import { setWeeklyAdopted } from "@/app/(app)/goals/weekly/actions";
import { setCommitProgress } from "@/app/(app)/goals/commit/actions";
import { fireToast } from "@/lib/toast";
import { AnimatedNumber, ContributionBadge } from "./allocation";
import { DROP_LEVEL_LABEL, endGoalDrag, getGoalDragSnapshot, publishGoalDrag, publishOverLevel } from "./drag-bridge";
import { HealthChip, Ring } from "./goal-container";
import { LEVEL_DOCK_PREFIX, LevelDock, useLevelDrop } from "./level-drop";
import { buildOptimisticGoal } from "./optimistic";
import { useCanvasShell } from "./shell-context";
import { useCanvasStage, monthNameOf, weekNoOf, weekRangeLabel } from "./stage";
import { LANE_MODES, ZOOM_LEVELS, type LaneMode, type WeeklyDTO, type ZoomLevel } from "./types";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/* Accent + ramp come from the design contract (tokens.ts, §2.0). */
const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Lane groupings. Which are offered — and which accept drops — depends on
 *  the zoom stage (spec §4). URL-backed (`lane=`) so deep-links restore.
 *  LANE_MODES/LaneMode live in types.ts so pages can name a default lane. */
const laneParser = parseAsStringLiteral(LANE_MODES);

const HEALTH_ORDER: HealthBand[] = ["at-risk", "spillover", "on-track", "ahead", "done"];

/** Ritual-lock bounce copy (Phase 6, Option B light) — one sentence, same
 *  spirit as POLICY_REASONS: says who CAN still edit. */
const RITUAL_LOCK_MSG =
  "This week is committed — only an admin or the owner's manager can move its goals.";

/* ------------------------------------------------------------------ */
/* Board model                                                         */
/* ------------------------------------------------------------------ */

type BoardCard =
  | { kind: "goal"; id: string; g: GoalDTO }
  | { kind: "weekly"; id: string; w: WeeklyDTO };

interface BoardLane {
  key: string;
  label: string;
  sub?: string;
  color: string;
  deep: string;
  /** Card-over tint for the column background. */
  bg: string;
  /** Focused/current bucket (e.g. the week you're zoomed into). */
  highlight: boolean;
  /** Ritual lock (Phase 6, Option B light): true when the week lane holds
   *  committed/approved rows — drops bounce unless the viewer has Option-A
   *  structure rights. Affordance only; punch gates keep reading the real
   *  columns server-side. Week lanes only. */
  locked?: boolean;
  cards: BoardCard[];
}

const cardEff = (c: BoardCard): number =>
  c.kind === "goal" ? effectiveGoalPct(c.g) : (c.w.acceptPct ?? c.w.pctDone);

const cardPeriodKey = (c: BoardCard): string =>
  c.kind === "goal" ? c.g.periodKey : c.w.weekStart;

const cardSpill = (c: BoardCard): boolean =>
  c.kind === "goal" ? isSpillover(c.g) : c.w.spillover;

/* ------------------------------------------------------------------ */
/* GoalsBoard                                                          */
/* ------------------------------------------------------------------ */

export function GoalsBoard(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { canWrite, mutation, weeklyMutation, viewedName, policy } = shell;
  // Phase 5 — the shared level-drop flow (sidebar bridge + dock share it).
  const levelDrop = useLevelDrop();
  const z = stage.z;
  const focus = stage.focus;
  const now = stage.now;

  /** Weekly stages (month/week/day) board WEEKLY rows; cascade stages board
   *  the focus's cascade children. Day boards the month like week (the Daily
   *  fold-in is a later phase — the board stays available, spec §4). */
  const cardKind: "goal" | "weekly" = z === "year" || z === "quarter" ? "goal" : "weekly";

  const modes: LaneMode[] =
    cardKind === "goal" ? ["category", "health", "period"] : ["week", "health", "adopted"];
  const [laneRaw, setLaneRaw] = useQueryState("lane", laneParser);
  // Phase 3 front door — the page may name the default lane (period columns on
  // /goals/quarterly + /monthly); a bare URL stays clean, `lane=` still wins.
  const fallbackLane: LaneMode =
    shell.defaultLane && modes.includes(shell.defaultLane)
      ? shell.defaultLane
      : (modes[0] ?? "category");
  const mode: LaneMode = laneRaw && modes.includes(laneRaw) ? laneRaw : fallbackLane;
  /** Only these lane modes mean something when a card is dropped. Period lanes
   *  are writable too (bug #8 — drop re-periods via moveGoalToPeriod); only the
   *  derived health grouping stays view-only. */
  const modeWritable =
    mode === "category" || mode === "week" || mode === "adopted" || mode === "period";
  const dragEnabled = canWrite && modeWritable;

  /* ----- the boarded rows (math over the FULL set; display filtered) ----- */
  const allChildren = React.useMemo<GoalDTO[]>(
    () => (cardKind === "goal" && focus ? (stage.maps.childrenOf.get(focus.id) ?? []) : []),
    [cardKind, focus, stage.maps],
  );
  const goalCards = React.useMemo<GoalDTO[]>(() => {
    if (cardKind !== "goal") return [];
    if (!shell.filter || shell.filter.id === "all") return allChildren;
    return allChildren.filter(shell.filter.predicate);
  }, [cardKind, allChildren, shell.filter]);

  /** bug #9 — the boarded MONTH is derived independently of a month GOAL row:
   *  the focused week's month, else the stage's effective month (focused month
   *  goal → picked ?pk → ?wk → now). Zero month goals no longer means "Nothing
   *  to board" (or the wrong month's lanes) while weekly rows exist. */
  const boardMonthKey =
    cardKind === "weekly" ? (stage.week?.weekStart.slice(0, 7) ?? stage.monthKey) : null;

  const monthRows = React.useMemo<WeeklyDTO[]>(
    () => (boardMonthKey ? (stage.maps.weeklyByMonth.get(boardMonthKey) ?? []) : []),
    [boardMonthKey, stage.maps],
  );

  /** Contribution basis — always the FULL sibling set + the parent's own
   *  numeric target (locked decision: basis = parent target). On the weekly
   *  stages the month goal is OPTIONAL parent-context only (bug #9): it feeds
   *  the basis solely when it actually owns the boarded month. */
  const parentGoal =
    cardKind === "weekly"
      ? focus?.period === "month" && focus.periodKey === boardMonthKey
        ? focus
        : null
      : focus;
  const parentTarget = parentGoal ? numericTarget(parentGoal) : null;
  const parentShort = parentGoal ? periodKeyShort(parentGoal.periodKey) : "";
  const siblingsGoal = allChildren;
  const siblingsWeekly = monthRows;

  /* ----- lanes ----- */
  const focusedWeekStart = stage.week?.weekStart ?? null;
  // ?q front door — the PICKED/addressed period bucket (?pk carrier, bug #14):
  // its period lane keeps the highlight ring and scrolls into view below.
  const pickedPk = shell.zoom.pk;
  const lanes = React.useMemo<BoardLane[]>(() => {
    const empty = (
      key: string,
      label: string,
      color: string,
      deep: string,
      bg: string,
      extra?: Partial<BoardLane>,
    ): BoardLane => ({ key, label, color, deep, bg, highlight: false, cards: [], ...extra });

    if (cardKind === "goal") {
      const cards: Array<Extract<BoardCard, { kind: "goal" }>> = goalCards.map((g) => ({
        kind: "goal",
        id: g.id,
        g,
      }));
      if (mode === "category") {
        const byCat = new Map<string, BoardLane>(
          GOAL_CATEGORIES.map((c) => {
            const s = categoryStyle(c, false);
            return [c, empty(c, s.label, s.color, s.color, s.bg)];
          }),
        );
        for (const c of cards) {
          const key = GOAL_CATEGORIES.includes(c.g.category as GoalCategory)
            ? c.g.category
            : "goal";
          byCat.get(key)?.cards.push(c);
        }
        return [...byCat.values()];
      }
      if (mode === "health") {
        const byBand = new Map<HealthBand, BoardLane>(
          HEALTH_ORDER.map((b) => {
            const s = HEALTH_STYLE[b];
            return [b, empty(b, s.label, s.color, s.color, s.bg)];
          }),
        );
        for (const c of cards) {
          const h = deriveHealth(cardEff(c), cardPeriodKey(c), now, { spillover: cardSpill(c) });
          byBand.get(h.band)?.cards.push(c);
        }
        // Only show bands that exist — five mostly-empty lanes read as noise.
        return [...byBand.values()].filter((l) => l.cards.length > 0);
      }
      // mode === "period" — the child buckets under the focus. Phase 3 front
      // door: lanes carry CALENDAR identity — "Q1" over its month span
      // ("Apr – Jun"), "Jul" over its calendar year — and the CURRENT
      // quarter/month plus the ?q-addressed column keep the highlight ring.
      const periodLane = (k: string): BoardLane => {
        const isQ = /-Q[1-4]$/.test(k);
        let span: string | undefined;
        if (isQ) {
          const months = monthKeysOfQuarter(fyStartYearOfKey(k), quarterOfKey(k));
          const first = months[0];
          const last = months[months.length - 1];
          span = first && last ? `${periodKeyShort(first)} – ${periodKeyShort(last)}` : undefined;
        } else {
          span = k.slice(0, 4); // month lane — its calendar year
        }
        const isNow = isQ ? k === calQuarterKeyOf(now) : k === calMonthKeyOf(now);
        return empty(k, periodKeyShort(k), ACCENT, ACCENT_DEEP, accentMix(8), {
          sub: span,
          highlight: isNow || k === pickedPk,
        });
      };
      const keys =
        focus?.period === "year"
          ? quartersOfFy(Number(focus.periodKey))
          : focus?.period === "quarter"
            ? monthKeysOfQuarter(fyStartYearOfKey(focus.periodKey), quarterOfKey(focus.periodKey))
            : [];
      const byKey = new Map<string, BoardLane>(keys.map((k) => [k, periodLane(k)]));
      for (const c of cards) {
        if (!byKey.has(c.g.periodKey)) byKey.set(c.g.periodKey, periodLane(c.g.periodKey));
        byKey.get(c.g.periodKey)?.cards.push(c);
      }
      return [...byKey.values()];
    }

    /* ----- weekly stages ----- */
    const cards: Array<Extract<BoardCard, { kind: "weekly" }>> = monthRows.map((w) => ({
      kind: "weekly",
      id: w.id,
      w,
    }));
    if (mode === "week") {
      // EVERY Monday the boarded month owns gets a lane, even when empty —
      // that's what makes the board a real planning surface (spec §4). Keyed
      // off the goal-independent boardMonthKey (bug #9), not a month goal.
      const mondays =
        boardMonthKey && /^\d{4}-\d{2}$/.test(boardMonthKey)
          ? weeksOfMonth(
              fyStartYearOfMonthKey(boardMonthKey),
              Number(boardMonthKey.slice(5, 7)) - 1,
            ).map((w) => w.mondayISO)
          : [];
      const byWeek = new Map<string, BoardLane>(
        mondays.map((m) => [
          m,
          empty(m, `W${weekNoOf(m)}`, ACCENT, ACCENT_DEEP, accentMix(8), {
            sub: weekRangeLabel(m),
            highlight: m === focusedWeekStart,
          }),
        ]),
      );
      for (const c of cards) {
        if (!byWeek.has(c.w.weekStart))
          byWeek.set(
            c.w.weekStart,
            empty(c.w.weekStart, `W${c.w.weekNo}`, ACCENT, ACCENT_DEEP, accentMix(8), {
              sub: weekRangeLabel(c.w.weekStart),
              highlight: c.w.weekStart === focusedWeekStart,
            }),
          );
        byWeek.get(c.w.weekStart)?.cards.push(c);
      }
      // Phase 6 ritual lock — a week whose rows carry the Saturday/Monday
      // stamps (committed/approved mirrors) reads as frozen.
      for (const l of byWeek.values())
        l.locked = l.cards.some((c) => c.kind === "weekly" && (c.w.committed || c.w.approved));
      return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, l]) => l);
    }
    if (mode === "health") {
      const byBand = new Map<HealthBand, BoardLane>(
        HEALTH_ORDER.map((b) => {
          const s = HEALTH_STYLE[b];
          return [b, empty(b, s.label, s.color, s.color, s.bg)];
        }),
      );
      for (const c of cards) {
        const h = deriveHealth(cardEff(c), cardPeriodKey(c), now, { spillover: cardSpill(c) });
        byBand.get(h.band)?.cards.push(c);
      }
      return [...byBand.values()].filter((l) => l.cards.length > 0);
    }
    // mode === "adopted"
    const adopted = empty("adopted", "Adopted", "#15803d", "#166534", "rgba(21,128,61,0.08)", {
      sub: "counts toward the week",
    });
    const dropped = empty("dropped", "Dropped", "#64748b", "#475569", "rgba(100,116,139,0.08)", {
      sub: "excluded from the week",
    });
    for (const c of cards) (c.w.adopted ? adopted : dropped).cards.push(c);
    return [adopted, dropped];
  }, [cardKind, goalCards, monthRows, mode, focus, boardMonthKey, now, focusedWeekStart, pickedPk]);

  const cardById = React.useMemo(() => {
    const m = new Map<string, BoardCard>();
    for (const l of lanes) for (const c of l.cards) m.set(c.id, c);
    return m;
  }, [lanes]);

  /* ----- canvas panning (ported mechanics — tasks kanban lines 117-223) ----- */
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const spaceHeld = React.useRef(false);
  const panState = React.useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);

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
    // Wheel over the board pans horizontally — unless the pointer sits over a
    // lane list that can still consume the vertical scroll itself.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // A REAL two-finger horizontal swipe: hand it straight to the browser.
      // This used to run `scrollLeft += deltaX` + preventDefault, which replaced
      // the platform's inertial scroll with one discrete jump per wheel tick —
      // no momentum, no rubber-band, and it fought the container's own smooth
      // scrolling. Returning without preventDefault lets the native scroller
      // consume deltaX on `overflow-x: auto`, which is what makes trackpad
      // panning feel right.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // Shift+wheel is the MOUSE convention for horizontal, and a plain mouse
      // only ever reports deltaY — so these still need translating by hand.
      if (e.shiftKey) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
        return;
      }
      const colList = (e.target instanceof HTMLElement ? e.target : null)?.closest<HTMLElement>(
        "[data-col-scroll]",
      );
      if (colList && colList.scrollHeight > colList.clientHeight + 1) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    // Hold Space → grab-hand pan. Field-safe; never steals Space from
    // buttons/links (dnd-kit keyboard pick-up stays intact).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (isTypingTarget(t) || t?.closest("button, a, [role='button']")) return;
      e.preventDefault();
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
    // Capture-phase swallow: while Space is held the MouseSensor must never
    // see a mousedown, or a card drag would start mid-pan.
    const onMouseDown = (e: MouseEvent) => {
      if (!spaceHeld.current) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!spaceHeld.current) return;
      panState.current = { startX: e.clientX, startY: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      el.style.cursor = "grabbing";
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = panState.current;
      if (!p) return;
      el.scrollLeft = p.left - (e.clientX - p.startX);
      el.scrollTop = p.top - (e.clientY - p.startY);
    };
    const onPointerUp = () => {
      if (!panState.current) return;
      panState.current = null;
      el.style.cursor = spaceHeld.current ? "grab" : "";
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, []);

  /* ----- ?q deep-link scroll (Phase 3 front door) ----- */
  // Bring the addressed period column into view (the ring comes from
  // lane.highlight). pk's shape is regex-validated in zoom-state, so the
  // attribute selector is injection-safe. Scrolls the BOARD only (inline axis
  // + block:nearest) — never yanks the page vertically. Reduced-motion-gated.
  React.useEffect(() => {
    if (!pickedPk || mode !== "period") return;
    const col = boardRef.current?.querySelector<HTMLElement>(`[data-lane-key="${pickedPk}"]`);
    if (!col) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    col.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [pickedPk, mode]);

  /* ----- Phase 5 — the drag-to-sidebar BRIDGE (brief §4) -----
     The five Goals nav pills live OUTSIDE this DndContext, so a level drop is
     hit-tested by hand: on drag start we publish the goal to the bridge store
     (the sidebar paints itself) and cache the `[data-goal-drop-level]` rects;
     a window pointermove maps the pointer to a level (refreshing rects on any
     scroll/resize); onDragEnd reads the store back. Keyboard drags never hit
     the sidebar — the keyboard path is MoveGoalControl's "Move to…". */
  const navRects = React.useRef<Array<{ level: ZoomLevel; rect: DOMRect }>>([]);
  const bridgeCleanup = React.useRef<(() => void) | null>(null);

  const startBridge = React.useCallback(
    (g: GoalDTO) => {
      publishGoalDrag(g, {
        canRehomeLevel: policy.canRehomeLevel,
        canReQuarter: policy.canReQuarter,
      });
      const refresh = () => {
        navRects.current = [...document.querySelectorAll<HTMLElement>("[data-goal-drop-level]")]
          .map((el) => ({
            level: el.dataset.goalDropLevel as ZoomLevel,
            rect: el.getBoundingClientRect(),
          }))
          .filter((e) => (ZOOM_LEVELS as readonly string[]).includes(e.level));
      };
      refresh();
      const onMove = (e: PointerEvent) => {
        const hit = navRects.current.find(
          ({ rect }) =>
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom,
        );
        publishOverLevel(hit?.level ?? null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("scroll", refresh, { capture: true, passive: true });
      window.addEventListener("resize", refresh);
      bridgeCleanup.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("scroll", refresh, { capture: true });
        window.removeEventListener("resize", refresh);
        bridgeCleanup.current = null;
      };
    },
    [policy],
  );
  const endBridge = React.useCallback(() => {
    bridgeCleanup.current?.();
    endGoalDrag();
  }, []);
  React.useEffect(() => endBridge, [endBridge]); // never leak past unmount

  /* ----- dnd ----- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overLane, setOverLane] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    // Bridge + dock activate for goals-table cards only (weekly rows cross
    // tables through their own verbs — the week lanes stay their home).
    const card = cardById.get(id);
    if (card?.kind === "goal" && dragEnabled) startBridge(card.g);
  };
  const onDragOver = (e: DragOverEvent) =>
    setOverLane(e.over ? String(e.over.id).replace(/^lane:/, "") : null);

  const onDragEnd = (e: DragEndEvent) => {
    const id = activeId;
    setActiveId(null);
    setOverLane(null);
    // Read the bridge's hit-test BEFORE tearing the drag state down.
    const bridgeLevel = getGoalDragSnapshot().overLevel;
    endBridge();
    if (!id) return;
    const card = cardById.get(id);
    if (!card || !dragEnabled) return;

    // Phase 5 — a LEVEL drop (sidebar bridge, or a dock chip droppable) wins
    // over whatever lane the collision detection reports (closestCorners
    // always names SOME lane): run the level-drop flow and never also fire
    // the same-level lane drop.
    if (card.kind === "goal") {
      const overId = e.over ? String(e.over.id) : null;
      const dockLevel = overId?.startsWith(LEVEL_DOCK_PREFIX)
        ? (overId.slice(LEVEL_DOCK_PREFIX.length) as ZoomLevel)
        : null;
      const targetLevel = bridgeLevel ?? dockLevel;
      if (targetLevel) {
        levelDrop.performLevelDrop(card.g, targetLevel);
        return;
      }
    }
    if (!e.over) return;
    const laneKey = String(e.over.id).replace(/^lane:/, "");

    if (mode === "category" && card.kind === "goal") {
      if (card.g.category === laneKey || !GOAL_CATEGORIES.includes(laneKey as GoalCategory)) return;
      setSavingId(id);
      void mutation
        .mutate({ type: "update", id, fields: { category: laneKey } }, () =>
          setGoalCategory({ id, category: laneKey as GoalCategory }),
        )
        .finally(() => setSavingId(null));
      return;
    }
    if (mode === "period" && card.kind === "goal") {
      // bug #8 — drag a card between SIBLING period lanes (Q1→Q3, Jul→Aug).
      // The optimistic patch moves only periodKey; the returned server row
      // reconciles position (+ any parent re-link) when the action settles.
      const laneShapeOk =
        card.g.period === "quarter"
          ? /^\d{4}-Q[1-4]$/.test(laneKey)
          : card.g.period === "month"
            ? /^\d{4}-\d{2}$/.test(laneKey)
            : false;
      if (card.g.periodKey === laneKey || !laneShapeOk) return;
      setSavingId(id);
      void mutation
        .mutate({ type: "update", id, fields: { periodKey: laneKey } }, () =>
          moveGoalToPeriod({ id, periodKey: laneKey }),
        )
        .finally(() => setSavingId(null));
      return;
    }
    if (mode === "week" && card.kind === "weekly" && weeklyMutation) {
      if (card.w.weekStart === laneKey || !/^\d{4}-\d{2}-\d{2}$/.test(laneKey)) return;
      // Phase 6 ritual lock (Option B light) — a committed/approved row, or a
      // drop INTO a frozen week lane, bounces unless the viewer holds Option-A
      // structure rights (admin / the owner's manager keep editing).
      if (
        (card.w.committed || card.w.approved || lanes.find((l) => l.key === laneKey)?.locked) &&
        !policy.canRehomeLevel
      ) {
        fireToast({ message: RITUAL_LOCK_MSG, type: "error" });
        return;
      }
      setSavingId(id);
      void weeklyMutation
        .mutate(
          {
            type: "update",
            id,
            fields: { weekStart: laneKey, monthKey: laneKey.slice(0, 7), weekNo: weekNoOf(laneKey) },
          },
          () => moveWeeklyToWeek({ id, weekStart: laneKey }),
        )
        .finally(() => setSavingId(null));
      return;
    }
    if (mode === "adopted" && card.kind === "weekly" && weeklyMutation) {
      const next = laneKey === "adopted";
      if (card.w.adopted === next) return;
      // Ritual lock — adopting/dropping mutates the committed set too.
      if ((card.w.committed || card.w.approved) && !policy.canRehomeLevel) {
        fireToast({ message: RITUAL_LOCK_MSG, type: "error" });
        return;
      }
      setSavingId(id);
      void weeklyMutation
        .mutate({ type: "update", id, fields: { adopted: next } }, () =>
          setWeeklyAdopted({ id, adopted: next }),
        )
        .finally(() => setSavingId(null));
    }
  };

  /* ----- inline % (Ops) — routes per table ----- */
  const commitPct = React.useCallback(
    (card: BoardCard, n: number) => {
      const next = clampPct(n);
      if (card.kind === "goal") {
        if (next === card.g.pctDone) return;
        void mutation.mutate({ type: "update", id: card.id, fields: { pctDone: next } }, () =>
          setGoalPctDone({ id: card.id, pctDone: next }),
        );
      } else if (weeklyMutation) {
        if (next === card.w.pctDone) return;
        void weeklyMutation.mutate({ type: "update", id: card.id, fields: { pctDone: next } }, () =>
          setCommitProgress({ id: card.id, pctDone: next }),
        );
      }
    },
    [mutation, weeklyMutation],
  );

  /* ----- Phase 6 a11y — roving tabindex over the columns + dnd announcements ----- */
  // ONE column carries tabIndex=0 (the last one focused, else the first);
  // Arrow keys walk siblings inside BoardLaneCol.
  const [roveKey, setRoveKey] = React.useState<string | null>(null);
  const tabbableKey =
    roveKey != null && lanes.some((l) => l.key === roveKey) ? roveKey : (lanes[0]?.key ?? null);

  const cardTitleOf = React.useCallback(
    (id: string | number) => {
      const c = cardById.get(String(id));
      return c ? (c.kind === "goal" ? c.g.title : c.w.title) : "the card";
    },
    [cardById],
  );
  // Names a droppable for the screen reader — a lane, or a level-dock chip.
  const dropTargetName = React.useCallback(
    (overId: string | number) => {
      const s = String(overId);
      if (s.startsWith(LEVEL_DOCK_PREFIX)) {
        const lvl = s.slice(LEVEL_DOCK_PREFIX.length) as ZoomLevel;
        return `the ${DROP_LEVEL_LABEL[lvl]} level`;
      }
      const lane = lanes.find((l) => `lane:${l.key}` === s);
      return lane ? `the ${lane.label} lane` : null;
    },
    [lanes],
  );

  const activeCard = activeId ? (cardById.get(activeId) ?? null) : null;
  const total = lanes.reduce((n, l) => n + l.cards.length, 0);
  // Phase 3 front door — a card-less PERIOD board still renders its calendar
  // columns (each an invitation with a "+ Add to Qn" footer), never the
  // whole-board empty state; other modes keep the honest empty message.
  const showLanes = total > 0 || (mode === "period" && cardKind === "goal" && lanes.length > 0);

  const modeMeta: Record<LaneMode, { label: string; icon: React.ReactNode; writable: boolean }> = {
    category: { label: "Category", icon: <Tag size={12} strokeWidth={2.6} />, writable: true },
    health: { label: "Health", icon: <HeartPulse size={12} strokeWidth={2.6} />, writable: false },
    period: { label: cardKind === "goal" && z === "year" ? "Quarter" : "Month", icon: <CalendarRange size={12} strokeWidth={2.6} />, writable: true }, // bug #8
    week: { label: "Week", icon: <CalendarRange size={12} strokeWidth={2.6} />, writable: true },
    adopted: { label: "Adopted", icon: <Move size={12} strokeWidth={2.6} />, writable: true },
  };

  return (
    <section aria-label="Goals board" className="flex min-w-0 flex-col gap-2.5">
      {/* board header: lane grouping + honesty about what a drop does */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Board · <span className="tabular-nums">{total}</span>
          {cardKind === "goal" && focus && (
            <span className="normal-case tracking-normal">
              {" "}
              — under {periodKeyShort(focus.periodKey)}
            </span>
          )}
          {/* bug #9 — the weekly header names the boarded calendar month, which
              exists even when no month GOAL row does. */}
          {cardKind === "weekly" && boardMonthKey && (
            <span className="normal-case tracking-normal"> — {monthNameOf(boardMonthKey)}</span>
          )}
        </h3>
        <div
          role="group"
          aria-label="Group lanes by"
          className="flex items-center rounded-chip border p-0.5"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
        >
          {modes.map((m) => {
            const meta = modeMeta[m];
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => void setLaneRaw(m)}
                title={
                  meta.writable
                    ? `Lane by ${meta.label.toLowerCase()} — drop a card to move it`
                    : `Lane by ${meta.label.toLowerCase()} — derived grouping (drag disabled)`
                }
                className="inline-flex h-6.5 items-center gap-1 rounded-[8px] px-2 text-[11px] font-bold transition-colors"
                style={
                  active
                    ? { color: "#fff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }
                    : { color: "var(--color-ink-muted)" }
                }
              >
                {meta.icon}
                {meta.label}
                {!meta.writable && <Lock size={9} strokeWidth={2.6} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[11px] font-semibold text-ink-faint max-md:hidden">
          {dragEnabled
            ? "drag cards between lanes · hold Space to pan · wheel scrolls"
            : modeWritable
              ? "view-only — hold Space to pan"
              : "auto-grouped (derived) — hold Space to pan"}
        </span>
      </div>

      {/* bug #18 — the scroll container renders UNCONDITIONALLY (empty state
          INSIDE it): the pan/wheel effect runs once with deps [] and reads
          boardRef.current at mount, so a board that mounted empty used to
          leave the listeners forever unbound even after cards arrived. */}
      <Tooltip.Provider delayDuration={500} skipDelayDuration={0}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          autoScroll={{ threshold: { x: 0.28, y: 0 }, acceleration: 16 }}
          // Phase 5 — the LevelDock mounts MID-drag (on drag start); Always
          // re-measures droppables on changes so its chips get live rects.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          // Phase 6 a11y — goal-domain announcements (dnd-kit renders them in
          // its own aria-live region) + honest keyboard instructions.
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "To pick up a goal card, press Space or Enter. While dragging, use the arrow keys to move it over a lane or a level chip, then press Space or Enter again to drop it. Press Escape to cancel.",
            },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${cardTitleOf(active.id)}.`,
              onDragOver: ({ active, over }) => {
                const t = over ? dropTargetName(over.id) : null;
                return t ? `${cardTitleOf(active.id)} is over ${t}.` : undefined;
              },
              onDragEnd: ({ active, over }) => {
                const t = over ? dropTargetName(over.id) : null;
                return t
                  ? `Dropped ${cardTitleOf(active.id)} on ${t}.`
                  : `Dropped ${cardTitleOf(active.id)}.`;
              },
              onDragCancel: ({ active }) => `Cancelled moving ${cardTitleOf(active.id)}.`,
            },
          }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setOverLane(null);
            endBridge();
          }}
        >
          <div
            ref={boardRef}
            className="kanban-scroll flex items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-2 max-sm:snap-x max-sm:snap-mandatory"
            style={{ height: "min(720px, calc(100dvh - 330px))", minHeight: 420, scrollBehavior: "auto" }}
          >
            {!showLanes ? (
              <div
                className="flex flex-1 items-center justify-center rounded-section border px-5 py-10 text-center"
                style={{ borderColor: accentMix(40), background: accentMix(5) }}
              >
                <p className="text-[15px] italic text-ink-muted" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
                  Nothing to board at this level yet — add goals from the toolbar or the List view.
                </p>
              </div>
            ) : (
              lanes.map((lane) => (
                <BoardLaneCol
                  key={lane.key}
                  lane={lane}
                  droppable={dragEnabled}
                  isCardOver={activeId != null && overLane === lane.key}
                  tabbable={lane.key === tabbableKey}
                  onRove={() => setRoveKey(lane.key)}
                >
                  {lane.cards.length === 0 && (
                    <div
                      className="rounded-chip px-3 py-6 text-center"
                      style={{ border: "1.5px dashed var(--color-hairline-strong)" }}
                    >
                      <p className="text-[12.5px] font-semibold text-ink-subtle">
                        {/* period columns: an empty bucket is an invitation, not an error */}
                        {mode === "period" && cardKind === "goal"
                          ? `Nothing in ${lane.label} yet.`
                          : dragEnabled
                            ? "Drop a card here."
                            : "Empty."}
                      </p>
                    </div>
                  )}
                  {lane.cards.map((c) => (
                    <BoardCardView
                      key={c.id}
                      card={c}
                      dragDisabled={!dragEnabled}
                      saving={savingId === c.id}
                      now={now}
                      canWrite={canWrite}
                      viewedName={viewedName}
                      siblingsGoal={siblingsGoal}
                      siblingsWeekly={siblingsWeekly}
                      parentTarget={parentTarget}
                      parentShort={parentShort}
                      onDrill={c.kind === "goal" ? () => stage.drillGoal(c.id) : undefined}
                      onCommitPct={(n) => commitPct(c, n)}
                    />
                  ))}
                  {/* Phase 3 front door — per-column "+ Add to Qn/Jul" footer:
                      quick-adds INTO this lane's bucket (reuses the toolbar's
                      addChildGoal/createGoal verb; period lanes only). */}
                  {mode === "period" && cardKind === "goal" && canWrite && (
                    <LaneQuickAdd
                      periodKey={lane.key}
                      period={focus?.period === "year" ? "quarter" : "month"}
                      parentGoalId={focus?.id ?? null}
                    />
                  )}
                </BoardLaneCol>
              ))
            )}
          </div>

          {/* Phase 5 — in-canvas LEVEL DOCK: touch/collapsed-sidebar/mobile
              fallback drop targets, mounted only while a goal card drags. */}
          <LevelDock />

          {/* floating drag preview (rotate-2, amber depth) */}
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
            {activeCard ? <DragPreview card={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      </Tooltip.Provider>

      {/* Phase 5 — screen-reader announcement of the last level drop. */}
      <span role="status" aria-live="polite" className="sr-only">
        {levelDrop.announcement}
      </span>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Lane column — frozen header, per-column scroll                      */
/* ------------------------------------------------------------------ */

function BoardLaneCol(props: {
  lane: BoardLane;
  droppable: boolean;
  isCardOver: boolean;
  /** Roving tabindex (Phase 6 a11y): exactly ONE column is tabbable; Arrow
   *  keys walk siblings, Home/End jump. Focusing a column roves the stop. */
  tabbable: boolean;
  onRove: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { lane } = props;
  const { setNodeRef } = useDroppable({ id: `lane:${lane.key}`, disabled: !props.droppable });
  // Arrow-walk between sibling columns — only when the COLUMN itself has
  // focus (never hijacks arrows inside cards, sliders or the quick-add).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
      return;
    const cols = [
      ...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-lane-key]") ?? []),
    ];
    const i = cols.indexOf(e.currentTarget);
    if (i < 0) return;
    e.preventDefault(); // consumed — never scrolls the page
    const next =
      e.key === "ArrowRight"
        ? Math.min(i + 1, cols.length - 1)
        : e.key === "ArrowLeft"
          ? Math.max(i - 1, 0)
          : e.key === "Home"
            ? 0
            : cols.length - 1;
    if (next !== i) cols[next]?.focus();
  };
  return (
    <div
      ref={setNodeRef}
      data-lane-key={lane.key} /* ?q deep-link scroll target */
      role="group"
      aria-label={`${lane.label} column — ${lane.cards.length} ${lane.cards.length === 1 ? "card" : "cards"}${lane.locked ? " · committed (frozen)" : ""}`}
      tabIndex={props.tabbable ? 0 : -1}
      onFocus={(e) => {
        if (e.target === e.currentTarget) props.onRove();
      }}
      onKeyDown={onKeyDown}
      className="relative flex flex-col overflow-hidden flex-[1_0_280px] max-w-[420px] max-sm:flex-[0_0_82vw] max-sm:max-w-none max-sm:snap-center rounded-section p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        outlineColor: lane.deep,
        background: props.isCardOver ? lane.bg : "var(--color-surface-soft)",
        border: `1px solid ${
          props.isCardOver
            ? lane.color
            : lane.highlight
              ? `color-mix(in srgb, ${lane.color} 45%, transparent)`
              : "var(--color-hairline)"
        }`,
        boxShadow: lane.highlight
          ? `0 0 0 2px color-mix(in srgb, ${lane.color} 25%, transparent), 0 12px 28px -22px rgba(15,23,42,0.22)`
          : "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -22px rgba(15,23,42,0.22)",
        touchAction: "manipulation",
      }}
    >
      {/* lane accent strip */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-30"
        style={{
          height: 3,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: `linear-gradient(90deg, ${lane.color}, ${lane.deep})`,
        }}
      />
      {/* frozen header — only the card list below scrolls */}
      <div
        className="z-20 -mx-3 -mt-3 mb-2.5 flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3.5"
        style={{ background: "inherit", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <span className="flex min-w-0 items-center gap-2" style={{ color: lane.deep }}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lane.color }} />
          <span className="min-w-0">
            <span
              className="block truncate font-bold"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 14.5, letterSpacing: "-0.005em" }}
            >
              {lane.label}
            </span>
            {lane.sub && (
              <span className="block truncate text-[11px] font-bold text-ink-subtle">{lane.sub}</span>
            )}
          </span>
        </span>
        {/* Phase 6 ritual lock — subtle "committed" chip; drops onto this
            lane bounce (admin / the owner's manager keep editing). */}
        {lane.locked && (
          <span
            title="Committed — the Saturday freeze stamped this week. Drops bounce; an admin or the owner's manager can still edit."
            className="inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
            style={{
              color: ACCENT_DEEP,
              background: accentMix(12),
              border: `1px solid ${accentMix(30)}`,
            }}
          >
            <Lock size={9} strokeWidth={2.8} aria-hidden="true" />
            Committed
          </span>
        )}
        <span
          className="shrink-0 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums"
          style={{
            color: lane.deep,
            background: `color-mix(in srgb, ${lane.color} 13%, var(--color-surface-card))`,
            border: `1px solid color-mix(in srgb, ${lane.color} 28%, transparent)`,
          }}
        >
          {lane.cards.length}
        </span>
      </div>
      <div
        data-col-scroll
        className="kanban-scroll -mr-1.5 flex min-h-[40px] flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1.5"
      >
        {props.children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-column quick-add — "+ Add to Q2" (Phase 3 front door)           */
/* ------------------------------------------------------------------ */

/**
 * Footer quick-add of a PERIOD lane: mints a goal INTO the column's bucket,
 * reusing the toolbar's exact write verb — under the boarded parent via
 * addChildGoal (bug #7), parentless createGoal otherwise — through the shell's
 * optimistic spine (temp card lands in the column instantly). An empty column
 * plus this footer reads as an invitation, not an error. Keyboard-first:
 * Enter commits, Esc closes; the input sits outside any draggable so the dnd
 * sensors never see it.
 */
function LaneQuickAdd(props: {
  /** The lane's bucket — a quarter ("2026-Q2") or month ("2026-07") key. */
  periodKey: string;
  period: "quarter" | "month";
  /** The boarded parent (the focused year/quarter goal), when one exists. */
  parentGoalId: string | null;
}): React.JSX.Element {
  const shell = useCanvasShell();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const short = periodKeyShort(props.periodKey); // "Q2" · "Jul"
  const close = () => {
    setOpen(false);
    setTitle("");
  };
  const commit = () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const temp = {
      ...buildOptimisticGoal({
        employeeId: shell.viewedEmployeeId,
        period: props.period,
        periodKey: props.periodKey,
        title: t,
      }),
      parentGoalId: props.parentGoalId,
    };
    void shell.mutation
      .mutate({ type: "insert", row: temp }, () =>
        props.parentGoalId
          ? addChildGoal({ parentId: props.parentGoalId, periodKey: props.periodKey, title: t })
          : createGoal({
              employeeId: shell.viewedEmployeeId,
              period: props.period,
              periodKey: props.periodKey,
              title: t,
            }),
      )
      .then((ok) => {
        if (!ok) return; // mutate already toasted the error
        fireToast({ message: `Goal added to ${short}`, type: "success" });
        close();
      })
      .finally(() => setBusy(false));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 inline-flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded-chip border text-[12px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
        style={{ borderColor: accentMix(40), background: accentMix(4) }}
      >
        <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
        Add to {short}
      </button>
    );
  }
  return (
    <div
      className="mt-0.5 flex shrink-0 items-center gap-1 rounded-chip border py-1 pl-2.5 pr-1"
      style={{ borderColor: accentMix(45), background: accentMix(5) }}
    >
      <input
        ref={inputRef}
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        aria-label={`New goal in ${short}`}
        placeholder={`New goal · ${short}…`}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
      />
      <button
        type="button"
        onClick={commit}
        disabled={busy || title.trim().length === 0}
        aria-label={`Add goal to ${short}`}
        className="inline-flex h-6.5 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[11.5px] font-bold text-white disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2.6} />}
        Add
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Cancel quick add"
        className="inline-flex size-6.5 shrink-0 items-center justify-center rounded-[8px] text-ink-subtle transition-colors hover:text-ink-strong"
      >
        <X size={12} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline % micro-slider (Ops) — shielded from the drag sensors        */
/* ------------------------------------------------------------------ */

function MiniPct(props: { pct: number; label: string; onCommit: (n: number) => void }): React.JSX.Element {
  const [local, setLocal] = React.useState(props.pct);
  React.useEffect(() => setLocal(props.pct), [props.pct]);
  const tone = pctTone(local);
  return (
    <div
      className="flex items-center gap-1.5"
      // Shield: the slider lives INSIDE a dnd-kit draggable — swallow the
      // pointer/keyboard starts so dragging the thumb never drags the card.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={(e) => props.onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End")
            props.onCommit(Number((e.target as HTMLInputElement).value));
        }}
        aria-label={props.label}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
        style={{
          accentColor: tone.color,
          background: `linear-gradient(90deg, ${tone.color} ${local}%, var(--color-hairline-strong) ${local}%)`,
        }}
      />
      <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums" style={{ color: tone.color }}>
        {local}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

interface BoardCardViewProps {
  card: BoardCard;
  dragDisabled: boolean;
  saving: boolean;
  now: Date;
  canWrite: boolean;
  viewedName: string;
  siblingsGoal: readonly GoalDTO[];
  siblingsWeekly: readonly WeeklyDTO[];
  parentTarget: number | null;
  parentShort: string;
  onDrill?: () => void;
  onCommitPct: (n: number) => void;
}

function BoardCardView(props: BoardCardViewProps): React.JSX.Element {
  const { card } = props;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.id,
    disabled: props.dragDisabled,
  });

  const eff = cardEff(card);
  const tone = pctTone(eff);
  const h = deriveHealth(eff, cardPeriodKey(card), props.now, { spillover: cardSpill(card) });
  const stripe =
    card.kind === "goal"
      ? originStyle(card.g).color
      : card.w.spillover && eff < 100
        ? "#b91c1c"
        : card.w.cascade
          ? "#1e3a8a"
          : "#111827";
  const dim = card.kind === "weekly" && !card.w.adopted;
  const title = card.kind === "goal" ? card.g.title : card.w.title;
  const codeLabel = card.kind === "goal" ? goalCode(card.g) : `W${card.w.weekNo}`;
  const measure = measureLine(card);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={props.dragDisabled ? "" : "cursor-grab active:cursor-grabbing"}
      style={{ opacity: isDragging ? 0.4 : dim ? 0.6 : 1 }}
    >
      <Tooltip.Root delayDuration={500}>
        <Tooltip.Trigger asChild>
          <div
            className="group relative rounded-chip border p-3 pl-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline)",
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            }}
          >
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
              style={{ background: stripe }}
            />
            {/* zone 1 — identity */}
            <div className="flex items-center gap-2">
              <Ring pct={eff} size={22} stroke={3} />
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-subtle">{codeLabel}</span>
              <span className="min-w-0 flex-1" />
              {props.saving && <Loader2 size={12} className="shrink-0 animate-spin text-ink-subtle" />}
              <span className="shrink-0 text-[14px] font-black" style={{ color: tone.color }}>
                <AnimatedNumber value={`${eff}%`} />
              </span>
            </div>
            {props.onDrill ? (
              <button
                type="button"
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDrill?.();
                }}
                className={`mt-1.5 block w-full text-left text-[13.5px] font-bold leading-snug text-ink-strong transition-colors hover:underline ${dim ? "line-through" : ""}`}
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                title={`Open ${title}`}
              >
                {title}
              </button>
            ) : (
              <span
                className={`mt-1.5 block text-[13.5px] font-bold leading-snug text-ink-strong ${dim ? "line-through" : ""}`}
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {title}
              </span>
            )}
            {/* zone 2 — vitals */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <HealthChip h={h} />
              {card.kind === "goal" ? (
                <ContributionBadge
                  child={card.g}
                  siblings={props.siblingsGoal}
                  parentTarget={props.parentTarget}
                  parentShort={props.parentShort}
                />
              ) : (
                <ContributionBadge
                  child={card.w}
                  siblings={props.siblingsWeekly}
                  parentTarget={props.parentTarget}
                  parentShort={props.parentShort}
                />
              )}
            </div>
            {/* zone 3 — measure + inline % (spec §4: ONE extra line). Unified
                surface: gated by canWrite/content, NOT a view mode (§2.7 —
                view-only unmounts the slider, keeps the measure line). */}
            {(measure != null || props.canWrite) && (
              <div className="mt-2 flex flex-col gap-1.5">
                {measure && (
                  <span className="text-[11px] font-semibold tabular-nums text-ink-subtle">{measure}</span>
                )}
                {props.canWrite ? (
                  <MiniPct pct={card.kind === "goal" ? card.g.pctDone : card.w.pctDone} label={`Progress for ${title}`} onCommit={props.onCommitPct} />
                ) : null}
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
            <GoalPeekCard card={props.card} h={h} viewedName={props.viewedName} parentShort={props.parentShort} siblingsGoal={props.siblingsGoal} siblingsWeekly={props.siblingsWeekly} parentTarget={props.parentTarget} />
            <Tooltip.Arrow width={14} height={7} style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

function measureLine(card: BoardCard): string | null {
  const src = card.kind === "goal" ? card.g : card.w;
  const tq = asNum(src.targetQty);
  const aq = asNum(src.actualQty);
  const ta = asNum(src.targetAmount);
  const aa = asNum(src.actualAmount);
  if (tq != null || aq != null) {
    const uom = src.uom ? ` ${src.uom}` : "";
    return `Tgt ${tq != null ? fmtNum(tq) : "—"}${uom} · Act ${aq != null ? fmtNum(aq) : "—"}${uom}`;
  }
  if (ta != null || aa != null)
    return `Tgt ₹${ta != null ? fmtNum(ta) : "—"} · Act ₹${aa != null ? fmtNum(aa) : "—"}`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Drag preview                                                        */
/* ------------------------------------------------------------------ */

function DragPreview({ card }: { card: BoardCard }): React.JSX.Element {
  const eff = cardEff(card);
  const title = card.kind === "goal" ? card.g.title : card.w.title;
  const codeLabel = card.kind === "goal" ? goalCode(card.g) : `W${card.w.weekNo}`;
  return (
    <div
      className="relative w-[280px] rotate-2 cursor-grabbing rounded-chip border p-3 pl-3.5"
      style={{
        background: "var(--color-surface-card)",
        borderColor: accentMix(45),
        boxShadow: `0 24px 60px -16px rgba(15,23,42,0.35), 0 8px 20px -8px ${accentMix(30)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
        style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      />
      <div className="flex items-center gap-2">
        <Ring pct={eff} size={22} stroke={3} />
        <span className="text-[11px] font-bold tabular-nums text-ink-subtle">{codeLabel}</span>
        <span className="ml-auto text-[14px] font-black tabular-nums" style={{ color: pctTone(eff).color }}>
          {eff}%
        </span>
      </div>
      <span
        className="mt-1.5 block text-[13.5px] font-bold leading-snug text-ink-strong"
        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {title}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hovercard quick-peek (no modal — spec §4)                           */
/* ------------------------------------------------------------------ */

function PeekMeta(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div
        className="text-ink-subtle"
        style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}
      >
        {props.label}
      </div>
      <div className="mt-0.5 truncate text-ink-strong" style={{ fontSize: 13.5, fontWeight: 600 }}>
        {props.value}
      </div>
    </div>
  );
}

function GoalPeekCard(props: {
  card: BoardCard;
  h: ReturnType<typeof deriveHealth>;
  viewedName: string;
  parentShort: string;
  siblingsGoal: readonly GoalDTO[];
  siblingsWeekly: readonly WeeklyDTO[];
  parentTarget: number | null;
}): React.JSX.Element {
  const { card, h } = props;
  const eff = cardEff(card);
  const tone = pctTone(eff);
  const title = card.kind === "goal" ? card.g.title : card.w.title;
  const codeLabel = card.kind === "goal" ? goalCode(card.g) : `W${card.w.weekNo}`;
  const notes = card.kind === "goal" ? card.g.notes?.trim() : null;
  const area = card.kind === "goal" ? card.g.area : card.w.area;
  const measure = measureLine(card);
  const cat = card.kind === "goal" ? categoryStyle(card.g.category, isSpillover(card.g)) : null;
  const origin = card.kind === "goal" ? originStyle(card.g) : null;
  const DELAY = ["40ms", "95ms", "150ms", "205ms", "260ms"] as const;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface-card"
      style={{
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
      }}
    >
      <span
        aria-hidden="true"
        className="hc-accent absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${h.color}, ${h.color})` }}
      />
      <div className="p-4.5 pt-5">
        {/* pills */}
        <div className="hc-item flex flex-wrap items-center gap-1.5" style={{ animationDelay: DELAY[0] }}>
          <HealthChip h={h} />
          {cat && (
            <span
              className="inline-flex items-center rounded-chip px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ color: cat.color, background: cat.bg }}
            >
              {cat.label}
            </span>
          )}
          {origin && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-subtle">
              <span className="size-2 rounded-full" style={{ background: origin.color }} aria-hidden="true" />
              {origin.label}
            </span>
          )}
          {card.kind === "weekly" && (
            <span
              className="inline-flex items-center rounded-chip px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={
                card.w.adopted
                  ? { color: "#15803d", background: "rgba(21,128,61,0.10)" }
                  : { color: "#64748b", background: "rgba(100,116,139,0.10)" }
              }
            >
              {card.w.adopted ? "Adopted" : "Dropped"}
            </span>
          )}
        </div>

        <h3
          className="hc-item mt-3 text-ink-strong"
          style={{ animationDelay: DELAY[1], fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: "-0.01em" }}
        >
          <span className="tabular-nums text-ink-subtle">{codeLabel} · </span>
          {title}
        </h3>

        {/* progress bar with the pace expectation marker */}
        <div className="hc-item mt-3" style={{ animationDelay: DELAY[2] }}>
          <div className="flex items-baseline justify-between text-[11px] font-bold text-ink-subtle">
            <span>
              Effective <span className="tabular-nums" style={{ color: tone.color }}>{eff}%</span>
            </span>
            <span>
              expected pace <span className="tabular-nums">{h.expected}%</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: accentMix(10) }}>
            <span className="block h-full rounded-full" style={{ width: `${eff}%`, background: tone.color }} />
            <span
              aria-hidden="true"
              className="absolute bottom-0 top-0 w-[2px]"
              style={{ left: `${h.expected}%`, background: "var(--color-ink-subtle)", opacity: 0.6 }}
              title="Expected pace"
            />
          </div>
        </div>

        {notes !== null && (
          <div className="hc-item mt-3" style={{ animationDelay: DELAY[3] }}>
            <div
              className="flex items-center gap-1.5 text-ink-subtle"
              style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" }}
            >
              <AlignLeft size={12} strokeWidth={2.4} /> Notes
            </div>
            {notes ? (
              <p
                className="mt-1 whitespace-pre-wrap text-ink-soft"
                style={{ fontSize: 13, lineHeight: 1.55, maxHeight: 132, overflowY: "auto" }}
              >
                {notes}
              </p>
            ) : (
              <p className="mt-1 italic text-ink-subtle" style={{ fontSize: 12.5 }}>
                No notes yet.
              </p>
            )}
          </div>
        )}

        <div className="hc-item my-3 h-px bg-hairline" style={{ animationDelay: DELAY[3] }} />

        <div className="hc-item grid grid-cols-2 gap-x-4 gap-y-3" style={{ animationDelay: DELAY[4] }}>
          <PeekMeta label="Measure" value={measure ?? "unmeasured"} />
          <PeekMeta label="Area" value={area?.trim() || "—"} />
          <PeekMeta
            label="Contribution"
            value={contributionLabel(card, props)}
          />
          <PeekMeta label="Owner" value={props.viewedName} />
        </div>
      </div>
    </div>
  );
}

/** Text form of the contribution chip for the peek grid (same canonical math
 *  as the badge — via ContributionBadge's underlying derive helpers). */
function contributionLabel(
  card: BoardCard,
  props: { parentTarget: number | null; parentShort: string },
): string {
  const src = card.kind === "goal" ? card.g : card.w;
  const target = asNum(src.targetQty) ?? asNum(src.targetAmount);
  if (target == null) return "unmeasured";
  if (props.parentTarget == null || props.parentTarget <= 0) return `${fmtNum(target)} of ?`;
  const pct = Math.round((target / props.parentTarget) * 1000) / 10;
  return `${pct}% of ${props.parentShort || "parent"}`;
}
