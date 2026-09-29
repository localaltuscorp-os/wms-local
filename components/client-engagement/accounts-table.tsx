"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowRightLeft, ArrowUp, ArrowUpDown, Ban, Building2, CircleDot, Pencil, SlidersHorizontal, User, type LucideIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { accountLabel, categoryOf } from "@/lib/client-engagement/constants";
import { formatDuration } from "@/lib/client-engagement/schedule";
import { hhStatusMeta, isInactiveAccount, lifecycleLabel } from "@/lib/client-engagement/status";
import type { Load } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { BTN_NEUTRAL, HhStatusPill, Select } from "./ui";

/**
 * THE ACCOUNTS TABLE — participants, clients and ambassadors as a real table
 * (asked 2026-09-28: "copy the entire structure from [the Tasks table]...
 * select box on the left, group by, filters, selectable columns... Participant
 * Name | Consultant Name | rest, frozen"), replacing the fixed two-pane
 * Active/Inactive card board for whichever category tab is open.
 *
 * Scaled to what THIS module needs rather than a line-for-line copy of
 * components/tasks/task-table.tsx: no pagination (a category's roster runs to
 * the dozens, not the hundreds Tasks paginates), and the Lifecycle filter
 * below does the job the two separate panes used to — one table, not two.
 *
 * Row SELECTION is wired to ONE bulk action, transfer, because that is the
 * one the module already has a single-row version of (`ceAssignAccount`);
 * bulk-transfer just calls it once per selected row, the same "reuse the
 * existing action in a loop" pattern add-call-dialog.tsx uses for its several
 * weekly calls, rather than a new bulk server action.
 */

type GroupKey = "none" | "consultant" | "hh" | "lifecycle";
const GROUP_OPTIONS: { key: GroupKey; label: string; Icon: LucideIcon }[] = [
  { key: "none", label: "None", Icon: Ban },
  { key: "consultant", label: "Consultant", Icon: User },
  { key: "hh", label: "Hand-holding status", Icon: CircleDot },
  { key: "lifecycle", label: "Lifecycle", Icon: Building2 },
];

type LifecycleFilter = "active" | "inactive" | "all";

const STORAGE_KEY = "altus.ce.accountsTable.columnVisibility.v1";

interface Row {
  account: CeAccountRow;
  consultantName: string;
  load: Load | undefined;
}

function groupValue(r: Row, by: Exclude<GroupKey, "none">): string {
  if (by === "consultant") return r.consultantName;
  if (by === "hh") return hhStatusMeta(r.account.hhStatus).label;
  return lifecycleLabel(r.account.lifecycleStatus);
}

