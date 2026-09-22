"use client";

import * as React from "react";
import { BadgeCheck, HandCoins, Info, Wallet } from "lucide-react";
import { formatInr } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import type {
  IncentiveStatusReport,
  StatusPersonRow,
  StatusTotals,
  StatusWindow,
} from "@/lib/queries/incentive-status";
import { IncentiveSection } from "./ui/chrome";
import { IncentiveEmptyState } from "./ui/states";
import { attainmentTone, PAYMENT_TONE, toneBase, toneFill, toneInk } from "./ui/tone";

/** Booked = client partial · Accrued = client paid in full · Paid = paid to employee. */
const STATUS_META = {
  booked: { label: "Booked", icon: HandCoins, hint: "client paid partial" },
  accrued: { label: "Accrued", icon: Wallet, hint: "client paid in full" },
  paid: { label: "Paid", icon: BadgeCheck, hint: "paid to employee" },
} as const;

type StatusKey = keyof typeof STATUS_META;

function pct(part: number, target: number): number | null {
  if (target <= 0) return null;
  return (part / target) * 100;
}

/**
 * THE THREE-STATUS REPORT.
 *
 * The meanings are untouched — Booked is a partial client payment, Accrued is a
 * client who has paid in full, Paid is money that reached the employee, and PMS
 * counts Paid alone. What changed is the packaging: the definitions are one
 * inline legend under the three windows instead of a standing banner that
 * repeated what each bar already said, and the per-person table is the shared
 * `DataTable`, so the tab has ONE search box rather than two.
 */
export function IncentiveStatusReport({ report }: { report: IncentiveStatusReport }) {
  const windows: StatusWindow[] = [report.thisMonth, report.last3Months, report.ytd];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5 max-lg:grid-cols-1">
        {windows.map((w) => (
          <WindowCard key={w.label} window={w} />
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-[12.5px] font-medium text-ink-muted">
        <Info size={13} strokeWidth={2.4} aria-hidden className="text-ink-subtle" />
        <b className="font-bold text-ink-strong">Booked</b> client paid partial ·
        <b className="font-bold text-ink-strong">Accrued</b> client paid in full ·
        <b className="font-bold text-ink-strong">Paid</b> we paid the employee ·
        <span className="font-bold" style={{ color: toneInk("teal") }}>
          Performance Intelligence (PMS) counts PAID only.
        </span>
      </p>

      <PersonTable report={report} />
    </div>
  );
}

function WindowCard({ window: w }: { window: StatusWindow }) {
  const t: StatusTotals = w.totals;
  const keys: StatusKey[] = ["booked", "accrued", "paid"];
  const paidPct = pct(t.paid, t.target);

  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-3.5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "-0.01em",
            }}
          >
            {w.label}
          </h3>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            target {formatInr(t.target)}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{
            color: toneInk(attainmentTone(paidPct)),
            background: toneFill(attainmentTone(paidPct)),
          }}
        >
          {paidPct == null ? "—" : `${paidPct.toFixed(0)}%`}
        </span>
      </header>

      <div className="space-y-2.5">
        {keys.map((k) => {
          const tone = PAYMENT_TONE[k];
          const value = t[k];
          const p = pct(value, t.target);
          const barPct = p == null ? 0 : Math.min(100, p);
          const Icon = STATUS_META[k].icon;
          return (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft">
                  <Icon size={13} strokeWidth={2.5} style={{ color: toneInk(tone) }} aria-hidden />
                  {STATUS_META[k].label}
                </span>
                <span className="text-[13px] font-bold tabular-nums text-ink-strong">
                  {formatInr(value)}
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--color-hairline)" }}
                aria-hidden
              >
                <span
                  className="block h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(value > 0 ? 3 : 0, barPct)}%`,
                    background: toneBase(tone),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PersonTable({ report }: { report: IncentiveStatusReport }) {
  const columns: DataTableColumn<StatusPersonRow>[] = [
    {
      key: "person",
      label: "Person",
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="flex items-center gap-2">
          <EmployeeAvatar name={r.name} size="sm" />
          <span className="text-[13.5px] font-bold text-ink-strong">{r.name}</span>
        </span>
      ),
    },
    {
      key: "target",
      label: "Target",
      align: "right",
      sortValue: (r) => r.target,
      render: (r) => (
        <span className="text-[13px] tabular-nums">{r.target > 0 ? formatInr(r.target) : "—"}</span>
      ),
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
    {
      key: "attain",
      label: "Attain",
      align: "right",
      sortValue: (r) => pct(r.paid, r.target) ?? -1,
      render: (r) => {
        const p = pct(r.paid, r.target);
        return (
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{ color: toneInk(attainmentTone(p)) }}
          >
            {p == null ? "—" : `${p.toFixed(0)}%`}
          </span>
        );
      },
    },
  ];

  return (
    <IncentiveSection
      bare
      title="Per-person · year to date"
      hint="Attain is Paid ÷ Target — the figure PMS reads."
    >
      <DataTable
        rows={report.perPersonYtd}
        columns={columns}
        getRowKey={(r) => r.key}
        searchText={(r) => r.name}
        searchPlaceholder="Local search — person"
        initialSort={{ key: "paid", dir: "desc" }}
        stickyFirstColumn
        dense
        pageSize={25}
        filters={[
          {
            label: "Attainment",
            options: [
              { value: "on", label: "At or above target" },
              { value: "behind", label: "Behind target" },
              { value: "none", label: "No target set" },
            ],
            match: (r, v) => {
              const p = pct(r.paid, r.target);
              return v === "none" ? p === null : v === "on" ? p !== null && p >= 100 : p !== null && p < 100;
            },
          },
        ]}
        emptyState={
          <IncentiveEmptyState
            title="No incentive activity this year yet"
            body="Booked, Accrued and Paid appear here once entries exist for the year."
          />
        }
      />
    </IncentiveSection>
  );
}
