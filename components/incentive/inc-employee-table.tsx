"use client";

import * as React from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatInr } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import type { IncentiveDashboard as DashboardData } from "@/lib/queries/incentives";

type Row = DashboardData["perEmployee"][number];
type SortKey = "name" | "permanent" | "project" | "total" | "paid" | "unpaid";

const GREEN_DEEP = "#15803d";

/**
 * Premium per-employee YTD ledger: client-side search + column sort over the
 * rows the server already loaded. Names keep the `data-incentive-person`
 * attribute so the existing dashboard drill-down delegation still opens the
 * person dialog — zero behaviour change, zero new queries.
 */
export function IncEmployeeTable({
  rows,
  totals,
}: {
  rows: Row[];
  totals: { permanent: number; project: number; total: number; paid: number; unpaid: number };
}) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "total",
    dir: "desc",
  });

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows.slice();
    base.sort((a, b) => {
      const va = sort.key === "name" ? a.name.toLowerCase() : a[sort.key];
      const vb = sort.key === "name" ? b.name.toLowerCase() : b[sort.key];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [rows, q, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div>
      {/* Search */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <label
          className="flex h-10 w-full max-w-[300px] items-center gap-2 rounded-xl bg-surface-card px-3.5"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
        >
          <Search size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — employee" title="Local search — filters only the list on this page" aria-label="Local search — employee — this page only"
            className="w-full bg-transparent text-[14px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
          />
        </label>
        <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
          {filtered.length} of {rows.length} employee{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <SortTh label="Employee" k="name" sort={sort} onSort={toggleSort} />
              <SortTh label="Permanent" k="permanent" sort={sort} onSort={toggleSort} align="right" />
              <SortTh label="Project" k="project" sort={sort} onSort={toggleSort} align="right" />
              <SortTh label="YTD Total" k="total" sort={sort} onSort={toggleSort} align="right" />
              <SortTh label="Paid" k="paid" sort={sort} onSort={toggleSort} align="right" />
              <SortTh label="Unpaid" k="unpaid" sort={sort} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[14px] font-semibold text-ink-subtle">
                  No employees match “{q}”.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const share = (r.total / maxTotal) * 100;
                return (
                  <tr
                    key={r.name}
                    className="group border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                    style={{ borderColor: "var(--color-hairline)" }}
                  >
                    <td className="py-2.5 pr-3 min-w-[220px]">
                      <button
                        type="button"
                        data-incentive-person={r.name}
                        className="flex w-full cursor-pointer items-center gap-2.5 text-left"
                      >
                        <EmployeeAvatar name={r.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold text-ink-strong transition-colors group-hover:text-[#A80400]">
                            {r.name}
                          </span>
                          <span
                            aria-hidden
                            className="mt-1 block h-1 w-full max-w-[140px] overflow-hidden rounded-full"
                            style={{ background: "var(--color-hairline)" }}
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.max(2, share)}%`,
                                background: "linear-gradient(90deg, #E10600, #A80400)",
                              }}
                            />
                          </span>
                        </span>
                      </button>
                    </td>
                    <Money v={r.permanent} />
                    <Money v={r.project} />
                    <Money v={r.total} bold />
                    <Money v={r.paid} color={GREEN_DEEP} />
                    <Money
                      v={r.unpaid}
                      color={r.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)"}
                    />
                  </tr>
                );
              })
            )}
            {/* Totals row — always the full-year totals, independent of the filter */}
            <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
              <td className="py-3 text-[13px] font-black uppercase tracking-[0.04em] text-ink-strong">
                Total
              </td>
              <Money v={totals.permanent} bold />
              <Money v={totals.project} bold />
              <Money v={totals.total} bold />
              <Money v={totals.paid} bold color={GREEN_DEEP} />
              <Money v={totals.unpaid} bold color={totals.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)"} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className="pb-2 whitespace-nowrap"
      style={{ textAlign: align }}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
          active ? "text-ink-strong" : "text-ink-subtle hover:text-ink-soft"
        }`}
        style={{ flexDirection: align === "right" ? "row-reverse" : "row" }}
      >
        {label}
        <Icon size={12} strokeWidth={2.6} style={{ color: active ? "#A80400" : undefined }} aria-hidden />
      </button>
    </th>
  );
}

function Money({ v, bold = false, color }: { v: number; bold?: boolean; color?: string }) {
  return (
    <td
      className={`py-2.5 pl-3 whitespace-nowrap text-right tabular-nums ${
        bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"
      }`}
      style={{ fontSize: 14, color }}
    >
      {formatInr(v)}
    </td>
  );
}
