"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import { GripVertical, Plus, Sparkles, ChevronLeft, ChevronRight, Loader2, Target, Users2, UserPlus, Mic, ArrowRight, ChevronDown } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  createGoal,
  generateGoalChildren,
  setGoalPctDone,
  setGoalCategory,
  setGoalTeam,
  editGoal,
  moveGoalForward,
  moveWeeklyToWeek,
  promoteToLevel,
} from "@/app/(app)/goals/cascade/actions";
import { setWeeklyGoalPct } from "@/app/(app)/weekly-goals/actions";
import {
  goalCode,
  categoryStyle,
  isSpillover,
  fmtNum,
  fyLabel,
  effectiveGoalPct,
  pctTone,
  type GoalDTO,
  type RosterMember,
} from "./util";
import type { AssignedGoal } from "@/lib/goals/queries";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  quarterKey as quarterKeyOf,
  monthKey as monthKeyOf,
  quarterOfKey,
  fyStartYearOf,
} from "@/lib/goals/types";
// Canonical weighted rollup (lib/goals/derive.ts §3.1) — replaces the old
// plain-average copies so this cockpit and the flagged canvas show ONE number.
import { rollupPct } from "@/lib/goals/derive";
// bug #23 — canonical FY (Apr–Mar) week number, matching the weekNo the page
// now stamps on WeeklyDTOs (the local Jan-1 copy is deleted).
import { weekNoOf } from "@/lib/goals/fy-calendar";

