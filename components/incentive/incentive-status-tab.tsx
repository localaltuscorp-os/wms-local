"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Layers, SlidersHorizontal, Users } from "lucide-react";
import { formatInr } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import type { EmployeeOption } from "@/lib/queries/employees";
import type {
  IncentiveStatusReport as StatusReport,
  IncentiveEntryStatusRow,
} from "@/lib/queries/incentive-status";
import { IncentiveStatusReport } from "./incentive-status-report";
import { IncentiveStatusEditor } from "./incentive-status-editor";
import { IncentiveTeamSplit } from "./incentive-team-split";
import { IncentiveBadge } from "./ui/badges";
import { IncentiveSection, INCENTIVE_BTN_NEUTRAL } from "./ui/chrome";
import { IncentiveEmptyState } from "./ui/states";
import { PAYMENT_TONE, toneInk } from "./ui/tone";

/**
 * WS-6 Status tab — the three-status report plus, for admins, an editor to set
 * each incentive's Booked/Accrued/Paid amounts and a team-split editor. This
 * whole tab is only mounted when the INCENTIVE_STATUS_UI kill-switch is on (the
 * page decides), so live users never see it until Sir flips the flag.
 *
 * The two editors, the flag and every amount are unchanged. The tab used to
 * carry two tables with their own search boxes and two 22px-radius panels; both
 * tables are the shared `DataTable` now, so there is one search per table, one
 * header style, and paging on the one that grows with the year.
 *
 * It also links to Accounts' payout screen, which is the next step in this same
 * job and had no route into it from anywhere in the app.
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

  const columns: DataTableColumn<IncentiveEntryStatusRow>[] = [
    {
      key: "employee",
      label: "Employee",
      sortValue: (r) => r.empName.toLowerCase(),
      render: (r) => (
        <span className="flex items-center gap-2">
          <EmployeeAvatar name={r.empName} size="sm" />
          <span className="text-[13.5px] font-bold text-ink-strong">{r.empName}</span>
          {r.participantCount > 0 && (
            <IncentiveBadge tone="red" title={`${r.participantCount} in the team split`}>
              <Users size={10} strokeWidth={2.6} aria-hidden className="mr-1" />
              {r.participantCount}
            </IncentiveBadge>
          )}
        </span>
      ),
    },
    {
      key: "incentive",
      label: "Incentive",
      sortValue: (r) => r.incentiveName.toLowerCase(),
      render: (r) => <span className="text-[13px] font-semibold text-ink-soft">{r.incentiveName}</span>,
    },
    {
      key: "booked",
      label: "Booked",
      align: "right",
      sortValue: (r) => r.booked,
      render: (r) => (
        <span className="text-[13px] tabular-nums" style={{ color: toneInk(PAYMENT_TONE.booked) }}>
          {formatInr(r.booked)}
        </span>
      ),
    },
    {
      key: "accrued",
      label: "Accrued",
      align: "right",
      sortValue: (r) => r.accrued,
      render: (r) => (
        <span className="text-[13px] tabular-nums" style={{ color: toneInk(PAYMENT_TONE.accrued) }}>
          {formatInr(r.accrued)}
        </span>
      ),
    },
    {
      key: "paid",
      label: "Paid",
      align: "right",
      sortValue: (r) => r.paid,
      render: (r) => (
        <span className="text-[13px] font-bold tabular-nums" style={{ color: toneInk(PAYMENT_TONE.paid) }}>
          {formatInr(r.paid)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <IncentiveStatusReport report={report} />

      {isAdmin && (
        <IncentiveSection
          bare
          title="Set status & team split"
          hint={`Set each incentive's Booked / Accrued / Paid, or divide it among the team · ${year}`}
          actions={
            <Link href={"/salary/incentive-payout" as Route} className={INCENTIVE_BTN_NEUTRAL}>
              Pay with salary
              <ArrowUpRight size={14} strokeWidth={2.4} aria-hidden />
            </Link>
          }
        >
          <DataTable
            rows={entries}
            columns={columns}
            getRowKey={(r) => r.id}
            searchText={(r) => `${r.empName} ${r.incentiveName}`}
            searchPlaceholder="Local search — incentive or person"
            initialSort={{ key: "paid", dir: "desc" }}
            stickyFirstColumn
            dense
            pageSize={25}
            filters={[
              {
                label: "Payment",
                options: [
                  { value: "unbooked", label: "Nothing booked yet" },
                  { value: "booked", label: "Booked, not accrued" },
                  { value: "accrued", label: "Accrued, not paid" },
                  { value: "paid", label: "Paid" },
                ],
                match: (r, v) =>
                  v === "paid"
                    ? r.paid > 0
                    : v === "accrued"
                      ? r.accrued > 0 && r.paid === 0
                      : v === "booked"
                        ? r.booked > 0 && r.accrued === 0
                        : r.booked === 0 && r.accrued === 0 && r.paid === 0,
              },
              {
                label: "Split",
                options: [
                  { value: "split", label: "Divided among a team" },
                  { value: "solo", label: "One person" },
                ],
                match: (r, v) => (v === "split" ? r.participantCount > 0 : r.participantCount === 0),
              },
            ]}
            rowActions={(r) => (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusRow(r)}
                  className={INCENTIVE_BTN_NEUTRAL}
                  style={{ height: 32 }}
                >
                  <SlidersHorizontal size={13} strokeWidth={2.4} />
                  Status
                </button>
                <button
                  type="button"
                  onClick={() => setSplitRow(r)}
                  className={INCENTIVE_BTN_NEUTRAL}
                  style={{ height: 32 }}
                >
                  <Users size={13} strokeWidth={2.4} />
                  Split
                </button>
              </div>
            )}
            emptyState={
              <IncentiveEmptyState
                icon={Layers}
                title={`No permanent incentive entries in ${year}`}
                body="Add entries on the Entries area first — their Booked, Accrued and Paid amounts are set from here."
              />
            }
          />
        </IncentiveSection>
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
