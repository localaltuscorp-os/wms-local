/**
 * The time/duration label a Plan My Day card shows (Sir's rule 15).
 *
 * PURE — no server imports, no `new Date()` of its own — so it can be unit
 * tested and used from either side of the wire.
 *
 * IT NEVER INVENTS A TIME. The label is derived strictly from what the task row
 * actually holds:
 *   1. a real scheduled block  (`starts_at` + `ends_at`, not all-day) → "4:30 PM – 5:30 PM"
 *   2. a start with no end                                           → "4:30 PM"
 *   3. planned effort only     (`estimated_minutes`)                 → "30 min" / "1 hr 30 min"
 *   4. nothing                                                       → null (the card shows no time line)
 *
 * Clock times are rendered in IST (the team's clock) SERVER-SIDE, so the string
 * the server sends is the string the browser paints — no hydration mismatch and
 * no per-viewer timezone drift.
 */

const IST = "Asia/Kolkata";

const istClock = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "16:30 IST" → "4:30 PM" (upper-cased meridiem, non-breaking space removed). */
function istTime(d: Date): string {
  return istClock.format(d).replace(/ | /g, " ").trim().toUpperCase();
}

/** 90 → "1 hr 30 min" · 60 → "1 hr" · 30 → "30 min". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  const hrLabel = `${hrs} hr`;
  return rem === 0 ? hrLabel : `${hrLabel} ${rem} min`;
}

export interface TaskTimeFields {
  startsAt?: Date | null;
  endsAt?: Date | null;
  allDay?: boolean | null;
  estimatedMinutes?: number | null;
}

/** The card's time line, or null when the task carries no time at all. */
export function taskTimeLabel(t: TaskTimeFields | null | undefined): string | null {
  if (!t) return null;
  const { startsAt, endsAt, allDay, estimatedMinutes } = t;
  if (startsAt && !allDay) {
    return endsAt ? `${istTime(startsAt)} – ${istTime(endsAt)}` : istTime(startsAt);
  }
  if (estimatedMinutes != null && estimatedMinutes > 0) return formatDuration(estimatedMinutes);
  return null;
}

/* ── minutes-of-day (the Plan My Day timeline) ───────────────────────────── */

/**
 * The planner stores a commitment's time as MINUTES FROM IST MIDNIGHT plus a
 * block length (migration 0185). The helpers below are the only place that
 * arithmetic lives, so the timeline, the add form and the server action can
 * never disagree about what "10:30 for 45 minutes" means.
 */

/** Minutes-from-IST-midnight of an absolute instant (e.g. tasks.starts_at). */
export function istMinuteOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** 630 → "10:30" (the value an `<input type="time">` wants). */
export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "10:30" → 630. Returns null for anything that isn't a real time of day. */
export function hhmmToMin(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** 630 → "10:30 AM". Pure integer math — no Date, so no timezone can touch it. */
export function minToClock(min: number): string {
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The hour label down the timeline gutter: 600 → "10 AM". */
export function minToHourLabel(min: number): string {
  const h24 = Math.floor((((Math.round(min) % 1440) + 1440) % 1440) / 60);
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${suffix}`;
}

/** What a scheduled commitment reads on its card: "10:30 AM – 11:15 AM". */
export function blockLabel(startMin: number | null, durationMin: number | null): string | null {
  if (startMin == null) return durationMin != null && durationMin > 0 ? formatDuration(durationMin) : null;
  if (durationMin == null || durationMin <= 0) return minToClock(startMin);
  return `${minToClock(startMin)} – ${minToClock(startMin + durationMin)}`;
}

/** "09:00" / "09:00:00" (employees.working_hours_*) → minutes. Null if unusable. */
export function timeColumnToMin(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface PlanRowTime {
  /** The commitment's OWN time (daily_checklist.start_min / duration_min). */
  startMin?: number | null;
  durationMin?: number | null;
}

/**
 * The EFFECTIVE time of a plan row: what the user set on the commitment wins;
 * otherwise a task-linked row inherits the schedule already on its WMS task.
 *
 * That order matters — dragging a commitment to 2 PM on the planner must not be
 * silently overruled by the task's own calendar block, and a task that was
 * scheduled in WMS shouldn't have to be re-timed here to show up on the
 * timeline. Nothing is invented: a row with neither is "Anytime".
 */
export function effectiveTime(
  row: PlanRowTime & TaskTimeFields,
): { startMin: number | null; durationMin: number | null } {
  if (row.startMin != null) {
    return { startMin: row.startMin, durationMin: row.durationMin ?? null };
  }
  if (row.startsAt && !row.allDay) {
    const start = istMinuteOfDay(row.startsAt);
    const dur = row.endsAt
      ? Math.max(1, istMinuteOfDay(row.endsAt) - start)
      : (row.estimatedMinutes ?? null);
    return { startMin: start, durationMin: dur && dur > 0 ? dur : null };
  }
  // Length but no position — a known effort that hasn't been placed in the day.
  return { startMin: null, durationMin: row.durationMin ?? row.estimatedMinutes ?? null };
}

/**
 * A START + END pair → what we actually store (start minute + length).
 *
 * The planner stores a start and a DURATION, so "end" is derived rather than a
 * second column. This is the one place that conversion happens, which is what
 * keeps the card, the composer and the detail dialog agreeing about whether a
 * range is legal.
 *
 * Rules (Sir's 7): an end BEFORE the start is rejected with a message rather
 * than silently clamped; an end EQUAL to the start is a zero-length block, also
 * rejected; and an empty end is perfectly fine — a start time with no end.
 */
export interface TimeRange {
  ok: boolean;
  startMin: number | null;
  durationMin: number | null;
  error: string | null;
}

export function rangeFromHhmm(startHhmm: string, endHhmm: string): TimeRange {
  const startMin = hhmmToMin(startHhmm);
  const endMin = hhmmToMin(endHhmm);

  if (startMin == null) {
    // No start ⇒ "Anytime". An end alone has nothing to hang off.
    return endMin == null
      ? { ok: true, startMin: null, durationMin: null, error: null }
      : { ok: false, startMin: null, durationMin: null, error: "Set a start time first." };
  }
  if (endMin == null) return { ok: true, startMin, durationMin: null, error: null };
  if (endMin <= startMin) {
    return { ok: false, startMin, durationMin: null, error: "End time must be after the start time." };
  }
  return { ok: true, startMin, durationMin: endMin - startMin, error: null };
}

/** The end of a block as "HH:MM", for an `<input type="time">`. */
export function endHhmm(startMin: number | null | undefined, durationMin: number | null | undefined): string {
  if (startMin == null || durationMin == null || durationMin <= 0) return "";
  return minToHhmm((startMin + durationMin) % 1440);
}
