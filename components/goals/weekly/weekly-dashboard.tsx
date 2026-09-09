"use client";

/**
 * WEEKLY GOALS — DASHBOARD VIEW.
 *
 * A calm, four-question dashboard. Opening it should answer, in order and
 * within a glance: which week am I in · how am I doing · what needs me · what
 * are my goals. Everything else is a breakdown you open when you want it.
 *
 * WHY THIS EXISTS SEPARATELY from `board/goals-dashboard.tsx`: that component
 * is the EXECUTIVE view the Yearly / Quarterly / Monthly boards render — a hero
 * gauge, a seven-tile KPI row, a band distribution, coverage, two group panels,
 * accountability, measures and a drill panel, each in its own bordered card.
 * That density is defensible when you are reading a year across a downline; on
 * one person's ~5-goal week it was nine cards of chrome around three numbers,
 * with the same figure (attainment, at-risk count) restated in three places.
 * Weekly gets its own LAYOUT — never its own arithmetic. Every number here
 * comes from the shared `dashboard-model`, so the two views can never disagree.
 *
 * Nothing is dropped, only demoted: pillar, area, accountability, measures and
 * the pace distribution live under one collapsed "Breakdown" disclosure, and
 * the old drill-down panel became an in-place FOCUS filter on the goal list —
 * clicking a stat or a breakdown row scopes the list rather than opening a
 * tenth card below the fold.
 *
 * Colour is semantic only: red = at risk / overdue, green = done / on pace,
 * amber = warning, neutral for everything else. The brand red is NOT the
 * default accent here — on a dashboard it reads as alarm, and when every tile
 * is alarming none of them is.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, X } from "lucide-react";
import {
  type GoalDTO,
  targetDateStatus,
  fmtNum,
} from "@/components/goals/cascade/util";
import {
  GREEN,
  AMBER,
  RED,
  BLUE,
  DISPLAY,
  BAND_META,
  BAND_ORDER,
  classify,
  pillarOf,
  buildModel,
  matchesFilters,
  buildSmartInsights,
  type DisplayBand,
  type Group,
  type Model,
  type Row,
  type DashboardFilters,
} from "@/components/goals/board/dashboard-model";
import { formatWeekRangeShort } from "./week-select";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** One surface treatment for the whole page: hairline, 12px, no shadow stack. */
const SURFACE: React.CSSProperties = {
  background: "var(--color-surface-card)",
  border: "1px solid var(--color-hairline)",
  borderRadius: 12,
};

/** Section heading — quiet, uppercase, the only label a section gets. */
function SectionLabel({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <h3
      className="text-[11px] font-bold uppercase tracking-[0.11em]"
      style={{ color: tone ?? "var(--color-ink-subtle)" }}
    >
      {children}
    </h3>
  );
}

/* ====================================================================== */
/* Root                                                                   */
/* ====================================================================== */

export interface WeeklyDashboardProps {
  /** The week's ADOPTED goals, already mapped to the shared DTO. */
  goals: GoalDTO[];
  /** FY week number — the "which week am I viewing" answer. */
  weekNo: number;
  /** Monday of the viewed week ('YYYY-MM-DD'). */
  weekStart: string;
  /** Whose week this is, when it is not the signed-in user's own. */
  viewedName?: string | null;
  /** Jump to the List view (and, when given a goal, that goal's row). The
   *  dashboard never edits — the list is where a goal is actually worked. */
  onOpenGoal?: (goalId: string) => void;
}

