"use client";

/**
 * Goals Canvas — GOALS CANVAS, the Phase-3 unified two-workspace shell
 * (design §2.1–§2.4 + §4.1). Renders when GOALS_CANVAS_ON='true', taking the
 * EXACT prop set CascadeWorkspace receives so the page swaps 1:1. (The old
 * cascade-canvas.tsx shell it superseded is deleted — Phase 6 orphan prune.)
 *
 * ONE mental model: you are always looking at ONE objective at some depth
 * (zoom ∈ year·quarter·month·week·day, URL state). Composition:
 *
 *   1. <ZoomSpine/>          — sticky breadcrumb-AS-zoom + sibling pips +
 *                              Person switcher + List/Board.
 *   2. <KpiStrip/>           — the scorecard band (ALWAYS on — the Exec/Ops
 *                              split is gone; collapsible to one line).
 *   3. <SmartToolbar/>       — client-side filter pills + New-Goal quick-add.
 *   4. LEFT  <ParentContextPanel/> — the persistent parent-context reference
 *      RIGHT <ChildPlanner/>       — the child planning containers.
 *      Drilling a child MORPHS it into the LEFT panel (shared layoutId).
 *
 * State spine: `useOptimisticGoals` (the Phase-1 reconciliation, shared with
 * the old shell) + a weekly OVERLAY (weekly rows live in weekly_goals — their
 * optimistic layer reconciles with rows returned by WEEKLY actions only, so
 * ritual stamps always land on the right table — §4.3).
 *
 * PREMIUM PREREQUISITES (design §6, pulled into Phase 3):
 *   · --module-accent / --module-accent-deep are set HERE (Altus red) — Button
 *     (.brand-btn), pills, focus rings and CTAs read them app-wide with a
 *     red fallback, so Goals stops hand-rolling amber against a hard-red kit.
 *   · --font-serif is re-pointed at the REAL editorial serif (Fraunces via
 *     --font-editorial, loaded in app/layout.tsx) for this subtree — the
 *     global token still resolves to Roboto, so production is untouched.
 *
 * HARD LAWS: zero data queries in this tree; brand-red FORBIDDEN (amber
 * identity); zoom is STATE — never CSS zoom/transform on ancestors (Radix
 * portals break, globals.css:135); keyboard-first; motion reduced-motion-gated.
 */

import * as React from "react";
import { LayoutGroup } from "motion/react";
import {
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  monthKey,
  monthKeysOfQuarter,
  quarterKey,
  quarterOfKey,
  quartersOfFy,
} from "@/lib/goals/types";
import { weekNoOf, weeksOfMonth } from "@/lib/goals/fy-calendar";
import { goalPolicy } from "@/lib/goals/policy";
import { fireToast } from "@/lib/toast";
import {
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
  periodKeyShort,
} from "@/components/goals/cascade/util";
import { GOALS_TINT_VARS } from "./tokens";
import { useZoomState } from "./zoom-state";
import type { CascadeCanvasProps, GoalDTO, WeeklyDTO } from "./types";
import { CanvasShellCtx, type CanvasShellCtxValue } from "./shell-context";
import {
  useOptimisticGoals,
  type WeeklyMutationApi,
  type WeeklyPatch,
  type WeeklyActionResult,
} from "./optimistic";
import { weeklyRowToDto, mondayKeyOf, resolveEffectiveFocus } from "./stage";
import { KpiStrip } from "./kpi-strip";
import { SmartToolbar, type ActiveGoalFilter, type QuickAddTarget } from "./smart-toolbar";
import { ZoomSpine } from "./zoom-spine";
import { RitualBanner } from "./ritual-banner";
import { ParentContextPanel } from "./parent-context-panel";
import { ChildPlanner } from "./child-planner";

/* ------------------------------------------------------------------ */
/* Weekly overlay — optimistic layer for the SECOND table (§4.3)        */
/* ------------------------------------------------------------------ */

interface WeeklyOverlay {
  overrides: Map<string, Partial<WeeklyDTO>>;
  extra: WeeklyDTO[];
}

const EMPTY_OVERLAY: WeeklyOverlay = { overrides: new Map(), extra: [] };

