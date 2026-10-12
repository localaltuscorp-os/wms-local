"use client";

import type { DragEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react";

export type TableSort<Column extends string> = { key: Column; direction: "asc" | "desc" } | null;

export function SortableTableHeader<Column extends string>({
  column,
  label,
  sort,
  pinned = false,
  sortable = true,
  align = "left",
  dragging,
  onSort,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  column: Column;
  label: string;
  sort: TableSort<Column>;
  pinned?: boolean;
  sortable?: boolean;
  align?: "left" | "right";
  dragging: boolean;
  onSort: (column: Column) => void;
  onDragStart: (event: DragEvent<HTMLTableCellElement>, column: Column) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLTableCellElement>, target: Column) => void;
}) {
  const active = sortable && sort?.key === column;
  const Icon = !active ? ChevronsUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
  const alignment = align === "right" ? "text-right" : "text-left";
  return <th
    scope="col"
    draggable={!pinned}
    onDragStart={pinned ? undefined : (event) => onDragStart(event, column)}
    onDragOver={pinned ? undefined : (event) => event.preventDefault()}
    onDrop={pinned ? undefined : (event) => onDrop(event, column)}
    onDragEnd={onDragEnd}
    aria-sort={active ? sort?.direction === "asc" ? "ascending" : "descending" : "none"}
    className={`${pinned ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${alignment} select-none whitespace-nowrap px-4 py-3 ${dragging ? "bg-red-50 text-red-700" : ""}`}
    title={pinned ? `${label} stays first` : `Drag ${label} to reorder columns`}
  >
    <div className={`inline-flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      {!pinned && <GripVertical size={14} strokeWidth={2.1} aria-hidden className="opacity-35" />}
      {sortable ? <button type="button" onClick={() => onSort(column)} title={`Sort by ${label}`} className={`group/sort inline-flex items-center gap-1.5 font-bold uppercase transition-colors ${active ? "text-slate-900" : "text-slate-600 hover:text-slate-800"}`}>
        {label}<Icon size={13} strokeWidth={2.5} aria-hidden className={active ? "text-red-700" : "opacity-45 transition-opacity group-hover/sort:opacity-100"} />
      </button> : <span className="font-bold uppercase text-slate-600">{label}</span>}
    </div>
  </th>;
}
