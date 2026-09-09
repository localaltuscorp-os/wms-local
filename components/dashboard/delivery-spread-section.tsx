"use client";

import * as React from "react";
import { CalendarCheck2 } from "lucide-react";
import { FineBucketBars } from "@/components/dashboard/task-report/fine-bucket-bars";
import type { DoneFineDistribution } from "@/lib/queries/task-report";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon } from "@/components/dashboard/section-icon";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD_PADDED,
} from "@/components/dashboard/section-chrome";
import { PageShell } from "@/components/layout/page-shell";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";

/**
 * DELIVERY VS DUE DATE - the 12-bucket spread.
 *
 * Moved here from the Task Analytics report (task-report-view.tsx), where it
 * was the first section. `DoneCard` and its `GlassCard` shell are carried over
 * UNCHANGED - same bucket split, same denominator, same bars, same on-time
 * percentage - because the point of the move was the placement, not a redesign.
 *
 * What could not come with it is the report's `ReportSection` chrome: that
 * component is shared with the report's other sections and stays there. The
 * dashboard's own DashboardSectionHeader + CollapseToggle wrap it instead, so
 * this section folds like every other section on this page rather than
 * importing a second set of section furniture.
 *
 * The DATA is computed the way the report computed it - every non-archived done
 * task, NOT the dashboard's filtered period - so the percentage reads the same
 * here as it did there. See `doneSpread` in lib/queries/dashboard.ts.
 */
/* Carried over verbatim from task-report-view, where DoneCard read them. */

export function DeliverySpreadSection({ dist }: { dist: DoneFineDistribution }) {
  const [open, setOpen] = React.useState(true);
  // The headline figures move UP into the header's right-hand slot, beside the
  // fold control. They used to be a 46px display number and a two-line legend
  // stacked at the top of the card, which put a second, larger masthead
  // directly under the section's actual one.
  const rate = dist.dated > 0 ? Math.round((dist.onTime / dist.dated) * 100) : 0;

  /* A distribution, not a roster - so the report's rows are the BUCKETS, which
     is the only thing this section actually shows. */
  const buildReport = React.useCallback((): SectionReport => {
    return {
      title: "Delivery vs Due Date",
      subtitle: "How far before or after the due date completed work landed",
      meta: [{ label: "On-time rate", value: `${rate}%` }],
      summary: `${dist.onTime} on or before · ${dist.late} late · ${dist.dated} dated`,
      columns: [
        { label: "Band", weight: 3, align: "left" },
        { label: "Tasks", weight: 1, align: "right" },
        { label: "Share", weight: 1, align: "right" },
      ],
      // `key` IS the label here - FINE_AGING_BUCKETS is a union of the written
      // band names ("4 to 7 days overdue"), not of slugs.
      rows: dist.buckets.map((b) => [
        b.key,
        String(b.count),
        dist.dated > 0 ? `${Math.round((b.count / dist.dated) * 100)}%` : "-",
      ]),
    };
  }, [dist, rate]);

  return (
    <PageShell as="section" width="full" py={false} aria-label="Delivery vs due date">
      <DashboardSectionHeader
        /* The SHARED badge, not a hand-rolled one. This was a size-10
           rounded-xl slate square - one of the very "every section rolled its
           own" cases SectionIcon exists to replace, and the reason this badge
           was a different SHAPE as well as a different colour from its
           neighbours. */
        icon={<SectionIcon icon={CalendarCheck2} tone="red" />}
        title="Delivery vs Due Date"
        subtitle="Completed tasks categorized by delivery timing relative to their committed due dates."
        /* THE METRICS MOVED INTO THE CARD. They sat here, in the section
           header, where they were a 12.5px caption competing with the title
           beside them and hidden outright below md. Inside the card they sit on
           the same line as the basis caption they qualify - "32% on time" means
           nothing until you know it is measured against the ORIGINAL due date,
           and that sentence is now readable in one glance. */
        actions={
          <>
            <SectionDispatch report={buildReport} />
            <CollapseToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label="the delivery spread"
            />
          </>
        }
      />
      <CollapsibleBody expanded={open}>
        <DoneCard dist={dist} label="By ORIGINAL due date" rate={rate} />
      </CollapsibleBody>
    </PageShell>
  );
}

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${DASHBOARD_CARD_PADDED} ${className ?? ""}`}>
      {children}
    </div>
  );
}

/* ──────────────────────── ① + ② DONE distribution card ─────────────────── */

function DoneCard({
  dist,
  label,
  rate,
}: {
  dist: DoneFineDistribution;
  label: string;
  /** Computed ONCE by the section and passed down. Recomputing it here would
   *  be a second source for a figure the export already quotes. */
  rate: number;
}) {
  // One denominator across BOTH halves, taken from the full distribution, so a
  // bar's length means the same thing on either side of the split.
  const barScale = Math.max(...dist.buckets.map((b) => b.count), 1);
  return (
    <GlassCard>
      {/* Caption left, figures right, on one line. The caption names the basis
          the bars are measured against; the figures are that basis's headline.
          `flex-wrap` rather than a fixed row: on a narrow card the badge drops
          under the caption instead of squeezing it to an ellipsis. */}
      {/* `-mt-1` lifts the row so the caption sits level with the badge's
          optical centre rather than its box: the badge is px-4 py-2 and the
          caption is a single line, so aligning the two boxes leaves the words
          reading low against it. */}
      <div className="-mt-1 mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-800 md:text-sm">
          {label}
        </p>
        <div className="ml-auto flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 shadow-sm">
          <span className="text-base font-black tabular-nums text-emerald-600 md:text-lg">
            {rate}% <span className="text-sm font-bold text-emerald-700/80">on time</span>
          </span>
          <span aria-hidden className="font-bold text-slate-300">
            •
          </span>
          <span className="text-base font-black tabular-nums text-slate-900 md:text-lg">
            {dist.onTime}{" "}
            <span className="text-sm font-bold text-slate-500">On / Before</span>
          </span>
          <span aria-hidden className="font-bold text-slate-300">
            •
          </span>
          <span className="text-base font-black tabular-nums text-red-600 md:text-lg">
            {dist.late} <span className="text-sm font-bold text-red-700/80">Late</span>
          </span>
        </div>
      </div>

      {/* Side-by-side split. The buckets are already ordered most-overdue first
          through earliest-delivery last, so `fineBucketIsLate` cuts the list
          cleanly in two at the "On Due Date" boundary - no re-ordering and no
          second source of truth for which band is which.
          On Due Date sits on the RIGHT: delivering exactly on the committed day
          is hitting the deadline, not missing it. */}
      <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <FineBucketBars
          buckets={dist.buckets.filter((b) => b.late)}
          heading="Overdue"
          scaleMax={barScale}
          percentBase={dist.dated}
        />
        <FineBucketBars
          buckets={dist.buckets.filter((b) => !b.late)}
          heading="On time & early"
          scaleMax={barScale}
          percentBase={dist.dated}
        />
      </div>

      {dist.undated > 0 && (
        <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
          {dist.undated} Done Without a Comparable Date - Not Counted.
        </p>
      )}
    </GlassCard>
  );
}