export interface WeeklyDTO {
  id: string;
  weekStart: string;
  monthKey: string;
  weekNo: number;
  title: string;
  area: string | null;
  uom: string | null;
  pctDone: number;
  acceptPct: number | null;
  position: number;
  cascade: boolean;
  spillover: boolean;
  /**
   * Numeric cascade mirrors (design §3.1 blocker fix — Month→Week rollup /
   * contribution math needs these in memory). numeric(14,2) → strings; null on
   * legacy free-text-target rows, which `lib/goals/derive.ts` treats as
   * UNMEASURED and excludes from allocation/contribution (locked decision 3).
   */
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  weight: number;
  adopted: boolean;
  /** Parent month goal id (goals.id) when the row is a cascade leaf — lets the
   *  canvas link a week row back to its month parent (Phase 3). `cascade`
   *  above stays the boolean mirror (`monthGoalId != null`). */
  monthGoalId: string | null;
  /**
   * Ritual stamps as booleans (Phase 6, design §2.2/§2.6): `committed_at` /
   * `approved_by_manager_at` — DISPLAY ONLY (the punch gates read the columns
   * server-side; these mirrors power the canvas "committed · awaiting Monday
   * approval" chips). Optional so pre-Phase-6 payload shapes stay assignable;
   * `undefined` = unknown (render nothing, never a wrong state).
   */
  committed?: boolean;
  approved?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const Q_LABEL: Record<number, string> = { 1: "Apr–Jun", 2: "Jul–Sep", 3: "Oct–Dec", 4: "Jan–Mar" };
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

type Lens = "year" | "quarter" | "month" | "levels";
const LEVEL_RANK: Record<string, number> = { year: 0, quarter: 1, month: 2, week: 3 };

type GoalCategory = "target" | "milestone" | "operational" | "goal";

/** Card action + roster context — avoids threading handlers through every column. */
interface CardCtxValue {
  canWrite: boolean;
  roster: RosterMember[];
  busy: string | null;
  onSetPct: (id: string, pct: number) => void;
  onSetCategory: (id: string, category: GoalCategory) => void;
  onSetTeam: (id: string, team: Array<{ employeeId?: string; name?: string }>) => void;
  onSetNotes: (id: string, notes: string) => void;
}
const CardCtx = React.createContext<CardCtxValue>({
  canWrite: false,
  roster: [],
  busy: null,
  onSetPct: () => {},
  onSetCategory: () => {},
  onSetTeam: () => {},
  onSetNotes: () => {},
});

/* ── Executive-cockpit primitives (Year lens) ──────────────────────────────── */

/** SVG progress ring, coloured by scorecard band. Children render in the centre. */
function Ring({
  pct,
  size = 120,
  stroke = 12,
  track = "var(--color-hairline-strong)",
  color,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  track?: string;
  color?: string;
  children?: React.ReactNode;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = color ?? pctTone(p).color;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={arc}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export interface PeriodRowData {
  key: string;
  label: string;
  sub?: string;
  pct: number;
  has: boolean;
  isNow?: boolean;
  onOpen?: () => void;
}

/** A full-width child-period ROW (a quarter under a year, a month under a
 *  quarter): label + bar + big %. Stacks vertically; opens the child lens. */
function PeriodRow({ d }: { d: PeriodRowData }) {
  const tone = pctTone(d.pct);
  return (
    <button
      type="button"
      onClick={d.onOpen}
      className="group flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-16px_rgba(15,23,42,0.4)]"
      style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
    >
      <div className="w-[104px] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-black uppercase tracking-[0.06em] text-ink-strong">{d.label}</span>
          {d.isNow && <span aria-label="current" className="size-1.5 rounded-full" style={{ background: "var(--color-altus-red)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 22%, transparent)" }} />}
        </div>
        {d.sub && <div className="text-[10.5px] font-semibold text-ink-faint">{d.sub}</div>}
      </div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-hairline-strong)" }}>
        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${d.has ? d.pct : 0}%`, background: tone.color }} />
      </div>
      <span
        className="w-[58px] shrink-0 text-right text-[19px] font-black tabular-nums"
        style={{ color: d.has ? tone.color : "var(--color-ink-subtle)", fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        {d.has ? `${d.pct}%` : "—"}
      </span>
      <ChevronRight size={16} className="shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

interface Props {
  goals: GoalDTO[];
  weekly: WeeklyDTO[];
  assigned: AssignedGoal[];
  fyStartYear: number;
  viewedEmployeeId: string;
  viewedName: string;
  roster: RosterMember[];
  canWrite: boolean;
}

export function CascadeWorkspace(props: Props) {
  const { goals, weekly, assigned, fyStartYear, viewedEmployeeId, viewedName, roster, canWrite } = props;
  const router = useRouter();
  const reduce = useReducedMotion();

  const [lens, setLens] = React.useState<Lens>("year");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);

  const nowQ = quarterOfKey(quarterKeyOf(new Date()));
  const nowMonth = monthKeyOf(new Date());
  const [selQuarter, setSelQuarter] = React.useState<number>(nowQ);
  const monthsInFy = React.useMemo(
    () => [1, 2, 3, 4].flatMap((q) => monthKeysOfQuarter(fyStartYear, q as 1 | 2 | 3 | 4)),
    [fyStartYear],
  );
  const [selMonth, setSelMonth] = React.useState<string>(
    monthsInFy.includes(nowMonth) ? nowMonth : (monthsInFy[0] ?? nowMonth),
  );

  const monLabel = (mk: string) => MONTHS[Number(mk.slice(5, 7)) - 1] ?? mk.slice(5, 7);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byPeriod = React.useCallback(
    (period: GoalDTO["period"], key: string) =>
      goals.filter((g) => g.period === period && g.periodKey === key).sort((a, b) => a.position - b.position),
    [goals],
  );
  const yearGoals = React.useMemo(
    () => goals.filter((g) => g.period === "year").sort((a, b) => a.position - b.position),
    [goals],
  );

  // ── Actions ──────────────────────────────────────────────────────────────
  const run = React.useCallback(
    (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(key);
      void fn()
        .then((r) => {
          if (!r.ok) fireToast({ message: r.error ?? "Something went wrong.", type: "error" });
          else router.refresh();
        })
        .finally(() => setBusy(null));
    },
    [router],
  );

  const onAdd = (period: GoalDTO["period"], periodKey: string, title: string) => {
    if (!title.trim()) return;
    run(`add:${periodKey}`, () => createGoal({ employeeId: viewedEmployeeId, period, periodKey, title: title.trim() }));
  };
  const onGenerate = (id: string) => run(`gen:${id}`, () => generateGoalChildren({ id }));
  const onSetPct = (id: string, pct: number) => run(`pct:${id}`, () => setGoalPctDone({ id, pctDone: pct }));
  const onWeeklyPct = (id: string, pct: number) => run(`wpct:${id}`, () => setWeeklyGoalPct({ id, pctDone: pct }));
  const onSetCategory = (id: string, category: GoalCategory) => run(`cat:${id}`, () => setGoalCategory({ id, category }));
  const onSetTeam = (id: string, team: Array<{ employeeId?: string; name?: string }>) => run(`team:${id}`, () => setGoalTeam({ id, team }));
  const onSetNotes = (id: string, notes: string) => run(`notes:${id}`, () => editGoal({ id, notes }));

  const cardCtx: CardCtxValue = React.useMemo(
    () => ({ canWrite, roster, busy, onSetPct, onSetCategory, onSetTeam, onSetNotes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, roster, busy],
  );

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);

    // Levels board — drop a card onto a HIGHER level to promote it ("travels along").
    if (overId.startsWith("lvl:")) {
      const level = overId.slice(4);
      if (level === "week") return; // can't promote INTO the leaf
      const gg = goals.find((x) => x.id === active.id);
      if (gg) {
        if (LEVEL_RANK[level]! < (LEVEL_RANK[gg.period] ?? 2)) {
          run(`promote:${gg.id}`, () => promoteToLevel({ id: gg.id, kind: "goal", level: level as "year" | "quarter" | "month" }));
        }
        return;
      }
      const ww = weekly.find((x) => x.id === active.id);
      if (ww) run(`promote:${ww.id}`, () => promoteToLevel({ id: ww.id, kind: "weekly", level: level as "year" | "quarter" | "month" }));
      return;
    }

    const g = goals.find((x) => x.id === active.id);
    if (g) {
      // Goal move (Q→Q / month→month) — drop onto a period column.
      const toKey = overId.startsWith("col:") ? overId.slice(4) : null;
      if (toKey && toKey !== g.periodKey) run(`move:${g.id}`, () => moveGoalForward({ id: g.id, targetPeriodKey: toKey }));
      return;
    }
    const w = weekly.find((x) => x.id === active.id);
    if (w) {
      // Weekly move (week→week within the month) — drop onto a week column.
      const toWeek = overId.startsWith("wk:") ? overId.slice(3) : null;
      if (toWeek && toWeek !== w.weekStart) run(`wmove:${w.id}`, () => moveWeeklyToWeek({ id: w.id, weekStart: toWeek }));
    }
  }

  const legend = (
    <div className="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
      <Dot c="#1e3a8a" label="Auto-derived" />
      <Dot c="#111827" label="Manual" />
      <Dot c="#b91c1c" label="Spillover" />
    </div>
  );

  return (
    <CardCtx.Provider value={cardCtx}>
      {/* ── Masthead ── */}
      <header className="wg-rise mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-grid size-10 place-items-center rounded-2xl text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Target size={20} strokeWidth={2.6} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="leading-none text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em" }}
              >
                The Cascade
              </h1>
              <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.15em] text-white" style={{ background: "#0f172a" }}>
                Kanban
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-ink-muted">
              Kanban of the Cascade · {viewedName} · {fyLabel(fyStartYear)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 max-md:w-full">
          {roster.length > 1 && (
            <label
              className="group relative inline-flex h-12 items-center gap-2.5 rounded-2xl border-[1.5px] bg-surface-card pl-3.5 pr-9 transition-shadow hover:shadow-[0_10px_24px_-16px_rgba(15,23,42,0.5)]"
              style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 4px 12px -10px rgba(15,23,42,0.35)" }}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
                <Users2 size={15} strokeWidth={2.4} />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-ink-subtle">Viewing</span>
                <span className="mt-0.5 text-[14.5px] font-black text-ink-strong">{viewedName}</span>
              </span>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <select
                value={viewedEmployeeId}
                onChange={(e) => router.push(`/goals/cascade?emp=${e.target.value}&fy=${fyStartYear}`)}
                aria-label="Select employee"
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex h-12 items-center gap-1 rounded-2xl border-[1.5px] bg-surface-card px-1.5" style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 4px 12px -10px rgba(15,23,42,0.35)" }}>
            <FyStep dir={-1} onClick={() => router.push(`/goals/cascade?emp=${viewedEmployeeId}&fy=${fyStartYear - 1}`)} />
            <span className="min-w-[52px] text-center text-[15px] font-black tabular-nums text-ink-strong">FY{fyStartYear % 100}</span>
            <FyStep dir={1} onClick={() => router.push(`/goals/cascade?emp=${viewedEmployeeId}&fy=${fyStartYear + 1}`)} />
          </div>
        </div>
      </header>

      {/* ── Lens switch (centered, dark) + legend (right, vertical) ── */}
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span aria-hidden />
        <div
          className="inline-flex rounded-2xl border p-1"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)", boxShadow: "0 6px 18px -12px rgba(15,23,42,0.35)" }}
        >
          {(["year", "quarter", "month", "levels"] as Lens[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLens(l)}
              className="rounded-xl px-6 py-2 text-[13.5px] font-black uppercase tracking-[0.08em] transition-all max-sm:px-3"
              style={
                lens === l
                  ? { background: "#0f172a", color: "#fff", boxShadow: "0 10px 24px -10px rgba(15,23,42,0.65)" }
                  : { color: "var(--color-ink-muted)" }
              }
            >
              {l}
            </button>
          ))}
        </div>
        <div className="justify-self-end">{legend}</div>
      </div>

      {assigned.length > 0 && <AssignedStrip items={assigned} reduce={!!reduce} />}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        {lens === "year" && (() => {
          const overall = rollupPct(yearGoals) ?? 0;
          const liveQ = goals.filter((g) => g.period === "quarter" && effectiveGoalPct(g) > 0).length;
          const status =
            yearGoals.length === 0 ? "Set your north star"
            : overall >= 70 ? "On track for the year"
            : overall >= 40 ? "Building momentum"
            : "Just getting started";
          const isCurrentFy = fyStartYear === fyStartYearOf(new Date());
          const qkeys = quartersOfFy(fyStartYear);
          return (
            <div className="space-y-6">
              {/* ── HERO: overall cascade health ── */}
              <section
                className="wg-rise relative overflow-hidden rounded-section border p-6 max-md:p-4"
                style={{
                  borderColor: "var(--color-hairline)",
                  background: `radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, ${ACCENT} 10%, transparent), transparent 55%), var(--color-surface-card)`,
                  boxShadow: "0 2px 4px rgba(15,23,42,0.05), 0 30px 60px -34px rgba(15,23,42,0.35)",
                }}
              >
                <div className="flex flex-wrap items-center gap-6 max-md:gap-4">
                  <Ring pct={overall} size={128} stroke={13} color="var(--color-altus-red)">
                    <div className="text-center">
                      <div
                        className="leading-none tabular-nums text-ink-strong"
                        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: "-0.03em" }}
                      >
                        {overall}
                        <span className="text-[16px]">%</span>
                      </div>
                      <div className="mt-0.5 text-[9.5px] font-black uppercase tracking-[0.14em] text-ink-subtle">Health</div>
                    </div>
                  </Ring>
                  <div className="min-w-[220px] flex-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-white" style={{ background: "#0f172a" }}>
                      {fyLabel(fyStartYear)} · Cascade health
                    </span>
                    <h2
                      className="mt-2.5 text-ink-strong"
                      style={{ fontFamily: "var(--font-serif), var(--font-display), serif", fontWeight: 800, fontSize: "clamp(24px, 3.2vw, 38px)", letterSpacing: "-0.02em", lineHeight: 1.03 }}
                    >
                      {status}
                    </h2>
                    <p className="mt-1.5 text-[13.5px] font-medium text-ink-muted">
                      {yearGoals.length} yearly {yearGoals.length === 1 ? "goal" : "goals"} · {liveQ} {liveQ === 1 ? "quarter" : "quarters"} live · {viewedName}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="w-full max-w-[280px] max-md:max-w-none">
                      <QuickAdd busy={busy === `add:${fyStartYear}`} onAdd={(t) => onAdd("year", String(fyStartYear), t)} />
                    </div>
                  )}
                </div>
              </section>

              {/* ── PER-GOAL BLOCKS: editable card + its four quarters ── */}
              {yearGoals.length === 0 ? (
                <div className="rounded-section border p-12 text-center" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <p className="text-[15px] font-bold text-ink-strong">No yearly goals yet for {fyLabel(fyStartYear)}</p>
                  <p className="mt-1 text-[13.5px] text-ink-muted">Add one above, then Auto-divide it into quarters, months and weeks.</p>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-2">
                {yearGoals.map((yg, i) => {
                  const kidsRows: PeriodRowData[] = qkeys.map((qk) => {
                    const q = quarterOfKey(qk);
                    const kids = goals.filter((g) => g.period === "quarter" && g.parentGoalId === yg.id && g.periodKey === qk);
                    const has = kids.length > 0;
                    const qpct = has ? (rollupPct(kids) ?? 0) : 0;
                    return {
                      key: qk,
                      label: `Q${q}`,
                      sub: Q_LABEL[q] ?? "",
                      pct: qpct,
                      has,
                      isNow: isCurrentFy && q === nowQ,
                      onOpen: () => { setSelQuarter(q); setLens("quarter"); },
                    };
                  });
                  return (
                    <CockpitGoalCard
                      key={yg.id}
                      g={yg}
                      childRows={kidsRows}
                      genLabel="quarters"
                      onGenerate={() => onGenerate(yg.id)}
                      generating={busy === `gen:${yg.id}`}
                      delayMs={i * 60}
                    />
                  );
                })}
                </div>
              )}
            </div>
          );
        })()}

        {lens === "quarter" && (() => {
          const qKey = `${fyStartYear}-Q${selQuarter}`;
          const qGoals = byPeriod("quarter", qKey);
          const months = monthKeysOfQuarter(fyStartYear, selQuarter as 1 | 2 | 3 | 4);
          return (
            <div className="space-y-6">
              {canWrite && (
                <div className="flex justify-end">
                  <div className="w-full max-w-[300px] max-md:max-w-none"><QuickAdd busy={busy === `add:${qKey}`} onAdd={(t) => onAdd("quarter", qKey, t)} /></div>
                </div>
              )}
              {/* centered, prominently-outlined quarter tabs */}
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {quartersOfFy(fyStartYear).map((qk) => {
                  const q = quarterOfKey(qk);
                  const on = selQuarter === q;
                  return (
                    <button
                      key={qk}
                      type="button"
                      onClick={() => setSelQuarter(q)}
                      className="rounded-xl border-2 px-6 py-2.5 text-[15px] font-black tracking-wide transition-all active:scale-95"
                      style={on
                        ? { background: ACCENT, color: "#fff", borderColor: ACCENT, boxShadow: `0 10px 22px -12px ${ACCENT_DEEP}` }
                        : { background: "var(--color-surface-card)", color: "var(--color-ink-strong)", borderColor: "var(--color-hairline-strong)" }}
                    >
                      Q{q}
                    </button>
                  );
                })}
                <span className="ml-1.5 text-[14px] font-bold text-ink-muted">{Q_LABEL[selQuarter] ?? ""}</span>
              </div>
              {qGoals.length === 0 ? (
                <div className="rounded-section border p-12 text-center" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <p className="text-[15px] font-bold text-ink-strong">No goals yet for Q{selQuarter}</p>
                  <p className="mt-1 text-[13.5px] text-ink-muted">Add one above, then Auto-divide it into months.</p>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-2">
                {qGoals.map((qg, i) => {
                  const rows: PeriodRowData[] = months.map((mk) => {
                    const kids = goals.filter((g) => g.period === "month" && g.parentGoalId === qg.id && g.periodKey === mk);
                    const has = kids.length > 0;
                    const mpct = has ? (rollupPct(kids) ?? 0) : 0;
                    return { key: mk, label: monLabel(mk), sub: mk.slice(0, 4), pct: mpct, has, isNow: mk === nowMonth, onOpen: () => { setSelMonth(mk); setLens("month"); } };
                  });
                  return (
                    <CockpitGoalCard key={qg.id} g={qg} childRows={rows} genLabel="months" onGenerate={() => onGenerate(qg.id)} generating={busy === `gen:${qg.id}`} delayMs={i * 60} />
                  );
                })}
                </div>
              )}
            </div>
          );
        })()}

        {lens === "month" && (() => {
          const mGoals = byPeriod("month", selMonth);
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selMonth}
                  onChange={(e) => setSelMonth(e.target.value)}
                  className="h-11 rounded-xl border-[1.5px] bg-surface-card px-3.5 text-[14.5px] font-black text-ink-strong"
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                >
                  {monthsInFy.map((mk) => (
                    <option key={mk} value={mk}>{monLabel(mk)} {mk.slice(0, 4)}</option>
                  ))}
                </select>
                {canWrite && <div className="ml-auto w-full max-w-[280px] max-md:max-w-none"><QuickAdd busy={busy === `add:${selMonth}`} onAdd={(t) => onAdd("month", selMonth, t)} /></div>}
              </div>
              {mGoals.length === 0 ? (
                <div className="rounded-section border p-14 text-center" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <p className="text-[19px] font-black text-ink-strong">No goals yet for {monLabel(selMonth)}</p>
                  <p className="mt-1.5 text-[15px] text-ink-muted">Add one above, then Auto-divide it into weeks.</p>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-2">
                {mGoals.map((mg, i) => (
                  <CockpitGoalCard key={mg.id} g={mg} childRows={[]} genLabel="weeks" onGenerate={() => onGenerate(mg.id)} generating={busy === `gen:${mg.id}`} delayMs={i * 60} />
                ))}
                </div>
              )}
              <div>
                <h3 className="mb-3 text-[16px] font-black uppercase tracking-[0.08em] text-ink-strong">Weeks of {monLabel(selMonth)}</h3>
                <div className="flex gap-3 overflow-x-auto pb-3">
                  <WeekColumns month={selMonth} weekly={weekly} canWrite={canWrite} onPct={onWeeklyPct} busy={busy} />
                </div>
              </div>
            </div>
          );
        })()}

        {lens === "levels" && (
          <>
            <p className="mb-3 text-center text-[12.5px] font-medium text-ink-muted">
              Drag a card <b className="text-ink-strong">up a level</b> to promote it — a weekly can become a month, quarter, or yearly goal.
            </p>
            <div className="flex gap-4 overflow-x-auto pb-3">
              <LevelColumn level="year" label="Yearly" sub="the north star" goals={goals.filter((g) => g.period === "year")} />
              <LevelColumn level="quarter" label="Quarterly" sub="4 per year" goals={goals.filter((g) => g.period === "quarter")} />
              <LevelColumn level="month" label="Monthly" sub="12 per year" goals={goals.filter((g) => g.period === "month")} />
              <WeekLevelColumn weekly={weekly} canWrite={canWrite} onPct={onWeeklyPct} busy={busy} />
            </div>
          </>
        )}

        <DragOverlay>
          {dragId ? (
            <div className="rounded-chip border border-hairline-strong bg-surface-card px-3 py-2 text-[13px] font-semibold text-ink-strong shadow-lg">
              {goals.find((g) => g.id === dragId)?.title ?? "Goal"}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CardCtx.Provider>
  );
}

/* ── "Assigned to you" strip (Sir #25) — goals others named you on ── */
function AssignedStrip({ items, reduce }: { items: AssignedGoal[]; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl border border-hairline bg-surface-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <Users2 size={15} style={{ color: ACCENT_DEEP }} />
        <span className="text-[13px] font-black text-ink-strong">Also on You</span>
        <span className="text-[11.5px] font-medium text-ink-muted">— goals others made you responsible for</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((a) => {
          const pct = a.acceptPct ?? a.pctDone;
          return (
            <div key={a.id} className="min-w-[220px] shrink-0 rounded-chip border border-hairline bg-surface-soft/50 px-3 py-2" style={{ borderLeft: "3px solid #1e3a8a" }}>
              <div className="truncate text-[13px] font-bold text-ink-strong">{a.title}</div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="truncate">{a.ownerName}{a.area ? ` · ${a.area}` : ""}</span>
                <span className="font-bold tabular-nums" style={{ color: pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c" }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** The Mondays whose date falls inside a month "YYYY-MM". */
function monthMondays(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const out: string[] = [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCMonth() === m - 1) {
    if (d.getUTCDay() === 1) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
/* ── Month → week columns: droppable by weekStart, draggable weekly cards, % edit ── */
function WeekColumns({ month, weekly, canWrite, onPct, busy }: { month: string; weekly: WeeklyDTO[]; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: string | null }) {
  const wk = weekly.filter((w) => w.monthKey === month);
  const byWeek = new Map<string, WeeklyDTO[]>();
  for (const w of wk) {
    const arr = byWeek.get(w.weekStart);
    if (arr) arr.push(w);
    else byWeek.set(w.weekStart, [w]);
  }
  const weekStarts = [...new Set([...monthMondays(month), ...byWeek.keys()])].sort();
  return (
    <>
      {weekStarts.map((ws) => (
        <WeekColumn key={ws} weekStart={ws} items={byWeek.get(ws) ?? []} canWrite={canWrite} onPct={onPct} busy={busy} />
      ))}
    </>
  );
}

function WeekColumn({ weekStart, items, canWrite, onPct, busy }: { weekStart: string; items: WeeklyDTO[]; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: `wk:${weekStart}` });
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[300px] shrink-0 flex-col rounded-2xl border-2 bg-white/80 p-3 transition-colors"
      style={{
        borderColor: isOver ? "#0f172a" : "var(--color-hairline-strong)",
        background: isOver ? "rgba(15,23,42,0.03)" : undefined,
        boxShadow: isOver ? "0 0 0 3px rgba(15,23,42,0.08)" : "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <div className="mb-3 flex items-baseline gap-2 border-b-2 px-1 pb-2.5" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[17px] font-black text-ink-strong">W{weekNoOf(weekStart)}</span>
        <span className="text-[12.5px] font-semibold text-ink-muted">{weekStart.slice(8)}/{weekStart.slice(5, 7)}</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-2 text-[12px] font-black tabular-nums text-ink-soft">{items.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        {items.map((w) => (
          <WeeklyCard key={w.id} w={w} canWrite={canWrite} onPct={onPct} busy={busy === `wpct:${w.id}`} />
        ))}
        {items.length === 0 && <div className="rounded-chip border border-hairline px-2 py-2 text-center text-[11px] text-ink-muted/70">Drop a week here</div>}
      </div>
    </div>
  );
}

function WeeklyCard({ w, canWrite, onPct, busy }: { w: WeeklyDTO; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: w.id });
  const pct = w.acceptPct ?? w.pctDone;
  const color = w.spillover && pct < 100 ? "#b91c1c" : w.cascade ? "#1e3a8a" : "#111827";
  const [draft, setDraft] = React.useState(String(w.pctDone));
  React.useEffect(() => setDraft(String(w.pctDone)), [w.pctDone]);
  const drag = canWrite ? { ...attributes, ...listeners } : {};
  return (
    <div
      ref={setNodeRef}
      {...drag}
      className={`rounded-lg border bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)] ${isDragging ? "" : "wg-rise"}`}
      style={{ borderColor: "var(--color-hairline)", borderLeft: `3px solid ${color}`, opacity: isDragging ? 0.35 : 1, cursor: canWrite ? "grab" : "default", touchAction: "none" }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ background: color }}>W{w.weekNo}</span>
        <span className="truncate text-[14.5px] font-bold text-ink-strong" title={w.title}>{w.title}</span>
        {canWrite && <span aria-hidden className="ml-auto text-ink-muted/25"><GripVertical size={14} /></span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-track">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        {canWrite ? (
          <div className="flex items-center gap-0.5">
            <input
              value={draft}
              onPointerDown={stopDrag}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              onBlur={() => { const n = Math.max(0, Math.min(100, Number(draft) || 0)); if (n !== w.pctDone) onPct(w.id, n); }}
              inputMode="numeric"
              aria-label={`Percent complete for ${w.title}`}
              className="w-11 rounded border border-hairline bg-surface-soft px-1.5 py-1 text-right text-[14px] font-bold tabular-nums text-ink-strong"
            />
            <span className="text-[13px] font-bold text-ink-muted">%</span>
            {busy && <Loader2 size={13} className="animate-spin text-ink-muted" />}
          </div>
        ) : (
          <span className="text-[14.5px] font-black tabular-nums" style={{ color }}>{pct}%</span>
        )}
      </div>
    </div>
  );
}

function DraggableGoalCard({ g }: { g: GoalDTO }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: g.id });
  const ctx = React.useContext(CardCtx);
  const drag = ctx.canWrite ? { ...attributes, ...listeners } : {};
  return (
    <div
      ref={setNodeRef}
      {...drag}
      style={{ opacity: isDragging ? 0.35 : 1, cursor: ctx.canWrite ? "grab" : "default", touchAction: "none" }}
      className={isDragging ? "" : "wg-rise"}
    >
      <GoalCard g={g} draggable={ctx.canWrite} />
    </div>
  );
}

/** Interactive controls inside a draggable card must swallow pointerdown so they
 *  stay clickable/typable instead of starting a drag. */
const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

/* ── The goal card — mockup style: category tag · title · dual % · team ── */
function GoalCard(props: {
  g: GoalDTO;
  onGenerate?: () => void;
  generating?: boolean;
  genLabel?: string;
  draggable?: boolean;
}) {
  const { g } = props;
  const ctx = React.useContext(CardCtx);
  const cat = categoryStyle(g.category, isSpillover(g));
  const self = g.pctDone;
  const target = g.acceptPct ?? 100;
  const [draft, setDraft] = React.useState(String(g.pctDone));
  const [catOpen, setCatOpen] = React.useState(false);
  const [teamOpen, setTeamOpen] = React.useState(false);
  React.useEffect(() => setDraft(String(g.pctDone)), [g.pctDone]);
  const team = g.teamInvolved ?? [];

  return (
    <div
      className={`group relative w-full rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)] ${props.draggable ? "" : "max-w-[620px]"}`}
      style={{ borderColor: "var(--color-hairline)", borderLeft: `4px solid ${cat.accent}` }}
    >
      {/* top row — category tag + grip affordance (the whole card drags) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!ctx.canWrite}
          onPointerDown={stopDrag}
          onClick={() => setCatOpen((o) => !o)}
          className="rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wide disabled:cursor-default"
          style={{ color: cat.color, background: cat.bg }}
        >
          {cat.label}
        </button>
        <span className="text-[11px] font-bold tabular-nums text-ink-subtle">{goalCode(g)}</span>
        <span className="ml-auto" />
        {props.draggable && (
          <span aria-hidden className="text-ink-muted/25 group-hover:text-ink-muted/60">
            <GripVertical size={14} />
          </span>
        )}
      </div>

      {/* category picker */}
      {catOpen && ctx.canWrite && (
        <div className="mt-1.5 flex flex-wrap gap-1" onPointerDown={stopDrag}>
          {(["target", "milestone", "operational", "goal"] as const).map((c) => {
            const cs = categoryStyle(c, false);
            return (
              <button
                key={c}
                type="button"
                onClick={() => { ctx.onSetCategory(g.id, c); setCatOpen(false); }}
                className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase"
                style={{ color: cs.color, background: cs.bg, outline: g.category === c ? `1px solid ${cs.color}` : "none" }}
              >
                {cs.label}
              </button>
            );
          })}
        </div>
      )}

      {/* title */}
      <div className="mt-2 text-[17px] font-bold leading-snug text-ink-strong" style={{ overflowWrap: "anywhere" }}>
        {g.title}
      </div>

      {/* meta */}
      {(g.area || g.targetQty != null || g.targetAmount != null) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-muted">
          {g.area && <span>{g.area}</span>}
          {g.targetQty != null && <span className="tabular-nums">{fmtNum(g.targetQty)} {g.uom ?? ""}</span>}
          {g.targetAmount != null && <span className="tabular-nums">₹{fmtNum(g.targetAmount)}</span>}
        </div>
      )}

      {/* dual % row */}
      <div className="mt-2.5 flex items-center justify-between">
        {ctx.canWrite ? (
          <span className="inline-flex items-center gap-0.5">
            <input
              value={draft}
              onPointerDown={stopDrag}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              onBlur={() => { const n = Math.max(0, Math.min(100, Number(draft) || 0)); if (n !== g.pctDone) ctx.onSetPct(g.id, n); }}
              inputMode="numeric"
              aria-label={`Percent complete for ${g.title}`}
              className="w-12 rounded border-0 bg-transparent p-0 text-left text-[22px] font-black tabular-nums focus:outline-none"
              style={{ color: cat.accent }}
            />
            <span className="text-[16px] font-black" style={{ color: cat.accent }}>%</span>
            {ctx.busy === `pct:${g.id}` && <Loader2 size={14} className="animate-spin text-ink-muted" />}
          </span>
        ) : (
          <span className="text-[22px] font-black tabular-nums" style={{ color: cat.accent }}>{self}%</span>
        )}
        <span className="text-[15px] font-bold tabular-nums text-ink-subtle">of {target}%</span>
      </div>

      {/* progress bar */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-track">
        <span className="block h-full rounded-full" style={{ width: `${self}%`, background: cat.accent }} />
      </div>

      {/* team involvement */}
      <div className="mt-3 flex items-center gap-2">
        <TeamAvatars team={team} />
        {ctx.canWrite && (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setTeamOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <UserPlus size={15} strokeWidth={2.4} /> {team.length > 0 ? "Edit people" : "Involve people"}
          </button>
        )}
        {ctx.busy === `team:${g.id}` && <Loader2 size={13} className="animate-spin text-ink-muted" />}
      </div>

      {teamOpen && ctx.canWrite && (
        <div onPointerDown={stopDrag}>
          <TeamPicker
            roster={ctx.roster}
            team={team}
            onDone={(next) => { ctx.onSetTeam(g.id, next); setTeamOpen(false); }}
            onCancel={() => setTeamOpen(false)}
          />
        </div>
      )}

      {props.onGenerate && ctx.canWrite && (
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={props.onGenerate}
          disabled={props.generating}
          className="bg-surface-card mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-bold text-ink-soft hover:border-hairline-strong disabled:opacity-50"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          {props.generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} style={{ color: ACCENT }} />}
          Auto-divide into {props.genLabel}
        </button>
      )}
    </div>
  );
}

/** Year-lens cockpit card — compact + clear: title, easy slider progress, a
 *  notes field with dictation, and a tight row of four quarters. */
function CockpitGoalCard({
  g,
  childRows,
  genLabel,
  onGenerate,
  generating,
  delayMs = 0,
}: {
  g: GoalDTO;
  childRows: PeriodRowData[];
  genLabel: string;
  onGenerate: () => void;
  generating: boolean;
  delayMs?: number;
}) {
  const ctx = React.useContext(CardCtx);
  const cat = categoryStyle(g.category, isSpillover(g));
  const eff = effectiveGoalPct(g);
  const tone = pctTone(eff);
  const target = g.acceptPct ?? 100;

  const [pct, setPct] = React.useState(g.pctDone);
  React.useEffect(() => setPct(g.pctDone), [g.pctDone]);
  const commitPct = (n: number) => { const c = Math.max(0, Math.min(100, n)); setPct(c); if (c !== g.pctDone) ctx.onSetPct(g.id, c); };

  const [notesOpen, setNotesOpen] = React.useState(!!g.notes?.trim());
  const [notes, setNotes] = React.useState(g.notes ?? "");
  React.useEffect(() => setNotes(g.notes ?? ""), [g.notes]);
  const { listening, toggle } = useDictation();
  const dictateNotes = () => { const base = notes.trim() ? notes.trim() + " " : ""; toggle((s) => setNotes((base + s).slice(0, 2000))); };
  const commitNotes = () => { const t = notes.trim(); if (t !== (g.notes ?? "").trim()) ctx.onSetNotes(g.id, t); };

  const [catOpen, setCatOpen] = React.useState(false);
  const [teamOpen, setTeamOpen] = React.useState(false);
  const team = g.teamInvolved ?? [];

  return (
    <section
      className="wg-rise overflow-hidden rounded-section border"
      style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)", borderLeft: `4px solid ${cat.accent}`, boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 14px 32px -26px rgba(15,23,42,0.3)", animationDelay: `${delayMs}ms` }}
    >
      {/* Title + big % */}
      <div className="flex items-start gap-4 px-5 pt-4 max-md:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!ctx.canWrite}
              onClick={() => setCatOpen((o) => !o)}
              className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide disabled:cursor-default"
              style={{ color: cat.color, background: cat.bg }}
            >
              {cat.label}
            </button>
            <span className="text-[10px] font-bold tabular-nums text-ink-subtle">{goalCode(g)}</span>
          </div>
          {catOpen && ctx.canWrite && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(["target", "milestone", "operational", "goal"] as const).map((c) => {
                const cs = categoryStyle(c, false);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { ctx.onSetCategory(g.id, c); setCatOpen(false); }}
                    className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase"
                    style={{ color: cs.color, background: cs.bg, outline: g.category === c ? `1px solid ${cs.color}` : "none" }}
                  >
                    {cs.label}
                  </button>
                );
              })}
            </div>
          )}
          <h3
            className="mt-1.5 leading-[1.05] text-ink-strong"
            style={{ overflowWrap: "anywhere", fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px, 2.6vw, 30px)", letterSpacing: "-0.02em" }}
          >
            {g.title}
          </h3>
          {(g.area || g.targetQty != null || g.targetAmount != null) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
              {g.area && <span>{g.area}</span>}
              {g.targetQty != null && <span className="tabular-nums">{fmtNum(g.targetQty)} {g.uom ?? ""}</span>}
              {g.targetAmount != null && <span className="tabular-nums">₹{fmtNum(g.targetAmount)}</span>}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="leading-none tabular-nums" style={{ color: tone.color, fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.02em" }}>
            {eff}
            <span className="text-[15px]">%</span>
          </div>
          <div className="mt-0.5 text-[9.5px] font-black uppercase tracking-[0.1em] text-ink-subtle">of {target}%</div>
        </div>
      </div>

      {/* Easy progress: drag slider + quick chips */}
      <div className="px-5 pt-3.5 max-md:px-4">
        <div className="flex items-center gap-3">
          <span className="w-[70px] shrink-0 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">Progress</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            disabled={!ctx.canWrite}
            onChange={(e) => setPct(Number(e.target.value))}
            onPointerUp={(e) => commitPct(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => commitPct(Number((e.target as HTMLInputElement).value))}
            aria-label={`Progress for ${g.title}`}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full disabled:cursor-default"
            style={{ accentColor: tone.color, background: `linear-gradient(90deg, ${tone.color} ${pct}%, var(--color-hairline-strong) ${pct}%)` }}
          />
          <span className="w-11 shrink-0 text-right text-[17px] font-black tabular-nums" style={{ color: tone.color }}>{pct}%</span>
          {ctx.busy === `pct:${g.id}` && <Loader2 size={13} className="animate-spin text-ink-muted" />}
        </div>
        {ctx.canWrite && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-[82px] max-md:pl-0">
            {[0, 25, 50, 75, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => commitPct(n)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums transition-colors"
                style={pct === n ? { background: tone.color, color: "#fff", borderColor: tone.color } : { color: "var(--color-ink-muted)", borderColor: "var(--color-hairline-strong)" }}
              >
                {n}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes + dictation */}
      <div className="px-5 pt-3.5 max-md:px-4">
        {!notesOpen ? (
          <button type="button" onClick={() => setNotesOpen(true)} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted hover:text-ink-strong">
            <Plus size={13} strokeWidth={2.8} /> Add a note
          </button>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border p-2" style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}>
            <textarea
              value={notes}
              disabled={!ctx.canWrite}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              onBlur={commitNotes}
              rows={2}
              placeholder="Notes, blockers, context… or tap the mic to dictate"
              className="min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-ink-strong outline-none placeholder:text-ink-subtle"
            />
            {ctx.canWrite && <MicButton listening={listening} onClick={dictateNotes} size={34} />}
            {ctx.busy === `notes:${g.id}` && <Loader2 size={13} className="mt-1 animate-spin text-ink-muted" />}
          </div>
        )}
      </div>

      {/* Footer: child periods (vertical) + team + generate */}
      <div className="mt-3.5 border-t px-5 py-3.5 max-md:px-4" style={{ borderColor: "var(--color-hairline)" }}>
        {childRows.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {childRows.map((d) => (
              <PeriodRow key={d.key} d={d} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <TeamAvatars team={team} />
          {ctx.canWrite && (
            <button
              type="button"
              onClick={() => setTeamOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              <UserPlus size={15} strokeWidth={2.4} /> {team.length > 0 ? "Edit people" : "Involve people"}
            </button>
          )}
          <span className="ml-auto" />
          {ctx.canWrite && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="brand-btn inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Auto-divide into {genLabel}
            </button>
          )}
        </div>
        {teamOpen && ctx.canWrite && (
          <div className="mt-2">
            <TeamPicker roster={ctx.roster} team={team} onDone={(next) => { ctx.onSetTeam(g.id, next); setTeamOpen(false); }} onCancel={() => setTeamOpen(false)} />
          </div>
        )}
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
const AV_COLORS = ["#1d4ed8", "#0891b2", "#7c3aed", "#b45309", "#be123c", "#15803d"];

function TeamAvatars({ team }: { team: Array<{ employeeId?: string; name?: string }> }) {
  if (team.length === 0) return null;
  return (
    <div className="flex -space-x-1.5">
      {team.slice(0, 5).map((t, i) => (
        <span
          key={t.employeeId ?? t.name ?? i}
          title={t.name ?? ""}
          className="inline-flex size-5 items-center justify-center rounded-full text-[8.5px] font-black text-white ring-1 ring-white"
          style={{ background: AV_COLORS[i % AV_COLORS.length] }}
        >
          {initials(t.name ?? "?")}
        </span>
      ))}
      {team.length > 5 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-soft text-[8.5px] font-black text-ink-muted ring-1 ring-white">+{team.length - 5}</span>}
    </div>
  );
}

function TeamPicker({
  roster,
  team,
  onDone,
  onCancel,
}: {
  roster: RosterMember[];
  team: Array<{ employeeId?: string; name?: string }>;
  onDone: (next: Array<{ employeeId?: string; name?: string }>) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = React.useState<Set<string>>(new Set(team.map((t) => t.employeeId).filter(Boolean) as string[]));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="mt-2 rounded-lg border bg-surface-card p-2 shadow-lg" style={{ borderColor: "var(--color-hairline-strong)" }}>
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-muted">Involve people</div>
      <div className="max-h-[160px] overflow-y-auto">
        {roster.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-soft">
            <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="accent-[#E10600]" />
            <span className="truncate text-ink-strong">{r.name}</span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="bg-surface-card rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted">Cancel</button>
        <button
          type="button"
          onClick={() => onDone(roster.filter((r) => sel.has(r.id)).map((r) => ({ employeeId: r.id, name: r.name })))}
          className="rounded-md px-2.5 py-1 text-[11.5px] font-bold text-white"
          style={{ background: "#E10600" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** Web-Speech dictation. `onText(transcript)` fires with the growing utterance;
 *  the caller merges it with whatever base text it captured at start. */
function useDictation() {
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<{ stop: () => void } | null>(null);
  const toggle = React.useCallback((onText: (t: string) => void) => {
    if (recRef.current) { recRef.current.stop(); return; }
    const SR =
      (window as unknown as { SpeechRecognition?: new () => never }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => never }).webkitSpeechRecognition;
    if (!SR) { fireToast({ message: "Voice input isn't supported in this browser.", type: "error" }); return; }
    const rec = new (SR as unknown as new () => {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    })();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e) => {
      let s = "";
      for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i]![0]!.transcript;
      onText(s);
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = rec; setListening(true); rec.start();
  }, []);
  return { listening, toggle };
}

/** Round mic toggle — pulses red while listening. */
function MicButton({ listening, onClick, size = 40 }: { listening: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl transition-colors ${listening ? "text-white" : "text-ink-soft hover:bg-surface-soft hover:text-ink-strong"}`}
      style={{ width: size, height: size, background: listening ? "var(--color-altus-red)" : undefined }}
    >
      {listening && <span aria-hidden className="absolute inset-0 animate-ping rounded-xl" style={{ background: "var(--color-altus-red)", opacity: 0.35 }} />}
      <Mic size={Math.round(size * 0.45)} strokeWidth={2.4} className="relative" />
    </button>
  );
}

