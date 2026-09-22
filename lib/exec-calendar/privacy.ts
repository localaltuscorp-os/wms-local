/**
 * MONTHLY EVENTS MASTER — who may change what.
 *
 * ── THE PRIVACY LAYER WAS REMOVED ON 2026-09-17, DELIBERATELY ─────────────
 * An earlier build had public / busy / private blocks with server-side masking.
 * It was cut on the owner's instruction, and the reasoning is worth keeping:
 * this module exists SO THAT PEOPLE CAN SEE EACH OTHER'S SCHEDULE. A calendar
 * whose default is "hidden" does not do that job, and every hidden block makes
 * the team's view less trustworthy than the spreadsheet it replaced.
 *
 * So every block is visible to everyone. What remains is AUTHORSHIP: you may
 * only edit or delete the blocks on your own calendar. The `visibility` column
 * still exists in the database, defaulted to 'public' and written as 'public' —
 * dropping it needs a migration and it costs nothing where it is.
 *
 * PURE: takes the event and the viewer, reads no database.
 */

import { isProtectedCategory } from "./taxonomy";

/** The shape the conflict + ownership rules need. */
export interface CalendarEventShape {
  id: string;
  ownerId: string;
  title: string;
  categoryKey: string;
  day: string;
  startMin: number | null;
  endMin: number | null;
  notes?: string | null;
  clientName?: string | null;
  clientEntryId?: string | null;
}

export interface Viewer {
  employeeId: string;
  /** The person whose calendar this is. */
  isOwner?: boolean;
  /** Full access to every calendar — the assistant/admin role. */
  isCalendarAdmin?: boolean;
}

/**
 * May this viewer create, move, retime or delete the block?
 *
 * This is the ONLY restriction left: everyone reads everything, and nobody
 * edits anybody else's calendar. `app/(app)/events/actions.ts` enforces it in
 * the WHERE clause of every write, so a crafted id matches no row.
 */
export function canEdit(event: { ownerId: string }, viewer: Viewer): boolean {
  return Boolean(viewer.isOwner || viewer.isCalendarAdmin) || event.ownerId === viewer.employeeId;
}

/* ── Conflict prevention (§5) ────────────────────────────────────────────── */

export interface ConflictCandidate {
  id?: string;
  day: string;
  startMin: number | null;
  endMin: number | null;
  categoryKey: string;
  title?: string;
  ownerId?: string;
}

/** Do two timed blocks share a minute? Touching ends do not overlap. */
export function overlaps(a: ConflictCandidate, b: ConflictCandidate): boolean {
  if (a.day !== b.day) return false;
  if (a.startMin == null || a.endMin == null || b.startMin == null || b.endMin == null) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export type ConflictVerdict =
  | { ok: true; warnings: ConflictCandidate[] }
  | { ok: false; blockedBy: ConflictCandidate; reason: string };

/**
 * Check a proposed block against what is already in the diary.
 *
 * TWO OUTCOMES, AND THE ASYMMETRY IS THE RULE. Overlapping a PROTECTED category
 * — exercise, family time, the executive break — is REFUSED for anyone who is
 * not the owner: that is §5's "prevents external or assistant-level double
 * bookings", and a warning would not prevent anything. Every other overlap is a
 * warning: two client calls at once is usually a mistake but is occasionally
 * deliberate, and software that refuses it just gets worked around.
 *
 * The owner is never blocked. They are allowed to decide their own exercise
 * hour loses to a board meeting — the rule exists to stop OTHER people making
 * that call on their behalf.
 */
export function checkConflicts(
  proposed: ConflictCandidate,
  existing: ConflictCandidate[],
  viewer: Viewer,
): ConflictVerdict {
  const clashes = existing.filter((e) => e.id !== proposed.id && overlaps(proposed, e));
  if (clashes.length === 0) return { ok: true, warnings: [] };

  if (!viewer.isOwner) {
    const guarded = clashes.find((c) => isProtectedCategory(c.categoryKey));
    if (guarded) {
      return {
        ok: false,
        blockedBy: guarded,
        reason:
          "That time is protected. Ask the owner to move it — an assistant cannot book over "
          + "personal or recovery time.",
      };
    }
  }
  return { ok: true, warnings: clashes };
}