function useWeeklyOverlay(propsWeekly: WeeklyDTO[]): {
  weeklyLive: WeeklyDTO[];
  weeklyMutation: WeeklyMutationApi;
} {
  const [overlay, setOverlay] = React.useState<WeeklyOverlay>(EMPTY_OVERLAY);
  const [pending, setPending] = React.useState(0);
  // Ref mirror so `mutate` can read the PRIOR override entry for its surgical
  // rollback (bug #12) without impure updaters.
  const overlayRef = React.useRef(overlay);
  React.useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  React.useEffect(() => {
    // Fresh RSC payload landed — server truth wins, drop the overlay.
    setOverlay((o) => (o.overrides.size === 0 && o.extra.length === 0 ? o : EMPTY_OVERLAY));
  }, [propsWeekly]);

  const weeklyLive = React.useMemo<WeeklyDTO[]>(() => {
    const apply = (w: WeeklyDTO): WeeklyDTO => {
      const patch = overlay.overrides.get(w.id);
      return patch ? { ...w, ...patch, id: w.id } : w;
    };
    // bug #12 — dedupe by id: a revalidated payload can already contain a row
    // whose settled twin still sits in `extra` (the reset effect fires a render
    // later), which mapped one id twice → duplicate React keys for a frame.
    // Props win; extras keep only ids the payload doesn't know yet.
    const propIds = new Set(propsWeekly.map((w) => w.id));
    return [
      ...propsWeekly.map(apply),
      ...overlay.extra.filter((r) => !propIds.has(r.id)).map(apply),
    ];
  }, [propsWeekly, overlay]);

  const mutate = React.useCallback(
    async (
      patch: WeeklyPatch,
      action: () => Promise<WeeklyActionResult>,
      opts?: { onError?: () => void },
    ): Promise<boolean> => {
      // bug #12 — rollback must be SURGICAL: undo only THIS mutation's own
      // patch via functional updates (a whole-snapshot restore reverted every
      // concurrent in-flight edit and resurrected stale overrides over newer
      // props). Update → restore the id's PRIOR override entry; insert →
      // remove the one temp row.
      const prevOverride =
        patch.type === "update" ? overlayRef.current.overrides.get(patch.id) : undefined;
      const rollback = () =>
        setOverlay((o) => {
          if (patch.type === "update") {
            const overrides = new Map(o.overrides);
            if (prevOverride) overrides.set(patch.id, prevOverride);
            else overrides.delete(patch.id);
            return { ...o, overrides };
          }
          return { ...o, extra: o.extra.filter((r) => r.id !== patch.row.id) };
        });
      setOverlay((o) => {
        if (patch.type === "update") {
          const overrides = new Map(o.overrides);
          overrides.set(patch.id, { ...(overrides.get(patch.id) ?? {}), ...patch.fields });
          return { ...o, overrides };
        }
        return { ...o, extra: [...o.extra, patch.row] };
      });
      setPending((n) => n + 1);
      try {
        const res = await action();
        if (!res.ok) {
          rollback();
          opts?.onError?.();
          fireToast({ message: res.error ?? "Something went wrong.", type: "error" });
          return false;
        }
        if (res.row) {
          const dto = weeklyRowToDto(res.row);
          setOverlay((o) => {
            const overrides = new Map(o.overrides);
            overrides.set(dto.id, dto); // full server truth for this row
            const extra =
              patch.type === "insert"
                ? o.extra.map((r) => (r.id === patch.row.id ? dto : r))
                : o.extra;
            return { overrides, extra };
          });
        }
        return true;
      } catch {
        rollback(); // bug #12 — same surgical undo on throw
        opts?.onError?.();
        // §2.7 offline copy — a thrown server-action fetch while offline should
        // say so plainly (and reassure that the rollback kept truth intact).
        fireToast({
          message:
            typeof navigator !== "undefined" && !navigator.onLine
              ? "You may be offline — nothing was saved."
              : "Something went wrong.",
          type: "error",
        });
        return false;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [],
  );

  const weeklyMutation = React.useMemo<WeeklyMutationApi>(
    () => ({ mutate, pending: pending > 0 }),
    [mutate, pending],
  );

  return { weeklyLive, weeklyMutation };
}

/** The Monday a weekly quick-add lands on: the focused week if any, else the
 *  focused month's current week (or its first week), else today's Monday. */
function pickWeekStart(monthKeyStr: string | null, wk: string | null): string {
  if (wk) return wk;
  const todayMonday = mondayKeyOf(new Date());
  if (monthKeyStr && /^\d{4}-\d{2}$/.test(monthKeyStr)) {
    const fy = fyStartYearOfMonthKey(monthKeyStr);
    const monthIndex = Number(monthKeyStr.slice(5, 7)) - 1;
    const weeks = weeksOfMonth(fy, monthIndex);
    const current = weeks.find((w) => w.mondayISO === todayMonday);
    return (current ?? weeks[0])?.mondayISO ?? todayMonday;
  }
  return todayMonday;
}

/* ------------------------------------------------------------------ */
/* GoalsCanvas                                                         */
/* ------------------------------------------------------------------ */

export function GoalsCanvas(props: CascadeCanvasProps) {
  /* --- optimistic spines: goals (shared Phase-1 hook) + weekly overlay --- */
  const { goals, mutation } = useOptimisticGoals(props.goals);
  const { weeklyLive, weeklyMutation } = useWeeklyOverlay(props.weekly);

  // Zoom over the FULL optimistic set so a focused goal never "vanishes"
  // when a filter hides it. Level-page mode (5-page restructure): the page's
  // level is the URL DEFAULT — the canvas opens at that level with no mount-time
  // history write, so same-page sidebar clicks are idempotent and Back walks
  // real steps. Drilling a child still deepens within the page.
  // defaultRepr (Phase 3 front door) + fyStartYear (the ?q=Q2 sugar) ride in.
  const zoom = useZoomState(goals, props.initialZoom ?? "year", {
    defaultRepr: props.defaultRepr,
    fyStartYear: props.fyStartYear,
  });

  /* ----- toolbar filter → filtered goal set (pure client derivation) ----- */
  const [filter, setFilter] = React.useState<ActiveGoalFilter | null>(null);
  const filteredGoals = React.useMemo<GoalDTO[]>(
    () => (filter && filter.id !== "all" ? goals.filter(filter.predicate) : goals),
    [goals, filter],
  );

  /* ----- peek → promoted to first-class: focusing a goal opens it in the
   *       LEFT ParentContextPanel at its own level (no overlay). ----- */
  const goalById = React.useMemo(() => {
    const m = new Map<string, GoalDTO>();
    for (const g of goals) m.set(g.id, g);
    return m;
  }, [goals]);
  const openPeek = React.useCallback(
    (goalId: string) => {
      const g = goalById.get(goalId);
      if (g) zoom.focusNode(g.id, g.period);
    },
    [goalById, zoom],
  );

  /* ----- quick-add target: DISCRIMINATED over the write surface -----
     On the WEEKS surface (month/week/day) New-goal writes a weekly_goals row
     (bug #1 — it used to mint a stray month goal that never appeared in the
     weeks pane); on the goal surface (year/quarter) it writes a goals row. */
  const quickAddTarget = React.useMemo<QuickAddTarget>(() => {
    const fy = props.fyStartYear;
    // The SHARED effective focus (bug #5) — the bucket the panels actually show,
    // never the raw URL ?focus. This is what makes New-goal land where you look.
    const focused = resolveEffectiveFocus({
      goals,
      z: zoom.z,
      wk: zoom.wk,
      pk: zoom.pk, // bug #14 — the clicked goal-less bucket wins over "now"
      focusedGoal: zoom.focusedGoal,
      fyStartYear: fy,
      now: new Date(),
    });

    if (zoom.z === "month" || zoom.z === "week" || zoom.z === "day") {
      const monthGoal = focused?.period === "month" ? focused : null;
      // bug #14 — a picked goal-less month (?pk=) is the write bucket too, so
      // quick-add lands in the month ON SCREEN (mirrors stage.monthKey's order).
      const pkMonth = zoom.pk && /^\d{4}-\d{2}$/.test(zoom.pk) ? zoom.pk : null;
      const monthKeyStr = monthGoal?.periodKey ?? pkMonth ?? zoom.wk?.slice(0, 7) ?? null;
      const weekStart = pickWeekStart(monthKeyStr, zoom.wk);
      // Bucket picker: the on-screen month's canonical Mondays, W-numbered —
      // the toolbar's expanded row lets you aim the new weekly at any of them
      // (defaults to the current period's week via `weekStart`).
      const mk = monthKeyStr && /^\d{4}-\d{2}$/.test(monthKeyStr) ? monthKeyStr : weekStart.slice(0, 7);
      const weekBuckets = weeksOfMonth(fyStartYearOfMonthKey(mk), Number(mk.slice(5, 7)) - 1).map(
        (w) => ({ key: w.mondayISO, label: `W${w.weekNo}` }),
      );
      // An edge-Monday focus (?wk outside the month's own Mondays) must still
      // be a pickable — and the DEFAULT — option, or the select would show one
      // bucket while the write went to another.
      if (!weekBuckets.some((b) => b.key === weekStart)) {
        weekBuckets.unshift({ key: weekStart, label: `W${weekNoOf(weekStart)}` });
      }
      return {
        kind: "weekly",
        weekStart,
        monthGoalId: monthGoal?.id ?? null,
        buckets: weekBuckets,
      };
    }

    // GOAL surface — quick-add targets the CHILD level of the stage (bug #7):
    // year→quarter, quarter→month, routed through addChildGoal with the focused
    // parent's id (it used to mint a SIBLING at the parent's own level). Bucket
    // = the "now" child bucket when it belongs to the scope, else the first.
    const nowDate = new Date();
    // yearly rootView — the pane lists the FY's YEAR objectives themselves, so
    // New goal mints a parentless YEAR root in this FY (it lands in the list).
    if (props.rootView && zoom.z === "year") {
      return { kind: "goal", period: "year", periodKey: String(fy), parentGoalId: null };
    }
    if (zoom.z === "year") {
      const qk = quarterKey(nowDate);
      // ?q front door — a picked/addressed quarter (?pk carrying a quarter key
      // of THIS FY) is the quick-add default, so New-goal lands in the column
      // the deep-link scrolled to; else the current quarter as before.
      const pkQuarterY =
        zoom.pk && /^\d{4}-Q[1-4]$/.test(zoom.pk) && fyStartYearOfKey(zoom.pk) === fy
          ? zoom.pk
          : null;
      return {
        kind: "goal",
        period: "quarter",
        periodKey: pkQuarterY ?? (fyStartYearOfKey(qk) === fy ? qk : `${fy}-Q1`),
        parentGoalId: focused?.period === "year" ? focused.id : null,
        // Bucket picker: all four quarters of the FY ("Q1"…"Q4"), so the
        // prominent New-goal can aim past the current quarter.
        buckets: quartersOfFy(fy).map((k) => ({ key: k, label: periodKeyShort(k) })),
      };
    }
    // z === "quarter" — resolve the active quarter (focused, else the PICKED
    // goal-less quarter — bug #14, else the now/first quarter of the FY), then
    // place the month inside it.
    const nowQk = quarterKey(nowDate);
    const pkQuarter = zoom.pk && /^\d{4}-Q[1-4]$/.test(zoom.pk) ? zoom.pk : null;
    const qKey =
      focused?.period === "quarter"
        ? focused.periodKey
        : (pkQuarter ??
          (fyStartYearOfKey(nowQk) === fy ? nowQk : `${fy}-Q1`));
    const months = monthKeysOfQuarter(fyStartYearOfKey(qKey), quarterOfKey(qKey));
    const nowMk = monthKey(nowDate);
    return {
      kind: "goal",
      period: "month",
      periodKey: months.includes(nowMk) ? nowMk : (months[0] ?? nowMk),
      parentGoalId: focused?.period === "quarter" ? focused.id : null,
      // Bucket picker: the active quarter's three months ("Apr"/"May"/"Jun").
      buckets: months.map((k) => ({ key: k, label: periodKeyShort(k) })),
    };
  }, [goals, zoom.z, zoom.focusedGoal, zoom.wk, zoom.pk, props.fyStartYear, props.rootView]);

  /* ----- Option A policy (Phase 2): resolved ONCE per viewed board — WHO you
     are (admin / manager-of-viewed / the owner) decides what you can touch.
     Affordance gating only; the actions re-derive it server-side. ----- */
  const policy = React.useMemo(
    () =>
      goalPolicy({
        isAdmin: props.isAdmin ?? false,
        isManagerOfOwner: props.managesViewed ?? false,
        isOwner: props.myEmployeeId != null && props.myEmployeeId === props.viewedEmployeeId,
      }),
    [props.isAdmin, props.managesViewed, props.myEmployeeId, props.viewedEmployeeId],
  );

  const ctx = React.useMemo<CanvasShellCtxValue>(
    () => ({
      ...props,
      goals, // the OPTIMISTIC tree — every consumer reacts instantly
      policy,
      zoom,
      filter,
      filteredGoals,
      openPeek,
      mutation,
      weeklyLive,
      weeklyMutation,
    }),
    [props, goals, policy, zoom, filter, filteredGoals, openPeek, mutation, weeklyLive, weeklyMutation],
  );

  return (
    <CanvasShellCtx.Provider value={ctx}>
      {/* NOTE: no `zoom`/`transform` styles on this tree (Radix-portal bug).
          --module-accent re-skins Button/pills/CTAs Altus red inside this subtree;
          --font-serif upgrades the editorial voice to the REAL serif pairing
          (Fraunces) without touching the global token. */}
      <div
        className="mx-auto flex w-full max-w-[1480px] flex-col gap-4"
        style={
          {
            "--module-accent": GOALS_ACCENT,
            "--module-accent-deep": GOALS_ACCENT_DEEP,
            "--goals-accent": GOALS_ACCENT,
            "--goals-accent-deep": GOALS_ACCENT_DEEP,
            // Design contract §2.0 — the 5-stop amber alpha ramp, published
            // once so CSS/arbitrary-value consumers share tokens.ts's mix.
            ...GOALS_TINT_VARS,
            "--font-serif": "var(--font-editorial), Georgia, serif",
          } as React.CSSProperties
        }
      >
        {/* 1 · Zoom spine — breadcrumb-as-zoom + person + view/repr toggles */}
        <ZoomSpine />

        {/* 1b · Rituals as contextual states (Phase 6, §2.6): Saturday commit +
               Monday approve appear HERE — auto on their gated day, or forced
               by the ?ritual= deep-link the /goals/commit + /goals/approve
               aliases and the punch-gate error toasts land on. */}
        <RitualBanner />

        {/* 2 · KPI scorecard band — ALWAYS rendered (unified surface; the old
               Exec-only gate died with the mode). Collapsible to one line, the
               chevron state persists in localStorage (kpi-strip.tsx).
               yearly rootView: pin the scope to the WHOLE FY (focus null) so the
               band matches the FY-portfolio framing, not one year goal. */}
        <KpiStrip focus={props.rootView && zoom.z === "year" ? null : undefined} />

        {/* 3 · Smart toolbar — filter pills + New-Goal quick-add */}
        <SmartToolbar
          goals={goals}
          viewedEmployeeId={props.viewedEmployeeId}
          myEmployeeId={props.myEmployeeId} // bug #15 — powers the "My goals" pill
          canWrite={props.canWrite}
          quickAddTarget={quickAddTarget}
          onFilterChange={setFilter}
          mutation={mutation}
          weeklyMutation={weeklyMutation}
        />

        {/* 4 · The two workspaces: persistent LEFT parent-context, RIGHT child
               planner. LayoutGroup scopes the shared-element morph ids.
               Phase 5: at DAY zoom the Plan-Your-Day surface takes the full
               width (the planner carries its own 4-column layout; the parent
               context lives in the spine's breadcrumb — design §2.1). */}
        <LayoutGroup>
          {zoom.z === "day" ? (
            <ChildPlanner />
          ) : (
            // §2.4 width clamp — the context rail holds 320–420px so on 1280px
            // screens the reference never outweighs the work on the right.
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,420px)_3fr]">
              <ParentContextPanel />
              <ChildPlanner />
            </div>
          )}
        </LayoutGroup>
      </div>
    </CanvasShellCtx.Provider>
  );
}
