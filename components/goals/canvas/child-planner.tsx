"use client";

/**
 * Goals Canvas — CHILD PLANNER (Phase 3, the RIGHT workspace — design §2.1/§2.3).
 *
 * Renders the focused objective's CHILDREN as planning containers, per zoom:
 *   year    → quarter GoalContainers (+ allocation banner + quick-add)
 *   quarter → month GoalContainers  (+ allocation banner + quick-add)
 *   month   → the month's WEEKS as drillable buckets (Phase 3 folded Week in)
 *   week    → the week's weekly rows as EDITABLE WeeklyGoalContainers + quick-add
 *   day     → Plan-Your-Day folded in (Phase 5) — the same <PlanBoard/> the
 *             /goals/plan deep-link alias renders, lazily fed by loadPlanDay
 *
 * repr = list (this file) | board (Phase-4 kanban — an honest staged panel).
 * Drag-reorder (canWrite-gated — the Exec/Ops mode split is gone): motion
 * Reorder with a grip handle → optimistic `reorder` patch → `reorderGoals`
 * (the Phase-1 action, first call site).
 *
 * Keyboard (section-scoped): ↑↓ select · Enter drill · Esc drill out.
 * HARD LAWS: zero queries; amber identity; zoom is STATE, never CSS transform.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation"; // yearly rootView drill
import type { Route } from "next";
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { CalendarDays, ChevronRight, Scale, Sparkles } from "lucide-react";
import {
  fyStartYearOfKey,
  monthKeysOfQuarter,
  quarterKey as quarterKeyOf,
  quarterOfKey,
  quartersOfFy,
} from "@/lib/goals/types";
import {
  fmtNum,
  periodKeyLabel,
  periodKeyShort,
  pctTone,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, DUR, EASE_OUT, SPRING, accentMix } from "./tokens";
import { allocation, numericTarget, rollupPct } from "@/lib/goals/derive";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import {
  addChildGoal,
  generateGoalChildren,
  reorderGoals,
} from "@/app/(app)/goals/cascade/actions";
import { addWeekGoal } from "@/app/(app)/goals/weekly/actions";
import { loadPlanDay } from "@/app/(app)/goals/plan/actions";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import type { PlanDayPayload } from "@/components/goals/plan/types";
import { AiExecutionHints } from "./ai-insight";
import { AllocationBanner } from "./allocation";
import { buildOptimisticGoal } from "./optimistic";
import { GoalContainer, QuickAdd, WeeklyGoalContainer } from "./goal-container";
import { GoalsBoard } from "./goals-board";
import { useCanvasShell } from "./shell-context";
import { useCanvasStage, weekNoOf, monthNameOf, type WeekBucket } from "./stage";
import type { WeeklyDTO } from "./types";

/* ------------------------------------------------------------------ */

/* Accent, ramp + spring come from the design contract (tokens.ts, §2.0). */

/* ------------------------------------------------------------------ */
/* Reorderable wrapper (grip-handle drag, canWrite-gated)              */
/* ------------------------------------------------------------------ */

function ReorderableGoal(props: {
  g: GoalDTO;
  siblings: readonly GoalDTO[];
  parentTarget: number | null;
  parentShort: string;
  index: number;
  selected: boolean;
  onDrill: () => void;
  onDragEnd: () => void;
}): React.JSX.Element {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={props.g.id}
      as="div"
      dragListener={false}
      dragControls={controls}
      onDragEnd={props.onDragEnd}
      className="focus-visible:outline-none"
    >
      <GoalContainer
        g={props.g}
        siblings={props.siblings}
        parentTarget={props.parentTarget}
        parentShort={props.parentShort}
        index={props.index}
        selected={props.selected}
        onDrill={props.onDrill}
        dragControls={controls}
      />
    </Reorder.Item>
  );
}

/* ------------------------------------------------------------------ */
/* Cascade child list (year → quarters · quarter → months)             */
/* ------------------------------------------------------------------ */

