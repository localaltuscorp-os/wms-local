/**
 * Daily Goals -> Dashboard — the payload shapes and the ranking rules.
 *
 * CLIENT-SAFE on purpose (no `server-only`, no db). The server assembler
 * (app/(app)/my-day/dashboard/data.ts) fills these in and the client view reads
 * them, so neither side owns the contract alone — and the ranking functions can
 * be unit-tested without a database.
 */

import { hasSignal, pct, type ResolvedRange, type Scorecard } from "./score";

export interface DashPerson {
  id: string;
  name: string;
  department: string | null;
  /** Their manager — the "Team Leader" the org filters key off. */
  leadId: string | null;
  leadName: string | null;
}

/** One person's numbers across the three windows the dashboard reports on. */
export interface PersonRow extends DashPerson {
  /** The window the header is currently set to. */
  range: Scorecard;
  week: Scorecard;
  mtd: Scorecard;
}

/** "Transferred From <day>" — one destination day and how much moved to it. */
export interface TransferRow {
  /** Where the work went (yyyy-mm-dd). */
  toDay: string;
  count: number;
}

export interface DashFilters {
  department: string | null;
  leadId: string | null;
  employeeId: string | null;
  threshold: number;
}

export interface DashOptions {
  departments: string[];
  leads: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}

export interface DashPayload {
  /** True when the viewer can only ever see themselves — the org filters, the
   *  leaderboards and the threshold table are all withheld in that mode. */
  individual: boolean;
  /** The signed-in person's own id, so the view can mark "You" in a list. */
  meId: string;
  /** Set when the view is drilled into ONE person (either an individual viewer,
   *  or a manager who picked an employee). */
  subject: DashPerson | null;
  today: string;
  range: ResolvedRange;
  filters: DashFilters;
  options: DashOptions;
  /** The selection's score for the active window. */
  score: Scorecard;
  /** The same selection scored for today / this week / month-to-date. */
  performance: { today: Scorecard; week: Scorecard; mtd: Scorecard };
  /** Where the active window's work moved to, earliest destination first. */
  transfers: TransferRow[];
  /** How many people the selection covers. */
  peopleCount: number;
  /** Per-person rows — empty in individual mode. */
  people: PersonRow[];
}

/* ----------------------------------------------------------------------- */
/* Rankings                                                                 */
/* ----------------------------------------------------------------------- */

export interface RankedPerson {
  id: string;
  name: string;
  pct: number;
  score: Scorecard;
}

/**
 * The people worth ranking: everyone in the current selection who actually
 * planned something in the active window.
 *
 * Anyone with an empty plan is EXCLUDED rather than ranked at 0% — otherwise the
 * Bottom 5 would fill up with people who were on leave, and "0%" would be read
 * as a performance figure when it is really an absence of data.
 */
export function rankable(people: PersonRow[]): RankedPerson[] {
  return people
    .filter((p) => hasSignal(p.range.overall))
    .map((p) => ({ id: p.id, name: p.name, pct: pct(p.range.overall), score: p.range }));
}

/** Highest first; ties broken by the bigger planned set, then by name, so the
 *  order is stable between renders. */
export function topPerformers(people: PersonRow[], n: number): RankedPerson[] {
  return rankable(people)
    .sort(
      (a, b) =>
        b.pct - a.pct ||
        b.score.overall.planned - a.score.overall.planned ||
        a.name.localeCompare(b.name),
    )
    .slice(0, n);
}

/** Lowest first — the same list read from the other end. */
export function bottomPerformers(people: PersonRow[], n: number): RankedPerson[] {
  return rankable(people)
    .sort(
      (a, b) =>
        a.pct - b.pct ||
        b.score.overall.planned - a.score.overall.planned ||
        a.name.localeCompare(b.name),
    )
    .slice(0, n);
}

/** Everyone whose ACTIVE-WINDOW score sits under the cut-off, worst first. */
export function belowThreshold(people: PersonRow[], threshold: number): PersonRow[] {
  return people
    .filter((p) => hasSignal(p.range.overall) && pct(p.range.overall) < threshold)
    .sort((a, b) => pct(a.range.overall) - pct(b.range.overall) || a.name.localeCompare(b.name));
}
