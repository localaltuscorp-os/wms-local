"use client";

import * as React from "react";
import { BadgeIndianRupee, BarChart3, ChevronDown, FolderKanban, PieChart, Tags, Trophy, Users } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { IncentiveDashboard as DashboardData } from "@/lib/queries/incentives";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { IncentiveMonthlyChart } from "./incentive-monthly-chart";
import { IncentiveNameChart } from "./incentive-name-chart";
import { IncentiveDashboardDrilldown } from "./incentive-dashboard-drilldown";
import { IncEmployeeTable } from "./inc-employee-table";
import { IncentiveSection } from "./ui/chrome";
import { IncentiveKpi, IncentiveKpiRow } from "./ui/kpi";
import { toneBase, toneInk } from "./ui/tone";

type NameRow = DashboardData["perIncentiveName"][number];

/**
 * THE COMPANY YEAR OVERVIEW — "Trends".
 *
 * Same data, same drill-down, same company-wide gate. Two things changed:
 *
 *  · WHERE IT SITS. It used to be a `<details>` disclosure ABOVE the dashboard's
 *    own table — a second dashboard folded into the first. It is the last band
 *    of the dashboard now, under the table that answers the daily question, and
 *    collapsed by default so it costs nothing until it is wanted.
 *  · THE PODIUM IS GONE. Three gradient cards with medals listed the same top
 *    three the ranked list directly beneath them already showed, with the same
 *    totals. The list stayed; the duplicate went.
 */
