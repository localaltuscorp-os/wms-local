"use client";

import * as React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { DepartmentRollup } from "@/lib/attendance/analytics/org";
import { bandRate } from "./insight-viz";

/**
 * Sortable department roll-up table — attendance / punctuality / hours / late
 * per department, colour-banded. Click a column header to sort.
 */

type SortKey = keyof Pick<
  DepartmentRollup,
  "department" | "headcount" | "attendanceRatePct" | "punctualityRatePct" | "avgHoursPerDay" | "late" | "absent" | "payableDays"
>;

const COLUMNS: { key: SortKey; label: string; numeric: boolean; align: "left" | "right" }[] = [
  { key: "department", label: "Department", numeric: false, align: "left" },
  { key: "headcount", label: "Headcount", numeric: true, align: "right" },
  { key: "attendanceRatePct", label: "Attendance", numeric: true, align: "right" },
  { key: "punctualityRatePct", label: "Punctuality", numeric: true, align: "right" },
  { key: "avgHoursPerDay", label: "Avg Hrs/Day", numeric: true, align: "right" },
  { key: "late", label: "Late", numeric: true, align: "right" },
  { key: "absent", label: "Absent", numeric: true, align: "right" },
  { key: "payableDays", label: "Payable", numeric: true, align: "right" },
];

export function DepartmentTable({ departments }: { departments: DepartmentRollup[] }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("headcount");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => {
    const rows = [...departments];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return dir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return rows;
  }, [departments, sortKey, dir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "department" ? "asc" : "desc");
    }
  }

  if (departments.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
        <p className="text-[13.5px] font-medium text-ink-muted">No department data for this month.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 720 }}>
        <thead>
          <tr className="border-b border-hairline-strong">
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`py-2.5 px-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.08em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50 rounded ${
                      col.align === "right" ? "flex-row-reverse" : ""
                    } ${active ? "text-[var(--color-altus-red-deep)]" : "text-ink-soft hover:text-ink-strong"}`}
                  >
                    <Icon size={12} strokeWidth={2.4} />
                    {col.label}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => {
            const at = bandRate(d.attendanceRatePct);
            const pu = bandRate(d.punctualityRatePct);
            return (
              <tr key={d.department} className="border-b border-hairline transition-colors hover:bg-surface-soft">
                <td className="py-2.5 px-3">
                  <span className="font-bold text-ink-strong" style={{ fontSize: 13.5 }}>{d.department}</span>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-ink-strong" style={{ fontSize: 13.5 }}>
                  {d.headcount}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <RatePill value={d.attendanceRatePct} tone={at.deep} />
                </td>
                <td className="py-2.5 px-3 text-right">
                  <RatePill value={d.punctualityRatePct} tone={pu.deep} />
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-ink-strong" style={{ fontSize: 13.5 }}>
                  {d.avgHoursPerDay.toFixed(1)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ fontSize: 13.5, color: d.late > 0 ? "var(--color-amber-deep)" : "var(--color-ink-muted)" }}>
                  {d.late}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ fontSize: 13.5, color: d.absent > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-muted)" }}>
                  {d.absent}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold text-ink-strong" style={{ fontSize: 13.5 }}>
                  {Number.isInteger(d.payableDays) ? d.payableDays : d.payableDays.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RatePill({ value, tone }: { value: number; tone: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 tabular-nums font-black"
      style={{ fontSize: 12.5, color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
    >
      {value}%
    </span>
  );
}