function QuickAdd({ busy, onAdd, compact }: { busy: boolean; onAdd: (title: string) => void; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState("");
  const { listening, toggle } = useDictation();
  const dictate = () => { const base = v.trim() ? v.trim() + " " : ""; toggle((s) => setV((base + s).slice(0, 400))); };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "brand-btn wg-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-white"
            : "brand-btn wg-btn wg-sheen inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[15.5px] font-black text-white"
        }
      >
        <Plus size={compact ? 15 : 19} strokeWidth={3} /> Add Goal
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); setOpen(false); } }}
      className={`wg-rise flex items-center gap-2 rounded-2xl border-[1.5px] bg-surface-card ${compact ? "p-1 pl-2.5" : "p-1.5 pl-4"}`}
      style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, var(--color-hairline-strong))", boxShadow: "0 8px 22px -14px rgba(225,6,0,0.5)" }}
    >
      {!compact && (
        <Sparkles size={17} strokeWidth={2.4} className="shrink-0" style={{ color: ACCENT }} />
      )}
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (!v.trim() && !listening) setOpen(false); }}
        maxLength={400}
        placeholder={compact ? "Goal…" : "Name your goal — or tap the mic to dictate…"}
        className={`min-w-0 flex-1 border-0 bg-transparent text-ink-strong outline-none placeholder:text-ink-subtle ${compact ? "text-[12.5px]" : "text-[15px] font-medium"}`}
      />
      <MicButton listening={listening} onClick={dictate} size={compact ? 32 : 40} />
      {/* submit */}
      <button
        type="submit"
        onMouseDown={(e) => e.preventDefault()}
        disabled={busy || v.trim().length < 1}
        className={`brand-btn inline-flex shrink-0 items-center justify-center rounded-xl text-white transition-transform active:scale-95 disabled:opacity-40 ${compact ? "size-8" : "size-10"}`}
        aria-label="Add goal"
      >
        {busy ? <Loader2 size={compact ? 14 : 17} className="animate-spin" /> : <ArrowRight size={compact ? 15 : 18} strokeWidth={2.8} />}
      </button>
    </form>
  );
}