export function WeeklyDashboard({
  goals,
  weekNo,
  weekStart,
  viewedName,
  onOpenGoal,
}: WeeklyDashboardProps) {
  // Stamp `now` once per payload so every pace number in one render agrees.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => new Date(), [goals]);

  const allRows = React.useMemo(
    () => goals.filter((g) => g.period === "week" && g.adopted).map((g) => classify(g, now, 0)),
    [goals, now],
  );

  // ── Filters: the same Area/Type/Owner/Delegate/Status the executive view
  //    has (through the SAME `matchesFilters` predicate, so the two views
  //    can never disagree on what "matches") — kept because they are real
  //    functionality, just rendered as a quiet strip instead of a big
  //    popover-based filter bar. Lens (quick all/at-risk) stays a separate,
  //    additional pass on top, unchanged from before. ─────────────────────
  const [lens, setLens] = React.useState<"all" | "risk">("all");
  const [pillarPick, setPillarPick] = React.useState<string | null>(null);
  const [areaPick, setAreaPick] = React.useState<string | null>(null);
  const [ownerPick, setOwnerPick] = React.useState<"all" | "self" | "assigned">("all");
  const [delegatePick, setDelegatePick] = React.useState<string | null>(null);
  const [statusPick, setStatusPick] = React.useState<DisplayBand | null>(null);

  const pillarOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) {
      const p = pillarOf(r.g);
      if (p) s.add(p);
    }
    return [...s].sort();
  }, [allRows]);
  const areaOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(r.g.area?.trim() ? r.g.area.trim() : "Unassigned");
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

  // A pick can vanish under the selection when the week's data changes.
  // Resolved DURING RENDER rather than corrected afterwards in an effect —
  // an effect would render one frame filtered to a value that no longer exists.
  const pillar = pillarPick && pillarOptions.includes(pillarPick) ? pillarPick : null;
  const area = areaPick && areaOptions.includes(areaPick) ? areaPick : null;
  const delegate = delegatePick && delegateOptions.some((d) => d.value === delegatePick) ? delegatePick : null;

  const dashboardFilters: DashboardFilters = React.useMemo(
    () => ({
      area: area ? [area] : [],
      type: pillar ? [pillar] : [],
      owner: ownerPick,
      delegate,
      status: statusPick ? [statusPick] : [],
    }),
    [area, pillar, ownerPick, delegate, statusPick],
  );

  const viewRows = React.useMemo(() => {
    let rs = allRows.filter((r) => matchesFilters(r.g, r.band, dashboardFilters));
    if (lens === "risk")
      rs = rs.filter((r) => r.band === "at-risk" || r.band === "overdue" || r.band === "spillover");
    return rs;
  }, [allRows, dashboardFilters, lens]);

  const m = React.useMemo(() => buildModel(viewRows, "week"), [viewRows]);

  // ── Focus: what the old drill-down panel did, applied to the goal list in
  //    place. A stat tile or a breakdown row narrows "My goals" and drops a
  //    dismissible chip above it — no tenth card, no scrolling to find it. ──
  const [focus, setFocus] = React.useState<{ id: string; label: string } | null>(null);
  const focusTest = React.useMemo(() => (focus ? focusTestFor(focus.id) : null), [focus]);
  const listRows = React.useMemo(
    () => (focusTest ? viewRows.filter(focusTest) : viewRows),
    [viewRows, focusTest],
  );

  const pickFocus = React.useCallback((id: string, label: string) => {
    setFocus((cur) => (cur?.id === id ? null : { id, label }));
  }, []);

  // Changing a FILTER clears the focus: the two stack, and a focus left over
  // from the previous filter set silently empties the goal list. Cleared in the
  // handlers, not an effect, so the new filter and the cleared focus land in
  // the same render.
  const changeLens = React.useCallback((l: "all" | "risk") => {
    setLens(l);
    setFocus(null);
  }, []);
  const changePillar = React.useCallback((p: string | null) => {
    setPillarPick(p);
    setFocus(null);
  }, []);
  const changeArea = React.useCallback((a: string | null) => {
    setAreaPick(a);
    setFocus(null);
  }, []);
  const changeOwner = React.useCallback((o: "all" | "self" | "assigned") => {
    setOwnerPick(o);
    setFocus(null);
  }, []);
  const changeDelegate = React.useCallback((d: string | null) => {
    setDelegatePick(d);
    setFocus(null);
  }, []);
  const changeStatus = React.useCallback((s: DisplayBand | null) => {
    setStatusPick(s);
    setFocus(null);
  }, []);

  if (allRows.length === 0) {
    return <WeeklyDashboardEmpty weekNo={weekNo} weekStart={weekStart} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterStrip
        lens={lens}
        onLens={changeLens}
        pillar={pillar}
        onPillar={changePillar}
        pillarOptions={pillarOptions}
        area={area}
        onArea={changeArea}
        areaOptions={areaOptions}
        owner={ownerPick}
        onOwner={changeOwner}
        delegate={delegate}
        onDelegate={changeDelegate}
        delegateOptions={delegateOptions}
        status={statusPick}
        onStatus={changeStatus}
        showing={viewRows.length}
        total={allRows.length}
      />

      <Performance
        model={m}
        weekNo={weekNo}
        weekStart={weekStart}
        viewedName={viewedName ?? null}
        focusId={focus?.id ?? null}
        onFocus={pickFocus}
      />

      <NeedsAttention rows={m.atRiskRows} total={m.total} onOpenGoal={onOpenGoal} />

      <MyGoals
        rows={listRows}
        focus={focus}
        onClearFocus={() => setFocus(null)}
        onOpenGoal={onOpenGoal}
      />

      <Breakdown model={m} rows={viewRows} focusId={focus?.id ?? null} onFocus={pickFocus} />
    </div>
  );
}

