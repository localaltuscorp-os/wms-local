"use client";

import * as React from "react";
import { Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FunctionToggle } from "@/components/dashboard/function-toggle";
import { SectionPagination, SectionSearchBox, usePagedRows } from "@/components/dashboard/section-chrome";
import { FUNCTION_LABELS } from "@/lib/org/functions";
import { compliancePct, rateTone, type DashboardBucket, type PersonStats, type Tally } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { DccSection, EmptyNote, usePeopleFilter } from "./ui";
import { fmtPct, shortDate } from "./format";

/** Cell fill by compliance. Static class strings so Tailwind generates them. */
function cellClass(t: Tally): string {
  if (t.due === 0) return "bg-slate-50 text-slate-300";
  const p = compliancePct(t)!;
  if (p === 100) return "bg-emerald-500 text-white";
  const tone = rateTone(p);
  if (tone === "green") return "bg-emerald-100 text-emerald-800";
  if (tone === "amber") return "bg-amber-100 text-amber-800";
  if (p === 0) return "bg-rose-500 text-white";
  return "bg-rose-100 text-rose-800";
}

/**
 * COMPLIANCE HEATMAP — people down the side, days (or weeks) across the top.
 *
 * The DCC's Aging Heatmap: the pattern a table of averages hides. A person at
 * 70% who misses every Friday and a person at 70% who went quiet last week need
 * two different conversations, and only a grid shows which is which.
 */
export function ComplianceHeatmapSection({
  people,
  buckets,
  today,
  meta,
  onOpenRange,
}: {
  people: PersonStats[];
  buckets: DashboardBucket[];
  today: string;
  meta: ReportMeta[];
  onOpenRange: (p: PersonStats, from: string, to: string) => void;
}) {
  const f = usePeopleFilter(people);
  const rows = React.useMemo(
    () =>
      [...f.rows].sort(
        (a, b) => (a.compliance ?? 101) - (b.compliance ?? 101) || a.person.name.localeCompare(b.person.name),
      ),
    [f.rows],
  );
  const paged = usePagedRows(rows, 15);
  const weekly = buckets.length > 0 && buckets[0]!.sub === "week";

  const report = (): SectionReport => ({
    title: "DCC Compliance Heatmap",
    meta: [...meta, { label: "Function", value: FUNCTION_LABELS[f.view] }],
    summary: `${rows.length} people × ${buckets.length} ${weekly ? "weeks" : "days"}`,
    columns: [{ label: "Person", weight: 3 }, ...buckets.map((b) => ({ label: weekly ? b.label : shortDate(b.from), align: "center" as const }))],
    rows: rows.map((p) => [p.person.name, ...p.buckets.map((t) => (t.due === 0 ? "—" : fmtPct(compliancePct(t))))]),
  });

  return (
    <DccSection
      icon={Flame}
      title="Compliance Heatmap"
      subtitle={`Compliance per person per ${weekly ? "week" : "day"}. Green is 80% or better, amber 60%, red below; grey had nothing due. Click a cell to see that ${weekly ? "week" : "day"}.`}
      label="the compliance heatmap"
      report={report}
      padded={false}
      controls={
        <>
          <SectionSearchBox query={f.query} onQuery={f.setQuery} placeholder="Search employees" />
          <SectionPagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} label="Compliance heatmap" />
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 md:px-6">
        <FunctionToggle view={f.view} onChange={f.setView} counts={f.counts} />
        <Legend />
      </div>
      {rows.length === 0 ? (
        <EmptyNote>Nobody in this view has KPIs.</EmptyNote>
      ) : (
        <div className="overflow-x-auto px-4 py-4 md:px-6">
          <table className="border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[190px] bg-white pr-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Person
                </th>
                {buckets.map((b) => (
                  <th
                    key={b.key}
                    className={`min-w-9 text-center text-[10.5px] font-bold leading-tight ${
                      b.from <= today && today <= b.to ? "text-[var(--color-altus-red)]" : "text-slate-500"
                    }`}
                  >
                    <span className="block tabular-nums">{b.label}</span>
                    <span className="block text-[9.5px] font-semibold uppercase opacity-70">{b.sub}</span>
                  </th>
                ))}
                <th className="pl-3 text-right text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Overall</th>
              </tr>
            </thead>
            <tbody>
              {paged.visible.map((p) => (
                <tr key={p.person.id}>
                  <td className="sticky left-0 z-10 bg-white py-0.5 pr-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={p.person.name} avatarUrl={p.person.avatarUrl} size={24} />
                      <span className="max-w-[150px] truncate text-[12.5px] font-bold text-slate-800">{p.person.name}</span>
                    </div>
                  </td>
                  {p.buckets.map((t, i) => {
                    const b = buckets[i]!;
                    const isOpenToday = b.from <= today && today <= b.to && p.today.unfilled > 0;
                    const label =
                      t.due === 0
                        ? `${p.person.name} · ${weekly ? `week of ${b.label}` : shortDate(b.from)}: nothing due`
                        : `${p.person.name} · ${weekly ? `week of ${b.label}` : shortDate(b.from)}: ${t.done}/${t.due} done, ${t.unfilled} unfilled, ${t.notDone} not done`;
                    return (
                      <td key={b.key} className="p-0">
                        <button
                          type="button"
                          title={label}
                          aria-label={label}
                          disabled={t.due === 0}
                          onClick={() => onOpenRange(p, b.from, b.to)}
                          className={`grid h-9 w-full min-w-9 place-items-center rounded-md text-[10.5px] font-bold tabular-nums transition-transform enabled:hover:scale-110 enabled:hover:shadow-md ${cellClass(t)} ${
                            isOpenToday ? "ring-2 ring-indigo-300 ring-offset-1" : ""
                          }`}
                        >
                          {t.due === 0 ? "·" : compliancePct(t)}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-3 text-right text-[13px] font-extrabold tabular-nums text-slate-800">{fmtPct(p.compliance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DccSection>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["bg-emerald-500", "100%"],
    ["bg-emerald-100", "≥80%"],
    ["bg-amber-100", "≥60%"],
    ["bg-rose-100", "Below"],
    ["bg-rose-500", "0%"],
    ["bg-slate-50 ring-1 ring-inset ring-slate-200", "Nothing due"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11.5px] font-semibold text-slate-500">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={`size-3 rounded ${cls}`} />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded ring-2 ring-indigo-300" />
        Open today
      </span>
    </div>
  );
}
