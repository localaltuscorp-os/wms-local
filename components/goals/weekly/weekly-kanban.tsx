"use client";

/**
 * Weekly board — KANBAN view (Week → Day).
 *
 * A frozen-parent hierarchy board that reads Vision → Execution left-to-right,
 * mirroring the level boards' Month → Week Kanban one rung down:
 *
 *   ┌─────────────┐  ┌──────┐ ┌──────┐ ┌──────┐ … ┌──────┐
 *   │ FROZEN      │  │ Mon  │ │ Tue  │ │ Wed  │   │ Sun  │
 *   │ this week's │  │ day  │ │ day  │ │ …    │   │ …    │
 *   │ goals       │  │ cards│ │ cards│ │      │   │      │
 *   │ (sticky)    │  │      │ │      │ │      │   │      │
 *   └─────────────┘  └──────┘ └──────┘ └──────┘   └──────┘
 *      ▲ pinned left       ▲ Mon…Sun lanes scroll horizontally →
 *
 * FROZEN column  = the week's weekly goals (weekly_goals rows) — the roll-up the
 *                  days ladder up to.
 * Lanes          = Mon…Sun of the week in view.
 * Day cards      = `goals` rows at period="day" whose date falls in that day.
 *                  Dragging one between day lanes RE-HOMES its date
 *                  (`moveDayGoalToDate`, optimistic + Undo, keyboard-draggable).
 *
 * Day goals are uncommon on a professional board (day work usually lives on the
 * Plan-Your-Day checklist), so most lanes render an empty-but-ready state — the
 * structure is here the moment day goals exist. One `DndContext`; Pointer +
 * Keyboard sensors; every drop is fail-safe (a rejected move reverts + toasts).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
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
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Layers, Snowflake } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { addDays } from "@/lib/weekly-goals/week";
import { moveDayGoalToDate } from "@/app/(app)/goals/cascade/actions";
import {
  type GoalDTO,
  effectiveGoalPct,
  categoryStyle,
  fmtNum,
} from "@/components/goals/cascade/util";
import { pctTone } from "@/components/weekly-goals/field-controls";
import { ProgressRing } from "@/components/goals/board/goal-board-card";
import type { BoardMe, CascadeWeeklyGoal } from "./types";

const ACCENT = "var(--goals-accent, #E10600)";
const ACCENT_DEEP = "var(--goals-accent-deep, #A80400)";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** Drop-id contract — a day lane droppable is `dlane:<yyyy-mm-dd>`. */
const LANE_DROP_PREFIX = "dlane:";
const EMPTY: GoalDTO[] = [];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "13 Jul" for a day lane sub-label. */
function dayShort(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7)) - 1;
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] ?? ""}`.trim();
}

export function WeeklyKanban({
  me,
  scopeEmp,
  weekStart,
  weekNo,
  weekLabel,
  rows,
  dayGoals,
  canWrite,
}: {
  me: BoardMe;
  scopeEmp: string;
  weekStart: string;
  weekNo: number;
  weekLabel: string;
  rows: CascadeWeeklyGoal[];
  dayGoals: GoalDTO[];
  canWrite: boolean;
}) {
  const router = useRouter();

  // The 7 Mon…Sun dates of the week in view.
  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Day goals get a small local optimistic layer (goals-table rows, but this
  // surface has no shared spine): a drag re-homes the date instantly, reconciled
  // from the server on success (router.refresh) or reverted + toasted on failure.
  const [items, setItems] = React.useState<GoalDTO[]>(dayGoals);
  React.useEffect(() => setItems(dayGoals), [dayGoals]);

  // The week's weekly goals — the frozen roll-up (adopted first, crossed last).
  const frozen = React.useMemo(
    () => [...rows].sort((a, b) => Number(b.adopted) - Number(a.adopted) || a.position - b.position),
    [rows],
  );

  // Day cards bucketed per lane (date), Sr.-No. sorted.
  const byDay = React.useMemo(() => {
    const m = new Map<string, GoalDTO[]>();
    for (const d of days) m.set(d, []);
    for (const g of items) m.get(g.periodKey)?.push(g);
    for (const list of m.values())
      list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    return m;
  }, [items, days]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndId = React.useId();
  const [active, setActive] = React.useState<GoalDTO | null>(null);

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const under = pointerWithin(args);
    return under.length > 0 ? under : closestCorners(args);
  }, []);

  /** Re-home a day goal to `day` — optimistic + Undo, reconciled on refresh. */
  const rehomeDay = React.useCallback(
    (g: GoalDTO, day: string) => {
      if (!canWrite || day === g.periodKey) return;
      const from = g.periodKey;
      const patch = (list: GoalDTO[], key: string) =>
        list.map((c) => (c.id === g.id ? { ...c, periodKey: key } : c));
      setItems((list) => patch(list, day));
      void moveDayGoalToDate({ id: g.id, day })
        .then((res) => {
          if (!res.ok) {
            setItems((list) => patch(list, from));
            fireToast({ message: res.error, type: "error" });
            return;
          }
          fireToast({
            message: `Moved to ${dayShort(day)}`,
            type: "success",
            actionLabel: "Undo",
            action: () => {
              setItems((list) => patch(list, from));
              void moveDayGoalToDate({ id: g.id, day: from }).then((undone) => {
                if (undone.ok) {
                  fireToast({ message: `Moved back to ${dayShort(from)}`, type: "success" });
                  router.refresh();
                }
              });
            },
          });
          router.refresh();
        })
        .catch(() => {
          setItems((list) => patch(list, from));
          fireToast({ message: "Couldn't move the day goal. Try again.", type: "error" });
        });
    },
    [canWrite, router],
  );

  const onDragStart = React.useCallback(
    (e: DragStartEvent) => setActive(items.find((g) => g.id === String(e.active.id)) ?? null),
    [items],
  );

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      setActive(null);
      const { active: a, over } = e;
      if (!over) return;
      const g = items.find((x) => x.id === String(a.id));
      if (!g) return;
      const overId = String(over.id);
      if (overId.startsWith(LANE_DROP_PREFIX)) {
        rehomeDay(g, overId.slice(LANE_DROP_PREFIX.length));
        return;
      }
      if (overId === g.id) return;
      const target = items.find((x) => x.id === overId);
      if (target && target.periodKey !== g.periodKey) rehomeDay(g, target.periodKey);
    },
    [items, rehomeDay],
  );

  // ── ARIA-LIVE narration (keyboard parity) ───────────────────────────
  const nameOf = React.useCallback(
    (id: string | number | undefined): string | null => {
      if (id == null) return null;
      const s = String(id);
      if (s.startsWith(LANE_DROP_PREFIX)) return `the ${dayShort(s.slice(LANE_DROP_PREFIX.length))} lane`;
      const g = items.find((x) => x.id === s);
      return g ? `“${g.title}”` : null;
    },
    [items],
  );
  const announcements = React.useMemo<Announcements>(
    () => ({
      onDragStart({ active: a }) {
        return `Picked up ${nameOf(a.id) ?? "the goal"}. Arrow keys move it between days; space drops, escape cancels.`;
      },
      onDragOver({ active: a, over }) {
        const t = nameOf(over?.id);
        return t ? `${nameOf(a.id) ?? "The goal"} is over ${t}.` : "No drop target.";
      },
      onDragEnd({ active: a, over }) {
        const name = nameOf(a.id) ?? "the goal";
        if (!over) return `Dropped ${name}. No change.`;
        const overId = String(over.id);
        if (overId.startsWith(LANE_DROP_PREFIX)) return `Moved ${name} to ${dayShort(overId.slice(LANE_DROP_PREFIX.length))}.`;
        const o = items.find((x) => x.id === overId);
        return o ? `Moved ${name} to ${dayShort(o.periodKey)}.` : `Dropped ${name}.`;
      },
      onDragCancel({ active: a }) {
        return `Cancelled — ${nameOf(a.id) ?? "the goal"} returned.`;
      },
    }),
    [nameOf, items],
  );
  const instructions = React.useMemo<ScreenReaderInstructions>(
    () => ({
      draggable:
        "Press space or enter to pick up a day goal, arrow keys to move it between the Mon–Sun lanes, space or enter to drop, escape to cancel.",
    }),
    [],
  );

  const totalDays = items.length;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
    >
      {/* Horizontal-scroll stage: the frozen roll-up pins left; the day lanes scroll. */}
      <div
        className="wg-rise relative overflow-x-auto overflow-y-visible pb-4"
        role="group"
        aria-label={`This week's goals with their days — drag a day card between lanes to re-home it`}
      >
        <div className="flex min-w-max items-stretch gap-4">
          {/* ── FROZEN WEEK COLUMN — sticky, the roll-up the days ladder up to ── */}
          <aside
            className="sticky left-0 z-30 flex w-[312px] shrink-0 flex-col gap-3 rounded-2xl p-3 max-md:w-[248px]"
            style={{
              background:
                "linear-gradient(158deg, color-mix(in srgb, var(--color-altus-red) 9%, var(--color-surface-card)) 0%, var(--color-surface-card) 60%)",
              border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 26%, var(--color-hairline-strong))",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.7) inset, 22px 0 26px -22px color-mix(in srgb, var(--color-altus-red) 55%, transparent), 0 18px 40px -28px color-mix(in srgb, var(--color-altus-red) 50%, transparent)",
            }}
          >
            <div className="flex items-center gap-2 px-1 pt-0.5">
              <span
                className="grid size-7 place-items-center rounded-lg text-white"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                <Layers size={15} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: ACCENT_DEEP }}>
                  W{weekNo} · roll-up
                </div>
                <div className="text-[12px] font-bold" style={{ color: "var(--color-ink-subtle)" }}>
                  {frozen.length} goal{frozen.length === 1 ? "" : "s"} · {weekLabel}
                </div>
              </div>
            </div>

            {frozen.length === 0 ? (
              <div
                className="flex flex-1 flex-col items-center justify-center rounded-xl border px-4 py-10 text-center"
                style={{ borderColor: "color-mix(in srgb, var(--color-ink-strong) 26%, transparent)" }}
              >
                <p className="text-[13px] font-bold" style={{ color: "var(--color-ink-soft)" }}>
                  No weekly goals for W{weekNo}
                </p>
                <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                  Add one above — the days below ladder up to it.
                </p>
              </div>
            ) : (
              frozen.map((g) => <FrozenWeekCard key={g.id} goal={g} />)
            )}
          </aside>

          {/* ── DAY LANES — Mon…Sun, droppable, the execution surface ── */}
          {days.map((date, i) => (
            <DayLane
              key={date}
              date={date}
              dow={DOW[i] ?? ""}
              goals={byDay.get(date) ?? EMPTY}
              draggable={canWrite}
              me={me}
              scopeEmp={scopeEmp}
            />
          ))}
        </div>
      </div>

      <p className="wg-rise mt-1 px-1 text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
        {totalDays} day goal{totalDays === 1 ? "" : "s"} across 7 lanes
      </p>

      <DragOverlay
        dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2,0,0,1)" }}
        style={{ width: "max-content", height: "auto" }}
      >
        {active && (
          <div
            className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5"
            style={{
              background: "var(--color-surface-card)",
              borderColor: "color-mix(in srgb, var(--goals-accent, #E10600) 48%, transparent)",
              boxShadow: "0 26px 60px -14px rgba(225,6,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6)",
              transform: "rotate(-2.5deg) scale(1.04)",
              cursor: "grabbing",
            }}
          >
            <ProgressRing pct={effectiveGoalPct(active)} tone={effectiveGoalPct(active) >= 100 ? "green" : pctTone(effectiveGoalPct(active))} size={36} />
            <span className="max-w-[280px] truncate text-[14px] font-bold" style={{ color: "var(--color-ink-strong)" }}>
              {active.title}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */
/* Frozen weekly-goal card — the roll-up the day lanes ladder up to     */
/* ------------------------------------------------------------------ */

function FrozenWeekCard({ goal }: { goal: CascadeWeeklyGoal }) {
  const eff = goal.acceptPct ?? goal.pctDone;
  const tone = eff >= 100 ? "green" : pctTone(eff);
  const crossed = !goal.adopted;
  const title = (goal.targetDone ?? "").trim() || (goal.subject ?? "").trim() || "Untitled";

  return (
    <article
      className="wg-sheen relative overflow-hidden rounded-2xl"
      style={{
        background: "var(--color-surface-card)",
        border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline-strong))",
        boxShadow: "0 10px 26px -16px color-mix(in srgb, var(--color-altus-red) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.7)",
        opacity: crossed ? 0.62 : 1,
      }}
    >
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-1" style={{ background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})` }} />
      <div className="flex items-start gap-3 p-3 pl-4">
        <ProgressRing pct={eff} tone={tone} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black tabular-nums" style={{ color: ACCENT_DEEP }}>
              W{goal.position}
            </span>
            {goal.area && (
              <span
                className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: ACCENT_DEEP }}
              >
                {goal.area}
              </span>
            )}
            {goal.committed && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: ACCENT_DEEP }}>
                <Snowflake size={10} strokeWidth={2.6} /> Committed
              </span>
            )}
          </div>
          <h3
            className="mt-1 text-[14px] font-black leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
            style={{ color: "var(--color-ink-strong)", letterSpacing: "-0.01em", fontFamily: "var(--font-display)", textDecoration: crossed ? "line-through" : undefined }}
            title={title}
          >
            {title}
          </h3>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* One DAY lane — droppable body + sortable day cards                   */
