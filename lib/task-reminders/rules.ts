import type { TaskStatus } from "@/db/enums";
import type { TaskReminderStatusToken } from "@/db/schema";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";

/**
 * Shared vocabulary for Task Reminder Settings — one source of truth for the
 * admin UI, the server actions and the dispatcher, so the checklist an admin
 * ticks and the query that runs at send time can never disagree.
 */

/**
 * Statuses a reminder rule may chase, plus the derived `overdue` token.
 *
 * `overdue` is NOT a status. It means "due_at is in the past", which cuts
 * across every live status — a task can be Initiated AND overdue. It sits in
 * the same list because that is how the setting reads to an admin: one
 * checklist of what should be chased.
 *
 * The terminal values are deliberately absent and can never be selected:
 * done / approved / not_approved / cancelled / transferred. A reminder is a
 * nudge to finish work, and finished work has nothing to nudge.
 */
export const REMINDER_STATUS_TOKENS: readonly TaskReminderStatusToken[] = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "need_info",
  "need_help",
  "on_hold",
  "overdue",
] as const;

/**
 * Defaults for a new rule: Not Read · Not Started · Initiated · Overdue.
 *
 * "In Progress" as a concept maps to `initiated` — this app has no status by
 * that name (see lib/format.ts STATUS_LABELS_FALLBACK); `initiated` is the
 * value meaning "picked up, not finished".
 */
export const DEFAULT_REMINDER_STATUSES: readonly TaskReminderStatusToken[] = [
  "dont_know",
  "not_started",
  "initiated",
  "overdue",
] as const;

/**
 * Statuses that mean "this task is finished" and are excluded from every
 * reminder REGARDLESS of what a rule asks for.
 *
 * This is a hard floor, not a default: it is applied in the dispatch query on
 * top of the rule's own filter, so a rule that somehow carried a terminal
 * status (hand-edited row, a future status added to the picker by mistake)
 * still cannot email somebody about work they already closed.
 */
export const NEVER_REMIND_STATUSES: readonly TaskStatus[] = [
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

export function reminderStatusLabel(token: TaskReminderStatusToken): string {
  if (token === "overdue") return "Overdue";
  return STATUS_LABELS_FALLBACK[token] ?? token;
}

/** Split a rule's tokens into real statuses and the derived overdue flag. */
export function splitReminderStatuses(tokens: readonly TaskReminderStatusToken[]): {
  statuses: TaskStatus[];
  includeOverdue: boolean;
} {
  const statuses: TaskStatus[] = [];
  let includeOverdue = false;
  for (const t of tokens) {
    if (t === "overdue") {
      includeOverdue = true;
      continue;
    }
    if ((NEVER_REMIND_STATUSES as readonly string[]).includes(t)) continue;
    statuses.push(t);
  }
  return { statuses, includeOverdue };
}

/* ── IST clock helpers ─────────────────────────────────────────────────────
   The org is entirely IST (UTC+05:30, no DST), the same assumption the digest
   cron's `digest_hour_ist` already makes. Rules store a wall-clock "HH:MM" and
   an IST "YYYY-MM-DD" last-sent stamp, so both helpers below shift by 330
   minutes and then read UTC fields off the shifted instant — never the host's
   local timezone, which on Vercel is UTC and on a laptop is anything.        */

const IST_OFFSET_MS = 330 * 60 * 1000;

/** "YYYY-MM-DD" for the IST day containing `now`. */
export function istDateKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:MM" IST wall clock for `now`. */
export function istTimeKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** `true` for a well-formed 24-hour "HH:MM". */
export function isValidSendTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Has this rule come due on the IST day containing `now`?
 *
 * `>=` rather than `===` on purpose: the dispatcher ticks every 15 minutes, so
 * an exact-match test would drop any rule whose minute never lines up with a
 * tick, and would silently skip the whole day if one tick was missed (deploy,
 * cold start, outage). Paired with the `lastSentOn` guard, "past its time and
 * not yet sent today" fires once and catches up.
 */
export function isRuleDue(
  rule: { sendTimeIst: string; lastSentOn: string | null },
  now: Date,
): boolean {
  const today = istDateKey(now);
  if (rule.lastSentOn === today) return false;
  return istTimeKey(now) >= rule.sendTimeIst;
}
