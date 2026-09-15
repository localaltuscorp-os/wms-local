"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FunctionToggle } from "@/components/dashboard/function-toggle";
import { SectionPagination, SectionSearchBox, usePagedRows } from "@/components/dashboard/section-chrome";
import { FUNCTION_LABELS } from "@/lib/org/functions";
import { pct, type PersonStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { DccSection, EmptyNote, RateBar, usePeopleFilter } from "./ui";
import { fmtPct } from "./format";

/**
 * MANAGER REVIEWS — how many of each person's DCC days a manager signed off.
 *
 * The DCC's Delegation scorecard. A review is a manager marking a day Approved
 * or Needs rework; a day with KPIs due and no review is a day nobody checked.
 * Today is excluded — a day is reviewed after it ends.
 */
export function ReviewCoverageSection({
  people,
  totals,
  meta,
}: {
  people: PersonStats[];
  totals: { approved: number; needsRework: number; reviewableDays: number };
  meta: ReportMeta[];
}) {
  const f = usePeopleFilter(people);
  const rows = React.useMemo(
    () =>
      [...f.rows].sort((a, b) => {
        const ca = pct(a.reviews.approved + a.reviews.needsRework, a.reviews.reviewableDays) ?? 101;
        const cb = pct(b.reviews.approved + b.reviews.needsRework, b.reviews.reviewableDays) ?? 101;
        return ca - cb || a.person.name.localeCompare(b.person.name);
      }),
    [f.rows],
  );
  const paged = usePagedRows(rows, 10);

  const reviewed = totals.approved + totals.needsRework;
  const coverage = pct(reviewed, totals.reviewableDays);

  const report = (): SectionReport => ({
    title: "DCC Manager Reviews",
    meta: [...meta, { label: "Function", value: FUNCTION_LABELS[f.view] }],
    summary: `${reviewed} of ${totals.reviewableDays} days reviewed (${fmtPct(coverage)})`,
    columns: [
      { label: "Person", weight: 3 },
      { label: "Days due", align: "right" },
      { label: "Approved", align: "right" },
      { label: "Needs rework", align: "right" },
      { label: "Not reviewed", align: "right", tone: "count" },
      { label: "Coverage", align: "right" },
    ],
    rows: rows.map((p) => {
      const done = p.reviews.approved + p.reviews.needsRework;
      return [
        p.person.name,
        String(p.reviews.reviewableDays),
        String(p.reviews.approved),
        String(p.reviews.needsRework),
        String(Math.max(0, p.reviews.reviewableDays - done)),
        fmtPct(pct(done, p.reviews.reviewableDays)),
      ];
    }),
  });

  return (
    <DccSection
      icon={ShieldCheck}
      title="Manager Reviews"
      subtitle="Past days with KPIs due, and how many a manager marked Approved or Needs rework."
      label="manager reviews"
      report={report}
      padded={false}
      controls={
        <>
          <SectionSearchBox query={f.query} onQuery={f.setQuery} placeholder="Search employees" />
          <SectionPagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} label="Manager reviews" />
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-4 py-4 sm:grid-cols-4 md:px-6">
        <Stat label="Days to review" value={totals.reviewableDays} />
        <Stat label="Approved" value={totals.approved} tone="text-emerald-700" />
        <Stat label="Needs rework" value={totals.needsRework} tone="text-amber-700" />
        <Stat label="Coverage" value={fmtPct(coverage)} tone={coverage != null && coverage < 50 ? "text-rose-700" : "text-slate-900"} />
      </div>
      <div className="border-b border-slate-100 px-4 py-3 md:px-6">
        <FunctionToggle view={f.view} onChange={f.setView} counts={f.counts} />
      </div>
      {rows.length === 0 ? (
        <EmptyNote>Nobody in this view has KPIs.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 pl-6 pr-3 text-left">Person</th>
                <th className="px-3 text-right">Days due</th>
                <th className="px-3 text-right">Approved</th>
                <th className="px-3 text-right">Needs rework</th>
                <th className="px-3 text-right">Not reviewed</th>
                <th className="py-3 pl-3 pr-6 text-right">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {paged.visible.map((p) => {
                const done = p.reviews.approved + p.reviews.needsRework;
                const missing = Math.max(0, p.reviews.reviewableDays - done);
                return (
                  <tr key={p.person.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pl-6 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={p.person.name} avatarUrl={p.person.avatarUrl} size={28} />
                        <span className="truncate font-bold text-slate-900">{p.person.name}</span>
                      </div>
                    </td>
                    <td className="px-3 text-right tabular-nums text-slate-600">{p.reviews.reviewableDays}</td>
                    <td className={`px-3 text-right tabular-nums ${p.reviews.approved ? "font-bold text-emerald-700" : "text-slate-300"}`}>
                      {p.reviews.approved}
                    </td>
                    <td className={`px-3 text-right tabular-nums ${p.reviews.needsRework ? "font-bold text-amber-700" : "text-slate-300"}`}>
                      {p.reviews.needsRework}
                    </td>
                    <td className={`px-3 text-right font-bold tabular-nums ${missing ? "text-rose-700" : "text-slate-300"}`}>{missing}</td>
                    <td className="py-2.5 pl-3 pr-6">
                      <RateBar value={pct(done, p.reviews.reviewableDays)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DccSection>
  );
}

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
      <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[22px] font-bold leading-none tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
