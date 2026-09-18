/**
 * ONE PASS OVER THE REGISTER — who sits where, and how much each person carries.
 *
 * Pure. Extracted from JdPersonView when the people list moved out of the page
 * and into a dropdown beside the heading (account holder, 2026-09-16): the
 * dropdown and the body below it both need the seat and the counts, and they
 * now live in different components. Computing it twice would be two passes over
 * the whole register per render, and — worse — two chances for the badge in the
 * dropdown to disagree with the sections underneath it.
 *
 * A person's JD comes from three places, and the badge is their sum:
 *   SEAT      the Master JD of the position they hold
 *   BY NAME   a Master JD from ANOTHER seat, handed to them by name
 *   PERSONAL  tasks written for them alone, belonging to no seat
 */

import { allAssignedIds, type TargetPeople } from "@/lib/jd/assignment-targets";

export interface PersonCounts {
  seat: number;
  byName: number;
  personal: number;
  total: number;
}

export const EMPTY_PERSON_COUNTS: PersonCounts = { seat: 0, byName: 0, personal: 0, total: 0 };

/** The shape this needs off a JD row — deliberately narrow, so tests can build one. */
interface IndexableEntry {
  isActive: boolean;
  positionId: string | null;
  /** Optional: only a PERSONAL task carries one (migration 0233). */
  ownerEmployeeId?: string | null;
  targetPeople: TargetPeople;
}

interface IndexableHolder {
  employeeId: string;
  positionId: string;
}

export interface PersonIndex {
  /** Which position each person holds. */
  seatOf: Map<string, string>;
  countsFor: (employeeId: string) => PersonCounts;
}

export function buildPersonIndex(
  entries: readonly IndexableEntry[],
  holders: readonly IndexableHolder[],
): PersonIndex {
  const seatOf = new Map(holders.map((h) => [h.employeeId, h.positionId]));

  const byPosition = new Map<string, number>();
  const personal = new Map<string, number>();
  const byName = new Map<string, number>();

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const e of entries) {
    if (!e.isActive) continue;
    // A personal task belongs to nobody's seat, so it is counted once and the
    // assignment lists below are not consulted for it.
    if (e.ownerEmployeeId) {
      bump(personal, e.ownerEmployeeId);
      continue;
    }
    if (e.positionId) bump(byPosition, e.positionId);
    for (const id of new Set(allAssignedIds(e.targetPeople))) {
      /* Named on a JD belonging to a seat they ALREADY hold is not a second
         task — it would be counted once under the seat and again here, and the
         badge would read double for the most ordinary case there is. */
      if (seatOf.get(id) !== e.positionId) bump(byName, id);
    }
  }

  return {
    seatOf,
    countsFor: (id: string): PersonCounts => {
      const seatId = seatOf.get(id);
      const seat = seatId ? (byPosition.get(seatId) ?? 0) : 0;
      const p = personal.get(id) ?? 0;
      const n = byName.get(id) ?? 0;
      return { seat, byName: n, personal: p, total: seat + p + n };
    },
  };
}

/** Two initials for an avatar bubble. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
