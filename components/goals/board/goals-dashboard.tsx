"use client";

/**
 * GOALS DASHBOARD — DIRECTOR / EXECUTIVE VIEW.
 *
 * A pace-aware "control room" for one level (Yearly / Quarterly / Monthly) or
 * the Weekly board of the currently-viewed person's cascade. EVERYTHING here is
 * a pure CLIENT-SIDE projection over the goals the board already holds — zero
 * new DB queries, recomputed whenever the props change.
 *
 * The whole point (vs. the old flat card wall): it drives EVERY health / at-risk
 * / forecast number off the canonical pace engine in `lib/goals/derive.ts`
 * (`deriveHealth` · `expectedPct` · `rollupPct`), NOT static ≥80/≥60 cutoffs.
 *
 * Sections:
 *   2. KPI row — weighted attainment · on-pace · at-risk · overdue · done ·
 *      ₹ attainment · cascade coverage. Each clickable → drill.
 *   3. Pace / health distribution — segmented bar across the 6 derived bands.
 *   4. At-risk & overdue action list — worst-first, the director's to-do.
 *   5. Cascade coverage — broken-down vs orphaned + "needs breakdown" list.
 *   6. By Pillar (goalType) + By Area — weighted attainment per group.
 *   7. Accountability / delegation — self·assigned·delegated, dependency, review.
 *   8. ₹ / quantitative attainment — Σ actual vs Σ target (only if measures).
 *   9. Drill-down panel — the goals behind any clicked KPI / band / group.
 *  10. Controls — All / At-risk lens + pillar filter.
 *
 * Brand laws (altus-premium-ui): Altus-red identity, --font-display numbers,
 * tabular-nums everywhere, .wg-rise / .wg-sheen + kpi-aurora depth, semantic
 * status hexes only, all motion reduced-motion-gated.
 */

import * as React from "react";
import { useReducedMotion } from "motion/react";
import {
  Target,
  CheckCircle2,
  TrendingUp,
  CalendarClock,
  AlertTriangle,
  X,
  GitBranch,
  Users,
  Gauge,
  Network,
  ShieldCheck,
  Boxes,
  BarChart3,
  LayoutDashboard,
  LineChart,
  ChevronDown,
  Check,
  ArrowLeftRight,
  Grid3x3,
  Lightbulb,
  Share2,
} from "lucide-react";
import {
  type GoalDTO,
  type RosterMember,
  periodKeyLabel,
  fmtNum,
  fyLabel,
} from "@/components/goals/cascade/util";
import { CardGrid } from "@/components/layout/card-grid";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HBars, type HBarRow } from "@/components/charts/h-bars";
import { VBars } from "@/components/charts/v-bars";
import { Donut, type DonutSlice } from "@/components/charts/donut";
import { TrendLine } from "@/components/charts/trend-line";
import type { GoalPeriod } from "@/lib/goals/types";
// The numbers live in ONE place — see `dashboard-model.ts`. This file owns the
// executive LAYOUT over them; the Weekly board renders its own layout over the
// same model.
import {
  GREEN,
  GREEN_BRIGHT,
  AMBER,
  RED,
  RED_DEEP,
  SLATE,
  BLUE,
  YELLOW,
  ORANGE,
  PURPLE,
  TEAL,
  DISPLAY,
  BAND_META,
  BAND_ORDER,
  classify,
  pillarOf,
  buildModel,
  buildQuarterBreakdown,
  matchesFilters,
  computeDelegationStats,
  computeAreaTypeMatrix,
  buildSmartInsights,
  aggregateMeasures,
  DEFAULT_DASHBOARD_FILTERS,
  type DisplayBand,
  type Row,
  type Group,
  type Model,
  type QuarterPoint,
  type DashboardFilters,
  type DelegationStats,
} from "./dashboard-model";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const PANEL: React.CSSProperties = {
  background: "var(--color-surface-card)",
  border: "1px solid var(--color-hairline-strong)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)",
};

const LEVEL_NOUN: Record<string, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};
const CHILD_NOUN: Record<string, string> = {
  year: "quarter",
  quarter: "month",
  month: "week",
  week: "",
  day: "",
};

