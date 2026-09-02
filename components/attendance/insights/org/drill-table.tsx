"use client";

import * as React from "react";
import { Search, ChevronRight, X } from "lucide-react";
import type { DashboardRow } from "@/lib/queries/attendance-status";
import { attendanceRatio, punctualityRatio } from "@/lib/attendance/analytics/ratios";
import { bandRate } from "./insight-viz";

/**
 * Per-employee drill table — the roster grounding every aggregate above. Rows
 * respond to the dashboard cross-filter (a KPI/slice selection) and a local
 * search box, and link to the per-person insight dashboard.
 */

/** Cross-filter predicates, keyed by the KPI/slice filter key. */
export const FILTER_META: Record<string, { label: string; test: (r: DashboardRow) => boolean }> = {
  present: { label: "Present days", test: (r) => r.summary.present > 0 },
  absent: { label: "Has absences", test: (r) => r.summary.absent > 0 },
  halfDay: { label: "Half days", test: (r) => r.summary.halfDay > 0 },
  late: { label: "Late marks", test: (r) => r.summary.late > 0 },
  onLeave: { label: "On leave", test: (r) => r.summary.paidLeave + r.summary.unpaidLeave > 0 },
  paidLeave: { label: "Paid leave", test: (r) => r.summary.paidLeave > 0 },
  unpaidLeave: { label: "Unpaid leave", test: (r) => r.summary.unpaidLeave > 0 },
  incomplete: { label: "Incomplete punches", test: (r) => r.summary.incomplete > 0 },
  compOff: { label: "Comp-off redeemed", test: (r) => r.summary.compOff > 0 },
  holidayPresent: { label: "Worked a holiday", test: (r) => r.summary.holidayPresent > 0 },
};

export function DrillTable({
  rows,
  activeFilter,
  onClearFilter,
}: {
  rows: DashboardRow[];
  activeFilter: string | null;
  onClearFilter: () => void;
}) {
  const [q, setQ] = React.useState("");

  const filterMeta = activeFilter ? FILTER_META[activeFilter] : undefined;

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterMeta && !filterMeta.test(r)) return false;
      if (needle) {
        const hay = `${r.name} ${r.department ?? ""} ${r.designation ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, filterMeta]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="relative inline-flex items-center">
            <Search size={15} strokeWidth={2.3} className="absolute left-3 text-ink-soft" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Local search — people or departments" title="Local search — filters only the list on this page" aria-label="Local search — people or departments — this page only"
              className="h-9 w-[260px] max-sm:w-[200px] rounded-full border border-hairline bg-surface-soft pl-9 pr-3 text-[13.5px] font-medium text-ink-strong placeholder:text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
            />
          </label>
          {filterMeta && (
            <button
              type="button"
              onClick={onClearFilter}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              {filterMeta.label}
              <X size={13} strokeWidth={2.6} />
            </button>
          )}
        </div>
        <span className="text-[12.5px] font-semibold text-ink-muted tabular-nums">
          {shown.length} of {rows.length} people
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
          <p className="text-[13.5px] font-medium text-ink-muted">No employees match the current filter.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 820 }}>
            <thead>
              <tr className="border-b border-hairline-strong">
                <Th align="left">Employee</Th>
                <Th align="right">Present</Th>
                <Th align="right">Absent</Th>
                <Th align="right">Half</Th>
                <Th align="right">Late</Th>
                <Th align="right">Leave</Th>
                <Th align="right">Avg Hrs</Th>
                <Th align="right">Attend.</Th>
                <Th align="right">Punct.</Th>
                <Th align="right">Payable</Th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const s = r.summary;
                const att = s.present + s.halfDay + s.holidayPresent + s.holidayHalfDay;
                const avgHrs = att > 0 ? s.totalWorkedMinutes / 60 / att : 0;
                const attPct = Math.round(attendanceRatio(s) * 100);
                const punPct = Math.round(punctualityRatio(s) * 100);
                const atTone = bandRate(attPct);
                const puTone = bandRate(punPct);
                return (
                  <tr key={r.employeeId} className="group border-b border-hairline transition-colors hover:bg-surface-soft">
                    <td className="py-2.5 px-3">
                      <a
                        href={`/attendance/insights/employee/${r.employeeId}`}
                        className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50 rounded"
                      >
                        <span className="block truncate font-bold text-ink-strong group-hover:text-[var(--color-altus-red-deep)]" style={{ fontSize: 13.5 }}>
                          {r.name}
                        </span>
                        <span className="block truncate text-[12px] font-medium text-ink-muted">
                          {r.department ?? "Unassigned"}
                        </span>
                      </a>
                    </td>
                    <Num v={s.present} />
                    <Num v={s.absent} tone={s.absent > 0 ? "var(--color-altus-red-deep)" : undefined} />
                    <Num v={s.halfDay} tone={s.halfDay > 0 ? "var(--color-amber-deep)" : undefined} />
                    <Num v={s.late} tone={s.late > 0 ? "var(--color-amber-deep)" : undefined} />
                    <Num v={s.paidLeave + s.unpaidLeave} />
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-ink-strong" style={{ fontSize: 13 }}>
                      {avgHrs.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="tabular-nums font-black" style={{ fontSize: 13, color: atTone.deep }}>{attPct}%</span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="tabular-nums font-black" style={{ fontSize: 13, color: puTone.deep }}>{punPct}%</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-ink-strong" style={{ fontSize: 13 }}>
                      {Number.isInteger(s.payableDays) ? s.payableDays : s.payableDays.toFixed(1)}
                    </td>
                    <td className="py-2.5 pr-2 text-right">
                      <ChevronRight size={15} strokeWidth={2.4} className="inline text-ink-soft group-hover:text-[var(--color-altus-red)]" aria-hidden />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`py-2.5 px-3 text-[11px] font-black uppercase tracking-[0.08em] text-ink-soft ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Num({ v, tone }: { v: number; tone?: string }) {
  return (
    <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ fontSize: 13, color: tone ?? (v > 0 ? "var(--color-ink-strong)" : "var(--color-ink-muted)") }}>
      {v}
    </td>
  );
}
