"use client";

import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";

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
  /**
   * EXPANDABLE ROWS (opt-in). Return the detail to show under a row and the
   * table grows a leading chevron column; the row itself becomes the toggle.
   * Omitted — which is every existing caller — and nothing changes.
   */
  renderRowDetail?: (row: T) => ReactNode;
  /** Row keys open on first render (deep links). Only honoured with `renderRowDetail`. */
  initiallyExpandedKeys?: string[];
  /**
   * PAGINATION (opt-in). Rows per page; a footer appears only once the filtered
   * set is longer than this. Search/filter/sort run over the WHOLE set first, so
   * paging never hides a match — it only chunks what is already matching.
   */
  pageSize?: number;
  /** Pin the first data column while the table scrolls sideways. */
  stickyFirstColumn?: boolean;
  /** A totals row rendered after the body. Give it the same cell count. */
  footerRow?: ReactNode;
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
  renderRowDetail,
  initiallyExpandedKeys,
  pageSize,
  stickyFirstColumn = false,
  footerRow,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [filterValues, setFilterValues] = useState<Record<number, string>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(initiallyExpandedKeys ?? []),
  );
  const [page, setPage] = useState(0);
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
  const expandable = Boolean(renderRowDetail);
  const hasToolbar =
    Boolean(searchText) || (filters && filters.length > 0) || Boolean(toolbarActions);
  const totalCols =
    columns.length + (rowActions ? 1 : 0) + (showSelect ? 1 : 0) + (expandable ? 1 : 0);
  const cellPadY = dense ? "py-2.5" : "py-4";

  /* ── Paging ──────────────────────────────────────────────────────────
     Runs AFTER search, filters and sort, so a match is never paged out of
     existence — the count in the toolbar still reports the whole match set.
     Narrowing the rows resets to page 1, which is what stops a filter from
     landing someone on an empty page 4. */
  const pageCount = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  useEffect(() => {
    setPage(0);
  }, [query, filterValues, pageSize]);
  const visible = useMemo(
    () => (pageSize ? filtered.slice(safePage * pageSize, safePage * pageSize + pageSize) : filtered),
    [filtered, pageSize, safePage],
  );

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Pinned first column — needs its own background or the scrolled cells show through. */
  const stickyCell = (isFirstData: boolean, head: boolean): string =>
    stickyFirstColumn && isFirstData ? (head ? "sticky left-0 z-20" : "sticky left-0 z-[1]") : "";
  const stickyStyle = (isFirstData: boolean, head: boolean) =>
    stickyFirstColumn && isFirstData
      ? { background: head ? "rgba(248, 250, 252, 0.95)" : "var(--color-surface-card)" }
      : undefined;

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
            <CollapsibleSearch scope={searchPlaceholder.replace(/^search\s+/i, "").replace(/[.…\s]+$/, "")} className="size-9">
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
            </CollapsibleSearch>
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

      <div className="table-scroll overflow-x-auto">
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
              {expandable ? (
                <th scope="col" className="sticky top-0 z-10 w-9 px-2 py-4" style={{ background: "rgba(248, 250, 252, 0.82)" }}>
                  <span className="sr-only">Expand</span>
                </th>
              ) : null}
              {columns.map((c, ci) => {
                const sortable = Boolean(c.sortValue);
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 px-5 py-4 backdrop-blur",
                      c.align === "right" && "text-right",
                      stickyCell(ci === 0, true),
                      c.className,
                    )}
                    style={stickyStyle(ci === 0, true) ?? { background: "rgba(248, 250, 252, 0.82)" }}
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
              visible.map((row) => {
                const key = getRowKey(row);
                const open = expandable && expandedKeys.has(key);
                return (
                  <Fragment key={key}>
                    <tr
                      className={cn(
                        "admin-row border-b border-hairline",
                        !open && "last:border-b-0",
                        expandable && "cursor-pointer",
                      )}
                      onClick={expandable ? () => toggleExpanded(key) : undefined}
                      data-expanded={open || undefined}
                    >
                      {showSelect ? (
                        <td
                          className={cn("w-10 px-4 align-middle", cellPadY)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label="Select row"
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleRow(key)}
                            className="size-4 cursor-pointer accent-[var(--color-altus-red)]"
                          />
                        </td>
                      ) : null}
                      {expandable ? (
                        <td className={cn("w-9 px-2 align-middle", cellPadY)}>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={open ? "Hide details" : "Show details"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(key);
                            }}
                            className="grid size-7 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
                          >
                            <ChevronDown
                              size={15}
                              strokeWidth={2.4}
                              className={cn("transition-transform", open && "rotate-180")}
                            />
                          </button>
                        </td>
                      ) : null}
                      {columns.map((c, ci) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-5 align-middle text-ink-soft",
                            cellPadY,
                            c.align === "right" && "text-right",
                            stickyCell(ci === 0, false),
                            c.className,
                          )}
                          style={stickyStyle(ci === 0, false)}
                        >
                          {c.render(row)}
                        </td>
                      ))}
                      {rowActions ? (
                        <td
                          className={cn("px-5 text-right", cellPadY)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {rowActions(row)}
                        </td>
                      ) : null}
                    </tr>
                    {open ? (
                      <tr className="border-b border-hairline last:border-b-0">
                        <td colSpan={totalCols} className="px-5 py-4" style={{ background: "var(--color-surface-soft)" }}>
                          {renderRowDetail!(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {footerRow ? <tfoot>{footerRow}</tfoot> : null}
        </table>
      </div>

      {pageSize && filtered.length > pageSize ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-5 py-2.5">
          <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="grid size-8 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:opacity-40"
            >
              <ChevronLeft size={15} strokeWidth={2.4} />
            </button>
            <span className="text-[12.5px] font-bold text-ink-soft tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
              className="grid size-8 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:opacity-40"
            >
              <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
