"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  /** Stable key — also the sort key. */
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Provide to make this column sortable. Return a string or number. */
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: "left" | "right";
}

export interface DataTableFilter<T> {
  label: string;
  options: { value: string; label: string }[];
  /** Return true if `row` passes when the chosen option is `value`. */
  match: (row: T, value: string) => boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  /** Provide to enable the search box; return the haystack text for a row. */
  searchText?: (row: T) => string;
  /** Optional dropdown filters rendered in the toolbar. */
  filters?: DataTableFilter<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Trailing per-row actions cell (row menu, buttons…). */
  rowActions?: (row: T) => ReactNode;
  /** Opt-in bulk actions — when provided, a leading select checkbox column + a
   *  sticky selection bar appear; render the action buttons for the picked rows.
   *  `clearSelection()` empties the selection (call after a successful action). */
  bulkActions?: (selected: T[], clearSelection: () => void) => ReactNode;
  /**
   * Turn on the leading checkbox column WITHOUT the sticky selection bar, for
   * callers that would rather drive the selection from their own toolbar
   * control (see `toolbarActions`). `bulkActions` implies this.
   */
  selectable?: boolean;
  /**
   * Rendered in the toolbar, after the filter dropdowns. Unlike `bulkActions`
   * this is ALWAYS mounted, so a button here can sit beside the filters and
   * simply disable itself while nothing is ticked — which is what "Edit All"
   * needs. Receives the rows currently selected AND visible.
   */
  toolbarActions?: (ctx: { selected: T[]; clearSelection: () => void }) => ReactNode;
  /** Shown when there are zero rows to begin with. */
  emptyState?: ReactNode;
  /** Tighter vertical padding. */
  dense?: boolean;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
  className?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

/**
 * The premium admin data table: a frosted card wrapping a sticky-glass-header
 * table with client-side search, dropdown filters, and sortable columns.
 *
 * All search/sort/filter runs over the `rows` you pass — no server round-trip.
 * Generic over the row type `T`; pass `columns` with per-column `render` (and
 * optional `sortValue` to make a column sortable) plus `getRowKey`.
 *
 * Usage:
 *   <DataTable
 *     rows={employees}
 *     getRowKey={(e) => e.id}
 *     searchText={(e) => `${e.name} ${e.email}`}
 *     searchPlaceholder="Search by name or email"
 *     initialSort={{ key: "name", dir: "asc" }}
 *     filters={[{
 *       label: "Status",
 *       options: [{ value: "active", label: "Active" }],
 *       match: (e, v) => (v === "active" ? e.isActive : true),
 *     }]}
 *     columns={[
 *       { key: "name", label: "Name", sortValue: (e) => e.name, render: (e) => e.name },
 *       { key: "email", label: "Email", render: (e) => e.email },
 *     ]}
 *     rowActions={(e) => <EmployeeRowActions … />}
 *   />
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  searchText,
  filters,
  initialSort,
  rowActions,
  bulkActions,
  selectable = false,
  toolbarActions,
  emptyState,
  dense = false,
  searchPlaceholder = "Search…",
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [filterValues, setFilterValues] = useState<Record<number, string>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const searchInputId = useId();

  const colByKey = useMemo(() => {
    const m = new Map<string, DataTableColumn<T>>();
    for (const c of columns) m.set(c.key, c);
    return m;
  }, [columns]);

  const filtered = useMemo(() => {
    let out = rows;

    // Dropdown filters.
    if (filters && filters.length > 0) {
      out = out.filter((row) =>
        filters.every((f, i) => {
          const v = filterValues[i];
          if (!v || v === "__all") return true;
          return f.match(row, v);
        }),
      );
    }

    // Free-text search.
    const q = query.trim().toLowerCase();
    if (q && searchText) {
      out = out.filter((row) => searchText(row).toLowerCase().includes(q));
    }

    // Sort.
    if (sort) {
      const col = colByKey.get(sort.key);
      if (col?.sortValue) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (typeof av === "number" && typeof bv === "number") {
            return (av - bv) * dir;
          }
          return String(av).localeCompare(String(bv), undefined, {
            numeric: true,
            sensitivity: "base",
          }) * dir;
        });
      }
    }

    return out;
  }, [rows, filters, filterValues, query, searchText, sort, colByKey]);

  function toggleSort(key: string) {
    const col = colByKey.get(key);
    if (!col?.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears the sort
    });
  }

  const showSelect = Boolean(bulkActions) || selectable;
  const hasToolbar =
    Boolean(searchText) || (filters && filters.length > 0) || Boolean(toolbarActions);
  const totalCols = columns.length + (rowActions ? 1 : 0) + (showSelect ? 1 : 0);
  const cellPadY = dense ? "py-2.5" : "py-4";

  // ── Bulk selection (opt-in) ──────────────────────────────────────────
  // Scoped to `filtered`, so "selected" always means "selected AND currently
  // visible" — narrowing the search must not silently act on hidden rows.
  const selectedRows = useMemo(
    () =>
      bulkActions || selectable
        ? filtered.filter((r) => selectedKeys.has(getRowKey(r)))
        : [],
    [bulkActions, selectable, filtered, selectedKeys, getRowKey],
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedKeys.has(getRowKey(r)));
  const someFilteredSelected = filtered.some((r) => selectedKeys.has(getRowKey(r)));
  const clearSelection = () => setSelectedKeys(new Set());
  function toggleRow(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    setSelectedKeys((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const r of filtered) next.delete(getRowKey(r));
        return next;
      }
      const next = new Set(prev);
      for (const r of filtered) next.add(getRowKey(r));
      return next;
    });
  }

  // Nothing at all — show the caller's empty state (or a default).
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "admin-panel px-6 py-14 text-center",
          className,
        )}
      >
        {emptyState ?? (
          <>
            <p
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-serif), system-ui, sans-serif",
                fontStyle: "italic",
                fontSize: 22,
                letterSpacing: "-0.015em",
              }}
            >
              Nothing here yet
            </p>
            <p className="mt-2 text-[14px] text-ink-subtle">
              Records will show up here once they exist.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn("admin-panel", className)}>
      {hasToolbar ? (
        <div className="admin-toolbar">
          {searchText ? (
            <div className="relative min-w-[200px] flex-1 max-w-sm">
              <Search
                size={16}
                strokeWidth={2.2}
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <input
                id={searchInputId}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="admin-search"
              />
            </div>
          ) : null}

          {filters?.map((f, i) => (
            <label key={f.label} className="inline-flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                {f.label}
              </span>
              <div className="relative">
                <select
                  value={filterValues[i] ?? "__all"}
                  onChange={(e) =>
                    setFilterValues((prev) => ({ ...prev, [i]: e.target.value }))
                  }
                  aria-label={f.label}
                  className="admin-filter-select"
                >
                  <option value="__all">All</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
                />
              </div>
            </label>
          ))}

          {toolbarActions ? (
            <div className="flex flex-wrap items-center gap-2">
              {toolbarActions({ selected: selectedRows, clearSelection })}
            </div>
          ) : null}

          <div className="ml-auto text-[13px] font-medium text-ink-subtle tabular-nums">
            {filtered.length} of {rows.length}
          </div>
        </div>
      ) : null}

      {/* Bulk-selection bar — appears once ≥1 row is ticked. */}
      {bulkActions && selectedRows.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3"
          style={{ background: "rgba(248, 250, 252, 0.9)" }}
        >
          <span className="text-[13px] font-bold text-ink-strong tabular-nums">
            {selectedRows.length} selected
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[12.5px] font-semibold text-ink-subtle underline-offset-2 hover:text-ink-strong hover:underline"
          >
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions(selectedRows, clearSelection)}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[15px]">
          <thead>
            <tr
              className="border-b border-hairline text-left text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
              style={{ background: "rgba(248, 250, 252, 0.7)" }}
            >
              {showSelect ? (
                <th scope="col" className="sticky top-0 z-10 w-10 px-4 py-4" style={{ background: "rgba(248, 250, 252, 0.82)" }}>
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                    }}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer accent-[var(--color-altus-red)]"
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const sortable = Boolean(c.sortValue);
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 px-5 py-4 backdrop-blur",
                      c.align === "right" && "text-right",
                      c.className,
                    )}
                    style={{ background: "rgba(248, 250, 252, 0.82)" }}
                    aria-sort={
                      active
                        ? sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : sortable
                          ? "none"
                          : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "admin-th-btn",
                          c.align === "right" && "flex-row-reverse",
                          active && "text-ink-strong",
                        )}
                      >
                        {c.label}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp size={13} strokeWidth={2.6} className="text-altus-red" />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.6} className="text-altus-red" />
                          )
                        ) : (
                          <ChevronsUpDown size={13} strokeWidth={2} className="opacity-45" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
              {rowActions ? (
                <th scope="col" className="sticky top-0 z-10 w-12 px-5 py-4 text-right" style={{ background: "rgba(248, 250, 252, 0.82)" }}>
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-5 py-12 text-center text-ink-subtle italic"
                >
                  {query.trim()
                    ? `No matches for “${query.trim()}”.`
                    : "No rows match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className="admin-row border-b border-hairline last:border-b-0"
                >
                  {showSelect ? (
                    <td className={cn("w-10 px-4 align-middle", cellPadY)}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selectedKeys.has(getRowKey(row))}
                        onChange={() => toggleRow(getRowKey(row))}
                        className="size-4 cursor-pointer accent-[var(--color-altus-red)]"
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-5 align-middle text-ink-soft",
                        cellPadY,
                        c.align === "right" && "text-right",
                        c.className,
                      )}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className={cn("px-5 text-right", cellPadY)}>
                      {rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
