/**
 * Client-SAFE DCC helpers (no DB import) — shared by the fill UI, the dashboard,
 * and the import script. Weekday bitmask: bit0=Mon … bit6=Sun.
 */

export const DCC_STATUSES = ["Done", "Not done", "NA", "Pending"] as const;
export type DccStatus = (typeof DCC_STATUSES)[number];

// Matches both the abbreviation AND the full weekday name, so "Every Friday",
// "Thursdays", "Wednesday" etc. schedule correctly (previously only "Fri"/"Thu"
// abbreviations parsed — "Every Friday" fell through to null = due every day).
const DAY_TOKENS: Array<[RegExp, number]> = [
  [/\bmon(day)?s?\b/i, 0],
  [/\btue(s|sday)?s?\b/i, 1],
  [/\bwed(nesday)?s?\b/i, 2],
  [/\b(thu(rsday|rs|r)?|thr)s?\b/i, 3],
  [/\bfri(day)?s?\b/i, 4],
  [/\bsat(urday)?s?\b/i, 5],
  [/\bsun(day)?s?\b/i, 6],
];

/** Parse a sheet frequency string ("Daily", "Wed & Sat", "Every Sat") → weekday
 *  bitmask. "Daily" → Mon-Sat. No recognizable day → null (always show). */
export function parseFrequencyToMask(freq: string | null | undefined): number | null {
  const f = (freq ?? "").toLowerCase().trim();
  if (!f) return null;
  if (/\bdaily\b/.test(f) || f === "every day") return 0b111111; // Mon-Sat
  let mask = 0;
  for (const [re, bit] of DAY_TOKENS) if (re.test(f)) mask |= 1 << bit;
  return mask || null;
}

/** JS Date → weekday bit (0=Mon..6=Sun). */
export function weekdayBit(d: Date): number {
  const g = d.getDay(); // 0=Sun..6=Sat
  return g === 0 ? 6 : g - 1;
}

/** Is an item with this weekday mask due on the given date? null/0 mask = always. */
export function isDueOn(weekdays: number | null | undefined, d: Date): boolean {
  if (weekdays == null || weekdays === 0) return true;
  return (weekdays & (1 << weekdayBit(d))) !== 0;
}

// ── DCC v2: schedule kinds + the roster-axis slot model ──────────────────────

export type ScheduleKind = "scheduled" | "weekly" | "monthly" | "adhoc" | "event";

/** Canonical string form: strip U+2060 word-joiner, collapse whitespace, trim.
 *  Reused by the importer to canonicalize participant/subject names too. */
export function normFreq(s: string | null | undefined): string {
  return (s ?? "").replace(/⁠/g, "").replace(/\s+/g, " ").trim();
}

export interface ParsedFrequency {
  scheduleKind: ScheduleKind;
  /** For scheduled: the due-days. For weekly/monthly: eligible-days (0 = any). Ignored for adhoc/event. */
  weekdays: number | null;
  /** true when the raw string was blank/unrecognized → parked as adhoc for a human to classify. */
  needsReview: boolean;
}

function countBits(m: number): number {
  let n = 0;
  for (let b = 0; b < 7; b++) if (m & (1 << b)) n++;
  return n;
}

/**
 * THE single frequency authority (supersedes parseFrequencyToMask as the source
 * of scheduleKind; still calls it for the weekday tokenizing). Decisive rules:
 *  - blank / unrecognized → adhoc + needsReview (NON-blocking; never bloats the
 *    daily due-count — the whole point of the redesign).
 *  - "Adhoc" → adhoc; "As per HH call scheduled" / "as and when" → event.
 *  - "Every Month"/"Monthly" → monthly (1 slot / calendar month).
 *  - "X or Y" (≥2 days) → weekly, one slot satisfiable on either day.
 *  - "Weekly"/"Every Week"/"per week" (no day named) → weekly, any day eligible.
 *  - "Every <single weekday>" → weekly, eligible only that day.
 *  - "Daily" → scheduled Mon-Sat.
 *  - ≥1 explicit weekday joined by &/, → scheduled (each listed day is due).
 */
