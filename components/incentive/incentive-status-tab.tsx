"use client";

import * as React from "react";
import { SlidersHorizontal, Users, Search } from "lucide-react";
import { formatInr } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import type { EmployeeOption } from "@/lib/queries/employees";
import type {
  IncentiveStatusReport as StatusReport,
  IncentiveEntryStatusRow,
} from "@/lib/queries/incentive-status";
import { IncentiveStatusReport } from "./incentive-status-report";
import { IncentiveStatusEditor } from "./incentive-status-editor";
import { IncentiveTeamSplit } from "./incentive-team-split";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const AMBER = "#d97706";

/**
 * WS-6 Status tab — the three-status report plus, for admins, an editor to set
 * each incentive's Booked/Accrued/Paid amounts and a team-split editor. This
 * whole tab is only mounted when the INCENTIVE_STATUS_UI kill-switch is on (the
 * page decides), so live users never see it until Sir flips the flag.
 */
export function IncentiveStatusTab({
  report,
  entries,
  employees,
  year,
  isAdmin,
}: {
  report: StatusReport;
  entries: IncentiveEntryStatusRow[];
  employees: EmployeeOption[];
  year: number;
  isAdmin: boolean;
}) {
  const [statusRow, setStatusRow] = React.useState<IncentiveEntryStatusRow | null>(null);
  const [splitRow, setSplitRow] = React.useState<IncentiveEntryStatusRow | null>(null);
  const [q, setQ] = React.useState("");

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? entries.filter(
          (e) =>
            e.empName.toLowerCase().includes(needle) ||
            e.incentiveName.toLowerCase().includes(needle),
        )
      : entries;
  }, [entries, q]);

  return (
    <div className="space-y-7">
      <IncentiveStatusReport report={report} />

      {isAdmin && (
        <section
          className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
          style={{
            boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
            animationDelay: "240ms",
          }}
        >
          <header className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-grid size-9 place-items-center rounded-xl"
                style={{ background: `color-mix(in srgb, #E10600 10%, transparent)`, color: "#A80400" }}
              >
                <SlidersHorizontal size={18} strokeWidth={2.3} />
              </span>
              <div>
                <h2
                  className="text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: 20,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Set Status & Team Split
                </h2>
                <p className="text-[13px] font-medium text-ink-subtle">
                  Set each incentive’s Booked / Accrued / Paid, or divide it among the team · {year}
                </p>
              </div>
            </div>
            <label
              className="flex h-10 w-full max-w-[260px] items-center gap-2 rounded-xl bg-surface-card px-3.5"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
            >
              <Search size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Local search — incentive or person" title="Local search — filters only the list on this page" aria-label="Local search — incentive or person — this page only"
                className="w-full bg-transparent text-[14px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
              />
            </label>
          </header>

          {entries.length === 0 ? (
            <p className="font-semibold text-ink-subtle" style={{ fontSize: 14 }}>
              No permanent incentive entries this year. Add entries from the Entries tab first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Incentive</Th>
                    <Th align="right" color={AMBER}>Booked</Th>
                    <Th align="right" color={GREEN}>Accrued</Th>
                    <Th align="right" color={GREEN_DEEP}>Paid</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[14px] font-semibold text-ink-subtle">
                        No incentives match “{q}”.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                      style={{ borderColor: "var(--color-hairline)" }}
                    >
                      <td className="px-1 py-2.5 whitespace-nowrap" style={{ fontSize: 13.5 }}>
                        <span className="flex items-center gap-2.5">
                          <EmployeeAvatar name={r.empName} size="sm" />
                          <span className="font-bold text-ink-strong">{r.empName}</span>
                          {r.participantCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
                              style={{ background: `color-mix(in srgb, #E10600 12%, transparent)`, color: "#A80400" }}
                            >
                              <Users size={10} strokeWidth={2.6} />
                              {r.participantCount}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-1 py-2.5 font-semibold text-ink-soft whitespace-nowrap" style={{ fontSize: 13.5 }}>
                        {r.incentiveName}
                      </td>
                      <Td align="right">{formatInr(r.booked)}</Td>
                      <Td align="right">{formatInr(r.accrued)}</Td>
                      <Td align="right" bold color={GREEN_DEEP}>{formatInr(r.paid)}</Td>
                      <td className="px-1 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setStatusRow(r)}
                            className="bg-surface-card wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-soft transition-colors hover:text-ink-strong"
                            style={{ fontSize: 12, fontWeight: 700, boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                          >
                            <SlidersHorizontal size={12} strokeWidth={2.4} />
                            Status
                          </button>
                          <button
                            type="button"
                            onClick={() => setSplitRow(r)}
                            className="bg-surface-card wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-soft transition-colors hover:text-ink-strong"
                            style={{ fontSize: 12, fontWeight: 700, boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                          >
                            <Users size={12} strokeWidth={2.4} />
                            Split
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <>
          <IncentiveStatusEditor row={statusRow} onClose={() => setStatusRow(null)} />
          <IncentiveTeamSplit row={splitRow} employees={employees} onClose={() => setSplitRow(null)} />
        </>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  color?: string;
}) {
  return (
    <th
      className="px-1 pb-2 uppercase font-bold tracking-[0.06em] whitespace-nowrap"
      style={{ fontSize: 10.5, textAlign: align, color: color ?? "var(--color-ink-subtle)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
  color?: string;
}) {
  return (
    <td
      className={`px-1 py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black" : "font-semibold"}`}
      style={{ fontSize: 13.5, textAlign: align, color: color ?? (bold ? "var(--color-ink-strong)" : "var(--color-ink-soft)") }}
    >
      {children}
    </td>
  );
}
