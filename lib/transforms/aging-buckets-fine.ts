/**
 * Manan's EXACT fine-grained early/late aging buckets.
 *
 * The signed "offset" of a task is measured in whole days against its effective
 * due date (COALESCE(revisedTargetDate, dueAt) — see lib/tasks/effective-due.ts):
 *
 *   • For a DONE task:    offset = effectiveDue − completedAt
 *   • For a PENDING task: offset = effectiveDue − today
 *
 * In BOTH cases the sign convention is identical:
 *   POSITIVE  → finished / standing EARLY (before the due date)  → good
 *   ZERO      → exactly on the due date
 *   NEGATIVE  → finished / standing LATE  (after the due date)   → overdue
 *
 * NINE buckets, ordered WORST-FIRST so the list reads top-to-bottom from most
 * overdue down to earliest delivery — the row you most need to act on sits at
 * the top.
 *
 * These replace an earlier twelve-band set keyed by signed numerals ("+7 or
 * more", "-8 to 10"). Two problems with that scheme, both fixed here: the sign
 * convention was ambiguous at a glance (does "-8" mean eight days late, or a
 * deficit of eight?), and its written labels overlapped — "-2 to 3" and
 * "-3 to 5" both claimed magnitude 3, so the code had to silently disagree with
 * the labels to keep the bands disjoint. Every boundary below is inclusive,
 * non-overlapping and says in words which side of the due date it is on.
 */

export const FINE_AGING_BUCKETS = [
  "22 or more days overdue",
  "15 to 21 days overdue",
  "8 to 14 days overdue",
  "4 to 7 days overdue",
  "1 to 3 days overdue",
  "On Due Date (0 days)",
  "1 to 3 days before due date",
  "4 to 7 days before due date",
  "8 or more days before due date",
] as const;

export type FineBucketKey = (typeof FINE_AGING_BUCKETS)[number];

/**
 * The 9-tier semantic colour ramp, one entry per bucket.
 *
 * Lives beside the buckets rather than in the chart so the bar, the count pill
 * and any future consumer read the SAME source — a colour defined in the view
 * is a colour that drifts the moment a second view appears.
 *
 * "On Due Date" is the only outlined tier: it is the neutral pivot between
 * overdue and early, and a filled neutral would read as just another grey band
 * rather than the axis the other eight are measured against.
 */
export interface FineBucketStyle {
  /** Bar fill and pill background. */
  color: string;
  /** Pill text colour. */
  ink: string;
  /** Set only for the outlined neutral tier. */
  border?: string;
}

export const FINE_BUCKET_STYLES: Record<FineBucketKey, FineBucketStyle> = {
  "22 or more days overdue":      { color: "#6B21A8", ink: "#FFFFFF" }, // purple-700
  "15 to 21 days overdue":        { color: "#7F1D1D", ink: "#FFFFFF" }, // red-900
  "8 to 14 days overdue":         { color: "#DC2626", ink: "#FFFFFF" }, // red-600
  "4 to 7 days overdue":          { color: "#F97316", ink: "#FFFFFF" }, // orange-500
  "1 to 3 days overdue":          { color: "#FBBF24", ink: "#78350F" }, // amber-400 (dark ink — white fails contrast on amber)
  "On Due Date (0 days)":         { color: "#FFFFFF", ink: "#111827", border: "#D1D5DB" }, // white / gray-300 / gray-900
  "1 to 3 days before due date":  { color: "#38BDF8", ink: "#0C4A6E" }, // sky-400 (dark ink — white fails contrast)
  "4 to 7 days before due date":  { color: "#2563EB", ink: "#FFFFFF" }, // blue-600
  "8 or more days before due date": { color: "#059669", ink: "#FFFFFF" }, // emerald-600
};

/** True when a bucket represents work delivered AFTER its due date. */
export function fineBucketIsLate(key: FineBucketKey): boolean {
  return key.endsWith("overdue");
}

/**
 * URL slug per bucket, and the signed day-offset window each one covers.
 *
 * Both live HERE, beside `bucketForOffset`, because they are the same
 * classification read in the other direction: bucketForOffset maps an offset to
 * a bucket, and FINE_BUCKET_OFFSETS maps a bucket back to the offsets it
 * accepts. Split across two files they would drift the first time a boundary
 * moved, and the drill-through would quietly select a different set of tasks
 * than the bar it was clicked on.
 *
 * The offset is `effectiveDue − today` in whole days, matching
 * pendingOffsetDays: NEGATIVE is overdue, positive is time still remaining.
 * `null` means unbounded on that side.
 */
export const FINE_BUCKET_SLUGS: Record<FineBucketKey, string> = {
  "22 or more days overdue": "22_plus",
  "15 to 21 days overdue": "15_21",
  "8 to 14 days overdue": "8_14",
  "4 to 7 days overdue": "4_7",
  "1 to 3 days overdue": "1_3",
  "On Due Date (0 days)": "on_due",
  "1 to 3 days before due date": "early_1_3",
  "4 to 7 days before due date": "early_4_7",
  "8 or more days before due date": "early_8_plus",
};

export const FINE_BUCKET_BY_SLUG: Record<string, FineBucketKey> = Object.fromEntries(
  (Object.entries(FINE_BUCKET_SLUGS) as [FineBucketKey, string][]).map(([k, v]) => [v, k]),
);

export const FINE_BUCKET_OFFSETS: Record<
  FineBucketKey,
  { min: number | null; max: number | null }
