const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Count working days in [start, end] inclusive (UTC days). A day is working
 *  unless its UTC weekday is in `weeklyOff` (default Sunday only) or its
 *  "YYYY-MM-DD" key is in `holidayDays`. */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidayDays: Set<string>,
  weeklyOff: number[] = [0],
): number {
  const off = new Set(weeklyOff);
  let count = 0;
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let t = s; t <= e; t += MS_PER_DAY) {
    const day = new Date(t);
    if (off.has(day.getUTCDay())) continue;
    if (holidayDays.has(day.toISOString().slice(0, 10))) continue;
    count++;
  }
  return count;
}
