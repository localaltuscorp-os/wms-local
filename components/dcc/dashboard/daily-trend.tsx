"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import {
  addTallies,
  compliancePct,
  emptyTally,
  filledPct,
  type DashboardBucket,
  type PersonStats,
} from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { DccSection, EmptyNote } from "./ui";
import { fmtPct, shortDate, toneFill } from "./format";

/** Plot height in px. The guide lines and the bars both measure against it. */
const PLOT_H = 180;

/**
 * COMPLIANCE TREND — the team's rate over the window, one bar per day or week.
 *
 * The solid bar is compliance (done ÷ due); the pale bar behind it is how much
 * was FILLED. The gap between the two is work that was recorded but not done —
 * a different problem from a blank DCC, and one this chart is the only place to
 * see.
 */
export function DailyTrendSection({
  people,
  buckets,
  today,
  meta,
}: {
  people: PersonStats[];
  buckets: DashboardBucket[];
  today: string;
  meta: ReportMeta[];
}) {
  const weekly = buckets.length > 0 && buckets[0]!.sub === "week";

  const series = React.useMemo(
    () =>
      buckets.map((b, i) => {
        const t = emptyTally();
        for (const p of people) addTallies(t, p.buckets[i]!);
        return { bucket: b, tally: t, compliance: compliancePct(t), filled: filledPct(t) };
      }),
    [people, buckets],
  );

  const withData = series.filter((s) => s.compliance != null);
  const best = withData.reduce<(typeof series)[number] | null>((m, s) => (!m || s.compliance! > m.compliance! ? s : m), null);
  const worst = withData.reduce<(typeof series)[number] | null>((m, s) => (!m || s.compliance! < m.compliance! ? s : m), null);
  const avg = withData.length ? Math.round(withData.reduce((n, s) => n + s.compliance!, 0) / withData.length) : null;
  const when = (b: DashboardBucket) => (weekly ? `week of ${b.label}` : shortDate(b.from));
  const labelEvery = Math.max(1, Math.ceil(series.length / 16));

  const report = (): SectionReport => ({
    title: "DCC Compliance Trend",
    meta,
    summary: `Average ${fmtPct(avg)} across ${withData.length} ${weekly ? "weeks" : "days"} with KPIs due`,
    columns: [
      { label: weekly ? "Week of" : "Day", weight: 2 },
      { label: "Due", align: "right" },
      { label: "Done", align: "right" },
      { label: "Unfilled", align: "right", tone: "count" },
      { label: "Filled", align: "right" },
      { label: "Compliance", align: "right" },
    ],
    rows: series.map((s) => [
      weekly ? s.bucket.label : shortDate(s.bucket.from),
      String(s.tally.due),
      String(s.tally.done),
      String(s.tally.unfilled),
      fmtPct(s.filled),
      fmtPct(s.compliance),
    ]),
  });

  return (
    <DccSection
      icon={BarChart3}
      title="Compliance Trend"
      subtitle={`Team compliance per ${weekly ? "week" : "day"}. The solid bar is done ÷ due; the pale bar behind it is how much was filled.`}
      label="the compliance trend"
      report={report}
    >
      {withData.length === 0 ? (
        <EmptyNote>No KPIs were due in this window.</EmptyNote>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-x-8 gap-y-2 text-[13px] font-semibold text-slate-600">
            <span>
              Average <b className="tabular-nums text-slate-900">{fmtPct(avg)}</b>
            </span>
            {best && (
              <span>
                Best <b className="tabular-nums text-emerald-700">{fmtPct(best.compliance)}</b> · {when(best.bucket)}
              </span>
            )}
            {worst && (
              <span>
                Lowest <b className="tabular-nums text-rose-700">{fmtPct(worst.compliance)}</b> · {when(worst.bucket)}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-4 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-emerald-500" /> Compliance
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-slate-200" /> Filled
              </span>
            </span>
          </div>

          <div className="pr-8">
            {/* The plot. Guide lines and bars share this box, so a 60% line and
                a 60% bar land at exactly the same height. */}
            <div className="relative" style={{ height: PLOT_H }}>
              {[100, 80, 60].map((line) => (
                <div
                  key={line}
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-0 border-t ${line === 100 ? "border-slate-100" : "border-dashed border-slate-200"}`}
                  style={{ bottom: `${line}%` }}
                >
                  <span className="absolute -right-8 -top-2 text-[10px] font-bold text-slate-400">{line}%</span>
                </div>
              ))}
              <div className="absolute inset-0 flex items-end gap-[3px] border-b border-slate-200">
                {series.map((s) => {
                  const isToday = s.bucket.from <= today && today <= s.bucket.to;
                  const title =
                    s.compliance == null
                      ? `${when(s.bucket)}: nothing due`
                      : `${when(s.bucket)}: ${fmtPct(s.compliance)} compliance, ${fmtPct(s.filled)} filled (${s.tally.done}/${s.tally.due} done)`;
                  return (
                    <div key={s.bucket.key} className="relative h-full min-w-0 flex-1" title={title}>
                      {s.filled != null && (
                        <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-slate-200/80" style={{ height: `${s.filled}%` }} />
                      )}
                      {s.compliance != null && (
                        <div
                          className={`absolute inset-x-[18%] bottom-0 rounded-t-sm transition-all ${isToday ? "opacity-70" : ""}`}
                          style={{ height: `${Math.max(s.compliance, 1)}%`, background: toneFill(s.compliance) }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-1.5 flex gap-[3px]">
              {series.map((s, i) => {
                const isToday = s.bucket.from <= today && today <= s.bucket.to;
                return (
                  <span
                    key={s.bucket.key}
                    className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] font-bold tabular-nums ${
                      isToday ? "text-[var(--color-altus-red)]" : "text-slate-400"
                    }`}
                  >
                    {i % labelEvery === 0 || isToday ? s.bucket.label : ""}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}
    </DccSection>
  );
}
