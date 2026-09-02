import { localDateString } from "@/lib/format";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/db/schema";

/**
 * Every date on this page is resolved in the ORG timezone, never the runtime's.
 * Vercel runs UTC and the browser runs the viewer's zone, so a raw
 * `new Date().getDate()` would print one day on the server and another in the
 * client and hydrate mismatched. Anchoring on IST makes both agree, and matches
 * how attendance / DCC already pin a calendar day.
 */
const TZ = "Asia/Kolkata";

/**
 * Inbox CATEGORIES — the seven buckets the Inbox filter bar offers.
 *
 * The Inbox used to carry the ten-module shortcut row at the top, which is
 * navigation, not a filter: it took you OUT of the page you were reading. The
 * bar is now a set of filters over this taxonomy, so the row answers "which of
 * my notifications do I want to look at" instead of "where else could I go".
 *
 * Every `NotificationKind` maps to exactly one category (see `CATEGORY_OF`), so
 * the seven buttons partition the feed — nothing is unreachable. `CATEGORY_OF`
 * is a total `Record<NotificationKind, …>` on purpose: adding a kind without
 * classifying it is a type error, not a notification that quietly vanishes from
 * every filter.
 *
 * This is presentation only. Nothing here changes what a notification IS, who
 * receives it, or how it is delivered.
 */

export const NOTIFICATION_CATEGORIES = [
  "attendance",
  "planning",
  "wms_tasks",
  "goals",
  "daily_commitments",
  "admin",
  "daily_compliance",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  attendance: "Attendance",
  planning: "Planning",
  wms_tasks: "WMS Tasks",
  goals: "Goals",
  daily_commitments: "Daily Commitments",
  admin: "Admin Panel",
  daily_compliance: "Daily Compliance",
};

/**
 * Kind → category.
 *
 * PLANNING vs GOALS vs DAILY COMMITMENTS is the one split worth spelling out,
 * because all three touch the goals cascade:
 *   • planning           — prompts to DECIDE the week ("commit next week's
 *                          goals", "approve your team's"). Nothing has happened
 *                          yet; you are being asked to plan.
 *   • goals              — the goals themselves moving: assigned, committed,
 *                          approved, still unfilled.
 *   • daily_commitments  — the Plan My Day / daily-checklist loop: what you
 *                          promised to deliver TODAY.
 */
const CATEGORY_OF: Record<NotificationKind, NotificationCategory> = {
  // ── WMS Tasks ─────────────────────────────────────────────────────────
  task_assigned: "wms_tasks",
  task_initiated: "wms_tasks",
  status_changed: "wms_tasks",
  approved: "wms_tasks",
  declined: "wms_tasks",
  reassigned: "wms_tasks",
  transferred: "wms_tasks",
  cancelled: "wms_tasks",
  commented: "wms_tasks",
  nudged: "wms_tasks",
  overdue_digest: "wms_tasks",

  // ── Attendance ────────────────────────────────────────────────────────
  attendance_late: "attendance",
  attendance_late_waived: "attendance",
  attendance_half_day: "attendance",
  attendance_device: "attendance",
  attendance_late_deduction: "attendance",

  // ── Planning — "decide your week" prompts ─────────────────────────────
  goals_commit_reminder: "planning",
  goals_approval_reminder: "planning",

  // ── Goals — the goals themselves ──────────────────────────────────────
  weekly_goals_assigned: "goals",
  weekly_goals_fill_reminder: "goals",
  weekly_goals_incomplete: "goals",
  goals_committed: "goals",
  goals_approved: "goals",

  // ── Daily Compliance — the DCC KPI sheet ──────────────────────────────
  dcc_fill_reminder: "daily_compliance",

  // ── Admin Panel — HR, appraisal, training, broadcasts, partner nudges ──
  training_test_failed: "admin",
  ambassador_reminder: "admin",
  hr_confirmation_due: "admin",
  hr_ticket_created: "admin",
  hr_ticket_assigned: "admin",
  hr_ticket_replied: "admin",
  hr_ticket_status_changed: "admin",
  hr_ticket_sla_breach: "admin",
  hr_ticket_csat_request: "admin",
  appraisal_cycle_opened: "admin",
  appraisal_self_reminder: "admin",
  appraisal_manager_pending: "admin",
  appraisal_management_pending: "admin",
  appraisal_finalized: "admin",
  broadcast: "admin",
};

/** The category a kind belongs to. Unclassified kinds fall to Admin Panel. */
export function categoryOfKind(kind: NotificationKind): NotificationCategory {
  return CATEGORY_OF[kind] ?? "admin";
}

