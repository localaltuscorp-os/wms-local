import type { Task } from "@/db/schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function countInRange(
  tasks: Task[],
  start: Date,
  endExclusive: Date,
): number {
  const s = start.getTime();
  const e = endExclusive.getTime();
  let n = 0;
  for (const t of tasks) {
    const c = t.createdAt.getTime();
    if (c >= s && c < e) n++;
  }
  return n;
}

export function computeWeekOverWeekDelta(
  tasks: Task[],
  now: Date,
): { current: number; previous: number } {
  const oneWeekAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * MS_PER_DAY);
  return {
    current: countInRange(tasks, oneWeekAgo, now),
    previous: countInRange(tasks, twoWeeksAgo, oneWeekAgo),
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function computeDailySparkline(
  tasks: Task[],
  now: Date,
  days: number,
): number[] {
  const today = startOfDay(now);
  const buckets = new Array<number>(days).fill(0);
  for (const t of tasks) {
    const d = startOfDay(t.createdAt);
    const diff = Math.floor(
      (today.getTime() - d.getTime()) / MS_PER_DAY,
    );
    if (diff < 0 || diff >= days) continue;
    const idx = days - 1 - diff;
    buckets[idx]! += 1;
  }
  return buckets;
}
