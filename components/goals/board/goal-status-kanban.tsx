"use client";

/**
 * Flat, Tasks-style Goal Kanban. Goals previously used period/cascade lanes
 * here; this board intentionally groups the currently selected level by the
 * Doer status instead. A drop changes only `goals.status` through the callback
 * supplied by the level board — period, parent linkage, and progress remain
 * intact.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { TaskStatus } from "@/db/enums";
import type { GoalDTO } from "@/components/goals/cascade/util";
import { GoalBoardCard, type SharedCardProps } from "./goal-board-card";

const COLUMNS: Array<{ id: TaskStatus; label: string; color: string }> = [
  { id: "dont_know", label: "Not Read", color: "#7c3aed" },
  { id: "not_started", label: "Not Started", color: "#4f46e5" },
  { id: "initiated", label: "Initiated", color: "#d97706" },
  { id: "follow_up", label: "Follow Up", color: "#ea580c" },
  { id: "need_info", label: "Need Info", color: "#dc2626" },
  { id: "done", label: "Done", color: "#059669" },
  { id: "abandoned", label: "Abandoned", color: "#0284c7" },
];
const EMPTY_CHILDREN: GoalDTO[] = [];

const columnDropId = (status: TaskStatus) => `goal-status:${status}`;
const kpiDropId = (status: TaskStatus) => `goal-kpi-status:${status}`;
type YearlyStatusKpi = "total" | "not_read" | "not_started" | "initiated" | "follow_up" | "need_info" | "done" | "abandoned" | "pending" | "approved" | "not_approved" | "on_hold" | "cancelled" | "archived";
type KpiTone = "slate" | "neutral" | "green" | "amber" | "red" | "blue" | "yellow" | "orange";
const KPI_TO_STATUS: Partial<Record<YearlyStatusKpi, TaskStatus>> = {
  not_read: "dont_know", not_started: "not_started", initiated: "initiated", follow_up: "follow_up", need_info: "need_info", done: "done", abandoned: "abandoned",
};

export function GoalStatusKanban({
  goals,
  filterGoal,
  cardProps,
  onDropStatus,
  kpiHost,
  yearlyStatusKpis = [],
  yearlyStatusCounts,
  yearlyStatusKpiActive,
  onYearlyStatusKpiClick,
  allowKpiDrops = false,
}: {
  goals: GoalDTO[];
  filterGoal: (goal: GoalDTO) => boolean;
  cardProps: SharedCardProps;
  onDropStatus: (goal: GoalDTO, status: TaskStatus) => void;
  kpiHost?: HTMLElement | null;
  yearlyStatusKpis?: Array<{ key: YearlyStatusKpi; label: string; tone: KpiTone }>;
  yearlyStatusCounts?: Partial<Record<YearlyStatusKpi, number>> | null;
  yearlyStatusKpiActive?: (key: YearlyStatusKpi) => boolean;
  onYearlyStatusKpiClick?: (key: YearlyStatusKpi) => void;
  allowKpiDrops?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [active, setActive] = React.useState<GoalDTO | null>(null);
  const visibleGoals = React.useMemo(() => goals.filter(filterGoal), [goals, filterGoal]);
  const byStatus = React.useMemo(() => {
    const groups = new Map<TaskStatus, GoalDTO[]>(COLUMNS.map(({ id }) => [id, []]));
    for (const goal of visibleGoals) {
      const candidate = goal.status ?? "not_started";
      const status = COLUMNS.some((column) => column.id === candidate) ? candidate as TaskStatus : "not_started";
      groups.get(status)?.push(goal);
    }
    for (const group of groups.values()) group.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    return groups;
  }, [visibleGoals]);
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const underPointer = pointerWithin(args);
    return underPointer.length > 0 ? underPointer : closestCorners(args);
  }, []);

  const onDragStart = React.useCallback((event: DragStartEvent) => {
    setActive(visibleGoals.find((goal) => goal.id === String(event.active.id)) ?? null);
  }, [visibleGoals]);
  const onDragEnd = React.useCallback((event: DragEndEvent) => {
    const dragged = active;
    setActive(null);
    if (!dragged || !event.over) return;
    const overId = String(event.over.id);
    const targetStatus = overId.startsWith("goal-status:")
      ? overId.slice("goal-status:".length)
      : overId.startsWith("goal-kpi-status:")
        ? overId.slice("goal-kpi-status:".length)
      : visibleGoals.find((goal) => goal.id === overId)?.status;
    if (!targetStatus || targetStatus === dragged.status) return;
    onDropStatus(dragged, targetStatus as TaskStatus);
  }, [active, onDropStatus, visibleGoals]);

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {kpiHost && yearlyStatusCounts && createPortal(
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Goal status summary and drop targets">
          {yearlyStatusKpis.map((kpi) => (
            <GoalKpiDropCard
              key={kpi.key}
              label={kpi.label}
              value={yearlyStatusCounts[kpi.key] ?? 0}
              tone={kpi.tone}
              active={yearlyStatusKpiActive?.(kpi.key) ?? false}
              status={allowKpiDrops ? KPI_TO_STATUS[kpi.key] : undefined}
              onClick={() => onYearlyStatusKpiClick?.(kpi.key)}
            />
          ))}
        </div>,
        kpiHost,
      )}
      <div className="table-scroll wg-rise overflow-x-auto pb-4" aria-label="Goal status Kanban">
        <div className="flex min-w-max gap-3">
          {COLUMNS.map((column) => (
            <StatusColumn
              key={column.id}
              column={column}
              goals={byStatus.get(column.id) ?? []}
              cardProps={cardProps}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
        {active ? (
          <div className="flex items-center gap-2 rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 shadow-lg">
            <GripVertical size={15} className="text-ink-subtle" />
            <span className="max-w-[260px] truncate text-[13px] font-bold text-ink-strong">{active.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function GoalKpiDropCard({ label, value, tone, active, status, onClick }: {
  label: string; value: number; tone: KpiTone; active: boolean; status?: TaskStatus; onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status ? kpiDropId(status) : `goal-kpi:${label}`, disabled: !status });
  const bg = `var(--color-${tone}-bg)`;
  const ink = `var(--color-${tone}-deep)`;
  const accent = `var(--color-${tone})`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}; ${status ? "drop a goal here to change its Doer status" : "filter"}`}
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl transition-all"
      style={{
        padding: "5px 10px",
        background: isOver ? `color-mix(in srgb, ${accent} 20%, ${bg})` : active ? `color-mix(in srgb, ${accent} 14%, ${bg})` : bg,
        boxShadow: isOver || active ? `inset 0 0 0 2px ${accent}` : `inset 0 0 0 1px color-mix(in srgb, ${accent} 26%, transparent)`,
        transform: isOver ? "scale(1.02)" : undefined,
      }}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
      <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, color: ink }}>{value}</span>
      <span className="font-semibold leading-none" style={{ fontSize: 11.5, color: ink }}>{label}</span>
    </button>
  );
}

function StatusColumn({
  column,
  goals,
  cardProps,
}: {
  column: (typeof COLUMNS)[number];
  goals: GoalDTO[];
  cardProps: SharedCardProps;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(column.id) });
  return (
    <section
      ref={setNodeRef}
      className="flex w-[304px] shrink-0 flex-col rounded-2xl border p-2 transition-colors"
      style={{
        borderColor: isOver ? column.color : "var(--color-hairline-strong)",
        background: isOver ? `color-mix(in srgb, ${column.color} 7%, var(--color-surface-soft))` : "var(--color-surface-soft)",
      }}
    >
      <header className="mb-2 flex items-center justify-between px-1.5 py-1">
        <span className="inline-flex items-center gap-2 text-[12px] font-black" style={{ color: column.color }}>
          <span className="size-2 rounded-full" style={{ background: column.color }} />
          {column.label}
        </span>
        <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-bold text-ink-muted">{goals.length}</span>
      </header>
      <SortableContext items={goals.map((goal) => goal.id)} strategy={rectSortingStrategy}>
        <div className="flex min-h-24 flex-col gap-2">
          {goals.map((goal) => (
            <GoalBoardCard
              key={goal.id}
              goal={goal}
              srNo={cardProps.rankOf(goal)}
              childGoals={EMPTY_CHILDREN}
              {...cardProps}
              dragMode="status"
              variant="kanban"
            />
          ))}
          {goals.length === 0 && <p className="px-2 py-5 text-center text-[12px] font-medium text-ink-subtle">Drop goals here</p>}
        </div>
      </SortableContext>
    </section>
  );
}
