"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Hourglass,
  IndianRupee,
  Loader2,
  ReceiptText,
  Users,
} from "lucide-react";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import type { BillingSummary } from "@/lib/billing/sheet";
import type { AnalyticsView } from "@/lib/incentive/analytics/model";
import { fetchIncentiveBilling } from "@/app/(app)/incentive/billing-actions";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { IncentiveKpi, IncentiveKpiRow } from "./ui/kpi";
import { IncentiveSection, INCENTIVE_BTN_NEUTRAL, Segmented } from "./ui/chrome";
import { IncentiveEmptyState } from "./ui/states";
import { toneBase, toneInk } from "./ui/tone";

type PersonRow = BillingSummary["perSalesperson"][number];
type DealRow = BillingSummary["deals"][number];

/**
 * BILLING — what the sales sheet says was billed and collected.
 *
 * The data, the live-sheet read and its Suspense boundary are untouched. The
 * presentation is now the module's: one KPI band, then two `DataTable`s, then
 * the monthly trend last.
 *
 * The ranked "Billing Leaderboard" that used to sit above the per-salesperson
 * table is GONE as a separate block — it listed the same people, in the same
 * order, with the same totals, plus a three-card podium above that. Rank and
 * the share bar are columns on the table instead, so the screen says each thing
 * once.
 *
 * Payment state is explicit on every row (Collected / Part / Outstanding), and
 * the area links to Accounts' incentive payout screen rather than restating any
 * of its logic — paying an incentive is still that screen's job, and this one
 * neither duplicates nor re-implements it.
 */
const BILLING_VIEW_OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "user" as const, label: "User" },
];

