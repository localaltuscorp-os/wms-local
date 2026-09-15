"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FunctionToggle } from "@/components/dashboard/function-toggle";
import { SectionPagination, SectionSearchBox, usePagedRows } from "@/components/dashboard/section-chrome";
import { Sparkline } from "@/components/dashboard/exec/viz/sparkline";
import { FUNCTION_LABELS } from "@/lib/org/functions";
import { compliancePct, pointsChange, type PersonStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { compareNullable, DccSection, EmptyNote, nextSortState, RateBar, SortHead, usePeopleFilter } from "./ui";
import { fmtPct, missedOf, shortDate, signed } from "./format";

type SortKey = "name" | "kpis" | "due" | "done" | "missed" | "filled" | "compliance" | "change" | "streak" | "last";

/**
 * COMPLIANCE BY PERSON — the DCC's Overdue-by-Person table.
 *
 * Opens sorted by compliance, LOWEST first: the table is read to find who needs
 * a word, and the people doing well are the ones least worth a manager's
 * attention. A click on any row opens their KPIs day by day.
 */
export function ComplianceByPersonSection({
  people,
  meta,
  onOpen,
}: {
  people: PersonStats[];
  meta: ReportMeta[];
  onOpen: (p: PersonStats) => void;
}) {
  const f = usePeopleFilter(people);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "compliance", dir: "asc" });

  const sorted = React.useMemo(() => {
    const val = (p: PersonStats): number | string | null => {
      switch (sort.key) {
        case "name":
          return p.person.name.toLowerCase();
        case "kpis":
          return p.kpis;
        case "due":
          return p.tally.due;
        case "done":
          return p.tally.done;
        case "missed":
          return missedOf(p);
        case "filled":
          return p.filled;
        case "compliance":
          return p.compliance;
        case "change":
          return pointsChange(p.compliance, p.prevCompliance);
        case "streak":
          return p.streak;
        case "last":
          return p.lastFilled;
      }
    };
    return [...f.rows].sort(
      (a, b) => compareNullable(val(a), val(b), sort.dir) || a.person.name.localeCompare(b.person.name),
    );
  }, [f.rows, sort]);

  const paged = usePagedRows(sorted, 10);
  const onSort = (k: SortKey) => setSort((cur) => nextSortState(cur, k, k === "name" || k === "compliance" ? "asc" : "desc"));

  const report = (): SectionReport => ({
    title: "DCC Compliance by Person",
    meta: [...meta, { label: "Function", value: FUNCTION_LABELS[f.view] }],
    summary: `${sorted.length} ${sorted.length === 1 ? "person" : "people"}`,
    columns: [
      { label: "Person", weight: 3 },
      { label: "KPIs", align: "right" },
      { label: "Due", align: "right" },
      { label: "Done", align: "right" },
      { label: "Missed", align: "right", tone: "count" },
      { label: "Filled", align: "right" },
      { label: "Compliance", align: "right" },
      { label: "Change", align: "right" },
      { label: "Streak", align: "right" },
    ],
    rows: sorted.map((p) => {
      const change = pointsChange(p.compliance, p.prevCompliance);
      return [
        p.person.name,
        String(p.kpis),
        String(p.tally.due),
        String(p.tally.done),
        String(missedOf(p)),
        fmtPct(p.filled),
        fmtPct(p.compliance),
        change == null ? "—" : `${change > 0 ? "+" : ""}${change} pts`,
        `${p.streak}d`,
      ];
    }),
  });

  return (
    <DccSection
      icon={Users}
      title="Compliance by Person"
      subtitle="Done ÷ due for each person in the window, with the change against the window before it. Click a row to see their KPIs day by day."
      label="compliance by person"
      report={report}
      padded={false}
      controls={
        <>
          <SectionSearchBox query={f.query} onQuery={f.setQuery} placeholder="Search employees" />
          <SectionPagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} label="Compliance by person" />
        </>
      }
    >
      <div className="border-b border-slate-100 px-4 py-3 md:px-6">
        <FunctionToggle view={f.view} onChange={f.setView} counts={f.counts} />
      </div>
      {sorted.length === 0 ? (
        <EmptyNote>Nobody in this view has KPIs.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <SortHead k="name" label="Person" sort={sort} onSort={onSort} align="left" className="pl-6" />
                <SortHead k="kpis" label="KPIs" sort={sort} onSort={onSort} />
                <SortHead k="due" label="Due" sort={sort} onSort={onSort} />
                <SortHead k="done" label="Done" sort={sort} onSort={onSort} />
                <SortHead k="missed" label="Missed" sort={sort} onSort={onSort} />
                <SortHead k="filled" label="Filled" sort={sort} onSort={onSort} />
                <SortHead k="compliance" label="Compliance" sort={sort} onSort={onSort} />
                <SortHead k="change" label="Change" sort={sort} onSort={onSort} />
                <SortHead k="streak" label="Streak" sort={sort} onSort={onSort} />
                <th scope="col" className="px-3 py-3 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Trend
                </th>
                <SortHead k="last" label="Last filled" sort={sort} onSort={onSort} className="pr-6" />
              </tr>
            </thead>
            <tbody>
              {paged.visible.map((p) => {
                const change = pointsChange(p.compliance, p.prevCompliance);
                const points = p.buckets.map(compliancePct).filter((v): v is number => v != null);
                const missed = missedOf(p);
                return (
                  <tr
                    key={p.person.id}
                    onClick={() => onOpen(p)}
                    className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <td className="py-2.5 pl-6 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={p.person.name} avatarUrl={p.person.avatarUrl} size={30} />
                        <span className="truncate font-bold text-slate-900">{p.person.name}</span>
                      </div>
                    </td>
                    <td className="px-3 text-right tabular-nums text-slate-600">{p.kpis}</td>
                    <td className="px-3 text-right tabular-nums text-slate-600">{p.tally.due}</td>
                    <td className="px-3 text-right tabular-nums text-slate-700">{p.tally.done}</td>
                    <td className={`px-3 text-right font-bold tabular-nums ${missed > 0 ? "text-rose-700" : "text-slate-300"}`}>
                      {missed}
                    </td>
                    <td className="px-3 text-right tabular-nums text-slate-600">{fmtPct(p.filled)}</td>
                    <td className="px-3">
                      <RateBar value={p.compliance} />
                    </td>
                    <td
                      className={`px-3 text-right text-[12px] font-bold tabular-nums ${
                        change == null ? "text-slate-300" : change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-500"
                      }`}
                    >
                      {change == null ? "—" : signed(change, " pts")}
                    </td>
                    <td className="px-3 text-right tabular-nums text-slate-600">{p.streak}d</td>
                    <td className="px-3">
                      <div className="flex justify-center">
                        {points.length >= 2 ? <Sparkline points={points} width={96} height={28} /> : <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pl-3 pr-6 text-right tabular-nums text-slate-500">
                      {p.lastFilled ? shortDate(p.lastFilled) : "Never"}
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