/** Every kind in a category — what the server filters `where kind in (…)` on. */
export function kindsInCategory(category: NotificationCategory): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((k) => categoryOfKind(k) === category);
}

/** Narrow an arbitrary `?cat=` query value. */
export function parseCategory(v: string | undefined): NotificationCategory | undefined {
  if (!v) return undefined;
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(v)
    ? (v as NotificationCategory)
    : undefined;
}

/* ------------------------------------------------------------------------ */
/* Period                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The date range a notification is ABOUT — not when it was sent.
 *
 * There is no `period` column on `notifications`, and inventing one would be a
 * schema + backfill change to every producer. The period is DERIVED from what
 * the row already knows, per category, and only where the answer is real:
 *   • attendance / daily compliance — the single day being reported on.
 *   • planning / goals             — the Mon–Sun week the reminder covers.
 *   • WMS tasks                    — the task's own created → due window.
 *   • anything else                — no period; the row renders a quiet dash.
 *
 * Returning `null` is the honest answer for most Admin Panel rows and is why
 * the column shows "—" rather than guessing a range.
 */
export interface NotificationPeriod {
  start: Date;
  end: Date;
}

/**
 * The IST calendar day of `d`, held as a UTC-midnight Date so all the arithmetic
 * below (week shifts, day diffs) is plain and timezone-free from here on.
 */
function dayOf(d: Date): Date {
  return new Date(`${localDateString(TZ, d)}T00:00:00.000Z`);
}

/** Monday of the week containing `d` (IST weeks, Monday-first). */
function weekStart(d: Date): Date {
  const s = dayOf(d);
  // getUTCDay(): 0 = Sunday. Shift so Monday is the first day.
  s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7));
  return s;
}

export function notificationPeriod(row: {
  kind: NotificationKind;
  createdAt: Date;
  taskCreatedAt?: Date | null;
  taskDueAt?: Date | null;
}): NotificationPeriod | null {
  const category = categoryOfKind(row.kind);

  if (category === "attendance" || category === "daily_compliance" || category === "daily_commitments") {
    const d = dayOf(row.createdAt);
    return { start: d, end: d };
  }

  if (category === "planning" || category === "goals") {
    const start = weekStart(row.createdAt);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start, end };
  }

  if (category === "wms_tasks") {
    // Only a task that has BOTH ends has a window. A task with no due date has
    // an open-ended one, which is not a period.
    if (row.taskCreatedAt && row.taskDueAt) {
      return { start: dayOf(row.taskCreatedAt), end: dayOf(row.taskDueAt) };
    }
    return null;
  }

  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `01-Aug-2026` — the period column's date atom. */
export function formatPeriodDate(d: Date): string {
  const u = dayOf(d);
  return `${String(u.getUTCDate()).padStart(2, "0")}-${MONTHS[u.getUTCMonth()]}-${u.getUTCFullYear()}`;
}

/** `01-Aug-2026 – 18-Aug-2026`, collapsed to one date when start === end. */
export function formatPeriod(p: NotificationPeriod | null): string | null {
  if (!p) return null;
  const a = formatPeriodDate(p.start);
  const b = formatPeriodDate(p.end);
  return a === b ? a : `${a} – ${b}`;
}

/** `18-08-26` (DD-MM-YY) — the leading "shared on" date column. */
export function formatShortDate(d: Date): string {
  const [y, m, day] = localDateString(TZ, d).split("-");
  return `${day}-${m}-${(y ?? "").slice(-2)}`;
}

/**
 * `4:05 pm` — the exact time the notification was SENT, shown under its date.
 *
 * Lives here beside `formatShortDate` and reads the same `TZ` deliberately: a
 * date rendered in IST next to a time rendered in the browser's zone would
 * disagree across midnight, and the row would claim a notification arrived on a
 * day it did not. Both come off `notifications.created_at`, so this is the
 * stored send time, never "now".
 */
export function formatShortTime(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Whole days between `d` and now, floored at 0. Drives "N days ago". */
export function daysAgo(d: Date, now: Date = new Date()): number {
  const ms = dayOf(now).getTime() - dayOf(d).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** "Today" / "1 day ago" / "12 days ago" — the final time column. */
export function formatDaysAgo(d: Date, now: Date = new Date()): string {
  const n = daysAgo(d, now);
  if (n === 0) return "Today";
  if (n === 1) return "1 day ago";
  return `${n} days ago`;
}