function FyStep({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-grid size-9 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong active:scale-95" aria-label={dir < 0 ? "Previous FY" : "Next FY"}>
      {dir < 0 ? <ChevronLeft size={18} strokeWidth={2.6} /> : <ChevronRight size={18} strokeWidth={2.6} />}
    </button>
  );
}

function Dot({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

/* ── Combined "Levels" board — one column per level; drop a card onto a higher
      level to promote it (the card travels along). ── */
function LevelColumn({ level, label, sub, goals }: { level: string; label: string; sub: string; goals: GoalDTO[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lvl:${level}` });
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[272px] shrink-0 flex-col rounded-2xl border-2 bg-white/80 transition-colors"
      style={{
        borderColor: isOver ? "#0f172a" : "var(--color-hairline-strong)",
        background: isOver ? "rgba(15,23,42,0.03)" : undefined,
        boxShadow: isOver ? "0 0 0 3px rgba(15,23,42,0.08)" : "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <div className="flex items-baseline gap-2 border-b-2 px-3.5 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{label}</span>
        <span className="text-[11.5px] font-medium text-ink-muted">{sub}</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-1.5 text-[11px] font-black tabular-nums text-ink-soft">{goals.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {goals.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-lg border px-4 py-8 text-center text-[12px] text-ink-muted/70" style={{ borderColor: "var(--color-hairline-strong)" }}>
            Drop a lower card here to promote
          </div>
        ) : (
          goals.map((g) => <DraggableGoalCard key={g.id} g={g} />)
        )}
      </div>
    </div>
  );
}

function WeekLevelColumn({ weekly, canWrite, onPct, busy }: { weekly: WeeklyDTO[]; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: string | null }) {
  const { setNodeRef } = useDroppable({ id: "lvl:week" });
  const items = [...weekly].sort((a, b) => a.weekNo - b.weekNo);
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[240px] shrink-0 flex-col rounded-2xl border-2 bg-white/80"
      style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="flex items-baseline gap-2 border-b-2 px-3.5 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>Weekly</span>
        <span className="text-[11.5px] font-medium text-ink-muted">the leaf</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-1.5 text-[11px] font-black tabular-nums text-ink-soft">{items.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {items.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-lg border px-4 py-8 text-center text-[12px] text-ink-muted/70" style={{ borderColor: "var(--color-hairline-strong)" }}>
            No weekly goals yet.
          </div>
        ) : (
          items.map((w) => <WeeklyCard key={w.id} w={w} canWrite={canWrite} onPct={onPct} busy={busy === `wpct:${w.id}`} />)
        )}
      </div>
    </div>
  );
}