export function AccountsTable({
  accounts,
  members,
  loads,
  canManage,
  canEdit,
  onOpen,
  onMove,
  onBulkTransfer,
  extraControls,
}: {
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  loads: Record<string, Load>;
  canManage: boolean;
  canEdit: (a: CeAccountRow) => boolean;
  onOpen: (a: CeAccountRow) => void;
  onMove: (a: CeAccountRow) => void;
  /** Bulk "transfer selected to…" — loops ceAssignAccount, same as a single move. */
  onBulkTransfer: (accounts: CeAccountRow[], toMemberId: string) => void;
  /**
   * The board's own cohort + team-member filters, rendered in THIS SAME
   * toolbar row (asked 2026-09-28: "move these filters" — down into the one
   * row Active/Inactive/All, Group by and Columns already share) rather than
   * a second row above it.
   */
  extraControls?: React.ReactNode;
}) {
  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name] as const)), [members]);
  const [lifecycle, setLifecycle] = React.useState<LifecycleFilter>("active");
  const [group, setGroup] = React.useState<GroupKey>("none");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [colMenuOpen, setColMenuOpen] = React.useState(false);
  const [transferTo, setTransferTo] = React.useState("");
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setColumnVisibility(JSON.parse(raw));
    } catch {
      /* private window / blocked storage — fall back to every column shown */
    }
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch {
      /* nothing to persist to — the toggle still works for this session */
    }
  }, [columnVisibility]);

  const rows: Row[] = React.useMemo(
    () =>
      accounts
        .filter((a) => (lifecycle === "all" ? true : lifecycle === "active" ? !isInactiveAccount(a) : isInactiveAccount(a)))
        .map((a) => ({ account: a, consultantName: a.assignedTo ? memberName.get(a.assignedTo) ?? "Unknown" : "Unassigned", load: loads[a.id] })),
    [accounts, lifecycle, memberName, loads],
  );

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            ariaLabel="Select all rows"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={(v) => table.toggleAllRowsSelected(v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox ariaLabel={`Select ${row.original.account.fullName}`} checked={row.getIsSelected()} onChange={(v) => row.toggleSelected(v)} />
        ),
        enableSorting: false,
        size: 36,
      },
      {
        id: "name",
        header: "Participant / Client / Ambassador",
        accessorFn: (r) => r.account.fullName,
        cell: ({ row }) => {
          const a = row.original.account;
          return (
            <button type="button" onClick={() => onOpen(a)} className="max-w-[220px] truncate text-left text-[13px] font-bold text-ink-strong hover:underline">
              {accountLabel(a.fullName, a.batchCode)}
            </button>
          );
        },
        size: 220,
      },
      {
        id: "consultant",
        header: "Consultant",
        accessorFn: (r) => r.consultantName,
        cell: ({ getValue }) => <span className="text-[13px] font-semibold text-ink-strong">{getValue<string>()}</span>,
        size: 150,
      },
      {
        id: "productType",
        header: "Product type",
        accessorFn: (r) => categoryOf(r.account.category)?.label ?? r.account.category,
        cell: ({ getValue }) => <span className="text-[12.5px] text-ink-muted">{getValue<string>()}</span>,
      },
      {
        id: "hh",
        header: "Hand-holding",
        accessorFn: (r) => hhStatusMeta(r.account.hhStatus).label,
        cell: ({ row }) => <HhStatusPill status={row.original.account.hhStatus} showStandard small />,
      },
      {
        id: "lifecycle",
        header: "Lifecycle",
        accessorFn: (r) => lifecycleLabel(r.account.lifecycleStatus),
        cell: ({ getValue }) => <span className="text-[12.5px] text-ink-muted">{getValue<string>()}</span>,
      },
      {
        id: "duration",
        header: "Weekly duration",
        accessorFn: (r) => r.load?.minutes ?? 0,
        cell: ({ getValue }) => <span className="tabular-nums text-[13px] text-ink-strong">{formatDuration(getValue<number>())}</span>,
      },
      {
        id: "calls",
        header: "Weekly calls",
        accessorFn: (r) => r.load?.calls ?? 0,
        cell: ({ getValue }) => <span className="tabular-nums text-[13px] text-ink-strong">{getValue<number>()}</span>,
      },
      {
        id: "tags",
        header: "Tags",
        accessorFn: (r) => r.account.tags.join(", "),
        cell: ({ getValue }) => <span className="truncate text-[12px] text-ink-subtle">{getValue<string>() || "—"}</span>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original.account;
          if (!canEdit(a)) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => onOpen(a)} aria-label={`Edit ${a.fullName}`} className="inline-flex size-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong">
                <Pencil size={13} strokeWidth={2.4} />
              </button>
              {canManage ? (
                <button type="button" onClick={() => onMove(a)} aria-label={`Assign or transfer ${a.fullName}`} className="inline-flex size-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong">
                  <ArrowRightLeft size={13} strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManage, canEdit, onOpen, onMove],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.account.id,
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original.account);
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const FROZEN_WIDTHS: Record<string, number> = { select: 36, name: 220 };
  let running = 0;
  const frozenLeft: Record<string, number> = {};
  for (const col of visibleLeafColumns) {
    if (!(col.id in FROZEN_WIDTHS)) break;
    frozenLeft[col.id] = running;
    running += FROZEN_WIDTHS[col.id]!;
  }

  const groupedRows = React.useMemo(() => {
    const sorted = table.getSortedRowModel().rows;
    if (group === "none") return [{ label: null, rows: sorted }];
    const buckets = new Map<string, typeof sorted>();
    for (const r of sorted) {
      const key = groupValue(r.original, group);
      const list = buckets.get(key) ?? [];
      list.push(r);
      buckets.set(key, list);
    }
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, rows]) => ({ label, rows }));
    // `table` (the useReactTable instance) keeps the SAME object identity
    // across renders — TanStack mutates it in place via setOptions() rather
    // than returning a new one — so it alone is NOT a valid memo dependency:
    // a table/tab/filter change would leave this memo stuck on whatever it
    // first computed (confirmed live: switching category tabs and picking a
    // team member both left the table showing its original rows forever).
    // `rows` and `sorting` are the actual values that change; depend on those
    // — the lint rule cannot see inside `table.getSortedRowModel()`, so it
    // reads them as unused and suggests removing the very fix for that bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, group, rows, sorting]);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {extraControls}
        <div className="inline-flex h-8 items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-soft">
          {(["active", "inactive", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setLifecycle(v)}
              className="h-full px-2.5 text-[12px] font-bold capitalize"
              style={lifecycle === v ? { background: "var(--color-altus-red)", color: "#fff" } : { color: "var(--color-ink-soft)" }}
            >
              {v}
            </button>
          ))}
        </div>

        <Select value={group} onChange={(v) => setGroup(v as GroupKey)} ariaLabel="Group by" className="w-[190px] shrink-0">
          {GROUP_OPTIONS.map((g) => (
            <option key={g.key} value={g.key}>
              Group by: {g.label}
            </option>
          ))}
        </Select>

        <div className="relative">
          <button type="button" onClick={() => setColMenuOpen((v) => !v)} className={BTN_NEUTRAL} aria-expanded={colMenuOpen}>
            <SlidersHorizontal size={13} strokeWidth={2.4} /> Columns
          </button>
          {colMenuOpen ? (
            <div className="absolute left-0 top-9 z-20 w-[220px] rounded-xl border border-hairline bg-surface-card p-1.5" style={{ boxShadow: "0 20px 50px -20px rgba(15,23,42,0.35)" }}>
              {table.getAllLeafColumns().filter((c) => c.id !== "select" && c.id !== "name" && c.id !== "actions").map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-surface-soft">
                  <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} className="size-3.5 accent-[var(--color-altus-red)]" />
                  {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {selectedRows.length ? (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-soft px-2.5 py-1.5">
            <span className="text-[12px] font-bold text-ink-strong">{selectedRows.length} selected</span>
            <Select value={transferTo} onChange={setTransferTo} ariaLabel="Transfer selected to" className="w-[150px] shrink-0">
              <option value="">Transfer to…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className={BTN_NEUTRAL}
              disabled={!transferTo}
              onClick={() => {
                onBulkTransfer(selectedRows, transferTo);
                setRowSelection({});
                setTransferTo("");
              }}
            >
              Go
            </button>
          </div>
        ) : null}
      </div>

      <div className="scroll-x-only rounded-2xl border border-hairline">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft">
              {table.getHeaderGroups()[0]!.headers.map((h) => {
                const sticky = h.column.id in frozenLeft;
                return (
                  <th
                    key={h.id}
                    onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                    className={`whitespace-nowrap px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle ${h.column.getCanSort() ? "cursor-pointer select-none" : ""} ${sticky ? "sticky z-10 bg-surface-soft" : ""}`}
                    style={sticky ? { left: frozenLeft[h.column.id] } : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() ? (
                        h.column.getIsSorted() === "asc" ? (
                          <ArrowUp size={11} />
                        ) : h.column.getIsSorted() === "desc" ? (
                          <ArrowDown size={11} />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40" />
                        )
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((bucket) => (
              <React.Fragment key={bucket.label ?? "__flat__"}>
                {bucket.label !== null ? (
                  <tr>
                    <td colSpan={visibleLeafColumns.length} className="border-b border-t border-hairline bg-surface-soft px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-subtle">
                      {bucket.label} <span className="ml-1 font-semibold normal-case text-ink-muted">({bucket.rows.length})</span>
                    </td>
                  </tr>
                ) : null}
                {bucket.rows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleLeafColumns.length} className="px-3 py-6 text-center text-[12.5px] text-ink-subtle">
                      Nothing here.
                    </td>
                  </tr>
                ) : (
                  bucket.rows.map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-surface-soft" style={row.getIsSelected() ? { background: "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" } : undefined}>
                      {row.getVisibleCells().map((cell) => {
                        const sticky = cell.column.id in frozenLeft;
                        return (
                          <td
                            key={cell.id}
                            className={`px-3 py-2 ${sticky ? "sticky z-[1] bg-surface-card" : ""}`}
                            style={sticky ? { left: frozenLeft[cell.column.id] } : undefined}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