/* ── Count-up (rAF ease-out; renders final state under reduced motion) ─── */
function useCountUp(target: number, enabled: boolean): number {
  const [val, setVal] = React.useState(enabled ? 0 : target);
  const fromRef = React.useRef(enabled ? 0 : target);
  React.useEffect(() => {
    if (!enabled) {
      fromRef.current = target;
      setVal(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const start = performance.now();
    const dur = 680;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, enabled]);
  return val;
}

/* ── Drill descriptor (a click → the goals behind a KPI / band / group) ── */
interface Drill {
  id: string;
  label: string;
  color: string;
  test: (r: Row) => boolean;
}

/* ====================================================================== */
/* Props                                                                  */
/* ====================================================================== */

export interface GoalsDashboardProps {
  /** FULL loaded cascade set (all levels) for the viewed person + FY. */
  allGoals: GoalDTO[];
  /** The level this dashboard summarises. */
  level: GoalPeriod;
  fyStartYear: number;
  /** Loaded roster (id → name) for delegate / dependency labels — load-neutral.
   *  OPTIONAL so lighter callers (e.g. the Weekly board) can mount the dashboard
   *  without the full cascade context; all extras default to inert. */
  roster?: RosterMember[];
  /** Weekly execution rows (period="week") — used for month→week coverage. */
  weekCards?: GoalDTO[];
  /** The person whose cascade this is. */
  viewedName?: string;
  viewedEmployeeId?: string;
  /** parentGoalId → its direct children (cascade rows, all levels). */
  childrenByParent?: Map<string, GoalDTO[]>;
  managesViewed?: boolean;
  isAdmin?: boolean;
  /** Controlled filter state — lifted to the parent so it can filter the
   *  goal table it renders alongside this dashboard through the SAME
   *  predicate (`matchesFilters`). Defaults to no filters when omitted. */
  filters?: DashboardFilters;
  onFiltersChange?: (f: DashboardFilters) => void;
}

const EMPTY_ROWS: GoalDTO[] = [];
const EMPTY_CHILDREN = new Map<string, GoalDTO[]>();
const EMPTY_ROSTER: RosterMember[] = [];

/* ====================================================================== */
/* Root                                                                   */
/* ====================================================================== */

export function GoalsDashboard(props: GoalsDashboardProps) {
  const {
    allGoals,
    level,
    fyStartYear,
    weekCards = EMPTY_ROWS,
    childrenByParent = EMPTY_CHILDREN,
  } = props;
  const reduce = useReducedMotion() ?? false;

  // Filters are controlled by the parent (so it can filter the goal table
  // through the same predicate) — fall back to local state for any caller
  // that doesn't wire them up.
  const [uncontrolledFilters, setUncontrolledFilters] = React.useState<DashboardFilters>(
    DEFAULT_DASHBOARD_FILTERS,
  );
  const filters = props.filters ?? uncontrolledFilters;
  const setFilters = props.onFiltersChange ?? setUncontrolledFilters;

  // Premium reveal even though data is synchronous (props).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stamp `now` once per payload so pace math is stable across the render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => new Date(), [allGoals]);

  const childCountOf = React.useCallback(
    (id: string) => {
      const direct = childrenByParent.get(id)?.length ?? 0;
      let weeks = 0;
      for (const w of weekCards) if (w.parentGoalId === id) weeks += 1;
      return direct + weeks;
    },
    [childrenByParent, weekCards],
  );

  // Analysed rows — adopted goals at this level (crossed-out rows excluded).
  const allRows = React.useMemo(
    () =>
      allGoals
        .filter((g) => g.period === level && g.adopted)
        .map((g) => classify(g, now, childCountOf(g.id))),
    [allGoals, level, now, childCountOf],
  );

  // Filter option lists — derived from the FULL level's rows (not the
  // already-filtered view), so picking one filter never shrinks another
  // filter's own option list out from under the user.
  const areaOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(r.g.area?.trim() ? r.g.area.trim() : "Unassigned");
    return [...s].sort();
  }, [allRows]);
  const typeOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(pillarOf(r.g) ?? "Unspecified");
    return [...s].sort();
  }, [allRows]);
  const delegateOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) {
      for (const d of r.g.delegatedTo ?? []) {
        if (!m.has(d.employeeId)) m.set(d.employeeId, d.name ?? "Unknown");
      }
    }
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows]);

  // A filter value that no longer exists in this level's data (data changed
  // underneath it) silently drops out rather than filtering to nothing.
  React.useEffect(() => {
    const nextArea = filters.area.filter((a) => areaOptions.includes(a));
    const nextType = filters.type.filter((t) => typeOptions.includes(t));
    const nextDelegate = filters.delegate && delegateOptions.some((d) => d.value === filters.delegate) ? filters.delegate : null;
    if (
      nextArea.length !== filters.area.length ||
      nextType.length !== filters.type.length ||
      nextDelegate !== filters.delegate
    ) {
      setFilters({ ...filters, area: nextArea, type: nextType, delegate: nextDelegate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaOptions, typeOptions, delegateOptions]);

  const viewRows = React.useMemo(
    () => allRows.filter((r) => matchesFilters(r.g, r.band, filters)),
    [allRows, filters],
  );

  const m = React.useMemo(() => buildModel(viewRows, level), [viewRows, level]);
  const delegation = React.useMemo(
    () => computeDelegationStats(viewRows, props.roster ?? EMPTY_ROSTER),
    [viewRows, props.roster],
  );

  // Goals by quarter + quarterly attainment — quarters of THIS FY, real data
  // only (year level only; quarters are the Yearly view's own child bucket).
  const quarters = React.useMemo(
    () => (level === "year" ? buildQuarterBreakdown(allGoals, fyStartYear, now) : null),
    [level, allGoals, fyStartYear, now],
  );

  // Drill state.
  const [drill, setDrill] = React.useState<Drill | null>(null);
  const toggleDrill = React.useCallback((d: Drill) => {
    setDrill((cur) => (cur?.id === d.id ? null : d));
  }, []);
  const drilled = React.useMemo(
    () => (drill ? viewRows.filter(drill.test).sort((a, b) => b.eff - a.eff) : []),
    [drill, viewRows],
  );
  // Drill can go stale when the filters change it out of the set.
  React.useEffect(() => {
    setDrill(null);
  }, [filters]);

  if (!mounted) return <DashboardSkeleton />;
  if (allRows.length === 0) return <DashboardEmpty level={level} />;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filter bar ── */}
      <FilterBar
        filters={filters}
        onFilters={setFilters}
        areaOptions={areaOptions}
        typeOptions={typeOptions}
        delegateOptions={delegateOptions}
        showing={viewRows.length}
        total={allRows.length}
      />

      {/* ── 2 · KPI row ── */}
      <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
        <SectionHeader
          icon={<LayoutDashboard size={17} strokeWidth={2.2} />}
          title="Overview"
          subtitle="Key metrics at a glance"
        />
        <KpiRow model={m} drill={drill} onDrill={toggleDrill} reduce={reduce} />
      </section>

      {/* ── 3 · Pace distribution + tracking to plan, side by side ── */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4 max-xl:grid-cols-1">
        <Distribution
          model={m}
          activeBand={
            drill?.id.startsWith("band:") ? (drill.id.slice(5) as DisplayBand) : null
          }
          onPick={(band) =>
            toggleDrill({
              id: `band:${band}`,
              label: BAND_META[band].label,
              color: BAND_META[band].color,
              test: (r) => r.band === band,
            })
          }
        />
        <TrackingToPlanPanel model={m} />
      </div>

      {/* ── 4 + 5 · At-risk action list + cascade coverage, side by side ── */}
      {m.coverage ? (
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <AtRiskList rows={m.atRiskRows} total={m.total} />
          <CoveragePanel coverage={m.coverage} total={m.total} level={level} />
        </div>
      ) : (
        <AtRiskList rows={m.atRiskRows} total={m.total} />
      )}

      {/* ── Goals by quarter + quarterly attainment (year level only —
          quarters are its own child bucket) ── */}
      {quarters && (
        <QuarterPanel
          quarters={quarters}
          activeLabel={drill?.id.startsWith("quarter:") ? drill.id.slice(8) : null}
          onPick={(label, key) =>
            toggleDrill({
              id: `quarter:${label}`,
              label: `Quarter · ${label}`,
              color: "var(--color-altus-red-deep)",
              test: (r) => r.g.period === "quarter" && r.g.periodKey === key,
            })
          }
        />
      )}

      {/* ── 6 + 7 · Goals by area/type beside Ownership + delegation ── */}
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <GroupedBreakdownPanel
          byArea={m.byArea}
          byPillar={m.byPillar}
          activeArea={drill?.id.startsWith("area:") ? drill.id.slice(5) : null}
          activePillar={drill?.id.startsWith("pillar:") ? drill.id.slice(7) : null}
          onPickArea={(label) =>
            toggleDrill({
              id: `area:${label}`,
              label: `Area · ${label}`,
              color: "var(--color-altus-red-deep)",
              test: (r) => (r.g.area?.trim() ? r.g.area.trim() : "Unassigned") === label,
            })
          }
          onPickPillar={(label) =>
            toggleDrill({
              id: `pillar:${label}`,
              label: `Type · ${label}`,
              color: "var(--color-altus-red-deep)",
              test: (r) => (pillarOf(r.g) ?? "Unspecified") === label,
            })
          }
        />

        <div className="flex flex-col gap-4">
          <OwnershipPanel model={m} />
          {delegation.byPerson.length > 0 && (
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <DelegatedByPersonPanel delegation={delegation} />
              <DelegateSharePanel delegation={delegation} />
            </div>
          )}
        </div>
      </div>

      {/* ── Area × type matrix ── */}
      <AreaTypeMatrixPanel rows={viewRows} />

      {/* ── 8 · Actual vs target ── */}
      {m.rupee || m.qty ? <ActualVsTargetPanel rows={viewRows} /> : <AccountabilityCallout model={m} />}

      {/* ── Smart insights ── */}
      <SmartInsightsPanel model={m} rows={viewRows} />

      {/* ── 9 · Drill-down ── */}
      {drill && <DrillPanel drill={drill} rows={drilled} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ====================================================================== */
/* Filter bar — Area / Type / Owner / Delegate / Status, all cascading    */
/* into every chart AND the goal table below (shared `matchesFilters`).   */
/* ====================================================================== */

function FilterBar({
  filters,
  onFilters,
  areaOptions,
  typeOptions,
  delegateOptions,
  showing,
  total,
}: {
  filters: DashboardFilters;
  onFilters: (f: DashboardFilters) => void;
  areaOptions: string[];
  typeOptions: string[];
  delegateOptions: { value: string; label: string }[];
  showing: number;
  total: number;
}) {
  const statusOptions = BAND_ORDER.map((b) => BAND_META[b].label);
  const labelToBand = new Map(BAND_ORDER.map((b) => [BAND_META[b].label, b]));
  const filtered =
    filters.area.length > 0 ||
    filters.type.length > 0 ||
    filters.owner !== "all" ||
    !!filters.delegate ||
    filters.status.length > 0;

  return (
    <div className="wg-rise flex flex-wrap items-center gap-2.5">
      <MultiPick
        label="Area"
        options={areaOptions}
        selected={new Set(filters.area)}
        onChange={(next) => onFilters({ ...filters, area: [...next] })}
      />
      <MultiPick
        label="Type"
        options={typeOptions}
        selected={new Set(filters.type)}
        onChange={(next) => onFilters({ ...filters, type: [...next] })}
      />

      {/* Owner segmented toggle */}
      <div
        role="tablist"
        aria-label="Owner"
        className="inline-flex items-center gap-1 rounded-full border p-1"
        style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
      >
        {(
          [
            { id: "all", label: "All owners" },
            { id: "self", label: "Self" },
            { id: "assigned", label: "Assigned" },
          ] as const
        ).map((o) => {
          const active = filters.owner === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onFilters({ ...filters, owner: o.id })}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-all ${FOCUS_RING}`}
              style={{
                background: active
                  ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                  : "transparent",
                color: active ? "#fff" : "var(--color-ink-muted)",
                boxShadow: active ? "0 6px 16px -8px rgba(168,4,0,0.55)" : "none",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <SinglePick
        label="Delegate"
        options={delegateOptions}
        selected={filters.delegate}
        onChange={(v) => onFilters({ ...filters, delegate: v })}
      />

      <MultiPick
        label="Status"
        options={statusOptions}
        selected={new Set(filters.status.map((b) => BAND_META[b].label))}
        onChange={(next) =>
          onFilters({ ...filters, status: [...next].map((label) => labelToBand.get(label)!).filter(Boolean) })
        }
      />

      <span className="ml-auto flex items-center gap-2 text-[12px] font-semibold text-ink-subtle tabular-nums">
        {filtered ? (
          <>
            showing <span className="font-black text-ink-soft">{showing}</span> of {total}
          </>
        ) : (
          <>
            <span className="font-black text-ink-soft">{total}</span> adopted goal{total === 1 ? "" : "s"}
          </>
        )}
        {filtered && (
          <button
            type="button"
            onClick={() => onFilters(DEFAULT_DASHBOARD_FILTERS)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold text-ink-subtle transition-colors hover:text-ink-strong ${FOCUS_RING}`}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <X size={11} strokeWidth={2.6} /> Clear
          </button>
        )}
      </span>
    </div>
  );
}

/** Multi-select chip popover — Area / Type / Status. */
function MultiPick({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const active = selected.size > 0;
  const summary = selected.size === 0 ? `All ${label}` : selected.size === 1 ? [...selected][0] : `${selected.size} ${label}`;
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
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-all cursor-pointer ${FOCUS_RING}`}
          style={
            active
              ? {
                  borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
                  background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }
              : { borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)", color: "var(--color-ink-soft)" }
          }
        >
          {summary}
          <ChevronDown size={14} strokeWidth={2.4} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1.5">
        <div className="max-h-[280px] overflow-auto">
          {options.length === 0 && <p className="px-2 py-2 text-[12.5px] text-ink-subtle">No {label.toLowerCase()} yet.</p>}
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
                  style={checked ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" } : { borderColor: "var(--color-hairline-strong)" }}
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

/** Single-select popover — Delegate. */
function SinglePick({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const active = selected != null;
  const summary = active ? (options.find((o) => o.value === selected)?.label ?? label) : label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-all cursor-pointer ${FOCUS_RING}`}
          style={
            active
              ? {
                  borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
                  background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }
              : { borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)", color: "var(--color-ink-soft)" }
          }
        >
          <Share2 size={13} strokeWidth={2.4} className="opacity-70" />
          {summary}
          <ChevronDown size={14} strokeWidth={2.4} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-1.5">
        <div className="max-h-[280px] overflow-auto">
          {options.length === 0 && <p className="px-2 py-2 text-[12.5px] text-ink-subtle">No delegated goals yet.</p>}
          {options.map((o) => {
            const checked = selected === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(checked ? null : o.value);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
              >
                <span
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded border"
                  style={checked ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" } : { borderColor: "var(--color-hairline-strong)" }}
                >
                  {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`mt-1 flex w-full cursor-pointer items-center justify-center rounded-md py-1.5 text-[12px] font-bold text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong ${FOCUS_RING}`}
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[12px] font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
      style={{
        borderColor: active ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
        background: active ? "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" : "transparent",
        color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-muted)",
      }}
    >
      {children}
    </button>
  );
}

/** Section header — a small colored icon chip + bold title + grey subtitle,
 *  used consistently above every panel on the dashboard. */
function SectionHeader({
  icon,
  title,
  subtitle,
  accent = "var(--color-altus-red-deep)",
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accent?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}
        >
          {icon}
        </span>
        <div>
          <h3 className="font-black leading-tight text-ink-strong" style={{ fontSize: 15, letterSpacing: "-0.01em" }}>
            {title}
          </h3>
          {subtitle && <p className="text-[12px] font-semibold text-ink-subtle">{subtitle}</p>}
        </div>
      </div>
      {trailing && <div className="pt-1.5">{trailing}</div>}
    </div>
  );
}

/* ====================================================================== */
/* 2 · KPI row                                                            */
/* ====================================================================== */

interface Kpi {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  numeric: number | null;
  sub: React.ReactNode;
  accent: string;
  drill?: Drill;
}

function KpiRow({
  model,
  drill,
  onDrill,
  reduce,
}: {
  model: Model;
  drill: Drill | null;
  onDrill: (d: Drill) => void;
  reduce: boolean;
}) {
  const kpis: Kpi[] = [];

  kpis.push({
    key: "total",
    icon: <Target size={16} strokeWidth={2.4} />,
    label: "Total goals",
    value: String(model.total),
    numeric: model.total,
    sub: "adopted this period",
    accent: BLUE,
  });

  kpis.push({
    key: "attn",
    icon: <Gauge size={16} strokeWidth={2.4} />,
    label: "Average attainment",
    value: `${model.weighted}%`,
    numeric: model.weighted,
    sub:
      model.paceDelta >= 0 ? (
        <span style={{ color: GREEN }}>▲ {model.paceDelta} pts ahead of pace</span>
      ) : (
        <span style={{ color: model.paceDelta <= -25 ? RED : AMBER }}>
          ▼ {Math.abs(model.paceDelta)} pts behind pace
        </span>
      ),
    accent: GREEN,
  });

  kpis.push({
    key: "delegatedCount",
    icon: <Share2 size={16} strokeWidth={2.4} />,
    label: "Delegated goals",
    value: String(model.accountability.delegated),
    numeric: model.accountability.delegated,
    sub: "handed to a team member",
    accent: ORANGE,
    drill:
      model.accountability.delegated > 0
        ? { id: "kpi:delegated", label: "Delegated goals", color: ORANGE, test: (r) => (r.g.delegatedTo ?? []).length > 0 }
        : undefined,
  });

  kpis.push({
    key: "atrisk",
    icon: <AlertTriangle size={16} strokeWidth={2.4} />,
    label: "Goals at risk",
    value: String(model.needsAttention),
    numeric: model.needsAttention,
    sub: "at-risk · overdue · spillover",
    accent: RED,
    drill:
      model.needsAttention > 0
        ? {
            id: "kpi:risk",
            label: "At-risk goals",
            color: RED,
            test: (r) => r.band === "at-risk" || r.band === "overdue" || r.band === "spillover",
          }
        : undefined,
  });

  return (
    // One line — a true grid row, so every card gets the exact same column
    // width and the same row height regardless of label length, with no
    // content-driven overflow pushing any single card wider than the rest.
    <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))` }}>
      {kpis.map((k, i) => (
        <KpiCard
          key={k.key}
          kpi={k}
          index={i}
          reduce={reduce}
          active={!!k.drill && drill?.id === k.drill.id}
          onSelect={k.drill ? () => onDrill(k.drill!) : undefined}
        />
      ))}
    </div>
  );
}

function KpiCard({
  kpi,
  index,
  reduce,
  active,
  onSelect,
}: {
  kpi: Kpi;
  index: number;
  reduce: boolean;
  active: boolean;
  onSelect?: () => void;
}) {
  const animated = useCountUp(kpi.numeric ?? 0, !reduce && kpi.numeric != null);
  const shown =
    kpi.numeric != null
      ? kpi.value.includes("%")
        ? `${Math.round(animated)}%`
        : String(Math.round(animated))
      : kpi.value;

  const clickable = !!onSelect;
  const Tag: React.ElementType = clickable ? "button" : "div";

  return (
    <Tag
      {...(clickable ? { type: "button", onClick: onSelect, "aria-pressed": active } : {})}
      className={`wg-rise flex h-full min-w-0 flex-col rounded-xl px-5 py-4 text-left transition-all ${
        clickable ? `cursor-pointer hover:-translate-y-px ${FOCUS_RING}` : ""
      }`}
      style={{
        animationDelay: `${index * 45}ms`,
        background: `color-mix(in srgb, ${kpi.accent} 7%, var(--color-surface-card))`,
        border: `1px solid color-mix(in srgb, ${kpi.accent} 22%, var(--color-hairline-strong))`,
        borderBottom: `3px solid ${kpi.accent}`,
        boxShadow: active
          ? `0 1px 2px rgba(15,23,42,0.04), 0 8px 20px -12px ${kpi.accent}`
          : "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[11px] font-black uppercase leading-tight tracking-[0.08em] text-ink-subtle">
          {kpi.label}
        </span>
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${kpi.accent} 18%, transparent)`, color: kpi.accent }}
        >
          {kpi.icon}
        </span>
      </div>
      <div
        className="mt-2.5 font-black tabular-nums leading-none"
        style={{ fontFamily: DISPLAY, fontSize: 34, letterSpacing: "-0.02em", color: kpi.accent }}
      >
        {shown}
      </div>
      <div className="relative mt-auto pt-2 text-[12.5px] font-semibold text-ink-subtle tabular-nums">
        {kpi.sub}
      </div>
    </Tag>
  );
}