export function IncentiveDashboard({ data, year }: { data: DashboardData; year: number }) {
  const { permanent, project, perEmployee, perIncentiveName, monthly, leaderboard } = data;

  // The band is collapsed by default. A closed <details> hides its children with
  // `display: none`, and recharts measures every ResponsiveContainer on mount —
  // inside a hidden box it reads width -1 / height -1 and logs a console warning
  // per chart. Mount the body only while open so the charts never render into a
  // zero-size container (and the collapsed band stays as cheap as it looks).
  const [trendsOpen, setTrendsOpen] = React.useState(false);

  // NOTE: per-employee × per-month figures are not exposed by getIncentiveDashboard
  // (it returns a company-wide `monthly` series + per-employee YTD totals). We render
  // the exact per-employee Permanent / Project / YTD / Paid / Unpaid columns and keep
  // the month breakdown in the company-wide Monthly chart above, rather than inventing
  // per-person monthly splits the summary can't support.
  const empTotal = perEmployee.reduce((s, r) => s + r.total, 0);
  const empPaid = perEmployee.reduce((s, r) => s + r.paid, 0);
  const empUnpaid = perEmployee.reduce((s, r) => s + r.unpaid, 0);

  const nameApproved = perIncentiveName.reduce((s, r) => s + r.approved, 0);
  const namePaid = perIncentiveName.reduce((s, r) => s + r.paid, 0);
  const nameUnpaid = perIncentiveName.reduce((s, r) => s + r.unpaid, 0);
  // Project roll-up row (project ledger isn't split by name in the summary).
  const projectRow = project.approved > 0 || project.paid > 0;

  const leaderTotal = leaderboard.reduce((s, r) => s + r.total, 0);

  const nameColumns: DataTableColumn<NameRow>[] = [
    {
      key: "name",
      label: "Incentive",
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => <span className="text-[13.5px] font-semibold text-ink-strong">{r.name}</span>,
    },
    {
      key: "count",
      label: "Count",
      align: "right",
      sortValue: (r) => r.count,
      render: (r) => <span className="text-[13px] tabular-nums">{r.count}</span>,
    },
    {
      key: "approved",
      label: "YTD",
      align: "right",
      sortValue: (r) => r.approved,
      render: (r) => (
        <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(r.approved)}</span>
      ),
    },
    {
      key: "paid",
      label: "Paid",
      align: "right",
      sortValue: (r) => r.paid,
      render: (r) => (
        <span className="text-[13px] tabular-nums" style={{ color: toneInk("teal") }}>
          {formatInr(r.paid)}
        </span>
      ),
    },
    {
      key: "unpaid",
      label: "Unpaid",
      align: "right",
      sortValue: (r) => r.unpaid,
      render: (r) => (
        <span
          className="text-[13px] tabular-nums"
          style={{ color: r.unpaid > 0 ? toneInk("red") : "var(--color-ink-subtle)" }}
        >
          {formatInr(r.unpaid)}
        </span>
      ),
    },
  ];

  return (
    <IncentiveDashboardDrilldown year={year}>
      <details
        open={trendsOpen}
        onToggle={(e) => setTrendsOpen(e.currentTarget.open)}
        className="group rounded-2xl border border-hairline bg-surface-card"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13.5px] font-bold text-ink-strong">
          <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />
          Trends · {year}
          <span className="text-[12.5px] font-medium text-ink-subtle">
            company monthly charts, leaderboard and incentive-name totals
          </span>
        </summary>

        {trendsOpen ? (
        <div className="space-y-3 border-t border-hairline p-4 max-md:p-3">
          {/* Ledger split: permanent vs project */}
          <IncentiveKpiRow cols={4}>
            <IncentiveKpi
              label="Permanent · YTD"
              value={formatInr(permanent.approved)}
              caption={`${formatInr(permanent.paid)} paid · ${formatInr(permanent.unpaid)} unpaid`}
              tone="green"
              icon={<BadgeIndianRupee size={13} strokeWidth={2.4} />}
              progress={permanent.approved > 0 ? permanent.paid / permanent.approved : null}
            />
            <IncentiveKpi
              label="Project · YTD"
              value={formatInr(project.approved)}
              caption={`${formatInr(project.paid)} paid · ${formatInr(project.unpaid)} unpaid`}
              tone="blue"
              icon={<FolderKanban size={13} strokeWidth={2.4} />}
              progress={project.approved > 0 ? project.paid / project.approved : null}
            />
            <IncentiveKpi
              label="Company YTD"
              value={formatInr(permanent.approved + project.approved)}
              caption="permanent + project"
              tone="slate"
              icon={<Tags size={13} strokeWidth={2.4} />}
            />
            <IncentiveKpi
              label="Earners"
              value={String(leaderboard.length)}
              caption="people with incentive this year"
              tone="red"
              icon={<Users size={13} strokeWidth={2.4} />}
            />
          </IncentiveKpiRow>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <IncentiveSection title="Monthly incentive" hint="Permanent vs project per month">
              <IncentiveMonthlyChart rows={monthly} />
            </IncentiveSection>
            <IncentiveSection title="Incentive mix" hint="Permanent incentives by name">
              <IncentiveNameChart rows={perIncentiveName} />
            </IncentiveSection>
          </div>

          {/* Leaderboard */}
          <IncentiveSection title="Leaderboard" hint="Top earners by YTD incentive">
            {leaderboard.length === 0 ? (
              <p className="text-[13.5px] font-medium text-ink-subtle">No earners this year yet.</p>
            ) : (
              <ol className="space-y-2">
                {leaderboard.map((row, i) => {
                  const share = leaderTotal > 0 ? (row.total / leaderTotal) * 100 : 0;
                  return (
                    <li key={row.name} className="flex items-center gap-2.5">
                      <span className="w-5 shrink-0 text-right text-[13px] font-bold tabular-nums text-ink-subtle">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        data-incentive-person={row.name}
                        aria-label={`Open ${row.name}'s incentive detail`}
                        className="shrink-0 cursor-pointer"
                      >
                        <EmployeeAvatar name={row.name} size="sm" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <button
                            type="button"
                            data-incentive-person={row.name}
                            className="cursor-pointer truncate text-left text-[13.5px] font-bold text-ink-strong transition-colors hover:text-altus-red"
                          >
                            {row.name}
                          </button>
                          <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink-strong">
                            {formatInr(row.total)}
                          </span>
                        </div>
                        <div
                          className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                          style={{ background: "var(--color-hairline)" }}
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.max(2, share)}%`, background: toneBase("red") }}
                          />
                        </div>
                      </div>
                      <span className="w-11 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-ink-subtle">
                        {share.toFixed(1)}%
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </IncentiveSection>

          {/* Employee-wise YTD table — searchable + sortable */}
          <IncentiveSection
            bare
            title="Employee-wise YTD"
            hint="Permanent + project totals per employee — click a person to drill down"
          >
            {perEmployee.length === 0 ? (
              <p className="text-[13.5px] font-medium text-ink-subtle">No employee incentives this year.</p>
            ) : (
              <IncEmployeeTable
                rows={perEmployee}
                totals={{
                  permanent: permanent.approved,
                  project: project.approved,
                  total: empTotal,
                  paid: empPaid,
                  unpaid: empUnpaid,
                }}
              />
            )}
          </IncentiveSection>

          {/* Incentive-name YTD table */}
          <IncentiveSection
            bare
            title="Incentive-name YTD"
            hint="Permanent ledger by incentive, with the project roll-up"
          >
            {perIncentiveName.length === 0 && !projectRow ? (
              <p className="text-[13.5px] font-medium text-ink-subtle">No incentives this year.</p>
            ) : (
              <DataTable
                rows={
                  projectRow
                    ? [
                        ...perIncentiveName,
                        {
                          name: "Project Based Incentive",
                          count: 0,
                          approved: project.approved,
                          paid: project.paid,
                          unpaid: project.unpaid,
                        } as NameRow,
                      ]
                    : perIncentiveName
                }
                columns={nameColumns}
                getRowKey={(r) => r.name}
                searchText={(r) => r.name}
                searchPlaceholder="Local search — incentive"
                initialSort={{ key: "approved", dir: "desc" }}
                dense
                footerRow={
                  <tr className="border-t border-hairline-strong">
                    <td className="px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-strong">
                      Total
                    </td>
                    <td />
                    <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
                      {formatInr(nameApproved + project.approved)}
                    </td>
                    <td
                      className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums"
                      style={{ color: toneInk("teal") }}
                    >
                      {formatInr(namePaid + project.paid)}
                    </td>
                    <td
                      className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums"
                      style={{
                        color:
                          nameUnpaid + project.unpaid > 0 ? toneInk("red") : "var(--color-ink-subtle)",
                      }}
                    >
                      {formatInr(nameUnpaid + project.unpaid)}
                    </td>
                  </tr>
                }
              />
            )}
          </IncentiveSection>

          <p className="flex items-center gap-1.5 px-1 text-[12px] font-medium text-ink-subtle">
            <BarChart3 size={12} strokeWidth={2.4} aria-hidden />
            Company-wide figures for the calendar year.
            <Trophy size={12} strokeWidth={2.4} aria-hidden className="ml-2" />
            Leaderboard shares are of the year&apos;s total.
            <PieChart size={12} strokeWidth={2.4} aria-hidden className="ml-2" />
            Mix is permanent incentives only.
          </p>
        </div>
        ) : null}
      </details>
    </IncentiveDashboardDrilldown>
  );
}
