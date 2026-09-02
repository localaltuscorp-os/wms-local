"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Search, X, Users, ChevronRight } from "lucide-react";
import type { EmployeeStatusRow, ViewMode } from "@/lib/types";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

type Tone = "green" | "amber" | "red" | "rose";

function Pill({ value, tone }: { value: number; tone: Tone }) {
  if (value === 0) {
    return <span className="text-ink-subtle text-mono">0</span>;
  }
  return (
    <span
      className="inline-flex items-center justify-center px-3 py-1.5 rounded-pill text-[15px] font-bold tabular-nums"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 15%, transparent)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      {value}
    </span>
  );
}

function buildColumns(): ColumnDef<EmployeeStatusRow>[] {
  return [
    {
      accessorKey: "employeeName",
      header: "Employee",
      cell: (info) => (
        <span className="inline-flex items-center gap-3">
          <EmployeeAvatar
            name={info.row.original.employeeName}
            size="sm"
          />
          <span
            className="text-ink-strong font-bold"
            style={{ fontSize: 16 }}
          >
            {info.row.original.employeeName}
          </span>
        </span>
      ),
    },
    { accessorKey: "department", header: "Department" },
    {
      accessorKey: "criticalCount",
      header: "Critical",
      cell: (info) => {
        const n = info.getValue<number>();
        return n > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <CriticalBadge />
            <span className="text-display-3xs tabular-nums">{n}</span>
          </span>
        ) : (
          <span className="text-ink-subtle text-mono">0</span>
        );
      },
    },
    {
      accessorKey: "done",
      header: "Done",
      cell: (info) => <Pill value={info.getValue<number>()} tone="green" />,
    },
    {
      accessorKey: "pendingTotal",
      header: "Pending",
      cell: (info) => <Pill value={info.getValue<number>()} tone="amber" />,
    },
    {
      accessorKey: "notApproved",
      header: "Not Approved",
      cell: (info) => <Pill value={info.getValue<number>()} tone="red" />,
    },
    {
      accessorKey: "cancelled",
      header: "Cancelled",
      cell: (info) => <Pill value={info.getValue<number>()} tone="rose" />,
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: (info) => (
        <span className="text-display-3xs text-ink-strong">
          {info.getValue<number>()}
        </span>
      ),
    },
  ];
}

const DEPT_TONES = [
  "blue",
  "green",
  "amber",
  "purple",
  "rose",
] as const;

function deptTone(name: string): (typeof DEPT_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return DEPT_TONES[Math.abs(hash) % DEPT_TONES.length]!;
}

