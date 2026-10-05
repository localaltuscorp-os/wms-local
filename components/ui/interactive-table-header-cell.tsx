"use client";

import type { CSSProperties, DragEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type TableSortDirection = "asc" | "desc" | false;

/**
 * The shared interactive table header used by Tasks-style data grids.
 *
 * Sorting and column reordering deliberately have separate hit targets: the
 * grip owns native HTML drag/drop, while the label button owns sorting. This
 * keeps a normal sort click from accidentally becoming a column drag.
 */
export function InteractiveTableHeaderCell({
  columnId,
  label,
  sortable,
  sortDirection,
  onToggleSort,
  draggable = false,
  dragging = false,
  dropTarget = false,
  dropFromLeft = false,
  onColumnDragStart,
  onColumnDragEnd,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  className,
  style,
  align = "left",
  labelClassName,
}: {
  columnId: string;
  label: ReactNode;
  sortable: boolean;
  sortDirection: TableSortDirection;
  onToggleSort?: () => void;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  dropFromLeft?: boolean;
  onColumnDragStart?: (event: DragEvent<HTMLSpanElement>) => void;
  onColumnDragEnd?: () => void;
  onColumnDragOver?: (event: DragEvent<HTMLTableCellElement>) => void;
  onColumnDragLeave?: () => void;
  onColumnDrop?: (event: DragEvent<HTMLTableCellElement>) => void;
  className?: string;
  style?: CSSProperties;
  align?: "left" | "right";
  labelClassName?: string;
}) {
  const plainLabel = typeof label === "string" ? label : columnId;
  return (
    <th
      scope="col"
      onDragOver={draggable ? onColumnDragOver : undefined}
      onDragLeave={draggable ? onColumnDragLeave : undefined}
      onDrop={draggable ? onColumnDrop : undefined}
      aria-sort={
        sortDirection === "asc"
          ? "ascending"
          : sortDirection === "desc"
            ? "descending"
            : sortable
              ? "none"
              : undefined
      }
      className={cn("group/head", className)}
      style={{
        ...style,
        boxShadow: dropTarget
          ? `${style?.boxShadow ? `${style.boxShadow}, ` : ""}inset ${dropFromLeft ? "-3px" : "3px"} 0 0 var(--color-altus-red)`
          : style?.boxShadow,
        opacity: dragging ? 0.45 : style?.opacity,
      }}
    >
      {draggable ? (
        <span
          draggable
          onDragStart={onColumnDragStart}
          onDragEnd={onColumnDragEnd}
          role="button"
          tabIndex={-1}
          aria-label={`Reorder column ${plainLabel}`}
          title="Drag to reorder this column"
          className="mr-1 inline-flex cursor-grab align-middle text-ink-subtle opacity-0 transition-opacity hover:text-ink-strong active:cursor-grabbing group-hover/head:opacity-70"
        >
          <GripVertical size={12} strokeWidth={2.4} aria-hidden />
        </span>
      ) : null}
      {sortable ? (
        <button
          type="button"
          onClick={onToggleSort}
          className={cn(
            "group/sort inline-flex items-center gap-1.5 select-none transition-colors hover:text-ink-strong",
            align === "right" && "flex-row-reverse",
            sortDirection && "text-ink-strong",
            labelClassName,
          )}
          title={`Sort by ${plainLabel}`}
        >
          {label}
          {sortDirection === "asc" ? (
            <ArrowUp size={13} strokeWidth={2.6} />
          ) : sortDirection === "desc" ? (
            <ArrowDown size={13} strokeWidth={2.6} />
          ) : (
            <ChevronsUpDown
              size={13}
              strokeWidth={2.4}
              className="opacity-45 text-ink-subtle transition-opacity group-hover/sort:opacity-100"
            />
          )}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">{label}</span>
      )}
    </th>
  );
}
