"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Group as GroupIcon, SlidersHorizontal } from "lucide-react";
import { SelectAllBar } from "@/components/ui/select-all-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * THE BILLING TABLE TOOLBAR — Group By ▾ · search · filters · pager · Columns,
 * the same rail as the task list (components/tasks/task-table.tsx). Shared by
 * the Customer Master and the Documents list so the two read as one module.
 * Each piece is controlled: the host owns the state (in memory or the URL).
 */

export function TableToolbar({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div
      className="wg-rise slim-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto rounded-section border border-hairline px-2.5 py-1.5 [scrollbar-width:thin]"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
      }}
    >
      {/* ONE LINE, always: the pills are sized to fit, and on a screen too
          narrow for them the rail scrolls sideways rather than wrapping. */}
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5">{left}</div>
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5 pl-1.5">{right}</div>
    </div>
  );
}

export const toolbarPill =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 text-[12px] font-bold transition-all";
const pillIdle = "border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong";
const pillOn = "border-altus-red bg-altus-red/10 text-altus-red";

export function GroupByControl<K extends string>({
  value,
  onChange,
  options,
  noun,
}: {
  value: K;
  onChange: (v: K) => void;
  /** The first option is "no grouping". */
  options: { key: K; label: string }[];
  noun: string;
}) {
  const none = options[0]!.key;
  const active = options.find((g) => g.key === value) ?? options[0]!;
  const grouped = value !== none;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Group ${noun} by`} className={`${toolbarPill} ${grouped ? pillOn : pillIdle}`}>
          <GroupIcon size={14} strokeWidth={2.3} />
          {grouped ? `Group: ${active.label}` : "Group By"}
          <ChevronDown size={14} strokeWidth={2.4} className="opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Group By</DropdownMenuLabel>
        {options.map((g) => {
          const on = g.key === value;
          return (
            <DropdownMenuItem key={g.key} onSelect={() => onChange(g.key)} className={on ? "font-bold text-altus-red" : ""}>
              <span className="inline-flex w-4 justify-center">{on ? <Check size={14} strokeWidth={2.6} /> : null}</span>
              {g.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ColumnsMenu<K extends string>({
  columns,
  hidden,
  onToggle,
  locked,
}: {
  columns: { key: K; label: string }[];
  hidden: Set<K>;
  onToggle: (k: K) => void;
  /** A column that cannot be hidden — the one that names the row. */
  locked?: K;
}) {
  // Every column the two bulk buttons are actually allowed to move.
  const toggleable = React.useMemo(
    () => columns.filter((c) => c.key !== locked).map((c) => c.key),
    [columns, locked],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${toolbarPill} ${pillIdle}`}>
          <SlidersHorizontal size={14} strokeWidth={2.2} />
          Columns
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="slim-scroll max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Show Columns</DropdownMenuLabel>
        {/* Show all / Hide all. `locked` names the column that titles the row —
            it can never be hidden, so it is left out of both the count and the
            two bulk moves rather than being promised and refused. */}
        <SelectAllBar
          compact
          className="mb-1"
          count={toggleable.filter((k) => !hidden.has(k)).length}
          total={toggleable.length}
          emptyLabel="No columns shown"
          onSelectAll={() => {
            for (const k of toggleable) if (hidden.has(k)) onToggle(k);
          }}
          onClear={() => {
            for (const k of toggleable) if (!hidden.has(k)) onToggle(k);
          }}
        />
        {columns.map((c) => (
          <DropdownMenuItem
            key={c.key}
            disabled={c.key === locked}
            onSelect={(e) => {
              e.preventDefault();
              onToggle(c.key);
            }}
          >
            <span className="inline-flex w-4 justify-center">
              {!hidden.has(c.key) ? <Check size={14} strokeWidth={2.6} /> : null}
            </span>
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Hidden-column state with a toggle. */
export function useHiddenColumns<K extends string>() {
  const [hidden, setHidden] = React.useState<Set<K>>(new Set());
  const toggle = (k: K) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  return { hidden, toggle };
}

/* FilterPill lived here — a pill-shaped single-value `<select>`. Both billing
   tables now use `MultiFilter`, which asks the same question and takes more
   than one answer, so the single-value version had no callers left. */

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export function Pager({
  pageIndex,
  pageCount,
  pageSize,
  rangeStart,
  rangeEnd,
  total,
  noun,
  onPage,
  onPageSize,
}: {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  noun: string;
  onPage: (i: number) => void;
  onPageSize: (n: number) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const shown = draft === "" ? String(pageIndex + 1) : draft;
  function commit(raw: string) {
    setDraft("");
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    // Clamped, not rejected: 99 in a 3-page list means "the end".
    onPage(Math.min(pageCount, Math.max(1, Math.trunc(n))) - 1);
  }
  const btn =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-white text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-40 disabled:hover:bg-white";

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-ink-subtle">
      <span className="whitespace-nowrap tabular-nums max-xl:hidden">
        {total === 0 ? `No ${noun}` : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </span>
      <label className="flex items-center gap-1 whitespace-nowrap">
        <span className="max-sm:hidden">Rows</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          className="h-7 rounded-md border border-hairline bg-white px-1.5 text-[12px] font-bold text-ink-strong"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0} aria-label="Previous page" className={btn}>
          <ChevronLeft size={14} strokeWidth={2.6} />
        </button>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="max-sm:hidden">Page</span>
          <input
            type="number"
            min={1}
            max={pageCount}
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setDraft("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={`Page number, 1 to ${pageCount}`}
            className="h-7 w-11 rounded-md border border-hairline bg-white px-1 text-center text-[12px] font-bold tabular-nums text-ink-strong"
          />
          <span className="tabular-nums">of {pageCount}</span>
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(pageCount - 1, pageIndex + 1))}
          disabled={pageIndex >= pageCount - 1}
          aria-label="Next page"
          className={btn}
        >
          <ChevronRight size={14} strokeWidth={2.6} />
        </button>
      </span>
    </div>
  );
}
