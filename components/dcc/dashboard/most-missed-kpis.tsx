"use client";

import * as React from "react";
import { ListX } from "lucide-react";
import { SectionPagination, SectionSearchBox, usePagedRows } from "@/components/dashboard/section-chrome";
import type { ItemStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { DccSection, EmptyNote } from "./ui";
import { fmtPct } from "./format";

/**
 * MOST-MISSED KPIs — the individual checklist lines that fail most often.
 *
 * A KPI missed every single day is usually not a discipline problem: it is a
 * task nobody does any more, or one scheduled on the wrong days. This is the
 * list to prune the checklists from.
 */
export function MostMissedKpisSection({
  items,
  meta,
  onOpenOwner,
}: {
  items: ItemStats[];
  meta: ReportMeta[];
  onOpenOwner: (ownerId: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.tally.unfilled + i.tally.notDone > 0 &&
        (!q ||
          i.item.title.toLowerCase().includes(q) ||
          i.ownerName.toLowerCase().includes(q) ||
          (i.item.section ?? "").toLowerCase().includes(q)),
    );
  }, [items, query]);

  const paged = usePagedRows(rows, 10);

  const report = (): SectionReport => ({
    title: "DCC Most-Missed KPIs",
    meta,
    summary: `${rows.length} KPIs missed or not done at least once`,
    columns: [
      { label: "KPI", weight: 5 },
      { label: "Owner", weight: 2 },
      { label: "Due", align: "right" },
      { label: "Done", align: "right" },
      { label: "Unfilled", align: "right", tone: "count" },
      { label: "Not done", align: "right" },
      { label: "Miss rate", align: "right" },
    ],
    rows: rows.map((i) => [
      `${i.item.code ? `${i.item.code} · ` : ""}${i.item.title}`,
      i.ownerName,
      String(i.tally.due),
      String(i.tally.done),
      String(i.tally.unfilled),
      String(i.tally.notDone),
      fmtPct(i.missRate),
    ]),
  });

  return (
    <DccSection
      icon={ListX}
      title="Most-Missed KPIs"
      subtitle="Checklist lines ranked by how often they were left blank or marked Not done. Click one to open its owner's day-by-day view."
      label="the most-missed KPIs"
      report={report}
      padded={false}
      controls={
        <>
          <SectionSearchBox query={query} onQuery={setQuery} placeholder="Search KPIs" />
          <SectionPagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} label="Most-missed KPIs" />
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyNote>No KPI was missed in this window.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="py-3 pl-6 pr-3 text-left">KPI</th>
                <th className="px-3 text-left">Owner</th>
                <th className="px-3 text-right">Due</th>
                <th className="px-3 text-right">Done</th>
                <th className="px-3 text-right">Unfilled</th>
                <th className="px-3 text-right">Not done</th>
                <th className="py-3 pl-3 pr-6 text-right">Miss rate</th>
              </tr>
            </thead>
            <tbody>
              {paged.visible.map((i) => (
                <tr
                  key={i.item.id}
                  onClick={() => onOpenOwner(i.item.ownerEmployeeId)}
                  className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                >
                  <td className="max-w-[420px] py-2.5 pl-6 pr-3">
                    <p className="line-clamp-2 font-bold text-slate-900">
                      {i.item.code && <span className="mr-1.5 font-mono text-[11px] text-slate-400">{i.item.code}</span>}
                      {i.item.title}
                    </p>
                    {i.item.section && <p className="mt-0.5 truncate text-[11.5px] font-semibold text-slate-400">{i.item.section}</p>}
                  </td>
                  <td className="px-3 font-semibold text-slate-700">{i.ownerName}</td>
                  <td className="px-3 text-right tabular-nums text-slate-600">{i.tally.due}</td>
                  <td className="px-3 text-right tabular-nums text-slate-700">{i.tally.done}</td>
                  <td className={`px-3 text-right font-bold tabular-nums ${i.tally.unfilled ? "text-rose-700" : "text-slate-300"}`}>
                    {i.tally.unfilled}
                  </td>
                  <td className={`px-3 text-right tabular-nums ${i.tally.notDone ? "text-rose-700" : "text-slate-300"}`}>
                    {i.tally.notDone}
                  </td>
                  <td className="py-2.5 pl-3 pr-6 text-right">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[12px] font-extrabold tabular-nums ${
                        (i.missRate ?? 0) >= 50 ? "bg-rose-100 text-rose-800" : (i.missRate ?? 0) >= 20 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {fmtPct(i.missRate)}
                    </span>
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
