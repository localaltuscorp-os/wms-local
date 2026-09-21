/**
 * EXECUTIVE MASTER CALENDAR — time-allocation analytics (spec §4D).
 *
 * The question this answers is the reason the sheet exists: not "what is on
 * Tuesday" but "where did the quarter go". It totals booked minutes per
 * analytics bucket over any date range and reports each as a share of the time
 * actually committed.
 *
 * TWO DENOMINATORS, AND THE DIFFERENCE MATTERS. Percentages are taken against
 * COMMITTED minutes (everything booked in the range), not against the calendar
 * window, because an empty Thursday is not time spent on anything and dividing
 * by a notional 15-hour day would make every number shrink whenever somebody
 * took a day off. `windowShare` is reported alongside for the one question the
 * other number cannot answer: how much of the available day is spoken for.
 *
 * ALL-DAY MARKERS ARE EXCLUDED from both. A public holiday is not eight hours
 * of "unbilled work" — counting it would swamp every other bucket in a festival
 * month and make the mix meaningless.
 *
 * PURE: takes events and a range, reads nothing.
 */

import {
  EXEC_CATEGORIES,
  execCategory,
  type ExecBucket,
  type ExecCategoryKey,
} from "./taxonomy";
import { addDays, type GridConfig } from "./grid";

export interface AllocationEvent {
  day: string;
  categoryKey: string;
  startMin: number | null;
  endMin: number | null;
  allDay?: boolean;
}

export interface BucketTotal {
  bucket: ExecBucket;
  label: string;
  minutes: number;
  /** Share of COMMITTED minutes, 0–100, rounded to one decimal. */
  percent: number;
  categories: ExecCategoryKey[];
}

export interface AllocationReport {
  from: string;
  to: string;
  /** Minutes actually booked (timed events only). */
  committedMinutes: number;
  /** Minutes the grid window offers across the range — the capacity. */
  windowMinutes: number;
  /** committedMinutes / windowMinutes as 0–100. */
  windowShare: number;
  buckets: BucketTotal[];
  alerts: VarianceAlert[];
}

export const BUCKET_LABELS: Record<ExecBucket, string> = {
  "client-delivery": "Client delivery",
  "sales-growth": "Sales & growth",
  "training-cohorts": "Training & cohorts",
  operations: "Operations",
  "personal-recovery": "Personal & recovery",
  unbilled: "Markers",
};

/* ── Thresholds (§4D, "variance alerts") ─────────────────────────────────── */

/**
 * The floors leadership is measured against. Deliberately few and deliberately
 * LOW: a threshold nobody believes gets muted, and a muted alert is the same as
 * no alert. These are minimums — the brief's concern is strategic and personal
 * time being crowded out by delivery, never the reverse — so there are no
 * ceilings here, and a busy delivery quarter raises nothing.
 */
export interface Threshold {
  bucket: ExecBucket;
  /** Minimum share of committed time, 0–100. */
  minPercent: number;
  /** Shown when the floor is missed. */
  note: string;
}

export const DEFAULT_THRESHOLDS: readonly Threshold[] = [
  {
    bucket: "personal-recovery",
    minPercent: 15,
    note: "Personal and recovery time is being crowded out.",
  },
  {
    bucket: "sales-growth",
    minPercent: 10,
    note: "Little time on sales and growth — the pipeline is being starved.",
  },
];

export interface VarianceAlert {
  bucket: ExecBucket;
  label: string;
  actual: number;
  target: number;
  note: string;
}

/* ── The maths ───────────────────────────────────────────────────────────── */

/** Minutes a single event contributes. Untimed and all-day events contribute 0. */
export function eventMinutes(e: AllocationEvent): number {
  if (e.allDay) return 0;
  if (e.startMin == null || e.endMin == null) return 0;
  return Math.max(0, e.endMin - e.startMin);
}

function dayCount(from: string, to: string): number {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) n += 1;
  return n;
}

/**
 * Total the range. `from`/`to` are inclusive day strings; events outside are
 * ignored, so a caller can pass a whole quarter's events and ask about one week
 * without filtering first.
 */
export function buildAllocation(
  events: AllocationEvent[],
  from: string,
  to: string,
  cfg: GridConfig,
  thresholds: readonly Threshold[] = DEFAULT_THRESHOLDS,
): AllocationReport {
  const minutesByBucket = new Map<ExecBucket, number>();
  let committed = 0;

  for (const e of events) {
    if (e.day < from || e.day > to) continue;
    const mins = eventMinutes(e);
    if (mins === 0) continue;
    const bucket = execCategory(e.categoryKey).bucket;
    minutesByBucket.set(bucket, (minutesByBucket.get(bucket) ?? 0) + mins);
    committed += mins;
  }

  const buckets: BucketTotal[] = (Object.keys(BUCKET_LABELS) as ExecBucket[])
    .map((bucket) => {
      const minutes = minutesByBucket.get(bucket) ?? 0;
      return {
        bucket,
        label: BUCKET_LABELS[bucket],
        minutes,
        percent: committed === 0 ? 0 : Math.round((minutes / committed) * 1000) / 10,
        categories: EXEC_CATEGORIES.filter((c) => c.bucket === bucket).map((c) => c.key),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const perDay = Math.max(0, cfg.endMin - cfg.startMin);
  const windowMinutes = perDay * dayCount(from, to);

  // No committed time means no mix to judge: raising "0% personal" for an empty
  // future quarter would be noise, and the alert people learn to ignore.
  const alerts: VarianceAlert[] =
    committed === 0
      ? []
      : thresholds
          .map((t) => {
            const actual = buckets.find((b) => b.bucket === t.bucket)?.percent ?? 0;
            return actual >= t.minPercent
              ? null
              : {
                  bucket: t.bucket,
                  label: BUCKET_LABELS[t.bucket],
                  actual,
                  target: t.minPercent,
                  note: t.note,
                };
          })
          .filter((a): a is VarianceAlert => a !== null);

  return {
    from,
    to,
    committedMinutes: committed,
    windowMinutes,
    windowShare: windowMinutes === 0 ? 0 : Math.round((committed / windowMinutes) * 1000) / 10,
    buckets,
    alerts,
  };
}