/* ====================================================================== */
/* 3 · Pace / health distribution                                        */
/* ====================================================================== */

function Distribution({
  model,
  activeBand,
  onPick,
}: {
  model: Model;
  activeBand: DisplayBand | null;
  onPick: (b: DisplayBand) => void;
}) {
  const total = model.total;
  const labelToBand = new Map(BAND_ORDER.map((b) => [BAND_META[b].label, b]));
  const bars: HBarRow[] = BAND_ORDER.map((b) => {
    const c = model.counts[b];
    const pct = total ? Math.round((c / total) * 100) : 0;
    return {
      label: BAND_META[b].label,
      value: pct,
      color: activeBand === b ? BAND_META[b].color : c > 0 ? BAND_META[b].color : "var(--color-hairline-strong)",
    };
  });

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<BarChart3 size={17} strokeWidth={2.2} />}
        title="Pace distribution"
        subtitle="Goals grouped by how they're tracking"
        trailing={<span className="text-[11px] font-semibold text-ink-subtle">click a band to drill in</span>}
      />

      <VBars
        data={bars}
        height={280}
        maxValue={100}
        rightLabel={(row) => `${row.value}% · ${model.counts[labelToBand.get(row.label)!]}`}
        onBarClick={(row) => {
          const b = labelToBand.get(row.label);
          if (b && model.counts[b] > 0) onPick(b);
        }}
      />

    </section>
  );
}

