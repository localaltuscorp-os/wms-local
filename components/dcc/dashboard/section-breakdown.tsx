"use client";

import * as React from "react";
import { Layers } from "lucide-react";
import { SectionPagination, SectionSearchBox, usePagedRows } from "@/components/dashboard/section-chrome";
import type { SectionStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { compareNullable, DccSection, EmptyNote, nextSortState, RateBar, SortHead } from "./ui";
import { fmtPct } from "./format";

type SortKey = "section" | "kpis" | "people" | "due" | "done" | "unfilled" | "notDone" | "compliance";

/**
 * COMPLIANCE BY SECTION — which kinds of work get skipped.
 *
 * Sections are free text typed onto each KPI ("Self Hygiene", "CORE
 * DELIVERABLES…"), so near-duplicates show as separate rows. That is the data
 * as it stands, and seeing the duplicates here is the first step to merging
 * them.
 */
export function SectionBreakdownSection({ sections, meta }: { sections: SectionStats[]; meta: ReportMeta[] }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "due", dir: "desc" });

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? sections.filter((s) => s.section.toLowerCase().includes(q)) : sections;
    const val = (s: SectionStats): number | string | null => {
      switch (sort.key) {
        case "section":
          return s.section.toLowerCase();
        case "kpis":
          return s.kpis;
        case "people":
          return s.people;
        case "due":
          return s.tally.due;
        case "done":
          return s.tally.done;
        case "unfilled":
          return s.tally.unfilled;
        case "notDone":
          return s.tally.notDone;
        case "compliance":
          return s.compliance;
      }
    };
    return [...filtered].sort((a, b) => compareNullable(val(a), val(b), sort.dir) || a.section.localeCompare(b.section));
  }, [sections, query, sort]);

  const paged = usePagedRows(rows, 10);
  const onSort = (k: SortKey) => setSort((cur) => nextSortState(cur, k, k === "section" || k === "compliance" ? "asc" : "desc"));

  const report = (): SectionReport => ({
    title: "DCC Compliance by Section",
    meta,
    summary: `${rows.length} sections`,
    columns: [
      { label: "Section", weight: 4 },
      { label: "KPIs", align: "right" },
      { label: "People", align: "right" },
      { label: "Due", align: "right" },
      { label: "Done", align: "right" },
      { label: "Unfilled", align: "right", tone: "count" },
      { label: "Not done", align: "right" },
      { label: "Compliance", align: "right" },
    ],
    rows: rows.map((s) => [
      s.section,
      String(s.kpis),
      String(s.people),
      String(s.tally.due),
      String(s.tally.done),
      String(s.tally.unfilled),
      String(s.tally.notDone),
      fmtPct(s.compliance),
    ]),
  });

  return (
    <DccSection
      icon={Layers}
      title="Compliance by Section"
      subtitle="The KPI sections people file their checklist under, with how often each is done."
      label="compliance by section"
      report={report}
      padded={false}
      controls={
        <>
          <SectionSearchBox query={query} onQuery={setQuery} placeholder="Search sections" />
          <SectionPagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} label="Compliance by section" />
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyNote>No sections match.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <SortHead k="section" label="Section" sort={sort} onSort={onSort} align="left" className="pl-6" />
                <SortHead k="kpis" label="KPIs" sort={sort} onSort={onSort} />
                <SortHead k="people" label="People" sort={sort} onSort={onSort} />
                <SortHead k="due" label="Due" sort={sort} onSort={onSort} />
                <SortHead k="done" label="Done" sort={sort} onSort={onSort} />
                <SortHead k="unfilled" label="Unfilled" sort={sort} onSort={onSort} />
                <SortHead k="notDone" label="Not done" sort={sort} onSort={onSort} />
                <SortHead k="compliance" label="Compliance" sort={sort} onSort={onSort} className="pr-6" />
              </tr>
            </thead>
            <tbody>
              {paged.visible.map((s) => (
                <tr key={s.section} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-[360px] py-2.5 pl-6 pr-3 font-bold text-slate-900">
                    <span className="line-clamp-2">{s.section}</span>
                  </td>
                  <td className="px-3 text-right tabular-nums text-slate-600">{s.kpis}</td>
                  <td className="px-3 text-right tabular-nums text-slate-600">{s.people}</td>
                  <td className="px-3 text-right tabular-nums text-slate-600">{s.tally.due}</td>
                  <td className="px-3 text-right tabular-nums text-slate-700">{s.tally.done}</td>
                  <td className={`px-3 text-right font-bold tabular-nums ${s.tally.unfilled ? "text-rose-700" : "text-slate-300"}`}>
                    {s.tally.unfilled}
                  </td>
                  <td className={`px-3 text-right tabular-nums ${s.tally.notDone ? "text-rose-700" : "text-slate-300"}`}>
                    {s.tally.notDone}
                  </td>
                  <td className="py-2.5 pl-3 pr-6">
                    <RateBar value={s.compliance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DccSection>
  );
}