export function BillingDashboard({
  data,
  year,
  initialView = "team",
  canSeeTeam = false,
  scopeLabel = "",
}: {
  data: BillingSummary & { error?: string };
  year?: number;
  /** Which of the two views the server resolved for this render. */
  initialView?: AnalyticsView;
  /** Hide the switcher entirely for a viewer who has no team — never grey it. */
  canSeeTeam?: boolean;
  scopeLabel?: string;
}) {
  const [summary, setSummary] = React.useState(data);
  const [view, setView] = React.useState<AnalyticsView>(initialView);
  const [label, setLabel] = React.useState(scopeLabel);
  const [pending, startTransition] = React.useTransition();

  /**
   * Switching scope re-reads the sheet through the server action, which resolves
   * the scope again from the signed-in identity and filters before aggregating.
   * This component never narrows anything itself — every figure below, including
   * the KPI band, is recomputed server-side from the rows this viewer may see.
   */
  function load(next: AnalyticsView) {
    if (!year) return;
    const shown = view;
    setView(next);
    startTransition(async () => {
      try {
        const res = await fetchIncentiveBilling({ year, view: next });
        if (!res.ok) {
          setView(shown);
          fireToast({ message: res.error, type: "error" });
          return;
        }
        setSummary(res.data);
        setLabel(res.label);
      } catch {
        setView(shown);
        fireToast({ message: "The billing sheet couldn't load just now — please try again.", type: "error" });
      }
    });
  }

  const { totals, perSalesperson, monthly, deals } = summary;

  const scopeRow = year ? (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-card px-3 py-2">
      {canSeeTeam && (
        <Segmented
          ariaLabel="Whose billing"
          options={BILLING_VIEW_OPTIONS}
          value={view}
          disabled={pending}
          onChange={load}
        />
      )}
      <span className="text-[12.5px] font-semibold text-ink-subtle">
        Billed, collected and outstanding from the billing sheet · {year}
      </span>
      <span className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-ink-subtle">
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {label}
      </span>
    </div>
  ) : null;

  if (data.error) {
    return (
      <IncentiveSection>
        <p className="text-[15px] font-bold text-ink-strong">Couldn&apos;t read the billing sheet</p>
        <p className="mt-1 text-[13.5px] font-medium text-ink-muted">{data.error}</p>
      </IncentiveSection>
    );
  }

  if (totals.deals === 0) {
    return (
      <div className="space-y-3">
        {scopeRow}
        <div className="rounded-2xl border border-hairline bg-surface-card">
          <IncentiveEmptyState
            icon={ReceiptText}
            title={year ? `No billing in ${year}` : "No billing this year"}
            body={
              canSeeTeam && view === "user"
                ? "No sales-credited deals were found for you in the Billing sheet for the selected year. Switch to Team to see your team's deals."
                : "No sales-credited deals were found in the Billing sheet for the selected year."
            }
          />
        </div>
      </div>
    );
  }

  const collectRate = totals.billed > 0 ? totals.paid / totals.billed : 0;
  const maxBilled = Math.max(...perSalesperson.map((p) => p.billed), 1);
  const maxMonth = Math.max(...monthly.map((m) => m.billed), 1);
  const rankByName = new Map(perSalesperson.map((p, i) => [p.name, i + 1]));

  const personColumns: DataTableColumn<PersonRow>[] = [
    {
      key: "rank",
      label: "#",
      align: "right",
      sortValue: (p) => rankByName.get(p.name) ?? 999,
      render: (p) => (
        <span className="text-[13px] font-bold tabular-nums text-ink-subtle">
          {rankByName.get(p.name)}
        </span>
      ),
    },
    {
      key: "name",
      label: "Salesperson",
      sortValue: (p) => p.name.toLowerCase(),
      render: (p) => (
        <span className="flex items-center gap-2">
          <EmployeeAvatar name={p.name} size="sm" />
          <span className="text-[13.5px] font-bold text-ink-strong">{p.name}</span>
        </span>
      ),
    },
    {
      key: "deals",
      label: "Deals",
      align: "right",
      sortValue: (p) => p.deals,
      render: (p) => <span className="text-[13px] tabular-nums">{p.deals}</span>,
    },
    {
      key: "billed",
      label: "Billed",
      align: "right",
      sortValue: (p) => p.billed,
      render: (p) => (
        <span className="flex flex-col items-end gap-1">
          <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(p.billed)}</span>
          <span
            className="h-1 w-full max-w-[110px] overflow-hidden rounded-full"
            style={{ background: "var(--color-hairline)" }}
            aria-hidden
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(2, (p.billed / maxBilled) * 100)}%`,
                background: toneBase("red"),
              }}
            />
          </span>
        </span>
      ),
    },
    {
      key: "paid",
      label: "Collected",
      align: "right",
      sortValue: (p) => p.paid,
      render: (p) => (
        <span className="text-[13px] tabular-nums" style={{ color: toneInk("teal") }}>
          {formatInr(p.paid)}
        </span>
      ),
    },
    {
      key: "outstanding",
      label: "Outstanding",
      align: "right",
      sortValue: (p) => p.outstanding,
      render: (p) => (
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: p.outstanding > 0 ? toneInk("red") : "var(--color-ink-subtle)" }}
        >
          {p.outstanding > 0 ? formatInr(p.outstanding) : "—"}
        </span>
      ),
    },
  ];

  const dealColumns: DataTableColumn<DealRow>[] = [
    {
      key: "client",
      label: "Client",
      sortValue: (d) => (d.client || "").toLowerCase(),
      render: (d) => <span className="text-[13.5px] font-bold text-ink-strong">{d.client || "—"}</span>,
    },
    {
      key: "salesperson",
      label: "Salesperson",
      sortValue: (d) => d.salesperson.toLowerCase(),
      render: (d) => <span className="text-[13px] font-semibold text-ink-soft">{d.salesperson}</span>,
    },
    {
      key: "entity",
      label: "Entity",
      sortValue: (d) => (d.entity || "").toLowerCase(),
      render: (d) => <span className="text-[13px] text-ink-subtle">{d.entity || "—"}</span>,
    },
    {
      key: "billed",
      label: "Billed",
      align: "right",
      sortValue: (d) => d.billed,
      render: (d) => (
        <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(d.billed)}</span>
      ),
    },
    {
      key: "paid",
      label: "Collected",
      align: "right",
      sortValue: (d) => d.paid,
      render: (d) => (
        <span className="text-[13px] tabular-nums" style={{ color: toneInk("teal") }}>
          {formatInr(d.paid)}
        </span>
      ),
    },
    {
      key: "state",
      label: "Payment",
      sortValue: (d) => paymentState(d).order,
      render: (d) => {
        const s = paymentState(d);
        return (
          <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
            style={{ background: `color-mix(in srgb, ${toneBase(s.tone)} 14%, transparent)`, color: toneInk(s.tone) }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: toneBase(s.tone) }} />
            {s.label}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      {scopeRow}

      <IncentiveKpiRow cols={4}>
        <IncentiveKpi
          label="Billed"
          value={formatInr(totals.billed)}
          caption={`${totals.deals} deal${totals.deals === 1 ? "" : "s"} YTD`}
          tone="slate"
          icon={<IndianRupee size={13} strokeWidth={2.4} />}
        />
        <IncentiveKpi
          label="Collected"
          value={formatInr(totals.paid)}
          caption={`${(collectRate * 100).toFixed(0)}% of billed`}
          tone="teal"
          icon={<CheckCircle2 size={13} strokeWidth={2.4} />}
          progress={collectRate}
        />
        <IncentiveKpi
          label="Outstanding"
          value={formatInr(totals.outstanding)}
          caption="billed − collected"
          tone={totals.outstanding > 0 ? "red" : "slate"}
          icon={<Hourglass size={13} strokeWidth={2.4} />}
        />
        <IncentiveKpi
          label="Salespeople"
          value={String(perSalesperson.length)}
          caption="credited this year"
          tone="blue"
          icon={<Users size={13} strokeWidth={2.4} />}
        />
      </IncentiveKpiRow>

      <IncentiveSection
        bare
        title="By salesperson"
        hint="Billed, collected and outstanding per person — ranked by billing."
        actions={
          <Link href={"/salary/incentive-payout" as Route} className={INCENTIVE_BTN_NEUTRAL}>
            Incentive payout
            <ArrowUpRight size={14} strokeWidth={2.4} aria-hidden />
          </Link>
        }
      >
        <DataTable
          rows={perSalesperson}
          columns={personColumns}
          getRowKey={(p) => p.name}
          searchText={(p) => p.name}
          searchPlaceholder="Local search — salesperson"
          initialSort={{ key: "billed", dir: "desc" }}
          stickyFirstColumn={false}
          dense
          filters={[
            {
              label: "Outstanding",
              options: [
                { value: "open", label: "Has outstanding" },
                { value: "clear", label: "Fully collected" },
              ],
              match: (p, v) => (v === "open" ? p.outstanding > 0 : p.outstanding <= 0),
            },
          ]}
          footerRow={
            <tr className="border-t border-hairline-strong">
              <td />
              <td className="px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-strong">
                Total
              </td>
              <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
                {totals.deals}
              </td>
              <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
                {formatInr(totals.billed)}
              </td>
              <td
                className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums"
                style={{ color: toneInk("teal") }}
              >
                {formatInr(totals.paid)}
              </td>
              <td
                className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums"
                style={{ color: totals.outstanding > 0 ? toneInk("red") : "var(--color-ink-subtle)" }}
              >
                {formatInr(totals.outstanding)}
              </td>
            </tr>
          }
          emptyState={<IncentiveEmptyState compact title="Nobody credited yet" />}
        />
      </IncentiveSection>

      <IncentiveSection bare title="Deals" hint="Sales-credited deals, highest billed first.">
        <DataTable
          rows={deals}
          columns={dealColumns}
          getRowKey={(d) => `${d.client}-${d.salesperson}-${d.billed}-${d.paid}`}
          searchText={(d) => `${d.client} ${d.salesperson} ${d.entity}`}
          searchPlaceholder="Local search — client, salesperson or entity"
          initialSort={{ key: "billed", dir: "desc" }}
          stickyFirstColumn
          dense
          pageSize={25}
          filters={[
            {
              label: "Payment",
              options: [
                { value: "paid", label: "Collected" },
                { value: "part", label: "Part collected" },
                { value: "open", label: "Nothing collected" },
              ],
              match: (d, v) => paymentState(d).key === v,
            },
          ]}
          emptyState={<IncentiveEmptyState compact title="No deals to show" />}
        />
      </IncentiveSection>

      {monthly.length > 0 && (
        <IncentiveSection title="Monthly billing" hint="Billing total per month.">
          <div className="space-y-1.5">
            {monthly.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[12.5px] font-semibold text-ink-subtle">
                  {monthLabel(m.month)}
                </span>
                <span
                  className="h-2 flex-1 overflow-hidden rounded-full"
                  style={{ background: "var(--color-hairline)" }}
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(2, (m.billed / maxMonth) * 100)}%`,
                      background: toneBase("blue"),
                    }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-ink-strong">
                  {formatInr(m.billed)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-subtle">
            <BarChart3 size={12} strokeWidth={2.4} aria-hidden />
            Read from the live billing sheet.
          </p>
        </IncentiveSection>
      )}
    </div>
  );
}

/** Where a deal stands with the client. Derived, never stored. */
function paymentState(d: DealRow): {
  key: "paid" | "part" | "open";
  label: string;
  tone: "teal" | "amber" | "red";
  order: number;
} {
  if (d.paid >= d.billed && d.billed > 0) return { key: "paid", label: "Collected", tone: "teal", order: 0 };
  if (d.paid > 0) return { key: "part", label: "Part collected", tone: "amber", order: 1 };
  return { key: "open", label: "Outstanding", tone: "red", order: 2 };
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m)] ?? m} ${y?.slice(2)}`;
}
