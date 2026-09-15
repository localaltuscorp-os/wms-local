"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { CalendarClock, CheckCircle2, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { filledOf, type DashboardPerson, type PersonStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { DccSection, EmptyNote } from "./ui";
import { longDate } from "./format";

/**
 * TODAY — who still has KPIs to fill, and who has none set at all.
 *
 * The one section that is about now rather than the window: a manager opens the
 * dashboard in the evening to chase today's gaps, and that list should not sit
 * under nine sections of history.
 */
export function TodaySection({
  people,
  today,
  withoutKpis,
  showWithoutKpis,
  meta,
}: {
  people: PersonStats[];
  today: string;
  withoutKpis: DashboardPerson[];
  showWithoutKpis: boolean;
  meta: ReportMeta[];
}) {
  const due = people.filter((p) => p.today.due > 0);
  const open = due
    .filter((p) => p.today.unfilled > 0)
    .sort((a, b) => b.today.unfilled - a.today.unfilled || a.person.name.localeCompare(b.person.name));
  const complete = due.length - open.length;

  const report = (): SectionReport => ({
    title: "DCC Yet to Fill Today",
    subtitle: longDate(today),
    meta,
    summary: `${open.length} of ${due.length} people still have KPIs to fill`,
    columns: [
      { label: "Person", weight: 3 },
      { label: "Filled", align: "right" },
      { label: "Due", align: "right" },
      { label: "Open", align: "right", tone: "count" },
    ],
    rows: open.map((p) => [
      p.person.name,
      String(filledOf(p.today)),
      String(p.today.due),
      String(p.today.unfilled),
    ]),
  });

  return (
    <DccSection
      icon={CalendarClock}
      title="Yet to Fill Today"
      subtitle={`${longDate(today)} · ${complete} of ${due.length} people have filled every KPI due today`}
      label="today's list"
      report={report}
    >
      {due.length === 0 ? (
        <EmptyNote>Nobody in this view has a KPI due today.</EmptyNote>
      ) : open.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-[14px] font-bold text-emerald-700">
          <CheckCircle2 size={18} /> Everyone has filled today&apos;s DCC.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {open.map((p) => {
            const filled = filledOf(p.today);
            const width = Math.round((filled / p.today.due) * 100);
            return (
              <Link
                key={p.person.id}
                href={`/dcc?emp=${p.person.id}` as Route}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition-colors hover:border-[var(--color-altus-red)]"
              >
                <Avatar name={p.person.name} avatarUrl={p.person.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-slate-900">{p.person.name}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, background: "var(--color-altus-red)" }}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] font-semibold tabular-nums text-slate-500">
                    {filled}/{p.today.due} filled · <span className="text-rose-700">{p.today.unfilled} open</span>
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-slate-300 group-hover:text-[var(--color-altus-red)]" />
              </Link>
            );
          })}
        </div>
      )}

      {showWithoutKpis && withoutKpis.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            No KPIs set · {withoutKpis.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {withoutKpis.map((p) => (
              <Link
                key={p.id}
                href={`/dcc?emp=${p.id}` as Route}
                title="Open their DCC to add KPIs"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-[var(--color-altus-red)] hover:text-[var(--color-altus-red)]"
              >
                <Avatar name={p.name} avatarUrl={p.avatarUrl} size={20} />
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </DccSection>
  );
}
