/**
 * OVERDUE-bucket / priority filtering for the WMS To-Do column.
 *
 * PURE — plain string math on IST `YYYY-MM-DD` labels, no server imports and no
 * Date parsing of user data, so the `"use client"` board imports it freely.
 *
 * WHY ymd STRINGS: every due date on a SourceItem is already the EFFECTIVE due
 * (revised ?? due_at) rendered as an IST day by `listOpenTasksForChecklist`.
 * Comparing those labels is the same comparison the server made, so a card that
 * reads "12 days overdue" always lands in the "Overdue 8–14 Days" bucket — a
 * `new Date(...)` round-trip here would re-introduce the timezone shift the
 * server removed.
 *
 * TWO FILTERS ONLY (Sir): OVERDUE and PRIORITY. The old free-form Due filter
 * (All / Overdue / Due Today / This Week) is replaced by the seven overdue
 * BUCKETS below, and the Status filter is gone entirely — a status is an
 * internal WMS state, not something that helps you decide what to do today.
 *
 * The overdue-BUCKET helpers below (`overdueBucket`, `overdueLabel`,
 * `daysOverdue`) are NOT filter options: they are how a card says "12 days
 * overdue" and how the column orders itself oldest-first. `source-card.tsx` and
 * `item-detail.tsx` both import them, so they stay regardless of what the
 * dropdown offers.
 */

import type { TaskPriority } from "@/db/enums";
import type { SourceItem } from "./types";

/**
 * The overdue buckets, oldest-first. `all` is the unfiltered default (you must
 * be able to see the whole column); every other value is a real bucket a task
 * can land in, and each task lands in EXACTLY ONE of them.
 */
export type OverdueFilter =
  | "all"
  | "not_due"
  | "today"
  | "od_1_3"
  | "od_4_7"
  | "od_8_14"
  | "od_15_21"
  | "od_22_plus";

/** A real bucket (everything except the unfiltered `all`). */
export type OverdueBucket = Exclude<OverdueFilter, "all">;

export type PriorityFilter = "all" | TaskPriority;

export interface WmsFilter {
  overdue: OverdueFilter;
  priority: PriorityFilter;
}

export const DEFAULT_WMS_FILTER: WmsFilter = { overdue: "all", priority: "all" };

export const OVERDUE_LABEL: Record<OverdueFilter, string> = {
  all: "All",
  not_due: "Not Due",
  today: "Due Today",
  od_1_3: "Overdue 1–3 Days",
  od_4_7: "Overdue 4–7 Days",
  od_8_14: "Overdue 8–14 Days",
  od_15_21: "Overdue 15–21 Days",
  od_22_plus: "Overdue 22+ Days",
};

/** Dropdown order — most overdue first, so the riskiest bucket is the top pick. */
export const OVERDUE_OPTIONS: OverdueFilter[] = [
  "all",
  "od_22_plus",
  "od_15_21",
  "od_8_14",
  "od_4_7",
  "od_1_3",
  "today",
  "not_due",
];

/* ── ymd math ─────────────────────────────────────────────────────────────── */

/** Shift an IST `YYYY-MM-DD` by whole days. UTC-only arithmetic → no offset drift. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/**
 * Whole IST days a due date is LATE relative to `today`.
 *   > 0 → that many days overdue · 0 → due today · < 0 → still to come.
 * Returns null when there is no due date at all.
 */
export function daysOverdue(dueYmd: string | null | undefined, today: string): number | null {
  if (!dueYmd) return null;
  const [dy, dm, dd] = dueYmd.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const due = Date.UTC(dy ?? 1970, (dm ?? 1) - 1, dd ?? 1);
  const now = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  return Math.round((now - due) / 86_400_000);
}

/**
 * The ONE bucket a task belongs to. Undated work is "Not Due" — nothing is at
 * risk yet, so it must not sit among genuinely late work.
 */
export function overdueBucket(item: SourceItem, today: string): OverdueBucket {
  const late = daysOverdue(item.dueYmd, today);
  if (late == null) return "not_due";
  if (late <= -1) return "not_due";
  if (late === 0) return "today";
  if (late <= 3) return "od_1_3";
  if (late <= 7) return "od_4_7";
  if (late <= 14) return "od_8_14";
  if (late <= 21) return "od_15_21";
  return "od_22_plus";
}

/* ── predicates ───────────────────────────────────────────────────────────── */

export function matchesOverdue(item: SourceItem, f: OverdueFilter, today: string): boolean {
  return f === "all" || overdueBucket(item, today) === f;
}

export function applyWmsFilter(items: SourceItem[], f: WmsFilter, today: string): SourceItem[] {
  return items.filter(
    (i) => matchesOverdue(i, f.overdue, today) && (f.priority === "all" || i.priority === f.priority),
  );
}

export function isFilterActive(f: WmsFilter): boolean {
  return f.overdue !== "all" || f.priority !== "all";
}

/* ── ordering ─────────────────────────────────────────────────────────────── */

/** Eisenhower rank (0 = most important) — mirrors the server-side tiebreaker. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  imp_urgent: 0,
  imp_not_urgent: 1,
  not_imp_urgent: 2,
  not_imp_not_urgent: 3,
};

/** Bucket sort weight — most overdue first, undated last. */
const BUCKET_RANK: Record<OverdueBucket, number> = {
  od_22_plus: 0,
  od_15_21: 1,
  od_8_14: 2,
  od_4_7: 3,
  od_1_3: 4,
  today: 5,
  not_due: 6,
};

/**
 * OLDEST-FIRST ordering (Sir): the work that has been late longest leads the
 * column, then due-today, then everything still to come, then undated. Inside a
 * bucket the older due date wins, with priority breaking the remaining ties.
 *
 * Priority is deliberately the TIEBREAKER, not the lead sort: a Critical task
 * due tomorrow is not more urgent than a Normal task that has been late for a
 * month — the whole point of the overdue buckets is to surface the latter.
 *
 * Applied AFTER filtering so a narrowed list stays ranked by age.
 */
export function sortByAttention(items: SourceItem[], today: string): SourceItem[] {
  const rank = (i: SourceItem) => (i.priority ? PRIORITY_RANK[i.priority] : 9);
  return [...items].sort(
    (a, b) =>
      BUCKET_RANK[overdueBucket(a, today)] - BUCKET_RANK[overdueBucket(b, today)] ||
      (a.dueYmd ?? "9999-99-99").localeCompare(b.dueYmd ?? "9999-99-99") ||
      rank(a) - rank(b),
  );
}

/** "12 days overdue" / "1 day overdue" — null when the task isn't late. */
export function overdueLabel(dueYmd: string | null | undefined, today: string): string | null {
  const late = daysOverdue(dueYmd, today);
  if (late == null || late <= 0) return null;
  return `${late} day${late === 1 ? "" : "s"} overdue`;
}
