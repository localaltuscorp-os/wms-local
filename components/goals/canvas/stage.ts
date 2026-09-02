"use client";

/**
 * Goals Canvas — STAGE DERIVATION (Phase 3, design §2.1).
 *
 * ONE hook, `useCanvasStage()`, derives everything the two-workspace shell
 * renders from the shell context: the LEFT parent-context subject (the
 * objective you drilled INTO), the RIGHT child planner's contents (the level
 * below), the breadcrumb-as-zoom chain (FY ▸ AQ2 ▸ Jul ▸ W3), and the drill
 * navigation. Pure client derivation over the already-loaded optimistic tree —
 * ZERO queries (§3.3).
 *
 * Level semantics (matches useZoomState + the proven zoom-canvas convention):
 *   z = the FOCUSED objective's level. LEFT shows the focused node; RIGHT
 *   shows its children one level down. At `year` the LEFT collapses to a slim
 *   FY summary (§2.2 — "at Year the objective IS the canvas"). At `week` the
 *   focused subject is the week itself (wk = its Monday) with the month goal
 *   as parent context; RIGHT lists the week's weekly_goals rows — EDITABLE
 *   (Phase 3 folded Week in as a real stage). `day` renders the folded-in
 *   Plan-Your-Day surface (Phase 5 — see ChildPlanner's DayStage).
 */

import * as React from "react";
import {
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  monthKey as monthKeyOf,
  monthKeysOfQuarter,
  quarterKey as quarterKeyOf,
  quarterKeyOfMonthKey,
  quarterOfKey,
  quartersOfFy,
} from "@/lib/goals/types";
import { weeksOfMonth, weekNoOf } from "@/lib/goals/fy-calendar";
import { deriveHealth, effective } from "@/lib/goals/derive";
import { periodKeyLabel } from "@/components/goals/cascade/util";
import { useCanvasShell } from "./shell-context";
import type { ActiveGoalFilter } from "./smart-toolbar"; // type-only — no cycle
import type { WeeklyServerRow } from "./optimistic";
import { ZOOM_LEVELS, type GoalDTO, type WeeklyDTO, type ZoomLevel } from "./types";

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthNameOf(monthKey: string): string {
  return MONTHS_FULL[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;
}

// bug #23 — ONE week-numbering model: the canonical FY (Apr–Mar) `weekNoOf`
// from lib/goals/fy-calendar. The old local Jan-1 calendar copy here numbered
// July "W29" while the cascade generator wrote "~W15" — deleted; consumers
// keep importing from this module via the re-export below.
export { weekNoOf };

/** "Jul 14 – 20" (or "Jul 28 – Aug 3" across a month edge). */
export function weekRangeLabel(weekStart: string): string {
  const s = new Date(`${weekStart}T00:00:00`);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  const sm = MONTHS_SHORT[s.getMonth()] ?? "";
  const em = MONTHS_SHORT[e.getMonth()] ?? "";
  return s.getMonth() === e.getMonth()
    ? `${sm} ${s.getDate()} – ${e.getDate()}`
    : `${sm} ${s.getDate()} – ${em} ${e.getDate()}`;
}

/** Monday of the week containing `d`, LOCAL time, as "YYYY-MM-DD". */
export function mondayKeyOf(d: Date): string {
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
  const mm = String(m.getMonth() + 1).padStart(2, "0");
  const dd = String(m.getDate()).padStart(2, "0");
  return `${m.getFullYear()}-${mm}-${dd}`;
}

/** Which goal level a period key's shape names ("2026" / "2026-Q2" / "2026-07"). */
export function periodOfKey(periodKey: string): "year" | "quarter" | "month" | null {
  if (/^\d{4}$/.test(periodKey)) return "year";
  if (/^\d{4}-Q[1-4]$/.test(periodKey)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(periodKey)) return "month";
  return null;
}

/**
 * The EFFECTIVE focus for a zoom state — the single source of truth every
 * consumer (panels, KPI band, quick-add) must agree on (bug #5). A same-level
 * URL `?focus` wins; then a same-level PICKED bucket (`?pk=`, bug #14);
 * otherwise the goal owning the "now" bucket at this level; otherwise `null` —
 * never the lexically-first goal (that fallback is what put a stray January on
 * screen and made the write bucket diverge from the pane).
 */
export function resolveEffectiveFocus(params: {
  goals: GoalDTO[];
  z: ZoomLevel;
  wk: string | null;
  /** Last PICKED period key (`?pk=`) — a goal-less tab click carries it. */
  pk?: string | null;
  focusedGoal: GoalDTO | null;
  fyStartYear: number;
  now: Date;
}): GoalDTO | null {
  const { goals, z, wk, pk, focusedGoal, fyStartYear, now } = params;
  const goalLevel: "year" | "quarter" | "month" =
    z === "year" || z === "quarter" ? z : "month"; // week/day anchor on the month
  if (focusedGoal && focusedGoal.period === goalLevel) return focusedGoal;

  const atLevel = goals
    .filter((g) => g.period === goalLevel)
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey) || a.position - b.position);

  // bug #14 — the CLICKED bucket wins over the "now" fallback: its goal when
  // one exists, else null (an empty picked quarter/month must render empty,
  // never silently snap back to the current period).
  if (pk && periodOfKey(pk) === goalLevel) {
    return atLevel.find((g) => g.periodKey === pk) ?? null;
  }
  if (atLevel.length === 0) return null;

  let nowKey: string;
  if (goalLevel === "year") {
    nowKey = String(fyStartYear);
  } else if (goalLevel === "quarter") {
    const k = quarterKeyOf(now);
    nowKey = fyStartYearOfKey(k) === fyStartYear ? k : `${fyStartYear}-Q1`;
  } else {
    const k = wk ? wk.slice(0, 7) : monthKeyOf(now);
    nowKey =
      fyStartYearOfMonthKey(k) === fyStartYear
        ? k
        : (monthKeysOfQuarter(fyStartYear, 1)[0] ?? k);
  }
  return atLevel.find((g) => g.periodKey === nowKey) ?? null;
}