export function StatusTable({
  rows,
  view,
}: {
  rows: EmployeeStatusRow[];
  view: ViewMode;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [selectedDept, setSelectedDept] = React.useState<string | null>(null);

  // Whole-row navigation — anyone can click anywhere on the row (or
  // Tab to it and hit Enter/Space) to drill into that person's tasks.
  const hrefFor = React.useCallback(
    (employeeId: string): Route => {
      const viewParam = view === "initiator" ? "&view=initiator" : "";
      return `/tasks?emp=${employeeId}${viewParam}` as Route;
    },
    [view],
  );

  const departments = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (selectedDept && r.department !== selectedDept) return false;
      if (q && !r.employeeName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, selectedDept]);

  const columns = React.useMemo(() => buildColumns(), []);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const hasActiveFilter = query.trim().length > 0 || selectedDept !== null;

  return (
    <section
      className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12"
      style={{
        opacity: 0,
        animation: "fadeUp 500ms ease-out 700ms forwards",
      }}
    >
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-strong)" }}
          >
            <Users size={20} strokeWidth={2.2} />
          </span>
          <div>
          <h2 className="text-display-lg text-ink-strong">
            Status by {view === "doer" ? "Doer" : "Initiator"}
          </h2>
          <p className="text-body-lg text-ink-subtle mt-1">
            {hasActiveFilter ? (
              <>
                Showing{" "}
                <span className="text-ink-strong font-bold tabular-nums">
                  {filtered.length}
                </span>{" "}
                of {rows.length} {rows.length === 1 ? "person" : "people"}
              </>
            ) : (
              <>Tasks broken down per person</>
            )}
          </p>
          </div>
        </div>
      </header>

      <FilterBar
        query={query}
        onQuery={setQuery}
        departments={departments}
        selectedDept={selectedDept}
        onDept={setSelectedDept}
        hasActiveFilter={hasActiveFilter}
        onClear={() => {
          setQuery("");
          setSelectedDept(null);
        }}
      />

      {filtered.length === 0 ? (
        <div
          className="bg-surface-card rounded-section border border-hairline p-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="text-body-lg text-ink-subtle">
            {rows.length === 0
              ? "No data for the current filter."
              : "No employees match your search."}
          </p>
          {hasActiveFilter && rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedDept(null);
              }}
              className="mt-3 text-cta text-altus-red hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div
          className="bg-surface-card rounded-section border border-hairline overflow-x-auto"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full min-w-[720px]">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-hairline">
                  {hg.headers.map((h, i) => (
                    <th
                      key={h.id}
                      className={`px-5 py-4 text-table-head whitespace-nowrap ${
                        i <= 1 ? "text-left" : "text-right"
                      } ${i === 0 ? "sticky left-0 z-10 bg-surface-card" : ""}`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                  {/* Chevron column header — silent, just claims width */}
                  <th aria-hidden style={{ width: 36 }} />
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const empId = row.original.employeeId;
                const empName = row.original.employeeName;
                const target = hrefFor(empId);
                return (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${empName}'s tasks`}
                    onClick={() => router.push(target)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(target);
                      }
                    }}
                    className="status-row border-b border-hairline last:border-b-0"
                    style={{ cursor: "pointer" }}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <td
                        key={cell.id}
                        className={`px-5 py-4 text-body-lg whitespace-nowrap ${
                          i === 0
                            ? "text-ink-strong sticky left-0 z-10 bg-surface-card"
                            : i === 1
                              ? "text-ink-muted"
                              : "text-right"
                        }`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell ?? ((c) => c.getValue()),
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                    {/* Chevron — telegraphs the row is a link target */}
                    <td
                      className="status-row-chevron px-2"
                      aria-hidden
                      style={{ color: "var(--color-ink-subtle)" }}
                    >
                      <ChevronRight size={18} strokeWidth={2.2} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FilterBar({
  query,
  onQuery,
  departments,
  selectedDept,
  onDept,
  hasActiveFilter,
  onClear,
}: {
  query: string;
  onQuery: (v: string) => void;
  departments: string[];
  selectedDept: string | null;
  onDept: (d: string | null) => void;
  hasActiveFilter: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
      {/* Search */}
      <div
        className="relative flex items-center bg-surface-card border border-hairline rounded-chip pl-3 pr-2 h-10 min-w-[260px] max-md:min-w-full max-md:w-full transition-shadow focus-within:border-hairline-strong"
        style={{
          boxShadow: query
            ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 12%, transparent), 0 1px 2px rgba(15,23,42,0.04)"
            : "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        <Search className="size-4 text-ink-subtle shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search employees…"
          className="flex-1 bg-transparent border-0 outline-none px-2.5 text-body-lg text-ink placeholder:text-ink-subtle"
          aria-label="Search employees"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            className="size-6 inline-flex items-center justify-center rounded-full hover:bg-surface-soft transition-colors text-ink-subtle hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Department chips */}
      {departments.length > 0 && (
        <div className="inline-flex items-center gap-1.5 flex-wrap">
          <DeptChip
            label="All"
            tone="ink"
            active={selectedDept === null}
            onClick={() => onDept(null)}
            icon={<Users className="size-3.5" />}
          />
          {departments.map((d) => (
            <DeptChip
              key={d}
              label={d}
              tone={deptTone(d)}
              active={selectedDept === d}
              onClick={() => onDept(selectedDept === d ? null : d)}
            />
          ))}
        </div>
      )}

      {/* Clear all */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-muted hover:text-altus-red transition-colors"
        >
          <X className="size-3.5" />
          Clear filters
        </button>
      )}
    </div>
  );
}

function DeptChip({
  label,
  tone,
  active,
  onClick,
  icon,
}: {
  label: string;
  tone: (typeof DEPT_TONES)[number] | "ink";
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const base =
    tone === "ink"
      ? {
          bg: "color-mix(in srgb, #0f172a 6%, transparent)",
          activeBg:
            "linear-gradient(135deg, #1f2937, #0f172a)",
          fg: "var(--color-ink-strong)",
          activeFg: "#ffffff",
        }
      : {
          bg: `color-mix(in srgb, var(--color-${tone}) 10%, transparent)`,
          activeBg: `linear-gradient(135deg, var(--color-${tone}), var(--color-${tone}-deep))`,
          fg: `var(--color-${tone}-deep)`,
          activeFg: "#ffffff",
        };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-[13px] font-bold transition-all duration-200"
      style={{
        background: active ? base.activeBg : base.bg,
        color: active ? base.activeFg : base.fg,
        boxShadow: active
          ? "0 4px 12px rgba(15, 23, 42, 0.12)"
          : "none",
        transform: active ? "translateY(-1px)" : "translateY(0)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