/**
 * Focus is stored as a STRING id, not a predicate, so the chip and the active
 * highlight survive re-renders without keeping a closure in state (a closure
 * captured over stale rows is how the old drill panel went out of sync with
 * its own filters). The id is resolved back to a predicate here.
 */
function focusTestFor(id: string): ((r: Row) => boolean) | null {
  switch (id) {
    case "stat:onpace":
      return (r) => r.band === "ahead" || r.band === "on-track";
    case "stat:risk":
      return (r) => r.band === "at-risk" || r.band === "overdue" || r.band === "spillover";
    case "stat:done":
      return (r) => r.band === "done";
  }
  if (id.startsWith("pillar:")) {
    const label = id.slice(7);
    return (r) => (pillarOf(r.g) ?? "Unspecified") === label;
  }
  if (id.startsWith("area:")) {
    const label = id.slice(5);
    return (r) => (r.g.area?.trim() ? r.g.area.trim() : "Unassigned") === label;
  }
  if (id.startsWith("band:")) {
    const band = id.slice(5) as DisplayBand;
    return (r) => r.band === band;
  }
  return null;
}

/* ====================================================================== */
/* Filters — deliberately the quietest row on the page                    */
/* ====================================================================== */

function FilterStrip({
  lens,
  onLens,
  pillar,
  onPillar,
  pillarOptions,
  area,
  onArea,
  areaOptions,
  owner,
  onOwner,
  delegate,
  onDelegate,
  delegateOptions,
  status,
  onStatus,
  showing,
  total,
}: {
  lens: "all" | "risk";
  onLens: (l: "all" | "risk") => void;
  pillar: string | null;
  onPillar: (p: string | null) => void;
  pillarOptions: string[];
  area: string | null;
  onArea: (a: string | null) => void;
  areaOptions: string[];
  owner: "all" | "self" | "assigned";
  onOwner: (o: "all" | "self" | "assigned") => void;
  delegate: string | null;
  onDelegate: (d: string | null) => void;
  delegateOptions: { value: string; label: string }[];
  status: DisplayBand | null;
  onStatus: (s: DisplayBand | null) => void;
  showing: number;
  total: number;
}) {
  const filtered =
    pillar != null || area != null || owner !== "all" || delegate != null || status != null || lens === "risk";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="tablist"
        aria-label="Goal lens"
        className="inline-flex items-center rounded-lg p-0.5"
        style={{ background: "var(--color-surface-soft)" }}
      >
        {(
          [
            { id: "all", label: "All goals" },
            { id: "risk", label: "At-risk only" },
          ] as const
        ).map((o) => {
          const active = lens === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onLens(o.id)}
              className={`cursor-pointer rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition-colors ${FOCUS_RING}`}
              style={
                active
                  ? {
                      background: "var(--color-surface-card)",
                      color: "var(--color-ink-strong)",
                      boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
                    }
                  : { background: "transparent", color: "var(--color-ink-subtle)" }
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {areaOptions.length > 0 && (
        <div className="inline-flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[11px] font-semibold text-ink-subtle">Area</span>
          <QuietChip active={area == null} onClick={() => onArea(null)}>
            All
          </QuietChip>
          {areaOptions.map((a) => (
            <QuietChip key={a} active={area === a} onClick={() => onArea(area === a ? null : a)}>
              {a}
            </QuietChip>
          ))}
        </div>
      )}

      {pillarOptions.length > 0 && (
        <div className="inline-flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[11px] font-semibold text-ink-subtle">Type</span>
          <QuietChip active={pillar == null} onClick={() => onPillar(null)}>
            All
          </QuietChip>
          {pillarOptions.map((p) => (
            <QuietChip
              key={p}
              active={pillar === p}
              onClick={() => onPillar(pillar === p ? null : p)}
            >
              {p}
            </QuietChip>
          ))}
        </div>
      )}

      <div className="inline-flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[11px] font-semibold text-ink-subtle">Owner</span>
        {(
          [
            { id: "all", label: "All" },
            { id: "self", label: "Self" },
            { id: "assigned", label: "Assigned" },
          ] as const
        ).map((o) => (
          <QuietChip key={o.id} active={owner === o.id} onClick={() => onOwner(o.id)}>
            {o.label}
          </QuietChip>
        ))}
      </div>

      {delegateOptions.length > 0 && (
        <div className="inline-flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[11px] font-semibold text-ink-subtle">Delegate</span>
          <QuietChip active={delegate == null} onClick={() => onDelegate(null)}>
            All
          </QuietChip>
          {delegateOptions.map((d) => (
            <QuietChip
              key={d.value}
              active={delegate === d.value}
              onClick={() => onDelegate(delegate === d.value ? null : d.value)}
            >
              {d.label}
            </QuietChip>
          ))}
        </div>
      )}

      <div className="inline-flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[11px] font-semibold text-ink-subtle">Status</span>
        <QuietChip active={status == null} onClick={() => onStatus(null)}>
          All
        </QuietChip>
        {BAND_ORDER.map((b) => (
          <QuietChip key={b} active={status === b} onClick={() => onStatus(status === b ? null : b)}>
            {BAND_META[b].short}
          </QuietChip>
        ))}
      </div>

      <span className="ml-auto text-[11.5px] font-medium tabular-nums text-ink-subtle">
        {filtered ? `${showing} of ${total} goals` : `${total} goal${total === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function QuietChip({
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
      className={`cursor-pointer rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors ${FOCUS_RING}`}
      style={
        active
          ? { background: "var(--color-surface-track)", color: "var(--color-ink-strong)" }
          : { background: "transparent", color: "var(--color-ink-subtle)" }
      }
    >
      {children}
    </button>
  );
}

/* ====================================================================== */
/* 1 · Weekly performance — the ONE place a headline number appears       */
/* ====================================================================== */

function Performance({
  model,
  weekNo,
  weekStart,
  viewedName,
  focusId,
  onFocus,
}: {
  model: Model;
  weekNo: number;
  weekStart: string;
  viewedName: string | null;
  focusId: string | null;
  onFocus: (id: string, label: string) => void;
}) {
  const gap = model.paceDelta;
  // Gap tone is the page's main semantic signal: behind is only a problem once
  // it is meaningfully behind, which is the same −25pt cut the health engine
  // uses for "at risk". A 3-point wobble is not an alarm.
  const gapTone = gap >= 0 ? GREEN : gap > -25 ? AMBER : RED;

  return (
    <section style={SURFACE} className="px-5 py-4 max-md:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionLabel>Weekly performance</SectionLabel>
        <span className="text-[11.5px] font-medium tabular-nums text-ink-subtle">
          W{weekNo} · {formatWeekRangeShort(weekStart)}
          {viewedName ? ` · ${viewedName}` : ""}
        </span>
      </div>

      {/* The four headline figures. Attainment leads at display size; the three
          counts are peers at a step down — the old KPI row gave seven tiles
          equal weight, which is the same as giving none any. */}
      <div className="mt-3.5 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <div
            className="leading-none tabular-nums text-ink-strong"
            style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, letterSpacing: "-0.03em" }}
          >
            {model.weighted}%
          </div>
          <div className="mt-1.5 text-[11.5px] font-semibold text-ink-muted">Attainment</div>
        </div>

        <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
          <StatTile
            value={model.onPace}
            label="On pace"
            tone={model.onPace > 0 ? GREEN : undefined}
            active={focusId === "stat:onpace"}
            onClick={() => onFocus("stat:onpace", "On pace")}
          />
          <StatTile
            value={model.needsAttention}
            label="At risk"
            tone={model.needsAttention > 0 ? RED : undefined}
            active={focusId === "stat:risk"}
            onClick={() => onFocus("stat:risk", "At risk")}
          />
          <StatTile
            value={model.done}
            label="Completed"
            tone={model.done > 0 ? GREEN : undefined}
            active={focusId === "stat:done"}
            onClick={() => onFocus("stat:done", "Completed")}
          />
        </div>
      </div>

      {/* Expected vs actual — one bar, read left to right. The expected marker
          is a tick ON the track rather than a second bar, so "how far behind"
          is a distance you can see instead of two numbers to subtract. */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3 text-[11.5px] font-medium tabular-nums text-ink-muted">
          <span>
            Expected <span className="font-bold text-ink-soft">{model.avgExpected}%</span>
          </span>
          <span>
            Actual <span className="font-bold text-ink-soft">{model.weighted}%</span>
          </span>
        </div>
        <div
          className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-surface-track)" }}
          role="img"
          aria-label={`Actual ${model.weighted} percent against an expected ${model.avgExpected} percent`}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, model.weighted))}%`,
              background: gapTone,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-y-0 w-[2px]"
            style={{
              left: `${Math.min(100, Math.max(0, model.avgExpected))}%`,
              background: "var(--color-ink-muted)",
            }}
          />
        </div>
        <div className="mt-1.5 text-[11.5px] font-semibold tabular-nums" style={{ color: gapTone }}>
          Gap {gap > 0 ? "+" : gap < 0 ? "−" : ""}
          {Math.abs(gap)}%
          <span className="ml-1 font-medium text-ink-subtle">
            {gap >= 0 ? "ahead of pace" : "behind pace"}
          </span>
        </div>
      </div>
    </section>
  );
}

function StatTile({
  value,
  label,
  tone,
  active,
  onClick,
}: {
  value: number;
  label: string;
  tone?: string;
  active: boolean;
  onClick: () => void;
}) {
  const interactive = value > 0;
  const ink = tone ?? "var(--color-ink-strong)";
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      aria-pressed={interactive ? active : undefined}
      disabled={!interactive}
      title={interactive ? `Show only the ${label.toLowerCase()} goals` : undefined}
      className={`-mx-1.5 rounded-lg px-1.5 py-1 text-left transition-colors ${
        interactive ? `cursor-pointer hover:bg-surface-soft ${FOCUS_RING}` : "cursor-default"
      }`}
      style={active ? { background: "var(--color-surface-soft)" } : undefined}
    >
      <div
        className="leading-none tabular-nums"
        style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, color: ink }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] font-semibold text-ink-muted">{label}</div>
    </button>
  );
}