/* ------------------------------------------------------------------ */

function DayLane({
  date,
  dow,
  goals,
  draggable,
  me,
  scopeEmp,
}: {
  date: string;
  dow: string;
  goals: GoalDTO[];
  draggable: boolean;
  me: BoardMe;
  scopeEmp: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE_DROP_PREFIX}${date}` });
  void me;
  void scopeEmp;

  return (
    <section
      aria-label={`${dow} ${dayShort(date)} — ${goals.length} day goal${goals.length === 1 ? "" : "s"}`}
      className="flex w-[240px] shrink-0 flex-col rounded-2xl border transition-all"
      style={{
        background: isOver
          ? "color-mix(in srgb, var(--color-ink-strong) 5%, var(--color-surface-soft))"
          : "var(--color-surface-soft)",
        borderColor: isOver
          ? "var(--color-ink-soft)"
          : "color-mix(in srgb, var(--color-ink-strong) 22%, var(--color-hairline-strong))",
        boxShadow: isOver
          ? "0 0 0 3px color-mix(in srgb, var(--color-ink-strong) 12%, transparent)"
          : "0 2px 10px -8px rgba(15,23,42,0.14)",
      }}
    >
      <header
        className="sticky top-2 z-20 mx-2 mt-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2"
        style={{
          background: "var(--color-surface-card)",
          border: "1.5px solid color-mix(in srgb, var(--goals-accent, #E10600) 24%, var(--color-hairline-strong))",
          boxShadow: "0 2px 10px -6px rgba(15,23,42,0.2)",
        }}
      >
        <div className="min-w-0">
          <div className="truncate text-[14px] font-black tracking-tight" style={{ color: "var(--color-ink-strong)", fontFamily: "var(--font-display)" }}>
            {dow}
          </div>
          <div className="truncate text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-subtle)" }}>
            {dayShort(date)}
          </div>
        </div>
        <span
          className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums"
          style={{ background: "color-mix(in srgb, var(--goals-accent, #E10600) 10%, transparent)", color: ACCENT_DEEP }}
        >
          {goals.length}
        </span>
      </header>

      <div ref={setNodeRef} className="flex min-h-[96px] flex-1 flex-col gap-2.5 px-2.5 pb-2.5 pt-1">
        <SortableContext items={goals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          {goals.length === 0 ? (
            <p
              className="flex flex-1 items-center justify-center rounded-xl border px-3 py-6 text-center text-[12px] font-semibold"
              style={{ borderColor: "color-mix(in srgb, var(--color-ink-strong) 22%, transparent)", color: "var(--color-ink-subtle)" }}
            >
              Nothing on {dow} yet
            </p>
          ) : (
            goals.map((goal) => <DayCard key={goal.id} goal={goal} draggable={draggable} />)
          )}
        </SortableContext>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One DAY card — lean, draggable (pointer + keyboard) → re-home its day */
/* ------------------------------------------------------------------ */

function DayCard({ goal, draggable }: { goal: GoalDTO; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: goal.id,
    disabled: !draggable,
  });
  const eff = effectiveGoalPct(goal);
  const tone = eff >= 100 ? "green" : pctTone(eff);
  const cat = categoryStyle(goal.category, false);
  const crossed = !goal.adopted;

  const qtyLine =
    goal.targetQty != null
      ? `Qty ${fmtNum(goal.actualQty ?? 0)} / ${fmtNum(goal.targetQty)}${goal.uom ? ` ${goal.uom}` : ""}`
      : goal.targetAmount != null
        ? `₹ ${fmtNum(goal.actualAmount ?? 0)} / ${fmtNum(goal.targetAmount)}`
        : "";

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : crossed ? 0.6 : 1,
        background: "var(--color-surface-card)",
        border: "1.5px solid var(--color-hairline-strong)",
        boxShadow: "0 6px 16px -10px rgba(15,23,42,0.28), 0 1px 2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
      className={`group relative rounded-2xl p-3 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--goals-accent,#E10600)_40%,var(--color-hairline-strong))] hover:shadow-[0_14px_30px_-14px_color-mix(in_srgb,var(--goals-accent,#E10600)_45%,transparent)] ${
        draggable ? `cursor-grab touch-none active:cursor-grabbing ${FOCUS_RING}` : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="shrink-0">
          <ProgressRing pct={eff} tone={tone} size={34} />
        </span>
        <h3
          className="min-w-0 flex-1 overflow-hidden text-[13.5px] font-semibold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
          style={{
            color: "var(--color-ink-strong)",
            letterSpacing: "-0.004em",
            textDecoration: crossed ? "line-through" : undefined,
          }}
        >
          {goal.title}
        </h3>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px]" style={{ color: "var(--color-ink-subtle)" }}>
        <span
          className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-black uppercase tracking-wide"
          style={{ background: "color-mix(in srgb, var(--goals-accent, #E10600) 10%, transparent)", color: ACCENT_DEEP }}
        >
          Day
        </span>
        <span
          className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[10.5px] font-bold"
          style={{ background: cat.bg, color: cat.color }}
        >
          {cat.label}
        </span>
        {goal.area && (
          <span className="max-w-[8rem] truncate font-semibold" style={{ color: "var(--color-ink-soft)" }}>
            {goal.area}
          </span>
        )}
      </div>
      {qtyLine && (
        <div className="mt-2 truncate text-[11.5px] font-medium tabular-nums" style={{ color: "var(--color-ink-subtle)" }}>
          {qtyLine}
        </div>
      )}
    </div>
  );
}
