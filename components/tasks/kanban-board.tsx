"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { format } from "date-fns";
import {
  Loader2,
  Archive,
  Flag,
  Tag,
  Building2,
  CalendarDays,
  AlignLeft,
  User,
  Check,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
  type StatusColorToken,
} from "@/db/enums";
import { ARCHIVE_COL, type ColId } from "@/lib/kanban-columns";
import { setTaskStatus, archiveTask, unarchiveTask } from "@/app/(app)/tasks/actions";
import { setBoardColumnOrder } from "@/app/(admin)/admin/settings/actions";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { LateBadge } from "@/components/ui/late-badge";
import { isDoneLate } from "@/lib/task-late";
import type { BoardTask } from "@/lib/queries/tasks";

// Priority → colour token + label for the hover-card badge.
const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

interface Props {
  tasks: BoardTask[];
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  isAdmin: boolean;
  /** Ordered column ids to render (statuses + the synthetic Archive column).
   *  Admins can drag column headers to reorder; the new order is persisted. */
  columnOrder: ColId[];
}

// Cards rendered per column before "Show more"; each tap reveals 10 more.
const COL_STEP = 10;

function accentFor(col: ColId, tones: Record<TaskStatus, StatusColorToken>) {
  const isArchive = col === ARCHIVE_COL;
  const tone = isArchive ? null : tones[col as TaskStatus];
  return {
    isArchive,
    accent: isArchive ? "#94a3b8" : `var(--color-${tone})`,
    accentDeep: isArchive ? "#64748b" : `var(--color-${tone}-deep)`,
    accentBgLight: isArchive ? "#f1f5f9" : `var(--color-${tone}-bg)`,
  };
}

/**
 * Status Kanban (Manan #25), rebuilt on dnd-kit for buttery pointer-based
 * drag: drag a card between columns to change its status (or into Archived to
 * archive / out to restore), and — as an admin — drag a column header to
 * reorder the whole board (persisted globally). A DragOverlay renders the
 * floating preview; dnd-kit handles auto-scroll, keyboard a11y and animation.
 */