/* ====================================================================== */
/* 2 · Needs attention — the actionable section, so it gets the emphasis  */
/* ====================================================================== */

function NeedsAttention({
  rows,
  total,
  onOpenGoal,
}: {
  rows: Row[];
  total: number;
  onOpenGoal?: (goalId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <section style={SURFACE} className="flex items-center gap-3 px-5 py-4 max-md:px-4">
        <CheckCircle2 size={18} strokeWidth={2.2} style={{ color: GREEN }} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink-strong">Nothing needs attention</p>
          <p className="text-[12px] text-ink-muted">
            {/* `total` is the FILTERED count, so it can be zero while the week
                still has goals — say so rather than claiming "all 0 goals". */}
            {total === 0
              ? "No goals match the current filters."
              : `All ${total} goal${total === 1 ? " is" : "s are"} tracking to pace this week.`}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        ...SURFACE,
        // The one place the page raises its voice: a left rule rather than a
        // fully tinted card, which would drown the goal titles it is pointing at.
        borderLeft: `3px solid ${RED}`,
      }}
      className="px-5 py-4 max-md:px-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={15} strokeWidth={2.4} style={{ color: RED }} />
        <SectionLabel tone={RED}>Needs attention</SectionLabel>
        <span className="text-[11.5px] font-bold tabular-nums" style={{ color: RED }}>
          {rows.length}
        </span>
      </div>

      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-hairline)" }}>
        {rows.map((r) => (
          <AttentionRow key={r.g.id} row={r} onOpenGoal={onOpenGoal} />
        ))}
      </ul>
    </section>
  );
}