/* ====================================================================== */
/* 3b · Tracking to plan — separate panel, beside the pace chart          */
/* ====================================================================== */

function TrackingToPlanPanel({ model }: { model: Model }) {
  const total = model.total;
  const tracking = model.done + model.onPace; // done + ahead + on-track
  const trackingPct = total ? Math.round((tracking / total) * 100) : 0;
  const gap = model.weighted - model.avgExpected;
  const gapColor = gap >= 0 ? GREEN : RED;
  const attention = model.atRisk + model.overdue;

  const slices: DonutSlice[] =
    total > 0
      ? [
          { label: "Tracking", value: tracking, color: GREEN },
          { label: "Behind", value: total - tracking, color: "var(--color-hairline-strong)" },
        ]
      : [];

  return (
    <section className="wg-rise flex flex-col rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<Target size={17} strokeWidth={2.2} />}
        title="Tracking to plan"
        subtitle={total ? `${tracking} of ${total} goals on schedule` : "No adopted goals yet"}
      />

      {total > 0 && (
        <>
          <div className="flex items-center justify-center py-1">
            <Donut data={slices} size={144} centerValue={`${trackingPct}%`} centerLabel="Tracking" />
          </div>

          <div
            className="mt-3 grid grid-cols-3 divide-x rounded-xl px-1 py-2.5"
            style={{ background: "var(--color-surface-soft)", borderColor: "var(--color-hairline)" }}
          >
            <div className="px-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">Attained</p>
              <p className="text-[18px] font-black tabular-nums text-ink-strong">{model.weighted}%</p>
            </div>
            <div className="px-3 text-center" style={{ borderColor: "var(--color-hairline)" }}>
              <p className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">Expected</p>
              <p className="text-[18px] font-black tabular-nums text-ink-soft">{model.avgExpected}%</p>
            </div>
            <div className="px-3 text-center" style={{ borderColor: "var(--color-hairline)" }}>
              <p className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">Gap</p>
              <p className="text-[18px] font-black tabular-nums" style={{ color: gapColor }}>
                {gap >= 0 ? "+" : "−"}{Math.abs(gap)}
              </p>
            </div>
          </div>

          <div
            className="mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
            style={{
              background:
                attention > 0
                  ? `color-mix(in srgb, ${RED} 7%, transparent)`
                  : `color-mix(in srgb, ${GREEN} 8%, transparent)`,
            }}
          >
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg"
              style={{
                background:
                  attention > 0
                    ? `color-mix(in srgb, ${RED} 14%, transparent)`
                    : `color-mix(in srgb, ${GREEN} 14%, transparent)`,
                color: attention > 0 ? RED : GREEN,
              }}
            >
              {attention > 0 ? <AlertTriangle size={15} strokeWidth={2.6} /> : <CheckCircle2 size={16} strokeWidth={2.4} />}
            </span>
            <p className="text-[12.5px] font-semibold leading-snug text-ink-soft">
              {attention > 0 ? (
                <>
                  <span className="font-black text-ink-strong tabular-nums">{attention}</span>{" "}
                  goal{attention === 1 ? "" : "s"} need attention
                  {model.overdue > 0 && (
                    <>
                      {" "}
                      · <span className="font-black tabular-nums" style={{ color: RED_DEEP }}>{model.overdue}</span> overdue
                    </>
                  )}
                </>
              ) : (
                <>All {total} goals are tracking to schedule — nothing behind pace.</>
              )}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/* ====================================================================== */
/* Yearly performance trend — actual vs expected, one point per quarter   */
/* ====================================================================== */

function QuarterPanel({
  quarters,
  activeLabel,
  onPick,
}: {
  quarters: QuarterPoint[];
  activeLabel: string | null;
  onPick: (label: string, key: string) => void;
}) {
  const withData = quarters.filter((p) => p.actual != null).length;
  const hasAny = quarters.some((p) => p.count > 0);
  const keyByLabel = new Map(quarters.map((q) => [q.label, q.key]));

  const bars: HBarRow[] = quarters.map((q) => ({
    label: q.label,
    value: q.count,
    color: activeLabel === q.label ? "var(--color-altus-red)" : q.count > 0 ? BLUE : "var(--color-hairline-strong)",
  }));

  return (
    <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
      <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
        <SectionHeader
          icon={<LineChart size={17} strokeWidth={2.2} />}
          title="Goals by quarter"
          subtitle="Adopted goal count, quarter by quarter"
          accent={BLUE}
        />
        {!hasAny ? (
          <p className="py-6 text-center text-[13px] font-semibold text-ink-subtle">
            No quarter goals cascaded yet this FY.
          </p>
        ) : (
          <VBars
            data={bars}
            height={200}
            onBarClick={(row) => {
              const key = keyByLabel.get(row.label);
              if (key && row.value > 0) onPick(row.label, key);
            }}
          />
        )}
      </section>

      <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
        <SectionHeader
          icon={<LineChart size={17} strokeWidth={2.2} />}
          title="Quarterly attainment"
          subtitle="Actual vs expected pace"
          trailing={
            <span className="flex items-center gap-3 text-[11px] font-semibold text-ink-subtle">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-[2.5px] w-3 rounded-full" style={{ background: "var(--color-altus-red)" }} />
                Actual
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-[2px] w-3 rounded-full"
                  style={{ background: "var(--color-ink-subtle)", opacity: 0.6 }}
                />
                Expected
              </span>
            </span>
          }
        />

        {withData < 2 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-[13px] font-bold text-ink-soft">No historical data available</p>
            <p className="max-w-[36ch] text-[12px] font-semibold text-ink-subtle">
              Attainment will chart here once goals are cascaded into more than one quarter of this FY.
            </p>
          </div>
        ) : (
          <TrendLine data={quarters} />
        )}
      </section>
    </div>
  );
}

/* ====================================================================== */
/* 4 · At-risk & overdue action list                                     */
/* ====================================================================== */

function AtRiskList({ rows, total }: { rows: Row[]; total: number }) {
  return (
    <section
      className="wg-rise overflow-hidden rounded-2xl"
      style={{ ...PANEL, borderBottom: `3px solid ${RED}` }}
    >
      <div className="px-5 pt-4 pb-1">
        <SectionHeader
          icon={<AlertTriangle size={17} strokeWidth={2.2} />}
          title="Needs attention"
          subtitle="Worst pace gap first"
          accent={RED}
          trailing={
            <span
              className="rounded-full px-2 py-0.5 text-[11.5px] font-black tabular-nums text-white"
              style={{ background: RED }}
            >
              {rows.length}
            </span>
          }
        />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 pb-6 pt-2 text-center">
          <span
            className="inline-flex size-11 items-center justify-center rounded-full"
            style={{ background: `color-mix(in srgb, ${GREEN} 12%, transparent)`, color: GREEN }}
          >
            <CheckCircle2 size={22} strokeWidth={2.4} />
          </span>
          <p className="text-[13.5px] font-bold text-ink-strong">Everything on pace</p>
          <p className="text-[12px] font-semibold text-ink-subtle">
            All {total} goal{total === 1 ? "" : "s"} are ahead of or tracking to schedule.
          </p>
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr style={{ background: "var(--color-surface-soft)" }}>
                <th className="px-5 py-2 text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">#</th>
                <th className="px-2 py-2 text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">Goal</th>
                <th className="px-2 py-2 text-right text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">
                  Status
                </th>
                <th className="px-5 py-2 text-right text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">
                  Attainment
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <AtRiskRow key={r.g.id} row={r} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AtRiskRow({ row, rank }: { row: Row; rank: number }) {
  const { g, eff, band, daysLate } = row;
  const meta = BAND_META[band];
  return (
    <tr className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
      <td className="px-5 py-3 text-[13px] font-black tabular-nums text-ink-subtle">{rank}</td>
      <td className="min-w-0 px-2 py-3">
        <div className="max-w-[260px] truncate text-[13.5px] font-bold text-ink-strong" title={g.title}>
          {g.title}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-right">
        <span className="text-[11.5px] font-black uppercase tracking-[0.04em]" style={{ color: meta.color }}>
          {daysLate > 0 ? `${daysLate}d late` : meta.short}
        </span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <span
            className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full max-sm:w-14"
            style={{ background: "var(--color-surface-soft)" }}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, eff)}%`, background: meta.color }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-[12.5px] font-black tabular-nums" style={{ color: meta.color }}>
            {eff}%
          </span>
        </div>
      </td>
    </tr>
  );
}

/* ====================================================================== */
/* 5 · Cascade coverage                                                   */
/* ====================================================================== */

function CoveragePanel({
  coverage,
  total,
  level,
}: {
  coverage: NonNullable<Model["coverage"]>;
  total: number;
  level: GoalPeriod;
}) {
  const child = CHILD_NOUN[level] || "child";
  const tone = coverage.pct >= 80 ? GREEN : coverage.pct >= 50 ? AMBER : RED;
  const orphanColor = coverage.orphans.length > 0 ? RED : "var(--color-hairline-strong)";

  const slices: DonutSlice[] =
    total > 0
      ? [
          { label: "Cascaded", value: coverage.withChildren, color: tone },
          { label: "Orphaned", value: coverage.orphans.length, color: orphanColor },
        ]
      : [];

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<GitBranch size={17} strokeWidth={2.2} />}
        title="Cascade coverage"
        subtitle={`Which goals are broken down into ${child} goals`}
        accent={BLUE}
      />

      <div className="grid grid-cols-[auto_1fr] items-center gap-6 max-sm:grid-cols-1 max-sm:justify-items-center">
        <Donut data={slices} size={132} centerValue={`${coverage.pct}%`} centerLabel="Cascaded" />

        <div className="text-[11.5px] font-semibold text-ink-subtle">
          <div className="tabular-nums">
            <span className="font-black text-ink-soft">{coverage.withChildren}</span> of {total} goals have a
            breakdown
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="size-2 shrink-0 rounded-full" style={{ background: tone }} />
              <span className="font-black text-ink-soft">{coverage.withChildren}</span> cascaded
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums" style={{ color: orphanColor }}>
              <span className="size-2 shrink-0 rounded-full" style={{ background: orphanColor }} />
              <span className="font-black">{coverage.orphans.length}</span> orphaned
            </span>
          </div>
        </div>
      </div>

      {coverage.orphans.length > 0 && (
        <div className="mt-3.5 border-t pt-3" style={{ borderColor: "var(--color-hairline)" }}>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
            Needs breakdown · biggest first
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {coverage.orphans.slice(0, 8).map((r) => (
              <li
                key={r.g.id}
                className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold text-ink-soft"
                style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
                title={r.g.title}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: RED }} />
                <span className="truncate">{r.g.title}</span>
              </li>
            ))}
            {coverage.orphans.length > 8 && (
              <li className="inline-flex items-center px-2 py-1 text-[12px] font-bold tabular-nums text-ink-subtle">
                +{coverage.orphans.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ====================================================================== */
/* 6 · Goals by area / type — one bar per category, two toggles           */
/* ====================================================================== */

/** One bar per category — a dimension toggle switches Area ↔ Type, a metric
 *  toggle switches Count ↔ Attainment, so only one number reads per bar at
 *  a time instead of two bars stacked per category. */
function GroupedBreakdownPanel({
  byArea,
  byPillar,
  activeArea,
  activePillar,
  onPickArea,
  onPickPillar,
}: {
  byArea: Group[];
  byPillar: Group[];
  activeArea: string | null;
  activePillar: string | null;
  onPickArea: (label: string) => void;
  onPickPillar: (label: string) => void;
}) {
  const [dim, setDim] = React.useState<"area" | "type">("area");
  const [metric, setMetric] = React.useState<"count" | "pct">("count");
  const groups = dim === "area" ? byArea : byPillar;
  const activeLabel = dim === "area" ? activeArea : activePillar;
  const onPick = dim === "area" ? onPickArea : onPickPillar;

  const toneOf = (pct: number) => (pct >= 100 ? GREEN : pct >= 60 ? AMBER : "var(--color-altus-red-deep)");
  const sorted = React.useMemo(() => {
    const list = groups.slice(0, 8);
    return metric === "pct" ? [...list].sort((a, b) => b.pct - a.pct) : list; // count = the model's own default order
  }, [groups, metric]);
  const totalCount = groups.reduce((s, g) => s + g.count, 0);

  const bars: HBarRow[] = sorted.map((g) => ({
    label: g.label,
    value: metric === "pct" ? g.pct : g.count,
    color: activeLabel === g.label ? "var(--color-altus-red)" : metric === "pct" ? toneOf(g.pct) : TEAL,
  }));

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={dim === "area" ? <Network size={17} strokeWidth={2.2} /> : <Boxes size={17} strokeWidth={2.2} />}
        title={dim === "area" ? "Goals by area" : "Goals by type"}
        subtitle={metric === "count" ? "Goal count" : "Weighted attainment"}
        trailing={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: "var(--color-hairline-strong)" }}>
              {(["count", "pct"] as const).map((mt) => (
                <button
                  key={mt}
                  type="button"
                  onClick={() => setMetric(mt)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${FOCUS_RING}`}
                  style={{
                    background: metric === mt ? "var(--color-altus-red-deep)" : "transparent",
                    color: metric === mt ? "#fff" : "var(--color-ink-subtle)",
                  }}
                >
                  {mt === "count" ? "Count" : "Attainment"}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: "var(--color-hairline-strong)" }}>
              {(["area", "type"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDim(d)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${FOCUS_RING}`}
                  style={{
                    background: dim === d ? "var(--color-altus-red-deep)" : "transparent",
                    color: dim === d ? "#fff" : "var(--color-ink-subtle)",
                  }}
                >
                  {d === "area" ? "By area" : "By type"}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {groups.length === 0 ? (
        <p className="py-3 text-[13px] font-semibold text-ink-subtle">No goals to group.</p>
      ) : (
        <>
          <HBars
            data={bars}
            height={Math.max(60, sorted.length * 40)}
            maxValue={metric === "pct" ? 100 : undefined}
            rightLabel={(row) =>
              metric === "pct"
                ? `${row.value}%`
                : `${row.value} · ${totalCount > 0 ? Math.round((row.value / totalCount) * 100) : 0}%`
            }
            onBarClick={(row) => onPick(row.label)}
          />
          {activeLabel && <p className="mt-2 text-[11px] font-semibold text-ink-subtle">Selected: {activeLabel}</p>}
        </>
      )}
    </section>
  );
}

/* ====================================================================== */
/* 7 · Ownership / delegation                                             */
/* ====================================================================== */

function OwnershipPanel({ model }: { model: Model }) {
  const a = model.accountability;

  const splits: Array<{ label: string; value: number; color: string; hint: string }> = [
    { label: "Self", value: a.self, color: SLATE, hint: "created by owner" },
    { label: "Assigned", value: a.assigned, color: "var(--color-altus-red-deep)", hint: "given by a manager" },
    { label: "Delegated", value: a.delegated, color: BLUE, hint: "handed to a member" },
  ];

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<Users size={17} strokeWidth={2.2} />}
        title="Ownership"
        subtitle="Who owns, delegates, and reviews these goals"
        accent={BLUE}
      />

      <div className="grid grid-cols-3 gap-2">
        {splits.map((s) => (
          <div
            key={s.label}
            className="rounded-xl px-3 py-3"
            style={{ background: `color-mix(in srgb, ${s.color} 8%, transparent)` }}
          >
            <div className="tabular-nums font-black leading-none" style={{ fontFamily: DISPLAY, fontSize: 24, color: s.color }}>
              {s.value}
            </div>
            <div className="mt-1 text-[12.5px] font-bold text-ink-strong">{s.label}</div>
            <div className="text-[10.5px] font-medium text-ink-subtle">{s.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Only people who actually carry delegated goals, never the full roster. */
function DelegatedByPersonPanel({ delegation }: { delegation: DelegationStats }) {
  const bars: HBarRow[] = delegation.byPerson.slice(0, 8).map((p) => ({ label: p.name, value: p.goalCount, color: BLUE }));
  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader icon={<Users size={17} strokeWidth={2.2} />} title="Delegated by person" subtitle="Who's carrying delegated goals" accent={BLUE} />
      <HBars data={bars} height={Math.max(60, bars.length * 36)} rightLabel={(row) => `${row.value} goal${row.value === 1 ? "" : "s"}`} />
    </section>
  );
}

function DelegateSharePanel({ delegation }: { delegation: DelegationStats }) {
  const bars: HBarRow[] = [...delegation.byPerson]
    .sort((x, y) => y.avgSharePct - x.avgSharePct)
    .slice(0, 8)
    .map((p) => ({ label: p.name, value: p.avgSharePct, color: ORANGE }));
  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader icon={<Share2 size={17} strokeWidth={2.2} />} title="Delegate share %" subtitle="Average share held per delegate" accent={ORANGE} />
      <HBars data={bars} height={Math.max(60, bars.length * 36)} maxValue={100} rightLabel={(row) => `${row.value}%`} />
    </section>
  );
}

/** Fallback second-column card when there are no ₹/qty measures — keep the
 *  accountability review detail visible so the row never looks lopsided. */
function AccountabilityCallout({ model }: { model: Model }) {
  const a = model.accountability;
  return (
    <section className="wg-rise flex flex-col justify-center rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<Target size={17} strokeWidth={2.2} />}
        title="Measures"
        subtitle="₹ and quantity targets across these goals"
      />
      <p className="text-[13px] font-semibold text-ink-subtle">
        No ₹ or quantity targets set on these goals — attainment is tracked by self-rated / reviewed progress
        only.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums text-ink-soft"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
        >
          <ShieldCheck size={13} strokeWidth={2.6} style={{ color: GREEN }} />
          {a.reviewed} reviewed · {a.selfOnly} self-rated
        </span>
      </div>
    </section>
  );
}

/* ====================================================================== */
/* Actual vs target — literal side-by-side comparison bars                */
/* ====================================================================== */

type AvTScope = "overall" | "area" | "type";

function ActualVsTargetPanel({ rows }: { rows: Row[] }) {
  const [scope, setScope] = React.useState<AvTScope>("overall");

  const groups = React.useMemo(() => {
    if (scope === "overall") return [{ label: "Overall", rows }];
    const key = scope === "area" ? (r: Row) => (r.g.area?.trim() ? r.g.area.trim() : "Unassigned") : (r: Row) => pillarOf(r.g) ?? "Unspecified";
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()]
      .map(([label, rs]) => ({ label, rows: rs }))
      .sort((a, b) => b.rows.length - a.rows.length)
      .slice(0, 6);
  }, [rows, scope]);

  const bars = groups
    .map((g) => {
      const { rupee, qty } = aggregateMeasures(g.rows);
      const measure = rupee ?? qty; // no target=0/no-target goal ever reaches here
      if (!measure) return null;
      const pct = measure.target > 0 ? Math.round((measure.actual / measure.target) * 100) : 0;
      return { label: g.label, actual: measure.actual, target: measure.target, pct, isRupee: !!rupee };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<ArrowLeftRight size={17} strokeWidth={2.2} />}
        title="Actual vs target"
        subtitle="Target vs actual, side by side"
        trailing={
          <div className="inline-flex items-center gap-0.5 rounded-full border p-0.5" style={{ borderColor: "var(--color-hairline-strong)" }}>
            {(["overall", "area", "type"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${FOCUS_RING}`}
                style={{
                  background: scope === s ? "var(--color-altus-red-deep)" : "transparent",
                  color: scope === s ? "#fff" : "var(--color-ink-subtle)",
                }}
              >
                {s === "overall" ? "Overall" : s === "area" ? "By area" : "By type"}
              </button>
            ))}
          </div>
        }
      />

      {bars.length === 0 ? (
        <p className="py-3 text-[13px] font-semibold text-ink-subtle">No measurable targets in this view.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {bars.map((b) => {
            const fmt = (n: number) => (b.isRupee ? `₹${fmtNum(n)}` : fmtNum(n));
            const tone = b.pct >= 100 ? GREEN : b.pct >= 60 ? AMBER : "var(--color-altus-red-deep)";
            return (
              <li key={b.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12.5px] font-black text-ink-strong">{b.label}</span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: tone }}>
                    {b.pct}% achieved
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10.5px] font-black uppercase text-ink-subtle">Target</span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
                      <span className="absolute inset-y-0 left-0 w-full rounded-full" style={{ background: "var(--color-hairline-strong)" }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-ink-soft">{fmt(b.target)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10.5px] font-black uppercase text-ink-subtle">Actual</span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${Math.min(100, b.pct)}%`, background: tone }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[11.5px] font-bold tabular-nums" style={{ color: tone }}>
                      {fmt(b.actual)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ====================================================================== */
/* Area × type matrix                                                     */
/* ====================================================================== */

function AreaTypeMatrixPanel({ rows }: { rows: Row[] }) {
  const matrix = React.useMemo(() => computeAreaTypeMatrix(rows), [rows]);

  if (matrix.areas.length === 0 || matrix.types.length === 0) return null;

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader
        icon={<Grid3x3 size={17} strokeWidth={2.2} />}
        title="Area × type matrix"
        subtitle="What kind of goals are concentrated where"
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-[10.5px] font-black uppercase tracking-[0.06em] text-ink-subtle">Area</th>
              {matrix.types.map((t) => (
                <th key={t} className="px-2 py-1.5 text-center text-[10.5px] font-black uppercase tracking-[0.06em] text-ink-subtle">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.areas.map((a) => (
              <tr key={a} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                <td className="px-2 py-1.5 text-[12.5px] font-bold text-ink-strong">{a}</td>
                {matrix.types.map((t) => {
                  const n = matrix.cells.get(`${a}|${t}`) ?? 0;
                  const intensity = matrix.maxCell > 0 ? n / matrix.maxCell : 0;
                  return (
                    <td key={t} className="px-1 py-1">
                      <div
                        className="mx-auto flex size-9 items-center justify-center rounded-lg text-[12.5px] font-black tabular-nums"
                        style={{
                          background: n > 0 ? `color-mix(in srgb, var(--color-altus-red) ${8 + intensity * 42}%, transparent)` : "var(--color-surface-soft)",
                          color: n > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)",
                        }}
                      >
                        {n > 0 ? n : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ====================================================================== */
/* Smart insights                                                         */
/* ====================================================================== */

function SmartInsightsPanel({ model, rows }: { model: Model; rows: Row[] }) {
  const insights = React.useMemo(() => buildSmartInsights(model, rows), [model, rows]);
  if (insights.length === 0) return null;

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <SectionHeader icon={<Lightbulb size={17} strokeWidth={2.2} />} title="Smart insights" subtitle="What the data is telling you" />
      <ul className="flex flex-col gap-2">
        {insights.map((text, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] font-semibold text-ink-soft">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: "var(--color-altus-red)" }} />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ====================================================================== */
/* 9 · Drill-down panel                                                   */
/* ====================================================================== */

function DrillPanel({ drill, rows, onClose }: { drill: Drill; rows: Row[]; onClose: () => void }) {
  return (
    <section
      className="wg-rise rounded-2xl px-5 py-4"
      style={{
        background: "var(--color-surface-card)",
        border: `1px solid color-mix(in srgb, ${drill.color} 40%, var(--color-hairline-strong))`,
        boxShadow: `0 12px 34px -22px ${drill.color}`,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: drill.color }} />
          <h3 className="text-[14px] font-bold text-ink-strong">{drill.label}</h3>
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-black tabular-nums text-white" style={{ background: drill.color }}>
            {rows.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drill-down"
          className={`inline-flex items-center gap-1 rounded-full border border-hairline-strong px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong cursor-pointer ${FOCUS_RING}`}
        >
          <X size={13} strokeWidth={2.6} /> Clear
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] font-semibold text-ink-subtle">No goals in this segment.</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-hairline)" }}>
          {rows.map((r) => {
            const meta = BAND_META[r.band];
            return (
              <li key={r.g.id} className="flex items-center gap-3 py-2">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-black tabular-nums"
                  style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
                >
                  {r.eff}%
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-ink-strong" title={r.g.title}>
                    {r.g.title}
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-subtle">
                    <span>{periodKeyLabel(r.g.periodKey)}</span>
                    {r.g.area && <span className="truncate">· {r.g.area}</span>}
                    <span style={{ color: meta.color }}>· {meta.short}</span>
                  </div>
                </div>
                <span
                  className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full max-sm:hidden"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, r.eff)}%`, background: meta.color }} />
                  <span
                    className="absolute inset-y-[-2px] w-[2px]"
                    style={{ left: `${Math.min(100, r.h.expected)}%`, background: "var(--color-ink-strong)", opacity: 0.5 }}
                    aria-hidden
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ====================================================================== */
/* Skeleton + empty                                                       */
/* ====================================================================== */

const SHIMMER: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.09) 50%, rgba(15,23,42,0.05) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeletonShimmer 1.4s ease-in-out infinite",
  border: "1px solid var(--color-hairline)",
};

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden aria-busy="true">
      <div className="h-8 w-72 rounded-full" style={SHIMMER} />
      <div className="h-[196px] rounded-2xl" style={SHIMMER} />
      <CardGrid min={190} gap="0.7rem">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[108px] rounded-2xl" style={SHIMMER} />
        ))}
      </CardGrid>
      <div className="grid grid-cols-[1.05fr_1.35fr] gap-4 max-xl:grid-cols-1">
        <div className="h-[240px] rounded-2xl" style={SHIMMER} />
        <div className="h-[240px] rounded-2xl" style={SHIMMER} />
      </div>
    </div>
  );
}

function DashboardEmpty({ level }: { level: GoalPeriod }) {
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <span
        className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
      >
        <Target size={30} strokeWidth={2.2} />
      </span>
      <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
        No adopted {(LEVEL_NOUN[level] ?? "").toLowerCase()} goals yet
      </h3>
      <p className="mx-auto mt-2 max-w-[48ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
        Adopt {(LEVEL_NOUN[level] ?? "new").toLowerCase()} goals to light up the OKR gauge, pace distribution,
        the at-risk action list and cascade coverage analytics here.
      </p>
    </div>
  );
}
