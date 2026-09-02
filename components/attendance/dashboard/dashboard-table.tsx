"use client";

import * as React from "react";
import { Search } from "lucide-react";
import type { DashboardRow } from "@/lib/queries/attendance-status";
import { EmployeeDetailDialog } from "./employee-detail";

export function AttendanceDashboardTable({
  rows,
  year,
  month,
}: {
  rows: DashboardRow[];
  year: number;
  month: number;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            strokeWidth={2.2}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by employee…"
            aria-label="Search employees"
            className="w-full h-11 pl-10 pr-9 rounded-pill border border-hairline bg-surface-card text-[15px] text-ink-strong placeholder:text-ink-subtle outline-none transition-all focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
        </div>
        <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
          {filtered.length} {filtered.length === 1 ? "person" : "people"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center font-semibold text-ink-subtle" style={{ fontSize: 14 }}>
          {rows.length === 0
            ? "No active employees for this month."
            : "No employees match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full border-collapse min-w-[1080px]">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                <Th>Employee</Th>
                <Th align="right">Present</Th>
                <Th align="right">Absent</Th>
                <Th align="right">Half-Day</Th>
                <Th align="right">Late</Th>
                <Th align="right">Left-Early</Th>
                <Th align="right">Late-Waived</Th>
                <Th align="right">Weekly-Off</Th>
                <Th align="right">Holiday</Th>
                <Th align="right" hint="Holiday Present">HP</Th>
                <Th align="right">Paid Leave</Th>
                <Th align="right">Unpaid Leave</Th>
                <Th align="right">Comp-Off</Th>
                <Th align="right">Payable Days</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const s = r.summary;
                return (
                  <tr
                    key={r.employeeId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected({ id: r.employeeId, name: r.name })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected({ id: r.employeeId, name: r.name });
                      }
                    }}
                    className="border-t cursor-pointer transition-colors hover:bg-surface-soft focus:bg-surface-soft outline-none"
                    style={{
                      borderColor: "var(--color-hairline)",
                      background:
                        i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                    }}
                  >
                    <td
                      className="px-3 py-3 font-semibold text-ink-strong whitespace-nowrap"
                      style={{ fontSize: 14 }}
                    >
                      {r.name}
                    </td>
                    <Td align="right">{s.present}</Td>
                    <Td align="right">{s.absent}</Td>
                    <Td align="right">{s.halfDay}</Td>
                    <Td
                      align="right"
                      style={s.late > 0 ? { color: "var(--color-red-deep)" } : undefined}
                    >
                      {s.late}
                    </Td>
                    <Td align="right">{s.leftEarly}</Td>
                    <Td
                      align="right"
                      style={
                        s.lateWaived > 0 ? { color: "var(--color-amber-deep)" } : undefined
                      }
                    >
                      {s.lateWaived}
                    </Td>
                    <Td align="right">{s.weeklyOff}</Td>
                    <Td align="right">{s.holiday}</Td>
                    <Td
                      align="right"
                      style={
                        s.holidayPresent > 0 ? { color: "var(--color-green-deep)" } : undefined
                      }
                    >
                      {s.holidayPresent}
                    </Td>
                    <Td
                      align="right"
                      style={
                        s.paidLeave > 0 ? { color: "var(--color-blue-deep)" } : undefined
                      }
                    >
                      {s.paidLeave}
                    </Td>
                    <Td align="right">{s.unpaidLeave}</Td>
                    <Td
                      align="right"
                      style={
                        s.compOff > 0 ? { color: "var(--color-teal-deep)" } : undefined
                      }
                    >
                      {s.compOff}
                    </Td>
                    <td
                      className="px-3 py-3 text-right font-black text-ink-strong tabular-nums whitespace-nowrap"
                      style={{ fontSize: 14 }}
                    >
                      {s.payableDays}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EmployeeDetailDialog
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        employeeId={selected?.id ?? null}
        employeeName={selected?.name ?? ""}
        year={year}
        month={month}
      />
    </section>
  );
}

function Th({
  children,
  align = "left",
  hint,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  hint?: string;
}) {
  return (
    <th
      className="px-3 pb-3 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align }}
      title={hint}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {hint && (
          <span
            className="rounded px-1 py-0.5 text-[9px] font-bold tracking-wide"
            style={{
              background: "var(--color-surface-track)",
              color: "var(--color-ink-subtle)",
            }}
          >
            {hint}
          </span>
        )}
      </span>
    </th>
  );
}

function Td({
  children,
  align = "left",
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <td
      className="px-3 py-3 font-semibold text-ink-soft tabular-nums whitespace-nowrap"
      style={{ fontSize: 14, textAlign: align, ...style }}
    >
      {children}
    </td>
  );
}
