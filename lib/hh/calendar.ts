/**
 * HAND-HOLDING CALENDAR — which weekly calls fall on a date, and how roster
 * names find their employee (account holder, 2026-09-15).
 *
 * The Handholding page shows a week calendar: each person's weekly calls and
 * every Daily Compliance entry, day by day. A weekly call is stored as a weekday
 * (Weekly Call 1 · Sat · 30 mins); it repeats every week on that day between the
 * entry's Start and End Date, and not while the entry is on hold.
 *
 * DCC belongs to employees, while a Handholding name is typed text, so a name is
 * linked to an employee: automatically when it matches an active employee's
 * name exactly, otherwise by hand (Admin and Ruchita).
 *
 * Pure and client-safe.
 */
import { addDaysYmd } from "@/lib/dcc/dashboard";

export interface CalendarEntry {
  id: string;
  personId: string;
  name: string;
  section: string | null;
  onHold: boolean;
  startDate: string | null;
  endDate: string | null;
}

export interface CalendarCall {
  id: string;
  entryId: string;
  seq: number;
  callType: string;
  day: string;
  durationMin: number;
}

export interface CallOccurrence {
  callId: string;
  entryId: string;
  personId: string;
  entryName: string;
  section: string | null;
  callType: string;
  durationMin: number;
}

const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "2026-09-15" → "tue", the code weekly calls are stored with. */
export function dayCodeOf(ymd: string): string {
  return DAY_CODES[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;
}

/** The Monday of the week containing `ymd`. */
export function mondayOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow);
}

/** Monday..Sunday of the week starting `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i));
}

/** The weekly calls that happen on `date`, for the entries given. */
export function callOccurrences(
  entries: readonly CalendarEntry[],
  calls: readonly CalendarCall[],
  date: string,
): CallOccurrence[] {
  const code = dayCodeOf(date);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const out: CallOccurrence[] = [];
  for (const c of [...calls].sort((a, b) => a.seq - b.seq)) {
    if (c.day !== code) continue;
    const e = entryById.get(c.entryId);
    if (!e || e.onHold) continue;
    if (e.startDate && date < e.startDate) continue;
    if (e.endDate && date > e.endDate) continue;
    out.push({
      callId: c.id,
      entryId: e.id,
      personId: e.personId,
      entryName: e.name,
      section: e.section,
      callType: c.callType,
      durationMin: c.durationMin,
    });
  }
  return out;
}

/** Case- and spacing-insensitive: "nandini  maurya" is "Nandini Maurya". */
export function normPersonName(name: string): string {
  return name.trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * Unlinked roster names that match exactly one active employee's name.
 *
 * Exact only — "Rohan" is NOT guessed to be Rohan Choudhary; a first name is
 * linked by hand. Two employees with the same name link neither, since picking
 * one would be a guess.
 */
export function planAutoLinks(
  people: ReadonlyArray<{ id: string; name: string; employeeId: string | null }>,
  employees: ReadonlyArray<{ id: string; name: string }>,
): Array<{ personId: string; employeeId: string }> {
  const byName = new Map<string, string | null>();
  for (const e of employees) {
    const key = normPersonName(e.name);
    byName.set(key, byName.has(key) ? null : e.id);
  }
  const out: Array<{ personId: string; employeeId: string }> = [];
  for (const p of people) {
    if (p.employeeId) continue;
    const employeeId = byName.get(normPersonName(p.name));
    if (employeeId) out.push({ personId: p.id, employeeId });
  }
  return out;
}
