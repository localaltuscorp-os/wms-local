/**
 * WCC — THE GROUPS: ALL THE DAILYS FIRST, THEN EACH DAY OF THE WEEK
 * (account holder, 2026-09-19):
 *
 *   "All Dailys to be shown first, then all Mondays, then all Tuesdays, then
 *    all Wednesdays — so if something is M and W, the same item will be shown
 *    on Monday as well as Wednesday, as they are two separate compliances."
 *
 * A row's BUCKET is Daily when its compliance is due every day (Mon to Sat,
 * Mon to Sun — lib/compliance/schedule `isDailyMask`), otherwise the day of
 * the week it is due on: Mon & Wed puts its Monday row under Monday and its
 * Wednesday row under Wednesday. An older once-a-week compliance goes under
 * Once a week, after the days.
 *
 * A group is one bucket on one date, so its heading carries the day the
 * Deadline column used to show — the WCC table has no Deadline column. Daily
 * comes first, a group for each day in the view (oldest first), then the days
 * of the week in order, then Once a week. Rows carried forward sit under the
 * day they were due, marked so. The Frequency column is untouched: a Mon & Wed
 * compliance still reads "Mon & Wed" under Monday.
 *
 * PURE and client-safe.
 */

import { isDailyMask, shortDay, weekdayIndex } from "./schedule";
import type { ComplianceRow } from "./rows";
import type { TeamGroup } from "./team";

/** Daily, a day of the week (Monday = 0 … Sunday = 6), or an older once-a-week one. */
export type WccBucket = "daily" | "weekly" | number;

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type BucketFields = Pick<ComplianceRow, "scheduleKind" | "weekdays" | "deadline">;

export function wccBucketOf(r: BucketFields): WccBucket {
  if (r.scheduleKind === "weekly") return "weekly";
  if (isDailyMask(r.weekdays)) return "daily";
  return weekdayIndex(r.deadline);
}

export interface WccGroup {
  key: string;
  label: string;
  /** Row keys in display order. */
  rowKeys: string[];
}

/** Daily first, then the days of the week, then Once a week. */
const rankOf = (b: WccBucket) => (b === "daily" ? 0 : b === "weekly" ? 2 : 1);

function labelOf(bucket: WccBucket, date: string, today: string, from: string): string {
  const when = date === today ? " · today" : date < from ? " · carried forward" : "";
  // A week's deadline that is today already says so: "by Sat 19 Sep".
  if (bucket === "weekly") return `Once a week · by ${shortDay(date)}${date < from ? " · carried forward" : ""}`;
  if (bucket === "daily") return `Daily · ${shortDay(date)}${when}`;
  return `${WEEKDAY_NAMES[bucket]} · ${+date.slice(8, 10)} ${MON[+date.slice(5, 7) - 1]}${when}`;
}

/**
 * The WCC rows in their groups. `order` sorts the rows inside a group — the
 * checklist's own order for one person, and person by person, in reporting
 * order, for a team.
 */
export function wccDayGroups(
  rows: readonly ComplianceRow[],
  opts: { today: string; from: string; order: (a: ComplianceRow, b: ComplianceRow) => number },
): WccGroup[] {
  const groups = new Map<string, { bucket: WccBucket; date: string; rows: ComplianceRow[] }>();
  for (const r of rows) {
    const bucket = wccBucketOf(r);
    const key = `${bucket}|${r.deadline}`;
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else groups.set(key, { bucket, date: r.deadline, rows: [r] });
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => rankOf(a.bucket) - rankOf(b.bucket) || a.date.localeCompare(b.date))
    .map(([key, g]) => ({
      key,
      label: labelOf(g.bucket, g.date, opts.today, opts.from),
      rowKeys: g.rows.sort(opts.order).map((r) => r.key),
    }));
}

/**
 * The team view: still team-wise (lib/compliance/team.ts), and inside each
 * team the same Daily-then-days sections over the whole team's rows — each
 * section person by person, in reporting order, then in `byItem`'s order.
 * A team's `rowKeys` is every section's rows, in order; a team with no rows
 * in the view is left out.
 */
export function wccTeamGroups(
  rows: readonly ComplianceRow[],
  teams: readonly TeamGroup[],
  opts: { today: string; from: string; byItem: (a: ComplianceRow, b: ComplianceRow) => number },
): (WccGroup & { sections: WccGroup[] })[] {
  const place = new Map<string, number>();
  for (const t of teams) for (const id of t.memberIds) if (!place.has(id)) place.set(id, place.size);
  const order = (a: ComplianceRow, b: ComplianceRow) =>
    (place.get(a.ownerId) ?? 0) - (place.get(b.ownerId) ?? 0) || opts.byItem(a, b);
  return teams
    .map((t) => {
      const members = new Set(t.memberIds);
      const sections = wccDayGroups(
        rows.filter((r) => members.has(r.ownerId)),
        { today: opts.today, from: opts.from, order },
      ).map((s) => ({ ...s, key: `${t.key}::${s.key}` }));
      return { key: t.key, label: t.label, rowKeys: sections.flatMap((s) => s.rowKeys), sections };
    })
    .filter((t) => t.rowKeys.length > 0);
}
