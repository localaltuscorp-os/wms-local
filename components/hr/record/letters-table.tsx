"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  Eye,
  FileSignature,
  Layers,
  Library,
  Loader2,
  PenLine,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateHr } from "@/lib/format";
import type {
  LetterKind,
  LetterStatus,
  LetterTableRow,
  SignatureState,
} from "@/app/(app)/hr/record/person-letters-types";

/**
 * HR Record → Letters & Policies: everything issued to the selected person and
 * every policy they sign, as one table built the way the WMS Tasks list is —
 * stat chips that filter, a Group By · Search · Pager toolbar, sticky sortable
 * headers, pill badges and a left accent on rows that still need something.
 *
 * It borrows the Tasks table's LOOK, not its component: TaskTable is wired to
 * task rows (inline status edits, drawers, doers), so reusing it here would mean
 * faking a task for every letter.
 */

/** Letters worth composing straight from a record. Keys are letters-registry keys. */
export const RECORD_LETTERS: { key: string; title: string }[] = [
  { key: "selection", title: "Selection Letter" },
  { key: "appointment", title: "Appointment Letter" },
  { key: "confirmation", title: "Confirmation Letter" },
  { key: "free-training", title: "Free Training Letter" },
  { key: "after-free-training", title: "After Free Training Letter" },
  { key: "increment", title: "Increment Letter" },
  { key: "relieving", title: "Relieving Letter" },
  { key: "experience-letter", title: "Experience Letter" },
];

type Tone = { bg: string; fg: string; ring: string; label: string };

const KIND_TONE: Record<LetterKind, Tone> = {
  letter: { bg: "#EAF2FE", fg: "#1D4ED8", ring: "#3B82F6", label: "Letter" },
  uploaded: { bg: "#F1F5F9", fg: "#334155", ring: "#94A3B8", label: "Uploaded" },
  policy: { bg: "#F3E8FF", fg: "#7E22CE", ring: "#A855F7", label: "Policy" },
};

const STATUS_TONE: Record<LetterStatus, Tone> = {
  draft: { bg: "#F1F5F9", fg: "#475569", ring: "#94A3B8", label: "Draft" },
  sent: { bg: "#EAF2FE", fg: "#1D4ED8", ring: "#3B82F6", label: "Sent" },
  acknowledged: { bg: "#ECFEFF", fg: "#0E7490", ring: "#06B6D4", label: "Acknowledged" },
  signed: { bg: "#E9F7EF", fg: "#15803D", ring: "#22C55E", label: "Signed" },
  issued: { bg: "#EAF2FE", fg: "#1D4ED8", ring: "#3B82F6", label: "Issued" },
  pending: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)", ring: "var(--color-red)", label: "Pending" },
};

const SIGNATURE_LABEL: Record<SignatureState, string> = {
  none: "Not required",
  pending: "Awaiting signature",
  signed: "Signed",
};

type GroupKey = "none" | "kind" | "category" | "status";
const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "kind", label: "Type" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
];

