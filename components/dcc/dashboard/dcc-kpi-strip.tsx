"use client";

import * as React from "react";
import { LayoutGrid } from "lucide-react";
import { CardGrid } from "@/components/layout/card-grid";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";
import { statusCardTokens, type StatusCardKey } from "@/lib/status-palette";
import { compliancePct, filledPct, pct, pointsChange, type DccDashboardResult } from "@/lib/dcc/dashboard";
import { fmtPct, previousLabel, signed } from "./format";

interface Tile {
  key: string;
  label: string;
  value: string;
  sub: string;
  trend: string;
  color: StatusCardKey;
  title: string;
}

/**
 * THE COMPLIANCE SUMMARY — the DCC's answer to the WMS Task Summary strip.
 *
 * Same soft tinted tiles, from the same palette bundle, so the two dashboards
 * read as one family. Each tile compares the window with the one of the same
 * length immediately before it: a RATE in percentage points, a COUNT in units.
 */
export function DccKpiStrip({ result }: { result: DccDashboardResult }) {
  const [open, setOpen] = React.useState(true);
  const { totals, prevTotals, people, includesToday } = result;

  const openToday = people.reduce((n, p) => n + p.today.unfilled, 0);
  const missed = totals.unfilled - openToday;
  const prevMissed = prevTotals.unfilled;
  const compliance = compliancePct(totals);
  const vs = previousLabel(result.window);
  const share = (n: number) => fmtPct(pct(n, totals.due));

  const rateTrend = (() => {
    const change = pointsChange(compliance, compliancePct(prevTotals));
    return change == null ? "no earlier data" : `${signed(change, " pts")} ${vs}`;
  })();
  const countTrend = (cur: number, prev: number) =>
    prevTotals.due === 0 ? "no earlier data" : `${signed(cur - prev)} ${vs}`;

  const tiles: Tile[] = [
    {
      key: "compliance",
      label: "Compliance",
      value: fmtPct(compliance),
      sub: `Filled ${fmtPct(filledPct(totals))} · ${totals.due.toLocaleString()} due`,
      trend: rateTrend,
      color: "total",
      title: "Done ÷ due, over the scheduled KPIs in this window.",
    },
    {
      key: "done",
      label: "Done",
      value: totals.done.toLocaleString(),
      sub: `${share(totals.done)} of due`,
      trend: countTrend(totals.done, prevTotals.done),
      color: "done",
      title: "KPIs marked Done.",
    },
    {
      key: "missed",
      label: "Missed",
      value: missed.toLocaleString(),
      sub: includesToday && openToday > 0 ? `+ ${openToday} still open today` : `${share(missed)} of due`,
      trend: countTrend(missed, prevMissed),
      color: "notStarted",
      title: "Due on a past day and never filled. Today's unfilled KPIs are counted as open, not missed.",
    },
    {
      key: "notDone",
      label: "Not Done",
      value: totals.notDone.toLocaleString(),
      sub: `${share(totals.notDone)} of due`,
      trend: countTrend(totals.notDone, prevTotals.notDone),
      color: "pending",
      title: "Filled, and marked Not done.",
    },
    {
      key: "pending",
      label: "Pending",
      value: totals.pending.toLocaleString(),
      sub: `${share(totals.pending)} of due`,
      trend: countTrend(totals.pending, prevTotals.pending),
      color: "needInfo",
      title: "Filled, and marked Pending.",
    },
    {
      key: "na",
      label: "Not Applicable",
      value: totals.na.toLocaleString(),
      sub: `${share(totals.na)} of due`,
      trend: countTrend(totals.na, prevTotals.na),
      color: "notApproved",
      title: "Marked NA. Counted as due and not done, as on the DCC page.",
    },
  ];

  return (
    <section aria-label="Compliance summary">
      <DashboardSectionHeader
        icon={<SectionIcon icon={LayoutGrid} tone="red" />}
        title="Compliance Summary"
        subtitle={`${people.length} ${people.length === 1 ? "person" : "people"} · ${totals.due.toLocaleString()} KPIs due in this window`}
        actions={<CollapseToggle expanded={open} onToggle={() => setOpen((v) => !v)} label="the compliance summary" />}
      />
      <CollapsibleBody expanded={open}>
        <CardGrid min={165} gap="0.875rem">
          {tiles.map((t) => {
            const tok = statusCardTokens(t.color);
            return (
              <div
                key={t.key}
                title={t.title}
                className={`relative h-full overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md ${tok.shell}`}
              >
                <span
                  className={`block text-[11px] font-semibold uppercase leading-[1.15] tracking-wider opacity-80 ${tok.label}`}
                  style={{ minHeight: 24 }}
                >
                  {t.label}
                </span>
                <span className={`mt-2 block text-3xl font-bold leading-none tracking-tight tabular-nums ${tok.value}`}>
                  {t.value}
                </span>
                <span className={`mt-1.5 block truncate text-xs font-semibold tabular-nums ${tok.sub}`}>{t.sub}</span>
                <span className={`mt-1 block truncate whitespace-nowrap text-xs font-medium tabular-nums opacity-90 ${tok.sub}`}>
                  {t.trend}
                </span>
              </div>
            );
          })}
        </CardGrid>
      </CollapsibleBody>
    </section>
  );
}