export function KanbanBoard({ tasks, labels, tones, isAdmin, columnOrder }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [visibleByCol, setVisibleByCol] = React.useState<Record<string, number>>({});
  // Column order is local state so an admin's drag-reorder is instant.
  const [columns, setColumns] = React.useState<ColId[]>(columnOrder);
  // The active drag (card or column) — drives the DragOverlay + drop targeting.
  const [active, setActive] = React.useState<{ id: string; type: "card" | "column" } | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  React.useEffect(() => setItems(tasks), [tasks]);
  React.useEffect(() => setColumns(columnOrder), [columnOrder]);

  const sensors = useSensors(
    // Mouse: a 6px move starts a drag, so clicking a card's link still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to drag, so normal swipes still scroll the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Filtering now happens server-side via the page's FilterBar; the board just
  // renders what it's given (kept as `filtered` so the column logic below is
  // unchanged). Optimistic drag still mutates `items`.
  const filtered = items;
  const activeCount = items.filter((t) => !t.archived).length;

  async function persistOrder(next: ColId[]) {
    const prev = columns;
    setColumns(next);
    const res = await setBoardColumnOrder(next as string[]);
    if (!res.ok) {
      setColumns(prev);
      fireToast({ message: res.error || "Couldn't save the column order." });
    }
  }

  async function archiveCard(taskId: string) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.archived) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, archived: true } : t)));
    setSavingId(taskId);
    const res = await archiveTask(taskId);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ message: res.error || "Couldn't archive the task." });
    } else {
      fireToast({ message: "Archived." });
    }
    router.refresh();
  }

  async function restoreCard(taskId: string) {
    const task = items.find((t) => t.id === taskId);
    if (!task || !task.archived) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, archived: false } : t)));
    setSavingId(taskId);
    const res = await unarchiveTask(taskId);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ message: res.error || "Couldn't restore the task." });
    } else {
      fireToast({ message: "Restored." });
    }
    router.refresh();
  }

  async function moveTo(taskId: string, status: TaskStatus) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setSavingId(taskId);
    const res = await setTaskStatus(taskId, status, task.updatedAt.toISOString());
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({
        message:
          res.error === "forbidden"
            ? "You can't move this task to that status."
            : res.error === "invalid"
              ? res.message ?? "That move isn't allowed from here."
              : res.error === "stale"
                ? "Task changed elsewhere — refreshing."
                : "Couldn't update the task.",
      });
    } else {
      fireToast({ message: `Moved to ${labels[status]}.` });
    }
    router.refresh();
  }

  function onDragStart(e: DragStartEvent) {
    const type = (e.active.data.current?.type as "card" | "column") ?? "card";
    setActive({ id: String(e.active.id), type });
  }

  function onDragOver(e: DragOverEvent) {
    setOverCol(e.over ? String(e.over.id) : null);
  }

  function onDragEnd(e: DragEndEvent) {
    const a = active;
    setActive(null);
    setOverCol(null);
    const { over } = e;
    if (!over || !a) return;
    const overId = String(over.id);

    if (a.type === "column") {
      if (!isAdmin || overId === a.id) return;
      const from = columns.indexOf(a.id as ColId);
      const to = columns.indexOf(overId as ColId);
      if (from < 0 || to < 0) return;
      void persistOrder(arrayMove(columns, from, to));
      return;
    }

    // Card drop — `over` resolves to a column droppable.
    const card = items.find((t) => t.id === a.id);
    if (!card) return;
    if (overId === ARCHIVE_COL) {
      if (!card.archived) void archiveCard(card.id);
      return;
    }
    // A status column. Dropping an archived card restores it (keeps status).
    if (card.archived) {
      void restoreCard(card.id);
      return;
    }
    void moveTo(card.id, overId as TaskStatus);
  }

  const activeCard = active?.type === "card" ? items.find((t) => t.id === active.id) ?? null : null;

  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={400}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setOverCol(null);
        }}
      >
        <div>
          {/* Running total — filtering lives in the top filter bar now. */}
          <div className="mb-5 flex items-center gap-2.5 flex-wrap">
            <span className="text-[15px] font-semibold text-ink-soft">
              <span className="text-ink-strong font-bold tabular-nums">{activeCount}</span>{" "}
              {activeCount === 1 ? "task" : "tasks"} on the board
            </span>
          </div>

          <div
            className="kanban-scroll flex items-stretch gap-4 overflow-x-auto overflow-y-auto pb-3 max-sm:snap-x max-sm:snap-mandatory"
            style={{ maxHeight: "calc(100dvh - 290px)", minHeight: 460 }}
          >
            <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
              {columns.map((col) => {
                const { isArchive, accent, accentDeep, accentBgLight } = accentFor(col, tones);
                const colTasks = isArchive
                  ? filtered.filter((t) => t.archived)
                  : filtered.filter((t) => !t.archived && t.status === col);
                const limit = visibleByCol[col] ?? COL_STEP;
                const shownTasks = colTasks.slice(0, limit);
                const hiddenCount = colTasks.length - shownTasks.length;
                const label = isArchive ? "Archived" : labels[col as TaskStatus];
                const isCardOver = active?.type === "card" && overCol === col;
                return (
                  <KanbanColumn
                    key={col}
                    col={col}
                    isAdmin={isAdmin}
                    isArchive={isArchive}
                    label={label}
                    count={colTasks.length}
                    accent={accent}
                    accentDeep={accentDeep}
                    accentBgLight={accentBgLight}
                    isCardOver={isCardOver}
                  >
                    {isArchive && colTasks.length === 0 && (
                      <p className="px-2 py-6 text-center text-[14px] font-semibold leading-relaxed text-ink-subtle">
                        Drag a card here to archive it.
                      </p>
                    )}
                    {!isArchive && colTasks.length === 0 && (
                      <p className="px-2 py-6 text-center text-[13.5px] text-ink-subtle">
                        Nothing here.
                      </p>
                    )}
                    {shownTasks.map((t) => (
                      <KanbanCard
                        key={t.id}
                        t={t}
                        labels={labels}
                        tones={tones}
                        saving={savingId === t.id}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleByCol((m) => ({ ...m, [col]: limit + COL_STEP }))
                        }
                        className="mt-1 w-full rounded-chip py-2.5 text-[14px] font-bold transition-colors text-ink-soft hover:bg-surface-card"
                        style={{ border: "1px dashed var(--color-hairline-strong)" }}
                      >
                        Show {Math.min(COL_STEP, hiddenCount)} more ({hiddenCount} hidden)
                      </button>
                    )}
                  </KanbanColumn>
                );
              })}
            </SortableContext>
          </div>
        </div>

        {/* Floating drag preview. */}
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
          {activeCard ? (
            <div className="w-[300px] rotate-2 cursor-grabbing rounded-chip border border-altus-red/40 bg-white p-3.5 shadow-2xl">
              <span
                className="block text-[15.5px] font-semibold text-ink-strong leading-snug"
                style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {activeCard.description || activeCard.title}
              </span>
              <div className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-subtle">
                {activeCard.taskNo != null && <span className="font-bold tabular-nums">#{activeCard.taskNo}</span>}
                {activeCard.doerName && <span>· {activeCard.doerName}</span>}
              </div>
            </div>
          ) : active?.type === "column" ? (
            <div className="rounded-section border border-hairline-strong bg-surface-soft px-4 py-3 shadow-2xl">
              <span className="text-[15.5px] font-bold text-ink-strong">
                {active.id === ARCHIVE_COL ? "Archived" : labels[active.id as TaskStatus]}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Tooltip.Provider>
  );
}

// ── Column (sortable for admin reorder + drop target for cards) ─────────────
function KanbanColumn({
  col,
  isAdmin,
  isArchive,
  label,
  count,
  accent,
  accentDeep,
  accentBgLight,
  isCardOver,
  children,
}: {
  col: ColId;
  isAdmin: boolean;
  isArchive: boolean;
  label: string;
  count: number;
  accent: string;
  accentDeep: string;
  accentBgLight: string;
  isCardOver: boolean;
  children: React.ReactNode;
}) {
  // Disable only the column DRAG for non-admins — the column must stay a drop
  // target so anyone can still drag cards between columns.
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: col,
    disabled: { draggable: !isAdmin, droppable: false },
    data: { type: "column" },
  });

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-[320px] max-sm:w-[85vw] max-sm:snap-center rounded-section p-3.5 transition-colors"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        background: isCardOver ? accentBgLight : "var(--color-surface-soft)",
        border: `1px solid ${isCardOver ? accent : "var(--color-hairline)"}`,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -18px rgba(15,23,42,0.20)",
        touchAction: "manipulation",
      }}
    >
      {/* Column header — sticky; the grip is the admin reorder handle. */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between -mx-3.5 -mt-3.5 mb-3 px-3.5 pt-3.5 pb-2.5"
        style={{
          background: "var(--color-surface-soft)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <span
          className="inline-flex items-center gap-2 text-[15.5px] font-bold min-w-0"
          style={{ color: accentDeep }}
        >
          {isAdmin && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${label} column`}
              className="shrink-0 cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink-strong touch-none"
            >
              <GripVertical size={15} strokeWidth={2.2} aria-hidden />
            </button>
          )}
          {isArchive ? (
            <Archive size={17} strokeWidth={2.4} style={{ color: accent }} />
          ) : (
            <span className="h-3 w-3 rounded-full" style={{ background: accent }} />
          )}
          {label}
        </span>
        <span className="text-[14px] font-bold tabular-nums text-ink-subtle">{count}</span>
      </div>

      <div className="flex flex-col gap-2 min-h-[40px]">{children}</div>
    </div>
  );
}

// ── Card (draggable) ─────────────────────────────────────────────────────────
function KanbanCard({
  t,
  labels,
  tones,
  saving,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  saving: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: t.id,
    data: { type: "card" },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <Tooltip.Root delayDuration={220}>
        <Tooltip.Trigger asChild>
          <div className="group rounded-chip bg-white border border-hairline p-3.5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-altus-red/40">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/tasks/${t.id}/focus` as Route}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                className="text-[15.5px] font-semibold text-ink-strong leading-snug hover:underline"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description || t.title}
              </Link>
              {saving && (
                <Loader2 size={14} className="animate-spin text-ink-subtle shrink-0 mt-0.5" />
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {t.taskNo != null && (
                <span className="text-[12.5px] font-bold tabular-nums text-ink-subtle">
                  #{t.taskNo}
                </span>
              )}
              {t.subject && (
                <span className="text-[13px] font-semibold text-ink-subtle">
                  {t.taskNo != null ? "· " : ""}
                  {t.subject}
                </span>
              )}
              {t.doerName && <span className="text-[13px] text-ink-subtle">· {t.doerName}</span>}
              {isDoneLate({ status: t.status, completedAt: t.completedAt, dueAt: t.dueAt }) && (
                <LateBadge />
              )}
            </div>
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
            <TaskHoverCard t={t} labels={labels} tones={tones} />
            <Tooltip.Arrow width={14} height={7} style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

// ── Hover preview ─────────────────────────────────────────────────────────
function Pill({
  tone,
  icon,
  children,
}: {
  tone: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap"
      style={{
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function FieldHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-1.5 text-ink-subtle"
      style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
    >
      {icon}
      {children}
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <FieldHead icon={icon}>{label}</FieldHead>
      <div className="mt-1 truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
        {value && value.trim() ? value : "—"}
      </div>
    </div>
  );
}

function TaskHoverCard({
  t,
  labels,
  tones,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
}) {
  const statusTone = tones[t.status] ?? "blue";
  const prioTone = PRIORITY_TONE[t.priority] ?? "slate";
  const desc = t.description?.trim();
  const DELAY = ["40ms", "95ms", "150ms", "205ms", "260ms"] as const;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface-card"
      style={{
        width: 384,
        maxWidth: "calc(100vw - 32px)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
      }}
    >
      <span
        aria-hidden
        className="hc-accent absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
        }}
      />

      <div className="p-5 pt-6">
        <div className="hc-item flex items-center gap-2 flex-wrap" style={{ animationDelay: DELAY[0] }}>
          <Pill
            tone={statusTone}
            icon={<span className="h-2 w-2 rounded-full" style={{ background: `var(--color-${statusTone})` }} />}
          >
            {labels[t.status]}
          </Pill>
          <Pill tone={prioTone} icon={<Flag size={12} strokeWidth={2.6} />}>
            {PRIORITY_LABELS[t.priority]}
          </Pill>
          {t.archived && (
            <Pill tone="slate" icon={<Archive size={12} strokeWidth={2.4} />}>
              Archived
            </Pill>
          )}
        </div>

        <h3
          className="hc-item mt-3.5 text-ink-strong"
          style={{ animationDelay: DELAY[1], fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}
        >
          {t.taskNo != null && <span className="text-ink-subtle tabular-nums">#{t.taskNo} · </span>}
          {t.title}
        </h3>

        <div className="hc-item mt-3" style={{ animationDelay: DELAY[2] }}>
          <FieldHead icon={<AlignLeft size={14} strokeWidth={2.2} />}>Description</FieldHead>
          {desc ? (
            <p
              className="mt-1.5 whitespace-pre-wrap text-ink-soft"
              style={{ fontSize: 14.5, lineHeight: 1.6, maxHeight: 208, overflowY: "auto" }}
            >
              {desc}
            </p>
          ) : (
            <p className="mt-1.5 italic text-ink-subtle" style={{ fontSize: 14 }}>
              No description added.
            </p>
          )}
        </div>

        <div className="hc-item my-4 h-px bg-hairline" style={{ animationDelay: DELAY[3] }} />

        <div className="hc-item grid grid-cols-2 gap-x-4 gap-y-4" style={{ animationDelay: DELAY[4] }}>
          <Meta icon={<Building2 size={14} strokeWidth={2.2} />} label="Client" value={t.client} />
          <Meta icon={<Tag size={14} strokeWidth={2.2} />} label="Subject" value={t.subject} />
          <Meta
            icon={<CalendarDays size={14} strokeWidth={2.2} />}
            label="Due"
            value={t.dueAt ? format(t.dueAt, "MMM d, yyyy") : null}
          />
          <div className="min-w-0">
            <FieldHead icon={<User size={14} strokeWidth={2.2} />}>Doer</FieldHead>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              {t.doerName ? (
                <>
                  <EmployeeAvatar name={t.doerName} size="sm" />
                  <span className="truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {t.doerName}
                  </span>
                </>
              ) : (
                <span className="text-ink-subtle" style={{ fontSize: 14.5 }}>
                  Unassigned
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