type ChipKey = "all" | "issued" | "pending" | "signed" | "policy";
const CHIPS: {
  key: ChipKey;
  label: string;
  pill: string;
  border: string;
  dot: string;
  match: (r: LetterTableRow) => boolean;
}[] = [
  { key: "all", label: "All", pill: "bg-white text-slate-900", border: "border-slate-200", dot: "bg-slate-400", match: () => true },
  { key: "issued", label: "Letters", pill: "bg-blue-50 text-blue-950", border: "border-blue-200", dot: "bg-blue-500", match: (r) => r.kind !== "policy" },
  { key: "pending", label: "Awaiting signature", pill: "bg-red-50 text-red-950", border: "border-red-200", dot: "bg-red-500", match: (r) => r.signature === "pending" },
  { key: "signed", label: "Signed", pill: "bg-emerald-50 text-emerald-950", border: "border-emerald-200", dot: "bg-emerald-500", match: (r) => r.signature === "signed" },
  { key: "policy", label: "Policies", pill: "bg-purple-50 text-purple-950", border: "border-purple-200", dot: "bg-purple-500", match: (r) => r.kind === "policy" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function groupLabel(r: LetterTableRow, g: GroupKey): string {
  if (g === "kind") return KIND_TONE[r.kind].label;
  if (g === "status") return STATUS_TONE[r.status].label;
  if (g === "category") return r.category || "Uncategorised";
  return "";
}

export function LettersTable({
  personId,
  rows,
  matched,
  loading,
}: {
  personId: string;
  rows: LetterTableRow[];
  matched: boolean;
  loading: boolean;
}) {
  const router = useRouter();
  const [chip, setChip] = React.useState<ChipKey>("all");
  const [query, setQuery] = React.useState("");
  const [groupBy, setGroupBy] = React.useState<GroupKey>("none");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "issuedAt", desc: true }]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState<number>(10);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const counts = React.useMemo(() => {
    const out = {} as Record<ChipKey, number>;
    for (const c of CHIPS) out[c.key] = rows.filter(c.match).length;
    return out;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const match = CHIPS.find((c) => c.key === chip)!.match;
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        match(r) &&
        (!q ||
          `${r.title} ${r.category} ${r.issuedBy ?? ""} ${KIND_TONE[r.kind].label} ${STATUS_TONE[r.status].label}`
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, chip, query]);

  const columns = React.useMemo<ColumnDef<LetterTableRow>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={(v) => table.toggleAllPageRowsSelected(v)}
            ariaLabel="Select every row on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} onChange={(v) => row.toggleSelected(v)} ariaLabel={`Select ${row.original.title}`} />
        ),
      },
      {
        id: "title",
        header: "Letter",
        accessorFn: (r) => r.title,
        sortingFn: "text",
        cell: ({ row }) => (
          <div className="min-w-0 py-1">
            <p className="truncate text-[14.5px] font-bold text-ink-strong" title={row.original.title}>
              {row.original.title}
            </p>
            <p className="truncate text-[12px] font-medium text-ink-muted">{row.original.category}</p>
          </div>
        ),
      },
      {
        id: "kind",
        header: "Type",
        accessorFn: (r) => KIND_TONE[r.kind].label,
        sortingFn: "text",
        cell: ({ row }) => <Pill tone={KIND_TONE[row.original.kind]} />,
      },
      // Hidden: exists so Group By › Category has a column to sort on.
      { id: "category", header: "Category", accessorFn: (r) => r.category, sortingFn: "text" },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => STATUS_TONE[r.status].label,
        sortingFn: "text",
        cell: ({ row }) => <Pill tone={STATUS_TONE[row.original.status]} />,
      },
      {
        id: "signature",
        header: "Signature",
        accessorFn: (r) => SIGNATURE_LABEL[r.signature],
        sortingFn: "text",
        cell: ({ row }) => <SignatureCell row={row.original} />,
      },
      {
        id: "issuedAt",
        header: "Issued on",
        // ISO strings sort chronologically as text; a blank sorts as oldest.
        accessorFn: (r) => r.issuedAt ?? "",
        sortingFn: "basic",
        cell: ({ row }) => (
          <span className="text-[13px] font-semibold tabular-nums text-ink-soft">
            {row.original.issuedAt ? formatDateHr(row.original.issuedAt) : "-"}
          </span>
        ),
      },
      {
        id: "issuedBy",
        header: "Issued by",
        accessorFn: (r) => r.issuedBy ?? "",
        sortingFn: "text",
        cell: ({ row }) => <span className="text-[13px] font-semibold text-ink-soft">{row.original.issuedBy || "-"}</span>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => <RowActions row={row.original} personId={personId} />,
      },
    ],
    [personId],
  );

  // GROUPING RIDES ON SORTING. Rows are clustered by sorting on the group column
  // first; the user's own sort then orders rows inside each group. Headers are
  // drawn wherever the group value changes (see the tbody below).
  const effectiveSorting: SortingState =
    groupBy === "none" ? sorting : [{ id: groupBy, desc: false }, ...sorting.filter((s) => s.id !== groupBy)];

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(pageIndex, pageCount - 1);

  const table = useReactTable({
    data: filtered,
    columns,
    getRowId: (r) => `${r.kind}:${r.id}`,
    state: {
      sorting: effectiveSorting,
      pagination: { pageIndex: safePage, pageSize },
      rowSelection,
      columnVisibility: { category: false },
    },
    enableMultiSort: false,
    autoResetPageIndex: false,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(effectiveSorting) : updater;
      setSorting(groupBy === "none" ? next : next.filter((s) => s.id !== groupBy));
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const total = filtered.length;
  const rangeStart = total === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min(total, (safePage + 1) * pageSize);
  const visibleCols = table.getVisibleLeafColumns().length;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const openable = selectedRows.filter((r) => r.openUrl);
  const pageRows = table.getRowModel().rows;

  function resetPage() {
    setPageIndex(0);
  }

  function composeHref(key: string) {
    return `/hr/letters/${key}?candidate=${personId}` as Route;
  }

  const newLetterMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-95"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          <Plus size={15} strokeWidth={2.6} /> New letter <ChevronDown size={14} strokeWidth={2.4} className="opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Compose for this person</DropdownMenuLabel>
        {RECORD_LETTERS.map((l) => (
          <DropdownMenuItem key={l.key} onSelect={() => router.push(composeHref(l.key))}>
            <FileSignature size={15} strokeWidth={2.2} className="text-ink-soft" />
            {l.title}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => router.push("/hr/letters" as Route)} className="font-bold">
          <Library size={15} strokeWidth={2.2} className="text-altus-red" />
          Browse all letters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Heading + stat chips */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.015em" }}
        >
          Letters &amp; Policies
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((c) => {
            const on = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setChip(on && c.key !== "all" ? "all" : c.key);
                  resetPage();
                }}
                className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 transition-all duration-150 ${c.pill} ${
                  on ? "scale-[1.02] border-white font-bold shadow-xs ring-1 ring-black/10" : `${c.border} font-medium`
                }`}
              >
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
                <span
                  className="tabular-nums leading-none"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}
                >
                  {loading ? "-" : counts[c.key]}
                </span>
                <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar — Group By · Search · Pager · New letter */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-section border border-hairline px-3 py-2"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 26px -20px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Group letters by"
                className={`inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-[13px] font-bold transition-all ${
                  groupBy !== "none"
                    ? "border-altus-red bg-altus-red/10 text-altus-red"
                    : "border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong"
                }`}
              >
                <Layers size={15} strokeWidth={2.3} />
                {groupBy !== "none" ? `Group: ${GROUP_OPTIONS.find((o) => o.key === groupBy)!.label}` : "Group By"}
                <ChevronDown size={14} strokeWidth={2.4} className="opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Group By</DropdownMenuLabel>
              {GROUP_OPTIONS.map((opt) => {
                const sel = opt.key === groupBy;
                return (
                  <DropdownMenuItem
                    key={opt.key}
                    onSelect={() => {
                      setGroupBy(opt.key);
                      resetPage();
                    }}
                    className={sel ? "font-bold text-altus-red" : ""}
                  >
                    <span className="inline-flex w-4 justify-center">{sel ? <Check size={14} strokeWidth={2.6} /> : null}</span>
                    {opt.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Always open — the whole bar is the input, not just its icon. */}
          <div className="relative w-full sm:w-[240px]">
            <Search size={15} strokeWidth={2.2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search letters & policies"
              aria-label="Search this person's letters and policies"
              className="h-9 w-full rounded-pill border border-hairline bg-surface-card pl-9 pr-8 text-[13.5px] text-ink-strong outline-none transition-all placeholder:text-ink-subtle focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink-strong"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Pager
            pageIndex={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={total}
            onPage={setPageIndex}
            onPageSize={(n) => {
              setPageSize(n);
              setPageIndex(0);
            }}
          />
          {newLetterMenu}
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-altus-red/30 bg-altus-red/5 px-3 py-2 text-[13px] font-semibold text-ink-strong">
          <span className="tabular-nums">{selectedRows.length} selected</span>
          <button
            type="button"
            disabled={openable.length === 0}
            onClick={() => {
              for (const r of openable) window.open(r.openUrl!, "_blank", "noopener,noreferrer");
            }}
            title="Opens each file in a new tab - allow pop-ups for this site if only the first one opens"
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3 py-1 text-[12.5px] font-bold transition-colors hover:bg-surface-soft disabled:opacity-40"
          >
            <Eye size={13} /> Open {openable.length} {openable.length === 1 ? "file" : "files"}
          </button>
          <button
            type="button"
            onClick={() => table.resetRowSelection()}
            className="ml-auto text-[12.5px] font-bold text-ink-muted hover:text-ink-strong"
          >
            Clear
          </button>
        </div>
      )}

      {/* The table card */}
      <div
        className="overflow-hidden rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px -24px rgba(15, 23, 42, 0.20)" }}
      >
        <div className="overflow-x-auto" style={{ overscrollBehaviorY: "auto" }}>
          <table className="min-w-full">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const canSort = h.column.getCanSort();
                    const sorted = h.column.getIsSorted();
                    const node = flexRender(h.column.columnDef.header, h.getContext());
                    return (
                      <th
                        key={h.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        // Actions is PINNED to the right edge. The table is wider
                        // than the shell, so Open/"No file yet" sat past the fold
                        // and read as a cut-off column ("No f") rather than one
                        // you scroll to. z-30 keeps it above the z-20 headers.
                        className={`sticky top-0 whitespace-nowrap px-4 py-2 text-left text-table-head max-md:px-3 ${
                          h.column.id === "actions" ? "right-0 z-30" : "z-20"
                        } ${h.column.id === "title" ? "w-full" : ""} ${h.column.id === "select" ? "w-10" : ""}`}
                        style={{
                          background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(244,246,249,0.90))",
                          color: "var(--color-ink-soft)",
                          boxShadow:
                            h.column.id === "actions"
                              ? "inset 0 -1px 0 var(--color-hairline-strong), -10px 0 14px -10px rgba(15,23,42,0.14)"
                              : "inset 0 -1px 0 var(--color-hairline-strong)",
                        }}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className={`group/sort inline-flex select-none items-center gap-1.5 transition-colors hover:text-ink-strong ${sorted ? "text-ink-strong" : ""}`}
                          >
                            {node}
                            {sorted === "asc" ? (
                              <ArrowUp size={13} strokeWidth={2.6} />
                            ) : sorted === "desc" ? (
                              <ArrowDown size={13} strokeWidth={2.6} />
                            ) : (
                              <ChevronsUpDown
                                size={13}
                                strokeWidth={2.4}
                                className="text-ink-subtle opacity-45 transition-opacity group-hover/sort:opacity-100"
                              />
                            )}
                          </button>
                        ) : (
                          node
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleCols} className="px-6 py-14 text-center text-ink-muted">
                    <Loader2 className="mx-auto animate-spin text-altus-red" />
                    <p className="mt-2 text-[13px] font-medium">Loading letters &amp; policies…</p>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols} className="px-6 py-12 text-center">
                    {rows.length === 0 ? (
                      <>
                        <p className="text-[15px] font-bold text-ink-strong">No letters issued yet.</p>
                        <p className="mx-auto mt-1 max-w-[56ch] text-[13px] font-medium text-ink-muted">
                          Letters composed for this person, letters uploaded to their file and the policies they sign all appear here.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[15px] font-bold text-ink-strong">Nothing matches this view.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setChip("all");
                            resetPage();
                          }}
                          className="mt-3 inline-flex items-center rounded-pill border border-hairline-strong bg-surface-card px-4 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                        >
                          Show everything
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => {
                  const label = groupBy === "none" ? null : groupLabel(row.original, groupBy);
                  const prev = i > 0 ? pageRows[i - 1] : undefined;
                  const showHeader = label !== null && (i === 0 || label !== groupLabel(prev!.original, groupBy));
                  const groupCount = label === null ? 0 : filtered.filter((r) => groupLabel(r, groupBy) === label).length;
                  return (
                    <React.Fragment key={row.id}>
                      {showHeader && (
                        <tr>
                          <td
                            colSpan={visibleCols}
                            className="border-b border-hairline px-5 py-2.5 max-md:px-3"
                            style={{
                              background:
                                "linear-gradient(90deg, color-mix(in srgb, var(--color-altus-red) 4.5%, var(--color-surface-soft)), var(--color-surface-soft) 40%)",
                            }}
                          >
                            <span className="sticky left-0 inline-flex items-center gap-2.5">
                              <span
                                aria-hidden
                                className="inline-block h-4 w-[3px] rounded-full"
                                style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                              />
                              <span
                                className="font-black tracking-[-0.01em] text-ink-strong"
                                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 16 }}
                              >
                                {label}
                              </span>
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill bg-altus-red/10 px-2 text-[12px] font-bold tabular-nums text-altus-red">
                                {groupCount}
                              </span>
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr
                        // Same row language as the Tasks list: a grey rule between
                        // rows, a red left border on hover (transparent by default
                        // so it costs no layout shift), and an amber inset accent on
                        // anything still waiting for a signature (red, matching
                        // its Pending pill).
                        className={`border-b border-l-4 border-gray-200 border-l-transparent transition-colors hover:border-l-red-600 hover:bg-surface-soft/60 ${
                          row.getIsSelected() ? "bg-altus-red/[0.05]" : ""
                        }`}
                        style={row.original.signature === "pending" ? { boxShadow: "inset 3px 0 0 0 var(--color-red)" } : undefined}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={`whitespace-nowrap px-3 py-1.5 max-md:py-2 ${
                              cell.column.id === "title" ? "w-full min-w-[240px] max-w-[48ch] overflow-hidden text-ellipsis" : ""
                            } ${cell.column.id === "actions" ? "sticky right-0 z-10 bg-surface-card text-right" : ""}`}
                            style={
                              cell.column.id === "actions"
                                ? { boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" }
                                : undefined
                            }
                          >
                            {flexRender(cell.column.columnDef.cell ?? ((c) => String(c.getValue() ?? "")), cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && !matched && (
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
          <UserRound size={13} className="mt-0.5 shrink-0" />
          Not yet linked to an employee account - letters and signatures appear here once this person joins.
        </p>
      )}
    </div>
  );
}

/** Uppercase pill with a leading dot — the Priority badge's shell. */
function Pill({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-flex min-w-[118px] items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5"
      style={{
        background: tone.bg,
        color: tone.fg,
        border: `1px solid color-mix(in srgb, ${tone.ring} 30%, transparent)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: tone.ring }} />
      <span className="flex-1 text-center">{tone.label}</span>
    </span>
  );
}

