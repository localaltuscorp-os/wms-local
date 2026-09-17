import { parseFrequency, weekdayBit, type ScheduleKind } from "./util";

/**
 * CHOOSING WHEN A COMPLIANCE IS DUE (DCC-SPEC §5).
 *
 * ── THE BUG THIS MODULE EXISTS TO CLOSE ────────────────────────────────────
 * `frequency` is free text on the row, and until now the "add a compliance"
 * form wrote ONLY that text: `weekdays` stayed NULL and `schedule_kind` took its
 * `"scheduled"` default. `scheduledDueOn` reads those two columns and treats a
 * NULL mask as "every day", so a compliance created with "Every Friday" was due
 * every single day, and one created with "Adhoc" was due every day too. The
 * text said one thing and the board did another, with nothing on screen
 * admitting it.
 *
 * So the schedule is now PICKED, not typed. The picker produces all three
 * values together — the text people read, and the two columns the scheduler
 * actually obeys — and they cannot disagree because they come from one call.
 *
 * ── WHY ONLY THREE CHOICES ─────────────────────────────────────────────────
 * `parseFrequency` can also yield `weekly`, `monthly`, `adhoc` and `event`, and
 * imported sheet rows do carry those. But `scheduledDueOn` admits ONLY
 * `scheduled` items to a day, and nothing in the rebuilt module surfaces the
 * others — so offering "Weekly" here would let somebody create a compliance
 * that never appears anywhere, which is a worse failure than not offering it.
 * Every option below produces a `scheduled` row that shows up on My Day.
 *
 * PURE and client-safe: the form previews the schedule with the same functions
 * the server writes it with, so what you are shown is what is stored.
 */

export const WEEKDAYS = [
  { bit: 0, short: "Mon", long: "Monday" },
  { bit: 1, short: "Tue", long: "Tuesday" },
  { bit: 2, short: "Wed", long: "Wednesday" },
  { bit: 3, short: "Thu", long: "Thursday" },
  { bit: 4, short: "Fri", long: "Friday" },
  { bit: 5, short: "Sat", long: "Saturday" },
  { bit: 6, short: "Sun", long: "Sunday" },
] as const;

/** Monday–Saturday: the week this company works, and what "Daily" has meant. */
export const WORKING_WEEK_MASK = 0b0111111;
export const FULL_WEEK_MASK = 0b1111111;

/**
 * `working` and `everyday` are not just presets — they are the two answers
 * almost everybody wants, and making them one click each keeps the weekday grid
 * for the case that actually needs it.
 */
export const DCC_SCHEDULE_CHOICES = ["working", "everyday", "days"] as const;
export type DccScheduleChoice = (typeof DCC_SCHEDULE_CHOICES)[number];

export interface DccSchedule {
  choice: DccScheduleChoice;
  /** Weekday bits, 0 = Monday. Read only when `choice` is "days". */
  weekdays: number[];
}

export const DEFAULT_SCHEDULE: DccSchedule = { choice: "working", weekdays: [] };

export function maskOf(bits: readonly number[]): number {
  let m = 0;
  for (const b of bits) if (b >= 0 && b <= 6) m |= 1 << b;
  return m;
}

export function bitsOf(mask: number | null | undefined): number[] {
  if (mask == null) return [];
  return WEEKDAYS.filter((d) => (mask & (1 << d.bit)) !== 0).map((d) => d.bit);
}

/** The mask a schedule resolves to, before it is turned into a row. */
export function maskForSchedule(s: DccSchedule): number {
  if (s.choice === "working") return WORKING_WEEK_MASK;
  if (s.choice === "everyday") return FULL_WEEK_MASK;
  return maskOf(s.weekdays);
}

/** A schedule with no day at all would be a compliance that is never due. */
export function isCompleteSchedule(s: DccSchedule): boolean {
  return maskForSchedule(s) !== 0;
}

export interface ResolvedSchedule {
  /** The text stored on the row and read by people and by the importer. */
  frequency: string;
  /** The column the scheduler actually obeys. */
  weekdays: number;
  scheduleKind: ScheduleKind;
  needsReview: boolean;
}

/**
 * One schedule → the three values a row needs.
 *
 * The `frequency` strings are chosen so `parseFrequency` reads them back as
 * exactly this mask and kind — tests/unit/dcc-frequency.test.ts asserts the
 * round trip for every option, because the importer and the position master
 * still go through the text and must land in the same place.
 */
export function resolveSchedule(s: DccSchedule): ResolvedSchedule {
  const weekdays = maskForSchedule(s);
  return {
    // "Daily" is the sheet's own word for Monday–Saturday, and the word already
    // sitting in the imported rows; a new row must not read differently.
    frequency:
      weekdays === WORKING_WEEK_MASK
        ? "Daily"
        : WEEKDAYS.filter((d) => (weekdays & (1 << d.bit)) !== 0)
            .map((d) => d.short)
            .join(", ")
            .replace(/, ([^,]*)$/, " & $1"),
    weekdays,
    scheduleKind: "scheduled",
    needsReview: false,
  };
}

/** One line under the picker, in the words the board will behave in. */
export function describeSchedule(s: DccSchedule): string {
  const mask = maskForSchedule(s);
  if (mask === 0) return "Pick at least one day, or it will never be due.";
  if (mask === WORKING_WEEK_MASK) return "Due every working day, Monday to Saturday.";
  if (mask === FULL_WEEK_MASK) return "Due every day, Sunday included.";
  const names = WEEKDAYS.filter((d) => (mask & (1 << d.bit)) !== 0).map((d) => d.long);
  const last = names.pop()!;
  return `Due on ${names.length ? `${names.join(", ")} and ${last}` : last}.`;
}

/**
 * The first day on or after `ymd` this schedule is due — the preview's "next on".
 *
 * A mask with no days would loop forever, so it returns null instead; the form
 * refuses to save that schedule anyway.
 */
export function nextDueOnOrAfter(s: DccSchedule, ymd: string): string | null {
  const mask = maskForSchedule(s);
  if (mask === 0) return null;
  const start = Date.parse(`${ymd}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + i * 86_400_000);
    if ((mask & (1 << weekdayBit(d))) !== 0) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * An existing row → the schedule the edit form opens on.
 *
 * `weekdays` wins over `frequency` because it is what the board obeys; the text
 * is only consulted for rows written before the picker existed, where the column
 * is NULL. Showing the text's intent there is the honest reading of a row whose
 * two halves disagree.
 */
export function scheduleOf(item: {
  frequency: string | null;
  weekdays: number | null;
}): DccSchedule {
  const mask = item.weekdays ?? parseFrequency(item.frequency).weekdays ?? WORKING_WEEK_MASK;
  if (mask === WORKING_WEEK_MASK) return { choice: "working", weekdays: [] };
  if (mask === FULL_WEEK_MASK) return { choice: "everyday", weekdays: [] };
  return { choice: "days", weekdays: bitsOf(mask) };
}