export function parseFrequency(raw: string | null | undefined): ParsedFrequency {
  const f = normFreq(raw).toLowerCase();
  if (!f) return { scheduleKind: "adhoc", weekdays: null, needsReview: true };
  if (/\badhoc\b/.test(f)) return { scheduleKind: "adhoc", weekdays: null, needsReview: false };
  if (/\bas per\b.*\b(call|scheduled|meeting)\b/.test(f) || /\bas (and )?when\b/.test(f) || /when it happens/.test(f))
    return { scheduleKind: "event", weekdays: null, needsReview: false };

  const mask = parseFrequencyToMask(f);

  if (/\bmonthly\b/.test(f) || /\bevery month\b/.test(f) || /\bper month\b/.test(f))
    return { scheduleKind: "monthly", weekdays: 0, needsReview: false };
  if (/\bor\b/.test(f) && mask && countBits(mask) >= 2)
    return { scheduleKind: "weekly", weekdays: mask, needsReview: false };
  if (/\bweekly\b/.test(f) || /\bevery week\b/.test(f) || /\bper week\b/.test(f))
    return { scheduleKind: "weekly", weekdays: mask ?? 0, needsReview: false };
  if (/\bevery\b/.test(f) && mask && countBits(mask) === 1 && !/\bdaily\b/.test(f))
    return { scheduleKind: "weekly", weekdays: mask, needsReview: false };
  if (/\bdaily\b/.test(f) || f === "every day")
    return { scheduleKind: "scheduled", weekdays: 0b111111, needsReview: false };
  if (mask) return { scheduleKind: "scheduled", weekdays: mask, needsReview: false };

  return { scheduleKind: "adhoc", weekdays: null, needsReview: true };
}

/** A DCC item, minimally, for the slot model. */
export interface SlotItem {
  /** Optional row id — callers may pass full slot rows; ignored by the scheduler. */
  id?: string | null;
  weekdays: number | null;
  scheduleKind?: string | null;
  isParticipantList?: boolean | null;
}

/** Is this item due on `d` as a DAILY slot? Only 'scheduled' non-participant
 *  items ever count toward the daily due-set / gate / streak — weekly, monthly,
 *  adhoc, event and participant-list items are excluded (they live in their own
 *  meters/trays and never block a punch). Byte-identical to isDueOn for legacy
 *  scheduled rows. */
export function scheduledDueOn(it: SlotItem, d: Date): boolean {
  if ((it.scheduleKind ?? "scheduled") !== "scheduled") return false;
  if (it.isParticipantList) return false;
  return isDueOn(it.weekdays, d);
}

/** Entry-map key: a strict superset of the old `${itemId}|${date}` — simple KPIs
 *  get an empty subject segment; participant fills carry the subjectId. */
export const slotKey = (itemId: string, subjectId: string | null | undefined, date: string): string =>
  `${itemId}|${subjectId ?? ""}|${date}`;

/** ISO-8601 week key, e.g. "2026-W27" (Thursday-anchored). */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // shift to the week's Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Calendar-month key, e.g. "2026-07". */
export function yearMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Tone for a DCC status chip/cell. */
export function dccStatusTone(status: string | null | undefined): { bg: string; fg: string; dot: string } {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "done")
    return { bg: "color-mix(in srgb, var(--color-green) 16%, transparent)", fg: "var(--color-green-deep)", dot: "var(--color-green)" };
  if (s === "not done")
    return { bg: "color-mix(in srgb, var(--color-altus-red) 13%, transparent)", fg: "var(--color-altus-red-deep)", dot: "var(--color-altus-red)" };
  if (s === "pending")
    return { bg: "color-mix(in srgb, var(--color-amber, #f59e0b) 20%, transparent)", fg: "var(--color-amber-deep, #b45309)", dot: "var(--color-amber, #f59e0b)" };
  if (s === "na" || s === "not applicable")
    return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-subtle)", dot: "var(--color-ink-subtle)" };
  return { bg: "transparent", fg: "var(--color-ink-subtle)", dot: "var(--color-hairline-strong)" };
}

/** Local YYYY-MM-DD (no UTC shift). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Human label for a weekday mask. */
export function maskLabel(mask: number | null | undefined): string {
  if (mask == null || mask === 0) return "Any";
  if (mask === 0b111111) return "Daily";
  const days: string[] = [];
  for (let b = 0; b < 7; b++) if (mask & (1 << b)) days.push(WEEKDAY_LABELS[b]!);
  return days.join(" · ");
}