/** Plain-language "why is this here", derived — never a stored string. */
function attentionReason(row: Row): string {
  if (row.band === "overdue")
    return `${row.daysLate} day${row.daysLate === 1 ? "" : "s"} past its target date`;
  if (row.band === "spillover") return "Carried over from an earlier week and still open";
  const behind = Math.abs(Math.round(row.h.delta));
  return `${behind} points behind where this should be by now`;
}

function AttentionRow({ row, onOpenGoal }: { row: Row; onOpenGoal?: (id: string) => void }) {
  const { g, eff, h, band } = row;
  const meta = BAND_META[band];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-[220px] flex-1">
        <p className="truncate text-[14px] font-semibold text-ink-strong" title={g.title}>
          {g.title}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-muted">{attentionReason(row)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="w-[132px] max-sm:w-[104px]">
          <ProgressTrack eff={eff} expected={h.expected} tone={meta.color} />
          <p className="mt-1 text-[11px] font-medium tabular-nums text-ink-subtle">
            <span className="font-bold" style={{ color: meta.color }}>
              {eff}%
            </span>{" "}
            of {h.expected}% expected
          </p>
        </div>

        {onOpenGoal && (
          <button
            type="button"
            onClick={() => onOpenGoal(g.id)}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1.5 py-1 text-[12px] font-semibold transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
            style={{ color: RED }}
          >
            View goal
            <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Progress bar with the pace tick — the one progress idiom on this page. */
function ProgressTrack({ eff, expected, tone }: { eff: number; expected: number; tone: string }) {
  return (
    <span
      className="relative block h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "var(--color-surface-track)" }}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, eff))}%`, background: tone }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 w-[2px]"
        style={{
          left: `${Math.min(100, Math.max(0, expected))}%`,
          background: "var(--color-ink-muted)",
        }}
      />
    </span>
  );
}

/* ====================================================================== */
/* 3 · My goals — the page's centre of gravity                            */
/* ====================================================================== */

function MyGoals({
  rows,
  focus,
  onClearFocus,
  onOpenGoal,
}: {
  rows: Row[];
  focus: { id: string; label: string } | null;
  onClearFocus: () => void;
  onOpenGoal?: (goalId: string) => void;
}) {
  return (
    <section style={SURFACE} className="px-5 py-4 max-md:px-4">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SectionLabel>My goals</SectionLabel>
        <span className="text-[11.5px] font-medium tabular-nums text-ink-subtle">{rows.length}</span>

        {focus && (
          <button
            type="button"
            onClick={onClearFocus}
            className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors hover:bg-surface-track ${FOCUS_RING}`}
            style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
          >
            {focus.label}
            <X size={12} strokeWidth={2.6} />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">
          No goals match the current filters.
        </p>
      ) : (
        <>
          {/* Column header — a single hairline, no filled header bar. Hidden on
              narrow widths where each row stacks and the labels stop earning
              their line. */}
          <div
            className="grid grid-cols-[minmax(0,1fr)_140px_112px_104px_28px] items-center gap-x-4 border-b pb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle max-lg:hidden"
            style={{ borderColor: "var(--color-hairline)" }}
          >
            <span>Goal</span>
            <span>Progress</span>
            <span>Status</span>
            <span>Due</span>
            <span className="sr-only">Open</span>
          </div>

          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-hairline)" }}>
            {rows.map((r) => (
              <GoalRow key={r.g.id} row={r} onOpenGoal={onOpenGoal} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function GoalRow({ row, onOpenGoal }: { row: Row; onOpenGoal?: (id: string) => void }) {
  const { g, eff, h, band } = row;
  const meta = BAND_META[band];
  const due = g.targetDate ? targetDateStatus(g.targetDate) : null;
  // Only a late / imminent deadline earns colour; a comfortable one is neutral.
  const dueTone =
    due && due.tone === "over" ? RED : due && due.tone === "warn" ? AMBER : "var(--color-ink-muted)";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_140px_112px_104px_28px] items-center gap-x-4 py-3 max-lg:grid-cols-1 max-lg:gap-y-2">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-ink-strong" title={g.title}>
          {g.title}
        </p>
        {g.area?.trim() && (
          <p className="mt-0.5 truncate text-[11.5px] text-ink-subtle">{g.area.trim()}</p>
        )}
      </div>

      <div className="max-lg:flex max-lg:items-center max-lg:gap-3">
        <ProgressTrack eff={eff} expected={h.expected} tone={meta.color} />
        <p className="mt-1 text-[11px] font-medium tabular-nums text-ink-subtle max-lg:mt-0">
          <span className="font-bold text-ink-soft">{eff}%</span>
          <span className="mx-1">·</span>
          {h.expected}% expected
        </p>
      </div>

      <StatusText band={band} />

      <span className="text-[11.5px] font-medium tabular-nums" style={{ color: dueTone }}>
        {due?.label ? formatDue(g.targetDate) : "—"}
      </span>

      {onOpenGoal ? (
        <button
          type="button"
          onClick={() => onOpenGoal(g.id)}
          aria-label={`Open ${g.title} in the list`}
          className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong max-lg:justify-self-start ${FOCUS_RING}`}
        >
          <ChevronRight size={15} strokeWidth={2.4} />
        </button>
      ) : (
        <span />
      )}
    </li>
  );
}

/** Status as a word, not a filled pill — a dot carries the semantics. */
function StatusText({ band }: { band: DisplayBand }) {
  const meta = BAND_META[band];
  const loud = band === "at-risk" || band === "overdue" || band === "spillover";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <span style={{ color: loud ? meta.color : "var(--color-ink-soft)" }}>{meta.short}</span>
    </span>
  );
}

/** "24 Aug" — the year only when it is not the current one. */
function formatDue(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/* ====================================================================== */
/* 4 · Breakdown — everything demoted, behind one disclosure              */
/* ====================================================================== */

function Breakdown({
  model,
  rows,
  focusId,
  onFocus,
}: {
  model: Model;
  rows: Row[];
  focusId: string | null;
  onFocus: (id: string, label: string) => void;
}) {
  const a = model.accountability;
  const bands = BAND_ORDER.filter((b) => model.counts[b] > 0);
  const insights = buildSmartInsights(model, rows);

  return (
    <details className="group" style={SURFACE}>
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 px-5 py-3 max-md:px-4 ${FOCUS_RING}`}
      >
        <ChevronRight
          size={14}
          strokeWidth={2.4}
          className="shrink-0 text-ink-subtle transition-transform group-open:rotate-90"
        />
        <SectionLabel>Breakdown</SectionLabel>
        <span className="text-[11.5px] font-medium text-ink-subtle">
          Pace · pillar · area · accountability · measures · insights
        </span>
      </summary>

      <div
        className="grid grid-cols-2 gap-x-8 gap-y-6 border-t px-5 py-4 max-lg:grid-cols-1 max-md:px-4"
        style={{ borderColor: "var(--color-hairline)" }}
      >
        {/* Pace distribution — the six derived bands, as one bar + legend. */}
        <div className="col-span-2 max-lg:col-span-1">
          <SectionLabel>Pace</SectionLabel>
          <div
            className="mt-2 flex h-2 w-full overflow-hidden rounded-full"
            style={{ background: "var(--color-surface-track)" }}
          >
            {bands.map((b) => (
              <span
                key={b}
                style={{
                  width: `${(model.counts[b] / model.total) * 100}%`,
                  background: BAND_META[b].color,
                }}
                title={`${BAND_META[b].label}: ${model.counts[b]}`}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {bands.map((b) => (
              <li key={b}>
                <button
                  type="button"
                  onClick={() => onFocus(`band:${b}`, BAND_META[b].label)}
                  aria-pressed={focusId === `band:${b}`}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
                  style={
                    focusId === `band:${b}` ? { background: "var(--color-surface-soft)" } : undefined
                  }
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: BAND_META[b].color }}
                  />
                  {BAND_META[b].label}
                  <span className="font-bold tabular-nums text-ink-soft">{model.counts[b]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <GroupList
          title="By pillar"
          groups={model.byPillar}
          idPrefix="pillar"
          focusId={focusId}
          onFocus={onFocus}
        />
        <GroupList
          title="By area"
          groups={model.byArea}
          idPrefix="area"
          focusId={focusId}
          onFocus={onFocus}
        />

        <div>
          <SectionLabel>Accountability</SectionLabel>
          <dl className="mt-2 flex flex-col gap-1.5">
            <FactRow label="Self" value={String(a.self)} hint="created by owner" />
            <FactRow label="Assigned" value={String(a.assigned)} hint="given by a manager" />
            <FactRow label="Delegated" value={String(a.delegated)} hint="handed to a member" tone={a.delegated > 0 ? BLUE : undefined} />
            <FactRow
              label="Team dependency"
              value={a.depCount > 0 ? `${a.avgDep}%` : "—"}
              hint={a.depCount > 0 ? `max ${a.maxDep}%` : "no exposure"}
              tone={a.depCount > 0 && a.avgDep >= 50 ? RED : a.depCount > 0 && a.avgDep >= 25 ? AMBER : undefined}
            />
            <FactRow
              label="Reviewed"
              value={String(a.reviewed)}
              hint={`${a.selfOnly} self-rated`}
              tone={a.reviewed > 0 ? GREEN : undefined}
            />
          </dl>
        </div>

        <div>
          <SectionLabel>Measures</SectionLabel>
          {model.rupee || model.qty ? (
            <dl className="mt-2 flex flex-col gap-1.5">
              {model.rupee && (
                <FactRow
                  label="₹ value"
                  value={`₹${fmtNum(model.rupee.actual)} / ₹${fmtNum(model.rupee.target)}`}
                  hint={`${pctOf(model.rupee.actual, model.rupee.target)}%`}
                />
              )}
              {model.qty && (
                <FactRow
                  label="Quantity"
                  value={`${fmtNum(model.qty.actual)} / ${fmtNum(model.qty.target)}`}
                  hint={`${pctOf(model.qty.actual, model.qty.target)}%`}
                />
              )}
            </dl>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              No ₹ or quantity targets on this week&apos;s goals — attainment comes from self-rated
              and reviewed progress only.
            </p>
          )}
        </div>

        {insights.length > 0 && (
          <div className="col-span-2 max-lg:col-span-1">
            <SectionLabel>Smart insights</SectionLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {insights.map((text, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-muted">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full" style={{ background: "var(--color-altus-red)" }} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function pctOf(actual: number, target: number): number {
  return target > 0 ? Math.round((actual / target) * 100) : 0;
}

function GroupList({
  title,
  groups,
  idPrefix,
  focusId,
  onFocus,
}: {
  title: string;
  groups: Group[];
  idPrefix: "pillar" | "area";
  focusId: string | null;
  onFocus: (id: string, label: string) => void;
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {groups.length === 0 ? (
        <p className="mt-2 text-[12px] text-ink-muted">Nothing to group.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {groups.slice(0, 8).map((grp) => {
            const id = `${idPrefix}:${grp.label}`;
            const active = focusId === id;
            return (
              <li key={grp.label}>
                <button
                  type="button"
                  onClick={() => onFocus(id, `${title.replace("By ", "")}: ${grp.label}`)}
                  aria-pressed={active}
                  className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
                  style={active ? { background: "var(--color-surface-soft)" } : undefined}
                >
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-strong" title={grp.label}>
                    {grp.label}
                  </span>
                  <span className="text-[12.5px] font-bold tabular-nums text-ink-soft">
                    {grp.pct}%
                  </span>
                  <span className="w-6 text-right text-[11px] font-medium tabular-nums text-ink-subtle">
                    {grp.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FactRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-ink-muted">{label}</dt>
      <dd className="flex items-baseline gap-1.5 text-right">
        <span
          className="text-[12.5px] font-bold tabular-nums"
          style={{ color: tone ?? "var(--color-ink-strong)" }}
        >
          {value}
        </span>
        <span className="text-[11px] text-ink-subtle">{hint}</span>
      </dd>
    </div>
  );
}

/* ====================================================================== */
/* Empty state                                                            */
/* ====================================================================== */

function WeeklyDashboardEmpty({ weekNo, weekStart }: { weekNo: number; weekStart: string }) {
  return (
    <section style={SURFACE} className="px-5 py-10 text-center">
      <p className="text-[14px] font-semibold text-ink-strong">
        Nothing to measure for W{weekNo} · {formatWeekRangeShort(weekStart)}
      </p>
      <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] text-ink-muted">
        Add a goal for this week, or adopt one from the monthly cascade — the dashboard fills in as
        soon as there is something to track.
      </p>
    </section>
  );
}
