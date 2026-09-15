"use client";

import * as React from "react";
import { ListChecks } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FunctionToggle } from "@/components/dashboard/function-toggle";
import { SectionPagination, SectionSearchBox, usePagedRows } from "@/components/dashboard/section-chrome";
import { FUNCTION_LABELS } from "@/lib/org/functions";
import type { PersonStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { compareNullable, DccSection, EmptyNote, nextSortState, SortHead, usePeopleFilter } from "./ui";
import { missedOf } from "./format";

type Col = "done" | "notDone" | "pending" | "na" | "noted" | "missed" | "open" | "due";
type SortKey = "name" | Col;

const COLS: { key: Col; label: string; tone: string; value: (p: PersonStats) => number }[] = [
  { key: "done", label: "Done", tone: "text-emerald-700", value: (p) => p.tally.done },
  { key: "notDone", label: "Not done", tone: "text-rose-700", value: (p) => p.tally.notDone },
  { key: "pending", label: "Pending", tone: "text-amber-700", value: (p) => p.tally.pending },
  { key: "na", label: "NA", tone: "text-slate-600", value: (p) => p.tally.na },
  { key: "noted", label: "Value / note only", tone: "text-sky-700", value: (p) => p.tally.noted },
  { key: "missed", label: "Missed", tone: "text-rose-700", value: missedOf },
  { key: "open", label: "Open today", tone: "text-indigo-700", value: (p) => p.today.unfilled },
  { key: "due", label: "Due", tone: "text-slate-900", value: (p) => p.tally.due },
];

/**
 * STATUS BY PERSON — the DCC's Status-by-Doer grid: every outcome a due KPI
 * can end in, counted per person, so "12% compliance" can be read as "mostly
 * NA" or "mostly blank" without opening anyone's board.
 */
export function StatusByPersonSection({
  people,
  includesToday,
  meta,
  onOpen,
}: {
  people: PersonStats[];
  includesToday: boolean;
  meta: ReportMeta[];
  onOpen: (p: PersonStats) => void;
}) {
  const f = usePeopleFilter(people);
  const cols = includesToday ? COLS : COLS.filter((c) => c.key !== "open");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "missed", dir: "desc" });

  const sorted = React.useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key);
    return [...f.rows].sort((a, b) => {
      const va = col ? col.value(a) : a.person.name.toLowerCase();
      const vb = col ? col.value(b) : b.person.name.toLowerCase();
      return compareNullable(va, vb, sort.dir) || a.person.name.localeCompare(b.person.name);
    });
  }, [f.rows, sort]);

  const paged = usePagedRows(sorted, 10);
  const onSort = (k: SortKey) => setSort((cur) => nextSortState(cur, k, k === "name" ? "asc" : "desc"));

  const totals = cols.map((c) => f.rows.reduce((n, p) => n + c.value(p), 0));

  const report = (): SectionReport => ({
    title: "DCC Status by Person",
    meta: [...meta, { label: "Function", value: FUNCTION_LABELS[f.view] }],
    summary: `${sorted.length} ${sorted.length === 1 ? "person" : "people"}`,
    columns: [
      { label: "Person", weight: 3 },
      ...cols.map((c) => ({ label: c.label, align: "right" as const, tone: c.key === "missed" ? ("count" as const) : undefined })),
    ],
    rows: [
      ...sorted.map((p) => [p.person.name, ...cols.map((c) => String(c.value(p)))]),
      ["Total", ...totals.map(String)],
    ],
  });

  return (
    <DccSection
      icon={ListChecks}
      title="Status by Person"
      subtitle="How every due KPI ended, per person. Missed means a past day left blank; Open today is still fillable."
      label="status by person"
      report={report}
      padded={false}
      controls={
        <>
          <SectionSearchBox query={f.query} onQuery={f.setQuery} placeholder="Search employees" />
          <SectionPagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} label="Status by person" />
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
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <SortHead k="name" label="Person" sort={sort} onSort={onSort} align="left" className="pl-6" />
                {cols.map((c) => (
                  <SortHead key={c.key} k={c.key} label={c.label} sort={sort} onSort={onSort} className={c.key === "due" ? "pr-6" : ""} />
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.visible.map((p) => (
                <tr
                  key={p.person.id}
                  onClick={() => onOpen(p)}
                  className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                >
                  <td className="py-2.5 pl-6 pr-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.person.name} avatarUrl={p.person.avatarUrl} size={28} />
                      <span className="truncate font-bold text-slate-900">{p.person.name}</span>
                    </div>
                  </td>
                  {cols.map((c) => {
                    const v = c.value(p);
                    return (
                      <td
                        key={c.key}
                        className={`px-3 text-right tabular-nums ${c.key === "due" ? "pr-6 font-extrabold" : "font-bold"} ${
                          v === 0 ? "text-slate-300" : c.tone
                        }`}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/70">
                <td className="py-2.5 pl-6 pr-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Total</td>
                {totals.map((v, i) => (
                  <td key={cols[i]!.key} className={`px-3 text-right font-extrabold tabular-nums text-slate-900 ${cols[i]!.key === "due" ? "pr-6" : ""}`}>
                    {v}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </DccSection>
  );
}