/**
 * Phase 3 front door (?q sugar) — a CHILD-level pk at year zoom (a quarter
 * key, written by the /goals/quarterly?q=Qn deep-link) addresses one of the
 * board's COLUMNS, not the stage subject (resolveEffectiveFocus rightly
 * ignores it: the shapes mismatch). Resolve the goal owning that bucket —
 * position-first, parented or not — so the KpiStrip and the LEFT rail can
 * scope to the addressed quarter. Null unless exactly this shape (an empty
 * addressed column still highlights/scrolls on the board; there is just no
 * goal to scope to).
 */
export function resolveAddressedChild(
  goals: GoalDTO[],
  z: ZoomLevel,
  pk: string | null,
): GoalDTO | null {
  if (z !== "year" || !pk || !/^\d{4}-Q[1-4]$/.test(pk)) return null;
  return (
    goals
      .filter((g) => g.period === "quarter" && g.periodKey === pk)
      .sort((a, b) => a.position - b.position)[0] ?? null
  );
}

/** Map a returned weekly server row → the client WeeklyDTO shape (the weekly
 *  overlay reconciles with this after every weekly action settles). */
export function weeklyRowToDto(row: WeeklyServerRow): WeeklyDTO {
  return {
    id: row.id,
    weekStart: row.weekStart,
    monthKey: row.weekStart.slice(0, 7),
    weekNo: weekNoOf(row.weekStart),
    title: (row.targetDone?.trim() || row.subject?.trim() || "Weekly goal") as string,
    area: row.area,
    uom: row.uom,
    pctDone: row.pctDone,
    acceptPct: row.acceptPct,
    position: row.position,
    cascade: row.monthGoalId != null,
    spillover: row.carriedFromId != null,
    targetQty: row.targetQty,
    actualQty: row.actualQty,
    targetAmount: row.targetAmount,
    actualAmount: row.actualAmount,
    weight: row.weight,
    adopted: row.adopted,
    monthGoalId: row.monthGoalId,
    // Ritual stamps → display booleans (Phase 6). `undefined` when the action's
    // returning() didn't carry them — the chip renders nothing rather than a
    // wrong state, and a fresh RSC payload restores truth.
    committed: row.committedAt !== undefined ? row.committedAt != null : undefined,
    approved:
      row.approvedByManagerAt !== undefined ? row.approvedByManagerAt != null : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Maps                                                                */
/* ------------------------------------------------------------------ */

export interface CanvasMaps {
  byId: Map<string, GoalDTO>;
  /** parentGoalId → children, position-sorted. */
  childrenOf: Map<string, GoalDTO[]>;
  /** periodKey → goals at that bucket, position-sorted. */
  byPeriodKey: Map<string, GoalDTO[]>;
  /** monthKey ("YYYY-MM") → weekly rows, (weekStart, position)-sorted. */
  weeklyByMonth: Map<string, WeeklyDTO[]>;
  /** weekStart Monday → weekly rows, position-sorted. */
  weeklyByWeek: Map<string, WeeklyDTO[]>;
}

export function buildCanvasMaps(goals: GoalDTO[], weekly: WeeklyDTO[]): CanvasMaps {
  const byId = new Map<string, GoalDTO>();
  const childrenOf = new Map<string, GoalDTO[]>();
  const byPeriodKey = new Map<string, GoalDTO[]>();
  for (const g of goals) {
    byId.set(g.id, g);
    if (g.parentGoalId) {
      const arr = childrenOf.get(g.parentGoalId) ?? [];
      arr.push(g);
      childrenOf.set(g.parentGoalId, arr);
    }
    const bucket = byPeriodKey.get(g.periodKey) ?? [];
    bucket.push(g);
    byPeriodKey.set(g.periodKey, bucket);
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.position - b.position);
  for (const arr of byPeriodKey.values()) arr.sort((a, b) => a.position - b.position);

  const weeklyByMonth = new Map<string, WeeklyDTO[]>();
  const weeklyByWeek = new Map<string, WeeklyDTO[]>();
  for (const w of weekly) {
    const m = weeklyByMonth.get(w.monthKey) ?? [];
    m.push(w);
    weeklyByMonth.set(w.monthKey, m);
    const wk = weeklyByWeek.get(w.weekStart) ?? [];
    wk.push(w);
    weeklyByWeek.set(w.weekStart, wk);
  }
  for (const arr of weeklyByMonth.values())
    arr.sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.position - b.position);
  for (const arr of weeklyByWeek.values()) arr.sort((a, b) => a.position - b.position);

  return { byId, childrenOf, byPeriodKey, weeklyByMonth, weeklyByWeek };
}

/* ------------------------------------------------------------------ */
/* Toolbar filter → weekly rows (bug #16)                              */
/* ------------------------------------------------------------------ */

/**
 * bug #16 — translate the toolbar's goal filter for WEEKLY rows so the pills
 * act on the weeks pane too (they used to silently no-op at month/week zoom).
 * Mirrors buildPills' GoalDTO predicates field-for-field; returns null for
 * "All" (no filtering). "My goals" matches nothing: weekly rows carry no
 * owner/team beyond the viewed person, and the pill is only visible when the
 * viewer ≠ the viewed person (bug #15) — the honest answer is an empty pane,
 * exactly like the GoalDTO predicate over another person's un-teamed goals.
 */
export function weeklyFilterPredicate(
  filter: ActiveGoalFilter,
  now: Date,
): ((r: WeeklyDTO) => boolean) | null {
  const id = filter.id;
  if (id === "all") return null;
  if (id.startsWith("area:")) {
    const area = id.slice("area:".length);
    return (r) => r.area?.trim() === area;
  }
  if (id === "at-risk")
    return (r) =>
      deriveHealth(effective(r), r.weekStart, now, { spillover: r.spillover }).band === "at-risk";
  if (id === "delayed") return (r) => r.spillover;
  if (id === "completed") return (r) => effective(r) >= 100;
  return () => false; // "mine" — see above
}

/* ------------------------------------------------------------------ */
/* Crumbs                                                              */
/* ------------------------------------------------------------------ */

export interface StageCrumb {
  key: string;
  label: string;
  z: ZoomLevel;
  /** Goal to focus when clicked (null = clear focus / week hop only). */
  targetId: string | null;
  /** Week Monday for the week/day crumbs. */
  weekStart: string | null;
  current: boolean;
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

export interface WeekBucket {
  weekStart: string;
  weekNo: number;
  rangeLabel: string;
  /** DISPLAY rows — toolbar-filtered (bug #16). */
  rows: WeeklyDTO[];
  /** The UNFILTERED rows — the math/basis set (allocation, contribution), so
   *  hiding rows with a filter never changes the numbers (same law as
   *  childGoals/allChildGoals). */
  allRows: WeeklyDTO[];
  isCurrent: boolean;
}

export interface CanvasStage {
  z: ZoomLevel;
  maps: CanvasMaps;
  /** yearly rootView, resolved (shell.rootView && z === "year") — when true,
   *  focus is null and allChildGoals lists the FY's YEAR ROOTS themselves. */
  rootView: boolean;
  /** The LEFT parent-context subject (null at `year` — slim FY summary). */
  focus: GoalDTO | null;
  /** ?q front door — the goal at an ADDRESSED child bucket (quarter pk at year
   *  zoom), scoping the LEFT rail/scorecard to the deep-linked column. */
  addressedChild: GoalDTO | null;
  /** Same-level siblings of the focus (includes it), for the spine pips. */
  siblings: GoalDTO[];
  /** Root-first ancestor chain of the focus. */
  ancestors: GoalDTO[];
  /** RIGHT planner: cascade children of the focus (year→quarters, quarter→months),
   *  toolbar-filtered. Unions parent-linked children with PARENTLESS goals in the
   *  focus's child buckets so manual rows stay visible (bug #7). */
  childGoals: GoalDTO[];
  /** The UNFILTERED child union — the math/basis set (allocation, contribution,
   *  rebalance scope) so hiding cards with a filter never changes the numbers. */
  allChildGoals: GoalDTO[];
  /** The EFFECTIVE calendar month on screen at month/week/day zoom ("YYYY-MM"),
   *  resolved even when the month has no goal row yet — the week buckets and the
   *  MonthWeeks quick-add key off this, not off a month goal's existence (bug #2). */
  monthKey: string | null;
  /** RIGHT planner at `month`: the month's weeks as buckets. */
  weeks: WeekBucket[];
  /** The focused week (z = week/day). */
  week: WeekBucket | null;
  /** The month goal owning the focused week (parent context at week zoom). */
  weekParent: GoalDTO | null;
  /** Breadcrumb-as-zoom chain, root-first, last = current. */
  crumbs: StageCrumb[];
  /** Stamp used for all pace math this render pass. */
  now: Date;
  /* --- navigation (URL-state only — zoom is STATE, never CSS) --- */
  drillGoal: (id: string) => void;
  drillWeek: (weekStart: string) => void;
  drillOut: () => void;
  goCrumb: (c: StageCrumb) => void;
}

export function useCanvasStage(): CanvasStage {
  const shell = useCanvasShell();
  const { zoom, fyStartYear } = shell;
  const goals = shell.goals; // optimistic tree (full set — focus never vanishes)
  const weekly = shell.weeklyLive ?? shell.weekly;

  // Stamped once per mount — pace math stays deterministic across optimistic
  // re-renders (edits reconcile in place; no refresh/remount).
  const [now] = React.useState(() => new Date());

  const maps = React.useMemo(() => buildCanvasMaps(goals, weekly), [goals, weekly]);

  const z = zoom.z;
  const wk = zoom.wk;
  // yearly rootView (/goals/yearly): at `year` zoom the canvas is the FY
  // PORTFOLIO — no single focused year goal; the RIGHT pane lists the year
  // roots themselves. Inert at every deeper zoom and on every other page.
  const rootView = Boolean(shell.rootView) && z === "year";

  /* ----- effective focus: the SHARED resolution (bug #5) — panels, KPI band
     and quick-add all consume resolveEffectiveFocus so the on-screen bucket
     always equals the write bucket. ----- */
  const focus = React.useMemo<GoalDTO | null>(
    () =>
      rootView
        ? null // yearly rootView — the LEFT shows the FY summary, not one year goal
        : resolveEffectiveFocus({
            goals,
            z,
            wk,
            pk: zoom.pk, // bug #14 — the clicked goal-less bucket wins over "now"
            focusedGoal: zoom.focusedGoal,
            fyStartYear,
            now,
          }),
    [rootView, goals, z, wk, zoom.pk, zoom.focusedGoal, fyStartYear, now],
  );
  const focusId = focus?.id ?? null;

  // ?q front door — the deep-linked quarter's goal (year zoom only; null when
  // the addressed column is empty or the pk is stage-level — bug #14's case).
  const addressedChild = React.useMemo<GoalDTO | null>(
    () => (rootView ? null : resolveAddressedChild(goals, z, zoom.pk)),
    [rootView, goals, z, zoom.pk],
  );

  /* ----- siblings + ancestors (fallback focus included) ----- */
  const siblings = React.useMemo<GoalDTO[]>(() => {
    if (!focus) return [];
    const sibs = focus.parentGoalId
      ? goals.filter((g) => g.parentGoalId === focus.parentGoalId)
      : goals.filter((g) => g.parentGoalId == null && g.periodKey === focus.periodKey);
    return [...sibs].sort((a, b) => a.position - b.position);
  }, [focus, goals]);

  const ancestors = React.useMemo<GoalDTO[]>(() => {
    if (!focus) return [];
    const chain: GoalDTO[] = [];
    const seen = new Set<string>([focus.id]);
    let cur: GoalDTO | undefined = focus;
    while (cur?.parentGoalId) {
      const parent = maps.byId.get(cur.parentGoalId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  }, [focus, maps]);

  /* ----- RIGHT planner: cascade children (bug #7a) -----
     Parent-linked children UNIONED with parentless goals whose periodKey falls
     in the focus's child buckets — manual rows created via createGoal
     (parentGoalId null) were invisible before because childrenOf is keyed
     strictly by parentGoalId. Dedup by id; parentless rows sort in by bucket. */
  const allChildGoals = React.useMemo<GoalDTO[]>(() => {
    // yearly rootView — the "children" ARE the FY's YEAR ROOTS (the level page's
    // primary content), position-sorted; the toolbar filter applies via childGoals.
    if (rootView) {
      return goals
        .filter((g) => g.period === "year" && g.periodKey === String(fyStartYear))
        .sort((a, b) => a.position - b.position);
    }
    if (!focus || z === "month" || z === "week" || z === "day") return [];
    const kids = maps.childrenOf.get(focus.id) ?? [];
    const bucketKeys =
      focus.period === "year"
        ? quartersOfFy(Number(focus.periodKey))
        : focus.period === "quarter"
          ? monthKeysOfQuarter(fyStartYearOfKey(focus.periodKey), quarterOfKey(focus.periodKey))
          : [];
    const seen = new Set(kids.map((k) => k.id));
    const extra: GoalDTO[] = [];
    for (const key of bucketKeys) {
      for (const g of maps.byPeriodKey.get(key) ?? []) {
        if (g.parentGoalId == null && !seen.has(g.id)) {
          seen.add(g.id);
          extra.push(g);
        }
      }
    }
    extra.sort((a, b) => a.periodKey.localeCompare(b.periodKey) || a.position - b.position);
    return [...kids, ...extra];
  }, [rootView, goals, fyStartYear, focus, z, maps]); // yearly rootView deps added

  const childGoals = React.useMemo<GoalDTO[]>(() => {
    if (!shell.filter || shell.filter.id === "all") return allChildGoals;
    const pred = shell.filter.predicate;
    return allChildGoals.filter(pred);
  }, [allChildGoals, shell.filter]);

  /* ----- the EFFECTIVE month on screen (month/week/day stages) -----
     Resolved from the focused month goal when one exists, else from the focused
     week / today — so a month with NO goal row still yields a key (bug #2: the
     week buckets below must exist for every month, goal or not). */
  const monthKey = React.useMemo<string | null>(() => {
    if (z !== "month" && z !== "week" && z !== "day") return null;
    if (focus?.period === "month") return focus.periodKey;
    // bug #14 — a picked goal-less month (?pk=) beats the week/now fallback,
    // so clicking "February" with no February goal shows FEBRUARY's weeks.
    if (zoom.pk && periodOfKey(zoom.pk) === "month") return zoom.pk;
    return wk ? wk.slice(0, 7) : monthKeyOf(now);
  }, [z, focus, zoom.pk, wk, now]);

  /* ----- weeks of the effective month ----- */
  const currentMonday = React.useMemo(() => mondayKeyOf(now), [now]);
  // bug #16 — the toolbar filter, translated for weekly rows (display only;
  // `allRows` keeps the unfiltered basis so no math shifts under a filter).
  const weeklyPred = React.useMemo(
    () => (shell.filter ? weeklyFilterPredicate(shell.filter, now) : null),
    [shell.filter, now],
  );
  const weeks = React.useMemo<WeekBucket[]>(() => {
    if (!monthKey) return [];
    const rows = maps.weeklyByMonth.get(monthKey) ?? [];
    const byStart = new Map<string, WeeklyDTO[]>();
    for (const r of rows) {
      const arr = byStart.get(r.weekStart) ?? [];
      arr.push(r);
      byStart.set(r.weekStart, arr);
    }
    // Union with the month's CANONICAL calendar Mondays so every month shows its
    // 4–5 drillable week buckets even before any weekly goal lands (bug #2 — an
    // empty month otherwise renders zero buckets, making the FIRST weekly goal
    // of the month uncreatable; the only escape was the toolbar, which minted
    // junk month rows). Empty buckets carry no rows; drilling one opens the
    // WeekPlanner's working quick-add.
    const fyStartYear = fyStartYearOfMonthKey(monthKey);
    const monthIndex = Number(monthKey.slice(5, 7)) - 1;
    for (const w of weeksOfMonth(fyStartYear, monthIndex)) {
      if (!byStart.has(w.mondayISO)) byStart.set(w.mondayISO, []);
    }
    return [...byStart.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, list]) => ({
        weekStart,
        weekNo: weekNoOf(weekStart),
        rangeLabel: weekRangeLabel(weekStart),
        rows: weeklyPred ? list.filter(weeklyPred) : list, // bug #16
        allRows: list,
        isCurrent: weekStart === currentMonday,
      }));
  }, [monthKey, maps, currentMonday, weeklyPred]);

  /* ----- the focused week (z = week/day) ----- */
  const week = React.useMemo<WeekBucket | null>(() => {
    if (z !== "week" && z !== "day") return null;
    const start = wk ?? weeks.find((w) => w.isCurrent)?.weekStart ?? weeks[0]?.weekStart ?? null;
    if (!start) return null;
    const found = weeks.find((w) => w.weekStart === start);
    if (found) return found;
    // A week outside the focused month (edge Mondays) — build it directly.
    const rows = maps.weeklyByWeek.get(start) ?? [];
    return {
      weekStart: start,
      weekNo: weekNoOf(start),
      rangeLabel: weekRangeLabel(start),
      rows: weeklyPred ? rows.filter(weeklyPred) : rows, // bug #16
      allRows: rows,
      isCurrent: start === currentMonday,
    };
  }, [z, wk, weeks, maps, currentMonday, weeklyPred]);

  const weekParent = z === "week" || z === "day" ? focus : null;

  /* ----- breadcrumb-as-zoom (FY ▸ AQ2 ▸ Jul ▸ W3 ▸ Day) ----- */
  const crumbs = React.useMemo<StageCrumb[]>(() => {
    const list: StageCrumb[] = [];
    const fyOfFocus = focus
      ? focus.period === "year"
        ? Number(focus.periodKey)
        : focus.period === "quarter"
          ? fyStartYearOfKey(focus.periodKey)
          : fyStartYearOfMonthKey(focus.periodKey)
      : fyStartYear;

    const yearId =
      ancestors.find((a) => a.period === "year")?.id ??
      (focus?.period === "year" ? focus.id : null) ??
      maps.byPeriodKey.get(String(fyOfFocus))?.[0]?.id ??
      null;
    list.push({
      key: `y:${fyOfFocus}`,
      label: `FY${String(fyOfFocus % 100)}`,
      z: "year",
      targetId: yearId,
      weekStart: null,
      current: z === "year",
    });

    if (focus && focus.period !== "year") {
      const quarterKey =
        focus.period === "quarter" ? focus.periodKey : quarterKeyOfMonthKey(focus.periodKey);
      const quarterId =
        focus.period === "quarter"
          ? focus.id
          : (ancestors.find((a) => a.period === "quarter")?.id ??
            maps.byPeriodKey.get(quarterKey)?.[0]?.id ??
            null);
      list.push({
        key: `q:${quarterKey}`,
        label: periodKeyLabel(quarterKey),
        z: "quarter",
        targetId: quarterId,
        weekStart: null,
        current: z === "quarter",
      });
    }

    if (focus && focus.period === "month") {
      list.push({
        key: `m:${focus.periodKey}`,
        label: monthNameOf(focus.periodKey),
        z: "month",
        targetId: focus.id,
        weekStart: null,
        current: z === "month",
      });
    }

    if ((z === "week" || z === "day") && week) {
      list.push({
        key: `w:${week.weekStart}`,
        label: `W${week.weekNo}`,
        z: "week",
        targetId: focusId,
        weekStart: week.weekStart,
        current: z === "week",
      });
    }
    if (z === "day" && week) {
      list.push({
        key: `d:${week.weekStart}`,
        label: "Days",
        z: "day",
        targetId: focusId,
        weekStart: week.weekStart,
        current: true,
      });
    }
    return list;
  }, [focus, focusId, ancestors, maps, z, week, fyStartYear]);

  /* ----- navigation ----- */
  const drillGoal = React.useCallback(
    (id: string) => {
      const g = maps.byId.get(id);
      if (!g) return;
      zoom.focusNode(g.id, g.period);
    },
    [maps, zoom],
  );

  const drillWeek = React.useCallback(
    (weekStart: string) => {
      // Anchor the month context on the week's owning month goal when we have
      // one; the week itself becomes the focused subject.
      const monthKey = weekStart.slice(0, 7);
      const owningMonth =
        focus && focus.period === "month" && focus.periodKey === monthKey
          ? focus
          : (maps.byPeriodKey.get(monthKey)?.[0] ?? null);
      if (owningMonth) zoom.focusNode(owningMonth.id);
      zoom.focusWeek(weekStart, "week");
    },
    [focus, maps, zoom],
  );

  // bug #4 — level pages (hideLevelNav) lock the SHALLOW bound: zoom-out (Esc,
  // ⌘↑) may never leave the page's level; the sidebar is the level navigator.
  const minZ: ZoomLevel = shell.hideLevelNav ? (shell.initialZoom ?? "year") : "year";
  const drillOut = React.useCallback(() => {
    if (ZOOM_LEVELS.indexOf(z) <= ZOOM_LEVELS.indexOf(minZ)) return;
    zoom.zoomOut();
  }, [z, zoom, minZ]);

  const goCrumb = React.useCallback(
    (c: StageCrumb) => {
      if (c.current) return;
      if (c.z === "week" && c.weekStart) {
        zoom.focusWeek(c.weekStart, "week");
        return;
      }
      zoom.focusNode(c.targetId, c.z);
    },
    [zoom],
  );

  return {
    z,
    maps,
    rootView, // yearly rootView
    focus,
    addressedChild, // ?q front door
    siblings,
    ancestors,
    childGoals,
    allChildGoals,
    monthKey,
    weeks,
    week,
    weekParent,
    crumbs,
    now,
    drillGoal,
    drillWeek,
    drillOut,
    goCrumb,
  };
}
