"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { isReordered, moveColumnKey, reconcileColumnOrder } from "@/lib/ui/column-order";

/**
 * DRAG A COLUMN ANYWHERE, remembered per person — the Tasks table's behaviour,
 * for any table (account holder, 2026-09-18).
 *
 * Two separate handles on a heading, as on Tasks: a GRIP that drags, and the
 * name, which sorts. Making the whole heading draggable competes with the sort
 * click — a click that moves a few pixels becomes a drag and the sort never
 * fires.
 */

/**
 * A person's column order, kept in their browser under `storageKey`.
 *
 * Read AFTER MOUNT: localStorage does not exist during the server render, and
 * reading it in a lazy initialiser would have the server render the default
 * order and the client a different one — a hydration mismatch. Storage can be
 * blocked (a private window throws), so every touch is guarded and the table
 * works the same without it — the order just lasts for the visit.
 */
export function useSavedColumnOrder<K extends string>(storageKey: string, defaults: readonly K[]) {
  const [order, setOrder] = React.useState<K[]>(() => [...defaults]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists after mount; see above.
      if (raw) setOrder(reconcileColumnOrder(JSON.parse(raw), defaults));
    } catch {
      /* nothing stored, or storage blocked — the default order stands */
    }
  }, [storageKey, defaults]);

  const save = React.useCallback(
    (next: K[]) => {
      setOrder(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* not storable here — the order holds for this visit only */
      }
    },
    [storageKey],
  );

  const reset = React.useCallback(() => {
    setOrder([...defaults]);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* nothing to clear */
    }
  }, [storageKey, defaults]);

  return { order, save, reset, reordered: isReordered(order, defaults) };
}

/**
 * The drag itself: which column is being carried, which heading it is over,
 * and the props for each heading and each grip.
 */
export function useColumnDrag<K extends string>(order: readonly K[], onMove: (next: K[]) => void) {
  const [dragging, setDragging] = React.useState<K | null>(null);
  const [over, setOver] = React.useState<K | null>(null);
  const end = () => {
    setDragging(null);
    setOver(null);
  };

  /** Spread on the heading cell: it is where a carried column is dropped. */
  const headProps = (k: K) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== k) setOver(k);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Moving between the grip and the name is not leaving the heading.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver((c) => (c === k ? null : c));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging && dragging !== k) onMove(moveColumnKey(order, dragging, k));
      end();
    },
  });

  /** Spread on the grip: it is what picks the column up. */
  const gripProps = (k: K) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragging(k);
      e.dataTransfer.effectAllowed = "move";
      // Firefox refuses to start a drag without a payload.
      e.dataTransfer.setData("text/plain", k);
    },
    onDragEnd: end,
  });

  /** Which edge of `k` the carried column would land on, for the drop line. */
  const edge = (k: K): "left" | "right" | null => {
    if (!dragging || over !== k || dragging === k) return null;
    return order.indexOf(dragging) < order.indexOf(k) ? "right" : "left";
  };

  return { dragging, headProps, gripProps, edge };
}

export type ColumnDragControl<K extends string> = ReturnType<typeof useColumnDrag<K>>;

/**
 * The heading's shadows: its own bottom rule (a sticky cell's border stays
 * behind in a collapsed table, so it is drawn as a shadow) plus the red drop
 * line on the edge the column would arrive at.
 */
export function headShadow(edge: "left" | "right" | null, rule = "inset 0 -1px 0 rgb(226,232,240)"): string {
  const line = edge === "right" ? "inset -3px 0 0 #B91C1C" : edge === "left" ? "inset 3px 0 0 #B91C1C" : null;
  return [rule, line].filter(Boolean).join(", ");
}

/** The grip — faint until the heading is hovered, so the headings stay quiet. */
export function ColumnGrip({
  label,
  className,
  ...props
}: { label: string; className?: string } & React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={`Move the ${label} column`}
      title="Drag to move this column"
      className={`inline-flex shrink-0 cursor-grab items-center text-slate-400 opacity-40 transition-opacity hover:text-slate-800 active:cursor-grabbing group-hover/head:opacity-100 ${className ?? ""}`}
      {...props}
    >
      <GripVertical className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
    </span>
  );
}
