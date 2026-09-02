"use client";

import * as React from "react";

/**
 * Generic drag-to-reorder table columns, remembered per user (localStorage,
 * keyed by `tableKey`) across sessions and devices. `pinned` columns can't be
 * dragged themselves, but other columns can still be dropped next to them.
 */
export interface ColumnOrderControl {
  order: string[];
  pinned: string[];
  /** Reorders `items` to match the saved order; unknown/new ids are appended
   *  in their original relative order. */
  ordered: <T>(items: T[], getId: (item: T) => string) => T[];
  moveBefore: (id: string, beforeId: string | null) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
}

function storageKey(tableKey: string): string {
  return `col-order:${tableKey}`;
}

function loadOrder(tableKey: string, columns: string[]): string[] {
  if (typeof window === "undefined") return columns;
  try {
    const raw = window.localStorage.getItem(storageKey(tableKey));
    if (!raw) return columns;
    const stored = JSON.parse(raw) as string[];
    const known = new Set(columns);
    const kept = stored.filter((id) => known.has(id));
    const missing = columns.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  } catch {
    return columns;
  }
}

export function useColumnOrder({
  tableKey,
  columns,
  pinned = [],
}: {
  tableKey: string;
  columns: string[];
  pinned?: string[];
}): ColumnOrderControl {
  const [order, setOrder] = React.useState<string[]>(() => loadOrder(tableKey, columns));
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const columnsKey = columns.join("|");
  const pinnedKey = pinned.join("|");

  // Reconcile when the caller's own column set changes (added/removed cols).
  React.useEffect(() => {
    setOrder((prev) => {
      const known = new Set(columns);
      const kept = prev.filter((id) => known.has(id));
      const missing = columns.filter((id) => !kept.includes(id));
      if (missing.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...missing];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(tableKey), JSON.stringify(order));
    } catch {
      // Private window / storage disabled — reordering just won't persist.
    }
  }, [tableKey, order]);

  const moveBefore = React.useCallback(
    (id: string, beforeId: string | null) => {
      if (id === beforeId || pinnedKey.split("|").includes(id)) return;
      setOrder((prev) => {
        const next = prev.filter((x) => x !== id);
        const idx = beforeId ? next.indexOf(beforeId) : -1;
        if (beforeId && idx === -1) return prev;
        if (idx === -1) next.push(id);
        else next.splice(idx, 0, id);
        return next;
      });
    },
    [pinnedKey],
  );

  const ordered = React.useCallback(
    <T,>(items: T[], getId: (item: T) => string): T[] => {
      const byId = new Map(items.map((item) => [getId(item), item] as const));
      const result: T[] = [];
      for (const id of order) {
        const item = byId.get(id);
        if (item !== undefined) {
          result.push(item);
          byId.delete(id);
        }
      }
      for (const item of items) {
        if (byId.has(getId(item))) result.push(item);
      }
      return result;
    },
    [order],
  );

  return { order, pinned, ordered, moveBefore, draggingId, setDraggingId };
}

export function ReorderableTh({
  id,
  ctl,
  label,
  className,
  children,
}: {
  id: string;
  ctl: ColumnOrderControl;
  /** Accessible column name, for headers whose visible content isn't plain text. */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const isPinned = ctl.pinned.includes(id);
  const dragging = ctl.draggingId === id;

  return (
    <th
      draggable={!isPinned}
      onDragStart={(e) => {
        if (isPinned) return;
        ctl.setDraggingId(id);
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", id);
        } catch {
          // Some browsers restrict setData outside a real user drag — harmless.
        }
      }}
      onDragOver={(e) => {
        if (!ctl.draggingId || ctl.draggingId === id) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = ctl.draggingId;
        if (!draggedId || draggedId === id) return;
        ctl.moveBefore(draggedId, id);
        ctl.setDraggingId(null);
      }}
      onDragEnd={() => ctl.setDraggingId(null)}
      aria-label={label}
      className={[className, !isPinned && "cursor-grab select-none", dragging && "opacity-50"]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </th>
  );
}
