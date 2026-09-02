import type { TrendPoint, TrendWindows } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Rows the trend reads. Kept structural so both the dashboard scan (which
 *  drops the big text columns) and tests can supply them. */
export interface TrendInput {
  createdAt: Date;
  completedAt?: Date | null;
}

function startOfUTCDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** `2026-08-15` — the key the tooltip formats and the series is indexed by. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * A dense day-by-day series ending TODAY, oldest first.
 *
 * Dense matters: the sparkline plots by index, so a sparse series (days with no
 * activity omitted) would silently compress a quiet week into a straight line
 * and put the wrong date under the reader's cursor.
 *
 * `created` buckets on `created_at`, `completed` on `completed_at` — a task
 * created on the 3rd and finished on the 9th contributes to both, on different
 * days. That is the point of the pair: one line is intake, the other is
 * throughput, and the gap between them is the backlog moving.
 */
export function computeTrendSeries(
  tasks: TrendInput[],
  now: Date,
  days: number,
): TrendPoint[] {
  const today = startOfUTCDay(now);
  const first = today - (days - 1) * MS_PER_DAY;

  const points: TrendPoint[] = [];
  const index = new Map<string, TrendPoint>();
  for (let i = 0; i < days; i++) {
    const ms = first + i * MS_PER_DAY;
    const point: TrendPoint = { date: isoDay(ms), created: 0, completed: 0 };
    points.push(point);
    index.set(point.date, point);
  }

  for (const t of tasks) {
    const created = index.get(isoDay(startOfUTCDay(t.createdAt)));
    if (created) created.created += 1;
    if (t.completedAt) {
      const done = index.get(isoDay(startOfUTCDay(t.completedAt)));
      if (done) done.completed += 1;
    }
  }

  return points;
}

/**
 * The smallest previous-window volume a PERCENTAGE may be computed from.
 *
 * A ratio needs a baseline with some weight behind it. Going from 1 task to 12
 * is a true +1100%, and the card duly printed "▲ 1155% vs last week" — an
 * arithmetically correct figure that tells the reader nothing except that a
 * quiet week happened to be followed by a normal one. Four-digit percentages
 * read as a broken metric, and they crowd out the numbers on the card that are
 * real.
 *
 * Below this floor the badge states the plain difference instead ("▲ +11"),
 * which is both honest and the thing a reader can act on at that volume. The
 * threshold lives HERE, beside the division it guards, so the card and its
 * detail panel cannot disagree about when a percentage is meaningful.
 */
export const MIN_PCT_BASELINE = 5;

/**
 * The largest percentage worth printing. Past this, the badge states the plain
 * difference instead.
 *
 * WHY A FLOOR ON THE BASELINE WAS NOT ENOUGH. MIN_PCT_BASELINE catches the
 * 1 → 12 case, and it is doing its job — but it never fires on the numbers
 * this was reported for. "▲ 265%" is 20 → 73. "▲ 967%" is 6 → 64. Those
 * baselines are 20 and 6; the arithmetic is exactly right, and the output is
 * still useless.
 *
 * That is the real lesson: a ratio is only informative inside a range. Past a
 * tripling it has stopped describing a trend and started describing an
 * anomalous baseline — a quiet week, a bulk import, a team that was on leave —
 * and at that point the reader wants to know that 53 more tasks arrived, not
 * that the number tripled and a half. So the cap is on the OUTPUT, where the
 * problem actually is, rather than on the input the guard already screens.
 *
 * 200 is a tripling. Below it the percentage still says something a person can
 * act on ("▲ 127%" — it doubled); above it, the count says more.
 */
export const MAX_PCT_MAGNITUDE = 200;

/**
 * The badge on each card: current 7-day volume vs the 7 days before it.
 *
 *   changePct = (current − previous) / previous × 100
 *
 * `changePct` is null when the previous window is too small to divide by — see
 * MIN_PCT_BASELINE. The card falls back to the absolute delta in that case.
 *
 * WHY THIS REPLACED THE OLD DELTA: the card used to show
 * `kpi.current − kpi.previous`, where `current` was the task count over the
 * WHOLE active date filter (31 days by default) and `previous` was a 7-day
 * count. Subtracting one from the other compares two different windows, which
 * is how a steady week produced a "▲ 323 vs last week".
 */
export function computeTrendWindows(
  points: TrendPoint[],
  windowDays = 7,
  metric: "created" | "completed" = "created",
): TrendWindows {
  const at = (i: number) => (i >= 0 && i < points.length ? points[i]![metric] : 0);
  const end = points.length;

  let current = 0;
  for (let i = end - windowDays; i < end; i++) current += at(i);

  let previous = 0;
  for (let i = end - 2 * windowDays; i < end - windowDays; i++) previous += at(i);

  return {
    windowDays,
    current,
    previous,
    changePct:
      previous >= MIN_PCT_BASELINE
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : null,
  };
}