function CascadeList(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { canWrite, mutation, viewedEmployeeId, policy } = shell;
  const focus = stage.focus;
  // yearly rootView (/goals/yearly): focus is null and the "children" are the
  // FY's YEAR ROOTS — same premium cards, but drilling one NAVIGATES to the
  // Quarterly page focused on it (the in-page zoom stays for every other page).
  const rootView = stage.rootView;
  const router = useRouter();
  const searchParams = useSearchParams();
  /** Displayed list = toolbar-filtered; MATH (contribution basis, allocation,
   *  rebalance) always runs over the FULL child set so hiding cards with a
   *  filter can never change the numbers or a redistribute's scope. Both sets
   *  come from the stage's child UNION (parent-linked + parentless same-bucket
   *  rows — bug #7), so manually-created goals are visible AND counted. */
  const children = stage.childGoals;
  const allChildren = stage.allChildGoals;

  const parentTarget = focus ? numericTarget(focus) : null;
  const parentShort = focus ? periodKeyShort(focus.periodKey) : "";
  const childLevel: "quarter" | "month" = stage.z === "year" ? "quarter" : "month";

  /* ---- quick-add bucket options (child period keys of the focus) ---- */
  const buckets = React.useMemo<string[]>(() => {
    if (!focus) return [];
    if (focus.period === "year") return quartersOfFy(Number(focus.periodKey));
    if (focus.period === "quarter")
      return monthKeysOfQuarter(fyStartYearOfKey(focus.periodKey), quarterOfKey(focus.periodKey));
    return [];
  }, [focus]);
  const nowBucket = React.useMemo(() => {
    const nowQ = quarterKeyOf(stage.now);
    if (buckets.includes(nowQ)) return nowQ;
    const nowM = `${stage.now.getFullYear()}-${String(stage.now.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.includes(nowM)) return nowM;
    return buckets[0] ?? "";
  }, [buckets, stage.now]);
  const [bucket, setBucket] = React.useState(nowBucket);
  React.useEffect(() => setBucket(nowBucket), [nowBucket]);

  /* ---- drag reorder (canWrite-gated) ---- */
  const ids = React.useMemo(() => children.map((c) => c.id), [children]);
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null);
  React.useEffect(() => setDragOrder(null), [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = React.useMemo(() => {
    if (!dragOrder) return children;
    const byId = new Map(children.map((c) => [c.id, c]));
    return dragOrder.map((id) => byId.get(id)).filter((c): c is GoalDTO => !!c);
  }, [children, dragOrder]);
  const commitReorder = React.useCallback(() => {
    if (!dragOrder) return;
    const same = dragOrder.length === ids.length && dragOrder.every((id, i) => id === ids[i]);
    if (same) {
      setDragOrder(null);
      return;
    }
    void mutation.mutate({ type: "reorder", ids: dragOrder }, () => reorderGoals(dragOrder));
  }, [dragOrder, ids, mutation]);

  /* ---- drill: in-page zoom, EXCEPT the yearly rootView — there a year card
     opens /goals/quarterly focused on it, carrying the current emp/fy scope
     (the Quarterly page is where a year breaks into Q1–Q4). ---- */
  const drill = React.useCallback(
    (id: string) => {
      if (!rootView) {
        stage.drillGoal(id);
        return;
      }
      const qs = new URLSearchParams(); // yearly rootView — cross-page drill
      const emp = searchParams.get("emp");
      const fy = searchParams.get("fy");
      if (emp) qs.set("emp", emp);
      if (fy) qs.set("fy", fy);
      qs.set("focus", id);
      router.push(`/goals/quarterly?${qs.toString()}` as Route);
    },
    [rootView, stage, searchParams, router],
  );

  /* ---- keyboard: roving selection ---- */
  const [sel, setSel] = React.useState(-1);
  React.useEffect(() => setSel(-1), [focus?.id, stage.z]);
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if ((e.key === "Enter" || e.key === " ") && target.closest("button, a")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(shown.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter" && sel >= 0 && shown[sel]) {
        e.preventDefault();
        drill(shown[sel]!.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        stage.drillOut();
      }
    },
    [shown, sel, stage, drill],
  );

  /* ---- auto-divide (empty state) ---- */
  const [dividing, setDividing] = React.useState(false);
  const autoDivide = React.useCallback(() => {
    if (!focus || dividing) return;
    setDividing(true);
    void generateGoalChildren({ id: focus.id })
      .then((res) => {
        if (res.ok) {
          fireToast({
            message:
              res.created > 0
                ? `Divided into ${res.created} ${childLevel} goal${res.created === 1 ? "" : "s"}.`
                : "Nothing new to divide — children already exist.",
            type: "success",
          });
        } else {
          fireToast({ message: res.error ?? "Couldn't auto-divide.", type: "error" });
        }
      })
      .finally(() => setDividing(false));
  }, [focus, dividing, childLevel]);

  const quickAdd = React.useCallback(
    (title: string): Promise<boolean> => {
      if (!focus || !bucket) return Promise.resolve(false);
      const temp = {
        ...buildOptimisticGoal({
          employeeId: viewedEmployeeId,
          period: childLevel,
          periodKey: bucket,
          title,
        }),
        parentGoalId: focus.id,
      };
      return mutation.mutate({ type: "insert", row: temp }, () =>
        addChildGoal({ parentId: focus.id, periodKey: bucket, title }),
      );
    },
    [focus, bucket, childLevel, viewedEmployeeId, mutation],
  );

  // §2.7 empty-state law — never reference an absent control: "New goal" only
  // exists in the toolbar when the viewer can write. The yearly rootView has
  // no focus by design — it falls through to render the year-roots list.
  if (!focus && !rootView)
    return (
      <EmptyPanel
        text={
          canWrite
            ? "No goals on the canvas yet — create the first with New goal in the toolbar."
            : "No goals on the canvas yet."
        }
      />
    );

  return (
    <section
      aria-label={rootView ? "Year objectives" : `${childLevel} objectives under ${focus?.title ?? ""}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2.5 outline-none focus-visible:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--module-accent)_35%,transparent)] rounded-section"
    >
      {/* §2.8 — the per-section keyboard hint text is gone; every binding now
          lives in the single `?` shortcut overlay (see zoom-spine.tsx). */}
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
        {rootView ? "Year objectives" : childLevel === "quarter" ? "Quarters" : "Month objectives"} ·{" "}
        <span className="tabular-nums">{children.length}</span>
      </h3>

      {/* Over/under check + atomic rebalance (Phase 2, reused at every level).
          yearly rootView: no focused parent → nothing to divide/rebalance, so
          the banner + AI hints are focus-gated. */}
      {focus && (
        <AllocationBanner
          parent={focus}
          childGoals={allChildren}
          canWrite={canWrite}
          canRebalance={policy.canRebalance} // Option A — apply is structure
          mutation={mutation}
        />
      )}

      {/* Phase 8 — cached AI execution suggestions for this parent (renders
          nothing until an insight exists; the banner above owns the apply). */}
      {focus && <AiExecutionHints focus={focus} />}

      {children.length === 0 && (rootView || !focus) ? (
        // yearly rootView empty state — no parent, so no auto-divide either.
        <EmptyPanel
          text={
            canWrite
              ? "No yearly objectives yet — create one with New goal in the toolbar."
              : "No yearly objectives yet."
          }
        />
      ) : children.length === 0 && focus ? (
        <div
          className="rounded-section border px-5 py-8 text-center"
          style={{ borderColor: accentMix(40), background: accentMix(5) }}
        >
          <p className="text-[15px] italic text-ink-muted" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
            No {childLevel} objectives under {periodKeyShort(focus.periodKey)} yet.
          </p>
          {/* Option A — auto-divide is structure (admin/manager): the button
              UNMOUNTS for owners (no dead affordance, §2.7); the manual
              quick-add below stays theirs. Server enforces the same line. */}
          {canWrite && policy.canAutoDivide && (
            <button
              type="button"
              onClick={autoDivide}
              disabled={dividing}
              className="mt-3 inline-flex items-center gap-1.5 rounded-chip px-3.5 py-2 text-[12.5px] font-bold text-white transition-transform duration-150 enabled:hover:-translate-y-0.5 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {dividing ? "Dividing…" : `Auto-divide ${periodKeyShort(focus.periodKey)} ÷ ${childLevel === "quarter" ? 4 : 3}`}
            </button>
          )}
        </div>
      ) : canWrite && children.length === allChildren.length ? (
        /* Drag-reorder only over the UNFILTERED list — renumbering a filtered
           subset would collide positions with the hidden rows. */
        <Reorder.Group
          axis="y"
          as="div"
          values={shown.map((c) => c.id)}
          onReorder={(next: string[]) => setDragOrder(next)}
          className="flex flex-col gap-2"
        >
          {shown.map((child, i) => (
            <ReorderableGoal
              key={child.id}
              g={child}
              siblings={allChildren}
              parentTarget={parentTarget}
              parentShort={parentShort}
              index={i}
              selected={sel === i}
              onDrill={() => drill(child.id)} // yearly rootView-aware
              onDragEnd={commitReorder}
            />
          ))}
        </Reorder.Group>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((child, i) => (
            <GoalContainer
              key={child.id}
              g={child}
              siblings={allChildren}
              parentTarget={parentTarget}
              parentShort={parentShort}
              index={i}
              selected={sel === i}
              onDrill={() => drill(child.id)} // yearly rootView-aware
            />
          ))}
        </div>
      )}

      {/* yearly rootView: no focused parent → buckets is empty and the inline
          bucket quick-add stays off (the toolbar's New goal mints year roots). */}
      {canWrite && focus && buckets.length > 0 && (
        <QuickAdd
          label={`Add a ${childLevel} goal under ${periodKeyShort(focus.periodKey)}`}
          placeholder={`New ${childLevel} goal…`}
          onSubmit={quickAdd}
          extra={
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              aria-label="Target bucket"
              className="rounded-lg border bg-transparent px-1.5 py-1 text-[11.5px] font-bold text-ink-muted outline-none"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              {buckets.map((b) => (
                <option key={b} value={b}>
                  {periodKeyLabel(b)}
                </option>
              ))}
            </select>
          }
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Month stage — the month's weeks as drillable planning buckets       */
/* ------------------------------------------------------------------ */

function WeekBucketCard(props: {
  bucket: WeekBucket;
  index: number;
  selected: boolean;
  onDrill: () => void;
}): React.JSX.Element {
  const { bucket } = props;
  const reduce = useReducedMotion() ?? false;
  const roll =
    rollupPct(
      bucket.rows.map((r) => ({
        pctDone: r.pctDone,
        acceptPct: r.acceptPct,
        weight: r.weight,
        adopted: r.adopted,
      })),
    ) ?? 0;
  const tone = pctTone(roll);
  return (
    <motion.button
      layout
      layoutId={`week-${bucket.weekStart}`}
      transition={reduce ? { duration: 0 } : SPRING}
      type="button"
      onClick={props.onDrill}
      className="wg-rise group w-full rounded-xl border px-4 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5 hover:[box-shadow:0_12px_28px_-18px_rgba(15,23,42,0.30)]"
      style={{
        borderColor: props.selected ? accentMix(55) : "var(--color-hairline)",
        background: "var(--color-surface-card)",
        boxShadow: props.selected ? `0 0 0 2px ${accentMix(35)}` : undefined,
        // Stagger caps at 8 (dense-layout spec §2) — long lists arrive together.
        animationDelay: `${Math.min(props.index, 8) * 55}ms`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="shrink-0 rounded-chip px-2 py-1 text-[12px] font-bold tabular-nums text-white"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          W{bucket.weekNo}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink-strong">
            {bucket.rangeLabel}
            {bucket.isCurrent && (
              <span
                aria-label="Current week"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: ACCENT, boxShadow: `0 0 0 3px ${accentMix(22)}` }}
              />
            )}
          </span>
          <span className="block text-[12px] font-semibold text-ink-subtle">
            {bucket.rows.length} goal{bucket.rows.length === 1 ? "" : "s"} · self-rated rollup
          </span>
        </span>
        <span className="w-11 shrink-0 text-right text-[15px] font-black tabular-nums" style={{ color: tone.color }}>
          {roll}%
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      {/* compact goal strip */}
      {bucket.rows.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          {bucket.rows.slice(0, 4).map((r) => {
            const eff = r.acceptPct ?? r.pctDone;
            return (
              <span key={r.id} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full"
                  style={{ background: accentMix(10) }}
                >
                  <span className="block h-full rounded-full" style={{ width: `${eff}%`, background: pctTone(eff).color }} />
                </span>
                <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-muted ${r.adopted ? "" : "line-through opacity-60"}`}>
                  {r.title}
                </span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: pctTone(eff).color }}>
                  {eff}%
                </span>
              </span>
            );
          })}
          {bucket.rows.length > 4 && (
            <span className="text-[11px] font-bold text-ink-faint">+{bucket.rows.length - 4} more…</span>
          )}
        </div>
      )}
    </motion.button>
  );
}

function MonthWeeks(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { canWrite, weeklyMutation, viewedEmployeeId } = shell;
  // The month GOAL is optional context — the stage resolves the CALENDAR month
  // (stage.monthKey) even when no goal row exists yet, so every month stays
  // drillable and quick-addable (bug #2 — the old bail-out here was half of
  // the "first weekly goal of a month is uncreatable" deadlock).
  const focus = stage.focus;
  const monthKey = stage.monthKey;
  const [sel, setSel] = React.useState(-1);
  React.useEffect(() => setSel(-1), [monthKey]);

  // Passive over/under hint vs the month target (weekly redistribute is a
  // later phase — no rebalance CTA here; display-only, honestly labeled).
  const monthTarget = focus ? numericTarget(focus) : null;
  // Only THIS month goal's own weekly rows count toward its allocation (bug #13);
  // stage.weeks now also carries empty calendar buckets + possibly sibling goals'
  // rows sharing the calendar month. `allRows` (not `rows`) — the allocation is
  // a math/basis read, and the toolbar filter must never change it (bug #16).
  const monthRows = React.useMemo(
    () => stage.weeks.flatMap((w) => w.allRows).filter((r) => r.monthGoalId === focus?.id),
    [stage.weeks, focus?.id],
  );
  const alloc = React.useMemo(() => allocation(monthRows, monthTarget), [monthRows, monthTarget]);

  /* ---- quick-add straight into a week (bug #2): a Monday selector so the
     FIRST weekly goal of an empty month lands without drilling anywhere;
     defaults to the current week when it belongs to this month. ---- */
  const defaultMonday =
    stage.weeks.find((w) => w.isCurrent)?.weekStart ?? stage.weeks[0]?.weekStart ?? "";
  const [monday, setMonday] = React.useState(defaultMonday);
  React.useEffect(() => setMonday(defaultMonday), [defaultMonday]);

  const quickAdd = React.useCallback(
    (title: string): Promise<boolean> => {
      if (!monday || !weeklyMutation) return Promise.resolve(false);
      const temp: WeeklyDTO = {
        id: `optimistic-${crypto.randomUUID()}`,
        weekStart: monday,
        monthKey: monday.slice(0, 7),
        weekNo: weekNoOf(monday),
        title,
        area: null,
        uom: null,
        pctDone: 0,
        acceptPct: null,
        position: 9_999,
        cascade: focus != null,
        spillover: false,
        targetQty: null,
        actualQty: null,
        targetAmount: null,
        actualAmount: null,
        weight: 100,
        adopted: true,
        monthGoalId: focus?.id ?? null,
      };
      return weeklyMutation.mutate({ type: "insert", row: temp }, () =>
        addWeekGoal({
          employeeId: viewedEmployeeId,
          weekStart: monday,
          title,
          monthGoalId: focus?.id ?? null,
        }),
      );
    },
    [monday, weeklyMutation, viewedEmployeeId, focus],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if ((e.key === "Enter" || e.key === " ") && target.closest("button, a")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(stage.weeks.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter" && sel >= 0 && stage.weeks[sel]) {
        e.preventDefault();
        stage.drillWeek(stage.weeks[sel]!.weekStart);
      } else if (e.key === "Escape") {
        e.preventDefault();
        stage.drillOut();
      }
    },
    [stage, sel],
  );

  if (!monthKey) return <EmptyPanel text="No month in view." />;
  const monthName = monthNameOf(monthKey);

  return (
    <section
      aria-label={`Weeks in ${monthName}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2.5 rounded-section outline-none focus-visible:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--module-accent)_35%,transparent)]"
    >
      {/* §2.8 — inline keyboard hints removed; the `?` overlay carries them. */}
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
        Weeks in {monthName} · <span className="tabular-nums">{stage.weeks.length}</span>
      </h3>

      {alloc && alloc.state !== "exact" && (
        <div
          className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: accentMix(40), background: accentMix(6) }}
        >
          <Scale className="h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-ink-strong">
            Week targets total <span className="font-bold tabular-nums">{fmtNum(alloc.sum)}</span> —{" "}
            <span className="font-bold tabular-nums" style={{ color: alloc.state === "over" ? "#b91c1c" : undefined }}>
              {alloc.state === "over" ? "over" : "under"} the {monthName} target by {fmtNum(Math.abs(alloc.delta))}
            </span>
            . <span className="text-ink-subtle">Week rebalance arrives with the board phase.</span>
          </p>
        </div>
      )}

      {/* Phase 8 — the month goal's cached AI read (week-level workload flags
          + execution suggestions; renders nothing until an insight exists). */}
      {focus && <AiExecutionHints focus={focus} />}

      {stage.weeks.length === 0 ? (
        // §2.7 — the quick-add below only mounts when weeks exist, so the copy
        // must not point at it (the old "add a weekly goal below" lied here).
        <EmptyPanel text={`No weeks to show for ${monthName}.`} />
      ) : (
        <div className="flex flex-col gap-2">
          {stage.weeks.map((w, i) => (
            <WeekBucketCard
              key={w.weekStart}
              bucket={w}
              index={i}
              selected={sel === i}
              onDrill={() => stage.drillWeek(w.weekStart)}
            />
          ))}
        </div>
      )}

      {/* bug #2 — the report's explicit add control: quick-add WITHOUT drilling,
          with a Monday selector (the drill-in path stays for editing). */}
      {canWrite && weeklyMutation && stage.weeks.length > 0 && (
        <QuickAdd
          label={`Add a weekly goal in ${monthName}`}
          placeholder={`New weekly goal for ${monthName}…`}
          onSubmit={quickAdd}
          extra={
            <select
              value={monday}
              onChange={(e) => setMonday(e.target.value)}
              aria-label="Target week"
              className="rounded-lg border bg-transparent px-1.5 py-1 text-[11.5px] font-bold text-ink-muted outline-none"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              {stage.weeks.map((w) => (
                <option key={w.weekStart} value={w.weekStart}>
                  W{w.weekNo} · {w.rangeLabel}
                </option>
              ))}
            </select>
          }
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Week stage — EDITABLE weekly rows (Phase 3 headline)                */
/* ------------------------------------------------------------------ */

function WeekPlanner(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { canWrite, weeklyMutation, viewedEmployeeId } = shell;
  const week = stage.week;
  const monthGoal = stage.weekParent;

  // Per-row parents own the contribution math (bug #13) — only the label
  // fallback still reads the focused month goal.
  const parentShort = monthGoal ? periodKeyShort(monthGoal.periodKey) : week ? `W${week.weekNo}` : "";

  const quickAdd = React.useCallback(
    (title: string): Promise<boolean> => {
      if (!week || !weeklyMutation) return Promise.resolve(false);
      const temp: WeeklyDTO = {
        id: `optimistic-${crypto.randomUUID()}`,
        weekStart: week.weekStart,
        monthKey: week.weekStart.slice(0, 7),
        weekNo: weekNoOf(week.weekStart),
        title,
        area: null,
        uom: null,
        pctDone: 0,
        acceptPct: null,
        position: 9_999,
        cascade: monthGoal != null,
        spillover: false,
        targetQty: null,
        actualQty: null,
        targetAmount: null,
        actualAmount: null,
        weight: 100,
        adopted: true,
        monthGoalId: monthGoal?.id ?? null,
      };
      return weeklyMutation.mutate({ type: "insert", row: temp }, () =>
        addWeekGoal({
          employeeId: viewedEmployeeId,
          weekStart: week.weekStart,
          title,
          monthGoalId: monthGoal?.id ?? null,
        }),
      );
    },
    [week, weeklyMutation, viewedEmployeeId, monthGoal],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        stage.drillOut();
      }
    },
    [stage],
  );

  // §2.7 — one primary action, on screen: the month stage is a drill-out away.
  if (!week)
    return (
      <EmptyPanel
        text="No week in focus yet."
        action={
          <button
            type="button"
            onClick={() => stage.drillOut()}
            className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-2 text-[12.5px] font-bold text-white transition-transform duration-150 hover:-translate-y-0.5"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Pick a week from the month
          </button>
        }
      />
    );

  return (
    <section
      aria-label={`Goals in week ${week.weekNo}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2.5 rounded-section outline-none focus-visible:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--module-accent)_35%,transparent)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          W{week.weekNo} · {week.rangeLabel} · <span className="tabular-nums">{week.rows.length}</span> goals
        </h3>
        {/* Phase 5: Days is now the deepest ZOOM stage (state change, not a
            route hop) — the Plan-Your-Day surface folds in right here. */}
        <button
          type="button"
          onClick={() => shell.zoom.focusWeek(week.weekStart, "day")}
          className="inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-[11.5px] font-bold transition-transform duration-150 hover:-translate-y-0.5"
          style={{ borderColor: accentMix(35), color: ACCENT_DEEP, background: accentMix(6) }}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Days →
        </button>
      </div>

      {week.rows.length === 0 ? (
        <EmptyPanel text={`Nothing planned for W${week.weekNo} yet.`} />
      ) : (
        <div className="flex flex-col gap-2">
          {week.rows.map((r, i) => {
            // Per-row parent (bug #13): a week can hold rows from more than one
            // month goal — each contribution chip must divide by ITS OWN parent's
            // target (never the focused goal's), with the sibling fallback basis
            // scoped the same way. null monthGoalId → no chip at all.
            const rowParent = r.monthGoalId ? stage.maps.byId.get(r.monthGoalId) : null;
            // `allRows` — the contribution basis must not shrink when the
            // toolbar filter hides sibling rows (bug #16 math law).
            const rowSiblings = week.allRows.filter((x) => x.monthGoalId === r.monthGoalId);
            return (
              <WeeklyGoalContainer
                key={r.id}
                w={r}
                siblings={rowSiblings}
                parentTarget={rowParent ? numericTarget(rowParent) : null}
                parentShort={rowParent ? periodKeyShort(rowParent.periodKey) : parentShort}
                hideContribution={!rowParent}
                index={i}
              />
            );
          })}
        </div>
      )}

      {canWrite && weeklyMutation && (
        <QuickAdd
          label={`Add a goal to W${week.weekNo}`}
          placeholder={`New goal for ${week.rangeLabel}…`}
          onSubmit={quickAdd}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Day stage — Phase 5: Plan-Your-Day folded in as the DEEPEST zoom    */
/* stage (design §2.1). Renders the SAME <PlanBoard/> the /goals/plan  */
/* route serves (that route stays as the deep-link alias), fed by the  */
/* SAME getPlanDayPayload assembler via the lazy loadPlanDay action    */
/* (§3.3 lazy detail bundle — fetched once on mount, never eagerly     */
/* joined into the cascade spine query). Shares CanvasShellCtx.        */
/* ------------------------------------------------------------------ */

type DayState =
  | { status: "loading" }
  | { status: "other" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: PlanDayPayload };

function DayStage(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { viewedEmployeeId, viewedName } = shell;

  const [state, setState] = React.useState<DayState>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadPlanDay(viewedEmployeeId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) setState({ status: "error", message: res.error });
        else if (!res.self || !res.payload) setState({ status: "other" });
        else setState({ status: "ready", payload: res.payload });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load your day." });
      });
    return () => {
      cancelled = true;
    };
  }, [viewedEmployeeId, attempt]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        stage.drillOut();
      }
    },
    [stage],
  );

  const todayLabel = React.useMemo(() => {
    const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(stage.now);
    return `${weekday}, ${formatDate(stage.now)}`;
  }, [stage.now]);

  return (
    <section
      aria-label="Plan your day"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3 rounded-section outline-none focus-visible:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--module-accent)_35%,transparent)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          <CalendarDays className="h-3.5 w-3.5" style={{ color: ACCENT }} aria-hidden="true" />
          Today · {todayLabel}
          {stage.week && (
            <span className="font-bold normal-case tracking-normal text-ink-faint">
              W{stage.week.weekNo} · {stage.week.rangeLabel}
            </span>
          )}
        </h3>
        <span className="flex items-center gap-3">
          {/* §2.8 — "Esc zooms out" hint moved into the `?` shortcut overlay. */}
          <Link
            href="/my-day"
            className="inline-flex items-center gap-1 rounded-chip border px-2.5 py-1 text-[11.5px] font-bold transition-transform duration-150 hover:-translate-y-0.5"
            style={{ borderColor: accentMix(35), color: ACCENT_DEEP, background: accentMix(6) }}
          >
            Full Page
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </span>
      </div>

      {state.status === "loading" ? (
        <div className="grid gap-4 grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-2 max-sm:grid-cols-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[220px] animate-pulse rounded-2xl border border-hairline"
              style={{ background: accentMix(4), animationDelay: `${i * 90}ms` }}
              aria-hidden="true"
            />
          ))}
          <span className="sr-only">Loading your day…</span>
        </div>
      ) : state.status === "other" ? (
        <div
          className="rounded-section border px-6 py-10 text-center"
          style={{ borderColor: accentMix(40), background: accentMix(5) }}
        >
          <p className="mx-auto max-w-md text-[15px] italic text-ink-muted" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
            The daily plan is personal — you&apos;re viewing {viewedName}&apos;s cascade. Switch back to
            yourself to plan the day.
          </p>
        </div>
      ) : state.status === "error" ? (
        <div
          className="rounded-section border px-6 py-10 text-center"
          style={{ borderColor: accentMix(40), background: accentMix(5) }}
        >
          {/* §2.7 error-voice split — failures speak PLAINLY (no serif italics;
              the editorial voice is reserved for empty states). */}
          <p className="text-[14px] font-semibold text-ink-strong">{state.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-chip px-4 py-2 text-[13px] font-bold text-white transition-transform duration-150 hover:-translate-y-0.5"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Try Again
          </button>
        </div>
      ) : (
        <PlanBoard
          key={state.payload.todayYmd}
          // This drawer always plans the CALLER's own day — no delegation here,
          // so an empty roster hides the "planning for" picker entirely.
          target={{ employeeId: "", name: "", isDelegated: false, roster: [] }}
          payload={state.payload}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared empty panel                                                  */
/* ------------------------------------------------------------------ */

/** Serif-italic is the EMPTY voice only (§2.7 — errors speak plainly). Each
 *  call-site carries at most ONE primary action and never references a control
 *  that isn't on screen. */
function EmptyPanel({ text, action }: { text: string; action?: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="rounded-section border px-5 py-8 text-center"
      style={{ borderColor: accentMix(40), background: accentMix(5) }}
    >
      <p className="text-[15px] italic text-ink-muted" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
        {text}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ChildPlanner — the exported RIGHT workspace                         */
/* ------------------------------------------------------------------ */

export function ChildPlanner(): React.JSX.Element {
  const { zoom } = useCanvasShell();
  const stage = useCanvasStage();
  const reduce = useReducedMotion() ?? false;

  // Board repr — the Phase-4 infinite-canvas Kanban, available at every zoom
  // level EXCEPT day: at the deepest stage the Plan-Your-Day surface IS the
  // board (Phase 5 fold-in), so List/Board converge there.
  if (zoom.repr === "board" && zoom.z !== "day") return <GoalsBoard />;

  const stageKey = `${stage.z}:${stage.focus?.id ?? "empty"}:${stage.week?.weekStart ?? ""}`;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={stageKey}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        // §2.9 choreography law — ONE narrated motion per action: on drill the
        // shared-element morph (`node-<id>` card → panel hero) IS the story, so
        // the outgoing stage may only FADE (opacity, 200ms) — never y-shift or
        // spring-exit while the morph runs.
        exit={{
          opacity: 0,
          transition: reduce ? { duration: 0 } : { duration: DUR.state, ease: EASE_OUT },
        }}
        transition={reduce ? { duration: 0 } : SPRING}
        className="min-h-[280px]"
      >
        {stage.z === "year" || stage.z === "quarter" ? (
          <CascadeList />
        ) : stage.z === "month" ? (
          <MonthWeeks />
        ) : stage.z === "week" ? (
          <WeekPlanner />
        ) : (
          <DayStage />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
