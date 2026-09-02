"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Palette,
  CalendarClock,
  GripVertical,
  Pencil,
  Archive,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { reorderCategories, archiveCategory, restoreCategory, setBatchTypeActive } from "@/app/(app)/events/masters/actions";
import { readableText } from "./palette";
import { CategoryEditor } from "./category-editor";
import { BatchTypeEditor } from "./batch-type-editor";
import { ArchiveCategoryDialog } from "./archive-category-dialog";
import type { CategoryVM, BatchTypeVM } from "./types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export function MastersWorkbench({
  categories,
  batchTypes,
}: {
  categories: CategoryVM[];
  batchTypes: BatchTypeVM[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CategoryPanel categories={categories} />
      <BatchTypePanel batchTypes={batchTypes} categories={categories} />
    </div>
  );
}

// ── categories ────────────────────────────────────────────────────────────

function CategoryPanel({ categories }: { categories: CategoryVM[] }) {
  const router = useRouter();
  const active = React.useMemo(
    () => categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const archived = React.useMemo(() => categories.filter((c) => !c.isActive), [categories]);

  const [order, setOrder] = React.useState<CategoryVM[]>(active);
  React.useEffect(() => setOrder(active), [active]);

  const [editing, setEditing] = React.useState<CategoryVM | null | "new">(null);
  const [archiveTarget, setArchiveTarget] = React.useState<CategoryVM | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [savingOrder, setSavingOrder] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = order.findIndex((c) => c.id === a.id);
    const to = order.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(order, from, to);
    setOrder(next);
    setSavingOrder(true);
    const res = await reorderCategories({ ids: next.map((c) => c.id) });
    setSavingOrder(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      setOrder(active);
      return;
    }
    router.refresh();
  }

  function requestArchive(cat: CategoryVM) {
    if (cat.usage > 0) {
      setArchiveTarget(cat);
      return;
    }
    void (async () => {
      const res = await archiveCategory({ id: cat.id, mode: "none" });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `“${cat.name}” archived.` });
      router.refresh();
    })();
  }

  async function restore(cat: CategoryVM) {
    const res = await restoreCategory(cat.id);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `“${cat.name}” restored.` });
    router.refresh();
  }

  return (
    <section className="wg-rise overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <PanelHeader
        Icon={Palette}
        title="Event Categories"
        count={active.length}
        note={savingOrder ? "Saving order…" : "Drag to reorder — the legend follows this order."}
        onAdd={() => setEditing("new")}
        addLabel="Add Category"
      />

      <div className="p-3">
        {order.length === 0 ? (
          <EmptyRow label="No categories yet. Add your first colour." />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {order.map((cat) => (
                  <SortableCategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={() => setEditing(cat)}
                    onArchive={() => requestArchive(cat)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {archived.length > 0 ? (
          <div className="mt-3 border-t border-hairline pt-3">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-1.5 px-1 text-[12.5px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink-strong"
            >
              <ChevronDown
                size={14}
                strokeWidth={2.6}
                style={{ transform: showArchived ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }}
              />
              Archived ({archived.length})
            </button>
            {showArchived ? (
              <ul className="mt-2 space-y-1.5">
                {archived.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center gap-2.5 rounded-xl border border-hairline px-3 py-2 opacity-70"
                  >
                    <span
                      className="size-4 shrink-0 rounded-[5px] border border-black/10"
                      style={{ background: cat.color }}
                    />
                    <span className="flex-1 truncate text-[14px] font-semibold text-ink-muted line-through">
                      {cat.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => restore(cat)}
                      className="bg-surface-card inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
                    >
                      <RotateCcw size={13} strokeWidth={2.4} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing !== null ? (
        <CategoryEditor
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {archiveTarget ? (
        <ArchiveCategoryDialog
          category={archiveTarget}
          categories={categories}
          onClose={() => setArchiveTarget(null)}
          onDone={() => {
            setArchiveTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function SortableCategoryRow({
  category,
  onEdit,
  onArchive,
}: {
  category: CategoryVM;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-card px-2.5 py-2 transition-shadow"
      data-dragging={isDragging || undefined}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-ink-soft/70 hover:text-ink-strong active:cursor-grabbing"
        aria-label={`Reorder ${category.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} strokeWidth={2.2} />
      </button>

      <span
        className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-md px-2 text-[11px] font-bold"
        style={{ background: category.color, color: readableText(category.color) }}
        title={category.color}
      >
        Aa
      </span>

      <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-strong">
        {category.name}
      </span>

      <span
        className="rounded-pill px-2 py-0.5 text-[11.5px] font-bold text-ink-soft"
        style={{ background: "var(--color-surface-soft)" }}
        title={`${category.usage} item${category.usage === 1 ? "" : "s"} use this category`}
      >
        {category.usage}
      </span>

      <RowIconButton label={`Edit ${category.name}`} onClick={onEdit}>
        <Pencil size={15} strokeWidth={2.2} />
      </RowIconButton>
      <RowIconButton label={`Archive ${category.name}`} onClick={onArchive}>
        <Archive size={15} strokeWidth={2.2} />
      </RowIconButton>
    </li>
  );
}

// ── batch types ─────────────────────────────────────────────────────────────

function BatchTypePanel({
  batchTypes,
  categories,
}: {
  batchTypes: BatchTypeVM[];
  categories: CategoryVM[];
}) {
  const router = useRouter();
  const active = React.useMemo(
    () => batchTypes.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [batchTypes],
  );
  const archived = React.useMemo(() => batchTypes.filter((b) => !b.isActive), [batchTypes]);
  const catById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const [editing, setEditing] = React.useState<BatchTypeVM | null | "new">(null);
  const [showArchived, setShowArchived] = React.useState(false);

  async function setActive(bt: BatchTypeVM, isActive: boolean) {
    const res = await setBatchTypeActive({ id: bt.id, isActive });
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: isActive ? `“${bt.name}” restored.` : `“${bt.name}” archived.` });
    router.refresh();
  }

  return (
    <section className="wg-rise overflow-hidden rounded-2xl border border-hairline bg-surface-card" style={{ animationDelay: "60ms" }}>
      <PanelHeader
        Icon={CalendarClock}
        title="Batch Types"
        count={active.length}
        note="The section types that auto-block the calendar from schedules."
        onAdd={() => setEditing("new")}
        addLabel="Add Batch Type"
      />

      <div className="p-3">
        {active.length === 0 ? (
          <EmptyRow label="No batch types yet. Add PS / BSS / Conclave …" />
        ) : (
          <ul className="space-y-1.5">
            {active.map((bt) => {
              const cat = bt.defaultCategoryId ? catById.get(bt.defaultCategoryId) : null;
              return (
                <li
                  key={bt.id}
                  className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card px-3 py-2"
                >
                  <span
                    className="size-4 shrink-0 rounded-[5px] border border-black/10"
                    style={{ background: cat?.color ?? "transparent", borderStyle: cat ? "solid" : "dashed" }}
                    title={cat ? cat.name : "No default colour"}
                  />
                  <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-strong">
                    {bt.name}
                  </span>
                  {cat ? (
                    <span className="hidden truncate text-[12px] font-medium text-ink-soft sm:inline">
                      {cat.name}
                    </span>
                  ) : (
                    <span className="hidden text-[12px] font-medium text-ink-soft/70 sm:inline">
                      No colour
                    </span>
                  )}
                  <RowIconButton label={`Edit ${bt.name}`} onClick={() => setEditing(bt)}>
                    <Pencil size={15} strokeWidth={2.2} />
                  </RowIconButton>
                  <RowIconButton label={`Archive ${bt.name}`} onClick={() => setActive(bt, false)}>
                    <Archive size={15} strokeWidth={2.2} />
                  </RowIconButton>
                </li>
              );
            })}
          </ul>
        )}

        {archived.length > 0 ? (
          <div className="mt-3 border-t border-hairline pt-3">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-1.5 px-1 text-[12.5px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink-strong"
            >
              <ChevronDown
                size={14}
                strokeWidth={2.6}
                style={{ transform: showArchived ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }}
              />
              Archived ({archived.length})
            </button>
            {showArchived ? (
              <ul className="mt-2 space-y-1.5">
                {archived.map((bt) => (
                  <li
                    key={bt.id}
                    className="flex items-center gap-2.5 rounded-xl border border-hairline px-3 py-2 opacity-70"
                  >
                    <span className="flex-1 truncate text-[14px] font-semibold text-ink-muted line-through">
                      {bt.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActive(bt, true)}
                      className="bg-surface-card inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
                    >
                      <RotateCcw size={13} strokeWidth={2.4} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing !== null ? (
        <BatchTypeEditor
          batchType={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────

function PanelHeader({
  Icon,
  title,
  count,
  note,
  onAdd,
  addLabel,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  count: number;
  note: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex size-9 items-center justify-center rounded-lg"
          style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
        >
          <Icon size={18} strokeWidth={2.3} />
        </span>
        <div>
          <h2
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 16.5 }}
          >
            {title}
            <span className="ml-2 text-[13px] font-bold text-ink-soft">{count}</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink-soft">{note}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="brand-btn wg-btn inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        <Plus size={15} strokeWidth={2.6} />
        <span className="max-sm:hidden">{addLabel}</span>
      </button>
    </header>
  );
}

function RowIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
    >
      {children}
    </button>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-solid border-hairline px-4 py-8 text-center text-[13.5px] font-medium text-ink-soft">
      {label}
    </div>
  );
}
