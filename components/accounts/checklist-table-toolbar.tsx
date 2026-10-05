"use client";

import * as React from "react";
import {
  Columns3,
  Download,
  LayoutDashboard,
  List,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ChecklistView = "list" | "kanban" | "dashboard";

export function ChecklistTableToolbar({
  view,
  onViewChange,
  fullscreen,
  onFullscreenChange,
  rowsPerPage,
  onRowsPerPageChange,
  sort,
  sortOptions,
  onSortChange,
  columns,
  visibleColumns,
  onVisibleColumnsChange,
  onExport,
  onUpload,
}: {
  view: ChecklistView;
  onViewChange: (view: ChecklistView) => void;
  fullscreen: boolean;
  onFullscreenChange: (value: boolean) => void;
  rowsPerPage: number | "all";
  onRowsPerPageChange: (value: number | "all") => void;
  sort?: string;
  sortOptions?: Array<{ value: string; label: string }>;
  onSortChange?: (value: string) => void;
  columns: Array<{ id: string; label: string }>;
  visibleColumns: Set<string>;
  onVisibleColumnsChange: (value: Set<string>) => void;
  onExport: () => void;
  onUpload?: (rows: Array<Record<string, string>>) => Promise<void>;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onFullscreenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, onFullscreenChange]);

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2 || !onUpload) return;
    const parse = (line: string) => {
      const cells: string[] = [];
      let cell = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index]!;
        if (char === '"' && quoted && line[index + 1] === '"') { cell += '"'; index += 1; continue; }
        if (char === '"') { quoted = !quoted; continue; }
        if (char === "," && !quoted) { cells.push(cell.trim()); cell = ""; continue; }
        cell += char;
      }
      cells.push(cell.trim());
      return cells;
    };
    const headers = parse(lines[0]!).map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    const rows = lines.slice(1).map((line) => {
      const cells = parse(line);
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    });
    setUploading(true);
    try {
      await onUpload(rows);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const button = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-2.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong";
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-none border border-hairline bg-surface-card px-2 py-1.5" aria-label="Table controls">
      <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-lg border border-hairline">
        {([
          ["list", "List", List],
          ["kanban", "Kanban", Columns3],
          ["dashboard", "Dashboard", LayoutDashboard],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => onViewChange(id)} aria-pressed={view === id} className={`inline-flex h-8 items-center gap-1 border-r border-hairline px-2 text-[12px] font-bold last:border-r-0 ${view === id ? "bg-altus-red text-white" : "bg-surface-card text-ink-soft hover:bg-surface-soft"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {sort && sortOptions && onSortChange && <label className={`${button} cursor-pointer`}>
        Sort
        <select value={sort} onChange={(event) => onSortChange(event.target.value)} className="max-w-28 bg-transparent text-[12px] font-bold outline-none">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>}
      <label className={`${button} cursor-pointer`}>
        Rows
        <select value={String(rowsPerPage)} onChange={(event) => onRowsPerPageChange(event.target.value === "all" ? "all" : Number(event.target.value))} className="bg-transparent text-[12px] font-bold outline-none">
          <option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="all">All</option>
        </select>
      </label>
      <Popover>
        <PopoverTrigger asChild><button type="button" className={button}><SlidersHorizontal size={13} /> Columns</button></PopoverTrigger>
        <PopoverContent align="start" className="w-52 p-2">
          <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Visible columns</p>
          {columns.map((column) => <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink-strong hover:bg-surface-soft"><input type="checkbox" checked={visibleColumns.has(column.id)} onChange={() => { const next = new Set(visibleColumns); next.has(column.id) ? next.delete(column.id) : next.add(column.id); onVisibleColumnsChange(next); }} />{column.label}</label>)}
        </PopoverContent>
      </Popover>
      <button type="button" onClick={onExport} className={button}><Download size={13} /> Export CSV</button>
      {onUpload && <><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} /><button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={button}><Upload size={13} /> {uploading ? "Uploading…" : "Bulk Upload"}</button></>}
    </div>
  );
}

export function ChecklistSummary({ title, groups }: { title: string; groups: Array<{ label: string; count: number }> }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <article key={group.label} className="rounded-xl border border-hairline bg-surface-card p-4"><p className="text-[12px] font-bold uppercase tracking-[0.07em] text-ink-subtle">{group.label}</p><p className="mt-1 text-2xl font-extrabold text-ink-strong">{group.count}</p><p className="mt-1 text-[12px] font-medium text-ink-subtle">{title}</p></article>)}</div>;
}

export function ChecklistKanban({ items }: { items: Array<{ id: string; title: string; group: string; detail: string; onEdit: () => void }> }) {
  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.group || "Unassigned", [...(groups.get(item.group || "Unassigned") ?? []), item]);
  return <div className="flex gap-3 overflow-x-auto pb-2">{[...groups.entries()].map(([group, cards]) => <section key={group} className="w-72 shrink-0 rounded-xl border border-hairline bg-surface-soft p-2.5"><h3 className="px-1 pb-2 text-[12px] font-bold uppercase tracking-[0.07em] text-ink-subtle">{group} · {cards.length}</h3><div className="space-y-2">{cards.map((item) => <article key={item.id} className="rounded-lg border border-hairline bg-surface-card p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><p className="text-[13px] font-bold text-ink-strong">{item.title}</p><button type="button" onClick={item.onEdit} className="shrink-0 text-altus-red" aria-label={`Edit ${item.title}`}><PencilIcon /></button></div><p className="mt-2 text-[12px] text-ink-subtle">{item.detail}</p></article>)}</div></section>)}</div>;
}

function PencilIcon() { return <span aria-hidden>✎</span>; }
