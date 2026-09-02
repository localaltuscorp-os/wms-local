"use client";

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
  useDraggable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { transferPlanItem } from "@/app/(app)/goals/plan/actions";
import type { MyDayColumn } from "@/app/(app)/my-day/payload";
import type { MyDayItem } from "@/app/(app)/my-day/payload";

const ACCENT = "var(--color-altus-red)";
const ACCENT_DEEP = "var(--color-altus-red-deep)";

/**
 * MY DAY · WEEK BOARD — Overdue + the next 7 days as columns you can drag work
 * between (Sir: "I need to see 7 days at a time + overdue for me to shift the
 * tasks from 1 day to the other").
 *
 * Dropping a card on a day calls `transferPlanItem`, which RE-DATES the single
 * `daily_checklist` row rather than copying it — so an item is only ever in one
 * column, and this board can never disagree with the planner or the day view.
 *
 * The Overdue column is a source only: you drag OUT of it onto a real day. There
 * is no "drop into overdue", because deliberately marking something late is not
 * a thing anyone needs to do.
 */
export function WeekBoard({ columns: initial }: { columns: MyDayColumn[] }) {
  const [columns, setColumns] = React.useState(initial);
  React.useEffect(() => setColumns(initial), [initial]);
  const [dragging, setDragging] = React.useState<MyDayItem | null>(null);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndId = React.useId();

  const onDragStart = React.useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      for (const c of columns) {
        const hit = c.items.find((i) => i.id === id);
        if (hit) {
          setDragging(hit);
          return;
        }
      }
    },
    [columns],
  );

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      setDragging(null);
      const id = String(e.active.id);
      const overId = e.over ? String(e.over.id) : null;
      if (!overId || !overId.startsWith("day:")) return;
      const toOffset = Number(overId.slice(4));
      if (!Number.isFinite(toOffset)) return;

      // Where is it now? A no-op drop (same column) must not hit the server.
      const fromIdx = columns.findIndex((c) => c.items.some((i) => i.id === id));
      if (fromIdx < 0) return;
      const from = columns[fromIdx]!;
      if (from.offset === toOffset) return;
      const item = from.items.find((i) => i.id === id)!;

      // Optimistic move, then persist. A failure refreshes back to server truth.
      setColumns((prev) =>
        prev.map((c) => {
          if (c === from || c.offset === from.offset) {
            return { ...c, items: c.items.filter((i) => i.id !== id) };
          }
          if (c.offset === toOffset) return { ...c, items: [...c.items, item] };
          return c;
        }),
      );
      void transferPlanItem(id, toOffset).then((r) => {
        if (!r.ok) {
          fireToast({ message: r.error, type: "error" });
          router.refresh();
        }
      });
    },
    [columns, router],
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((c) => (
          <DayColumn key={c.offset ?? "overdue"} col={c} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="w-[248px] rotate-1 rounded-xl border border-hairline-strong bg-surface-card px-2.5 py-2 shadow-xl">
            <p className="line-clamp-2 text-[13px] font-semibold text-ink-strong">{dragging.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayColumn({ col }: { col: MyDayColumn }) {
  const isOverdue = col.offset == null;
  // Only real days accept a drop — see the component note on Overdue.
  const { setNodeRef, isOver } = useDroppable({ id: isOverdue ? `overdue` : `day:${col.offset}`, disabled: isOverdue });
  const today = col.offset === 0;

  return (
    <section
      ref={setNodeRef}
      className={`flex w-[262px] shrink-0 flex-col rounded-2xl border transition-colors ${
        isOver ? "border-altus-red" : "border-hairline"
      }`}
      style={{
        background: isOver
          ? "color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card))"
          : "var(--color-surface-card)",
      }}
    >
      <header
        className="flex items-baseline justify-between gap-2 rounded-t-2xl px-3 py-2"
        style={{
          background: isOverdue
            ? "var(--color-red-bg)"
            : today
              ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)"
              : "var(--color-surface-soft)",
        }}
      >
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-black text-ink-strong">
          {isOverdue && <AlertTriangle size={13} style={{ color: ACCENT_DEEP }} />}
          {col.label}
        </span>
        <span className="text-[10.5px] font-bold tabular-nums text-ink-subtle">
          {col.dateLabel ?? ""} {col.items.length > 0 ? `· ${col.items.length}` : ""}
        </span>
      </header>

      <div className="flex min-h-[120px] flex-1 flex-col gap-1.5 p-2">
        {col.items.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11.5px] font-medium text-ink-subtle">
            {isOverdue ? "Nothing overdue." : "Drag work here."}
          </p>
        ) : (
          col.items.map((it) => <WeekCard key={it.id} item={it} />)
        )}
      </div>
    </section>
  );
}

function WeekCard({ item }: { item: MyDayItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: item.done,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined }}
      className="group rounded-xl border border-hairline bg-surface-card px-2 py-1.5 transition-colors hover:border-hairline-strong"
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-label={`Move ${item.title} to another day`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-ink-muted/40 hover:text-ink-muted disabled:cursor-default disabled:opacity-25"
          disabled={item.done}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`line-clamp-2 text-[12.5px] font-semibold leading-snug ${
              item.done ? "text-ink-subtle line-through" : "text-ink-strong"
            }`}
          >
            {item.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {item.taskNo != null && (
              <span className="text-[10px] font-bold tabular-nums text-ink-subtle">#{item.taskNo}</span>
            )}
            {item.overdue && !item.done && (
              <span
                className="rounded-pill px-1.5 py-px text-[9.5px] font-black uppercase tracking-[0.06em]"
                style={{ background: "var(--color-red-bg)", color: ACCENT_DEEP }}
              >
                Overdue
              </span>
            )}
            {item.done && <Check size={11} strokeWidth={3} style={{ color: "var(--color-green-deep)" }} />}
          </div>
        </div>
      </div>
      <span aria-hidden className="sr-only" style={{ color: ACCENT }} />
    </div>
  );
}