function SignatureCell({ row }: { row: LetterTableRow }) {
  if (row.signature === "signed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: "#15803D" }}>
        <CircleCheck size={14} strokeWidth={2.6} /> Signed
        {row.signedAt ? <span className="font-semibold tabular-nums text-ink-soft">· {formatDateHr(row.signedAt)}</span> : null}
      </span>
    );
  }
  if (row.signature === "pending") {
    return (
      <span className="inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
        {SIGNATURE_LABEL.pending}
      </span>
    );
  }
  return <span className="text-[12.5px] font-medium text-ink-subtle">{SIGNATURE_LABEL.none}</span>;
}

function RowActions({ row, personId }: { row: LetterTableRow; personId: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {row.openUrl ? (
        <a
          href={row.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
        >
          <Eye size={13} /> Open
        </a>
      ) : (
        <span className="px-2 text-[11.5px] font-semibold text-ink-subtle">No file yet</span>
      )}
      {row.composeKey && (
        <Link
          href={`/hr/letters/${row.composeKey}?candidate=${personId}` as Route}
          title="Compose this letter again"
          aria-label={`Compose ${row.title} again`}
          className="inline-grid size-8 place-items-center rounded-lg border border-hairline-strong bg-white text-ink-muted transition-colors hover:text-ink-strong"
        >
          <PenLine size={14} />
        </Link>
      )}
    </div>
  );
}

/** "Showing 1–10 of 24" · Rows · ‹ Page n of m › — the Tasks pager, trimmed. */
function Pager({
  pageIndex,
  pageCount,
  pageSize,
  rangeStart,
  rangeEnd,
  total,
  onPage,
  onPageSize,
}: {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPage: (i: number) => void;
  onPageSize: (n: number) => void;
}) {
  const btn =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-white text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-40 disabled:hover:bg-white";
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-subtle">
      <span className="whitespace-nowrap tabular-nums max-lg:hidden">
        {total === 0 ? "No rows" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </span>
      <label className="flex items-center gap-1 whitespace-nowrap">
        <span className="max-sm:hidden">Rows</span>
        {/* OS arrow hidden, app chevron drawn with its own gutter. */}
        <span className="relative inline-block">
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-7 cursor-pointer rounded-md border border-hairline bg-white pl-2 text-[12px] font-bold text-ink-strong"
            style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 24 }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown size={12} strokeWidth={2.6} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted" />
        </span>
      </label>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0} aria-label="Previous page" className={btn}>
          <ChevronLeft size={14} strokeWidth={2.6} />
        </button>
        <span className="whitespace-nowrap tabular-nums">
          {pageIndex + 1} of {pageCount}
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
