import { AlertTriangle } from "lucide-react";
import { FALLBACK_CATEGORY, categoryColors } from "@/lib/exec-calendar/taxonomy";
import { durationLabel } from "@/lib/exec-calendar/grid";
import type { AllocationReport } from "@/lib/exec-calendar/analytics";

/**
 * TIME ALLOCATION & AUDIT (§4D).
 *
 * One stacked bar and a row per bucket, because the question is a MIX — "what
 * kind of quarter was that" — and a mix reads as proportions of one bar far
 * better than as six numbers. Hours sit beside each percentage since "18%" and
 * "27 hours" answer different questions and leadership asks both.
 *
 * Percentages are of COMMITTED time (see analytics.ts). `windowShare` is
 * reported separately as "of the open day", because the two are routinely
 * confused and the difference decides whether the answer is "you spent too much
 * of your time on delivery" or "you are simply booked solid".
 *
 * Alerts are floors only, and appear ABOVE the bar — an alert below the fold is
 * an alert nobody reads.
 */
const VIEW_WORD: Record<string, string> = {
  day: "this day",
  week: "this week",
  grid: "these 4 weeks",
  month: "this month",
  year: "this year",
};

export function ExecAllocationPanel({
  report,
  view = "week",
  masked = false,
}: {
  report: AllocationReport;
  /** Which horizon the numbers cover — the panel says so, so "8%" is never
   *  read as a week when it is a year. */
  view?: string;
  /**
   * True when the viewer is reading SOMEBODY ELSE'S calendar. Two things change,
   * both discovered by actually looking at a colleague's week rather than by
   * reasoning about it:
   *
   *   · VARIANCE ALERTS ARE SUPPRESSED. They are computed from what the viewer
   *     can see, and a masked calendar always looks like it has no personal
   *     time — the panel cheerfully told a colleague "Personal & recovery is
   *     0%, under the 15% floor" about somebody who exercises every morning.
   *     The mix is the owner's to judge, on their own complete data.
   *   · The totals are labelled as partial, because reserved blocks land in
   *     Markers and the split is therefore not the real one.
   */
  masked?: boolean;
}) {
  const nonEmpty = report.buckets.filter((b) => b.minutes > 0);
  const empty = report.committedMinutes === 0;

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">
          Where the time goes · {VIEW_WORD[view] ?? "this week"}
        </h2>
        <span className="text-[11.5px] font-semibold text-ink-muted">
          {durationLabel(report.committedMinutes)} booked · {report.windowShare}% of the open day
        </span>
      </div>

      {!masked && report.alerts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {report.alerts.map((a) => (
            <li
              key={a.bucket}
              className="flex items-start gap-2 rounded-xl px-3 py-2"
              style={{ background: "var(--color-amber-bg)", border: "1px solid var(--color-amber-edge)" }}
            >
              <AlertTriangle size={14} className="mt-[2px] shrink-0" style={{ color: "var(--color-amber-deep)" }} />
              <span className="text-[12px] leading-snug" style={{ color: "var(--color-amber-deep)" }}>
                <strong>{a.label} is {a.actual}%</strong>, under the {a.target}% floor. {a.note}
              </span>
            </li>
          ))}
        </ul>
      )}

      {masked && !empty && (
        <p className="mt-2 text-[11.5px] leading-snug text-ink-subtle">
          Partial: blocks you cannot see are counted as reserved time, so this split is not their
          real one.
        </p>
      )}

      {empty ? (
        <p className="mt-3 text-[12.5px] text-ink-muted">
          Nothing booked in this range yet — so there is no mix to report.
        </p>
      ) : (
        <>
          <div className="mt-3 flex h-3 overflow-hidden rounded-pill" style={{ background: "var(--color-surface-track)" }}>
            {nonEmpty.map((b) => (
              <div
                key={b.bucket}
                style={{ width: `${b.percent}%`, background: categoryColors(b.categories[0] ?? FALLBACK_CATEGORY).base }}
                title={`${b.label} — ${b.percent}%`}
              />
            ))}
          </div>

          <ul className="mt-3 space-y-1.5">
            {nonEmpty.map((b) => (
              <li key={b.bucket} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: categoryColors(b.categories[0] ?? FALLBACK_CATEGORY).base }}
                />
                <span className="flex-1 truncate text-[12.5px] font-semibold text-ink-strong">{b.label}</span>
                <span className="text-[12px] tabular-nums text-ink-muted">{durationLabel(b.minutes)}</span>
                <span className="w-12 text-right text-[12.5px] font-bold tabular-nums text-ink-strong">
                  {b.percent}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