> = {
  "22 or more days overdue": { min: null, max: -22 },
  "15 to 21 days overdue": { min: -21, max: -15 },
  "8 to 14 days overdue": { min: -14, max: -8 },
  "4 to 7 days overdue": { min: -7, max: -4 },
  "1 to 3 days overdue": { min: -3, max: -1 },
  "On Due Date (0 days)": { min: 0, max: 0 },
  "1 to 3 days before due date": { min: 1, max: 3 },
  "4 to 7 days before due date": { min: 4, max: 7 },
  "8 or more days before due date": { min: 8, max: null },
};

/**
 * Classify a signed day-offset into one of the nine buckets.
 *
 * `days` is the SIGNED offset (positive = early/before due, negative = late).
 * Every band is inclusive at both ends and the set is exhaustive:
 *
 *   22 or more days overdue        →  days <= -22
 *   15 to 21 days overdue          →  -21 <= days <= -15
 *   8 to 14 days overdue           →  -14 <= days <= -8
 *   4 to 7 days overdue            →   -7 <= days <= -4
 *   1 to 3 days overdue            →   -3 <= days <= -1
 *   On Due Date (0 days)           →        days === 0
 *   1 to 3 days before due date    →    1 <= days <= 3
 *   4 to 7 days before due date    →    4 <= days <= 7
 *   8 or more days before due date →        days >= 8
 *
 * Ordered worst-first, and the guards below are written in the same order, so
 * the code reads in the same sequence as the rendered list.
 */
export function bucketForOffset(days: number): FineBucketKey {
  if (days <= -22) return "22 or more days overdue";
  if (days <= -15) return "15 to 21 days overdue";
  if (days <= -8) return "8 to 14 days overdue";
  if (days <= -4) return "4 to 7 days overdue";
  if (days <= -1) return "1 to 3 days overdue";
  if (days === 0) return "On Due Date (0 days)";
  if (days <= 3) return "1 to 3 days before due date";
  if (days <= 7) return "4 to 7 days before due date";
  return "8 or more days before due date";
}

const MS_PER_DAY = 86_400_000;

/** Whole-UTC-day index for a Date or ISO/date string (timezone-stable). */
export function fineDayNumber(d: Date | string): number {
  const key = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return Math.floor(new Date(`${key}T00:00:00Z`).getTime() / MS_PER_DAY);
}

/**
 * Signed offset for a DONE task: (effectiveDue − completedAt) in whole days.
 * Positive = finished early, negative = finished late. Returns null when either
 * date is missing (the task cannot be placed on the early/late scale).
 */
export function doneOffsetDays(
  effectiveDue: Date | string | null,
  completedAt: Date | string | null,
): number | null {
  if (!effectiveDue || !completedAt) return null;
  return fineDayNumber(effectiveDue) - fineDayNumber(completedAt);
}

/**
 * Signed offset for a PENDING / not-yet-resolved task as of `now`:
 * (effectiveDue − today) in whole days. Positive = not yet due (early),
 * negative = overdue (late). Returns null when there is no effective due date.
 */
export function pendingOffsetDays(
  effectiveDue: Date | string | null,
  now: Date,
): number | null {
  if (!effectiveDue) return null;
  return fineDayNumber(effectiveDue) - fineDayNumber(now);
}

export interface FineBucketCount {
  key: FineBucketKey;
  count: number;
  late: boolean;
}

/** Build a zeroed, fully-ordered count map over the nine buckets. */
export function emptyFineDistribution(): Map<FineBucketKey, number> {
  return new Map(FINE_AGING_BUCKETS.map((k) => [k, 0]));
}

/** Materialise a count map into the ordered, render-ready bucket list. */
export function toFineBucketList(
  counts: Map<FineBucketKey, number>,
): FineBucketCount[] {
  return FINE_AGING_BUCKETS.map((key) => ({
    key,
    count: counts.get(key) ?? 0,
    late: fineBucketIsLate(key),
  }));
}

export interface DoneFineInput {
  effectiveDue: Date | string | null;
  completedAt: Date | string | null;
}

/**
 * Distribute a set of DONE tasks across the nine buckets using each task's
 * (effectiveDue − completedAt) signed offset. Tasks without both dates are
 * skipped and reported via `undated`.
 */
export function distributeDoneFine(rows: DoneFineInput[]): {
  buckets: FineBucketCount[];
  dated: number;
  undated: number;
} {
  const counts = emptyFineDistribution();
  let dated = 0;
  let undated = 0;
  for (const r of rows) {
    const offset = doneOffsetDays(r.effectiveDue, r.completedAt);
    if (offset === null) {
      undated++;
      continue;
    }
    const key = bucketForOffset(offset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    dated++;
  }
  return { buckets: toFineBucketList(counts), dated, undated };
}

export interface PendingFineInput {
  effectiveDue: Date | string | null;
}

/**
 * Distribute a set of PENDING / not-approved tasks across the nine buckets
 * using each task's (effectiveDue − today) signed offset. Tasks without an
 * effective due date are skipped and reported via `undated`.
 */
export function distributePendingFine(
  rows: PendingFineInput[],
  now: Date,
): {
  buckets: FineBucketCount[];
  dated: number;
  undated: number;
} {
  const counts = emptyFineDistribution();
  let dated = 0;
  let undated = 0;
  for (const r of rows) {
    const offset = pendingOffsetDays(r.effectiveDue, now);
    if (offset === null) {
      undated++;
      continue;
    }
    const key = bucketForOffset(offset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    dated++;
  }
  return { buckets: toFineBucketList(counts), dated, undated };
}
