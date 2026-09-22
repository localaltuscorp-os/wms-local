/**
 * JOB DESCRIPTION — the rank ladder and the vacancy rule.
 *
 * PURE. The resolver below takes the roster it needs as an argument rather than
 * reading the database, so the escalation rule can be tested exhaustively
 * without a fixture database — and that matters more here than almost anywhere
 * else in the app, because getting it wrong routes somebody else's work to you
 * silently, and the only symptom is a task that quietly never gets done.
 */

/** A rank on the ladder. `order` IS BEHAVIOUR — escalation climbs it. */
export interface Rank {
  id: string;
  name: string;
  order: number;
  band: string | null;
}

/**
 * THE TWENTY-SIX RANKS, in the order the account holder gave them (2026-09-12),
 * numbered in tens so a rank can be inserted later without renumbering its
 * neighbours.
 *
 * ── `order` IS BEHAVIOUR, NOT PRESENTATION ───────────────────────────────
 * The vacancy resolver climbs this list: a job description on an empty seat
 * goes to the next FILLED rung above it in the same function. So the sequence
 * below decides who covers for whom, and changing a number reroutes live work
 * without anything appearing on screen to say so.
 *
 * Two consequences of this particular sequence, stated plainly because they are
 * the kind of thing that is noticed months later:
 *
 *  · The VP grades sit BELOW the GM grades — a vacant Manager seat escalates to
 *    Associate Vice President, and only reaches Assistant General Manager after
 *    passing President. Moving the three GM rows above Associate Vice President
 *    is a two-minute edit here plus migration 0226 if that is not intended.
 *  · Consultant and Sr. Consultant sit between Sr. Executive and Assistant
 *    Manager. The candidate-facing list in `interview_positions`
 *    (lib/hr/candidate/intake-schema.ts) places Consultant differently, and the
 *    two are deliberately NOT merged: that one describes seats we hire into,
 *    this one decides who covers a vacancy.
 *
 * ── THE FOURTEEN THAT CAME BEFORE ────────────────────────────────────────
 * This replaced a fourteen-rung ladder on 2026-09-12. Twelve ranks are new; one
 * — DGM — has no equivalent in the new list and is NOT silently dropped:
 * migration 0226 leaves any seat still pointing at it alone and reports it, so
 * a human decides whether it becomes Deputy Director or General Manager.
 */
export const RANK_LADDER: readonly { name: string; order: number; band: string }[] = [
  { name: "Intern - First Year", order: 10, band: "Trainee" },
  { name: "Intern - Second Year", order: 20, band: "Trainee" },
  { name: "Intern - Third Year", order: 30, band: "Trainee" },
  { name: "Executive", order: 40, band: "Individual" },
  { name: "Sr. Executive", order: 50, band: "Individual" },
  { name: "Consultant", order: 60, band: "Individual" },
  { name: "Sr. Consultant", order: 70, band: "Individual" },
  { name: "Assistant Manager", order: 80, band: "Management" },
  { name: "Deputy Manager", order: 90, band: "Management" },
  { name: "Manager", order: 100, band: "Management" },
  { name: "Associate Vice President", order: 110, band: "Leadership" },
  { name: "Deputy Vice President", order: 120, band: "Leadership" },
  { name: "Vice President", order: 130, band: "Leadership" },
  { name: "Senior Vice President", order: 140, band: "Leadership" },
  { name: "President", order: 150, band: "Leadership" },
  { name: "Sr President", order: 160, band: "Leadership" },
  { name: "Assistant General Manager", order: 170, band: "General Management" },
  { name: "General Manager", order: 180, band: "General Management" },
  { name: "Sr. General Manager", order: 190, band: "General Management" },
  { name: "Associate Director", order: 200, band: "Director" },
  { name: "Deputy Director", order: 210, band: "Director" },
  { name: "Director", order: 220, band: "Director" },
  { name: "Senior Director", order: 230, band: "Director" },
  { name: "CEO", order: 240, band: "Board" },
  { name: "Managing Director", order: 250, band: "Board" },
  { name: "Chairman", order: 260, band: "Board" },
] as const;

/** One seat. */
export interface Position {
  id: string;
  functionKey: string;
  rankOrder: number;
  title: string;
}

/** Somebody who currently holds a seat. */
export interface Holder {
  employeeId: string;
  name: string;
  positionId: string;
}

export type ResolutionVia = "delegation" | "assigned" | "holder" | "escalated" | "unassigned";

export interface Resolution {
  employeeIds: string[];
  via: ResolutionVia;
  /** The seat the work actually landed on, when it escalated. */
  escalatedToPositionId: string | null;
  /** Every rank order the climb passed through, for the audit line. */
  chain: number[];
}

export interface ResolveInput {
  position: Position;
  /** Every position in the org, so the climb can find the next filled rung. */
  positions: readonly Position[];
  /** Active holders, any seat. */
  holders: readonly Holder[];
  /** People explicitly assigned this JD, overriding the seat. */
  assignedEmployeeIds?: readonly string[];
  /** An active delegation for this JD on the date in question. */
  delegateEmployeeIds?: readonly string[];
}

/**
 * WHO DOES THIS TASK TODAY.
 *
 * Order matters and is deliberate:
 *
 *   1. A delegation wins outright. It is a dated decision a human made about a
 *      specific absence, and it should beat every inherited default.
 *   2. An explicit assignment beats the seat — HR picked this person on purpose.
 *   3. The seat's own holders.
 *   4. Climb: the nearest FILLED rank above, within the same function. Empty
 *      rungs are skipped, not stopped at.
 *   5. Nothing above is filled → unassigned, and the caller must raise it.
 *
 * Escalation NEVER crosses functions. A vacant Sales seat does not become the
 * HR Manager's problem, and a rule that let it would be discovered the first
 * time somebody quit.
 */
export function resolveAssignees(input: ResolveInput): Resolution {
  const { position, positions, holders } = input;

  if (input.delegateEmployeeIds && input.delegateEmployeeIds.length > 0) {
    return {
      employeeIds: [...input.delegateEmployeeIds],
      via: "delegation",
      escalatedToPositionId: null,
      chain: [],
    };
  }

  if (input.assignedEmployeeIds && input.assignedEmployeeIds.length > 0) {
    return {
      employeeIds: [...input.assignedEmployeeIds],
      via: "assigned",
      escalatedToPositionId: null,
      chain: [],
    };
  }

  const holdersOf = (positionId: string) =>
    holders.filter((h) => h.positionId === positionId).map((h) => h.employeeId);

  const own = holdersOf(position.id);
  if (own.length > 0) {
    return { employeeIds: own, via: "holder", escalatedToPositionId: null, chain: [] };
  }

  // Same function, strictly higher rank, nearest first. Sorted rather than
  // scanned so "nearest" is defined by the ladder and not by row order.
  const above = positions
    .filter(
      (p) =>
        p.functionKey === position.functionKey &&
        p.rankOrder > position.rankOrder &&
        p.id !== position.id,
    )
    .sort((a, b) => a.rankOrder - b.rankOrder);

  const chain: number[] = [];
  // Bounded by the ladder length: a duplicated rank_order or a malformed row
  // must not turn this into an unbounded walk.
  for (const p of above.slice(0, RANK_LADDER.length)) {
    chain.push(p.rankOrder);
    const found = holdersOf(p.id);
    if (found.length > 0) {
      return {
        employeeIds: found,
        via: "escalated",
        escalatedToPositionId: p.id,
        chain,
      };
    }
  }

  // Never silently dropped. A task with no doer cannot be written to `tasks` at
  // all, so this has to surface as something HR can see rather than an
  // exception swallowed by the nightly job.
  return { employeeIds: [], via: "unassigned", escalatedToPositionId: null, chain };
}

/** Is this seat empty right now? */
export function isVacant(positionId: string, holders: readonly Holder[]): boolean {
  return !holders.some((h) => h.positionId === positionId);
}

/**
 * DE-ESCALATION: which tasks come back down when a seat is filled.
 *
 * Only work that is escalated, unstarted and not yet due moves. Anything the
 * senior has begun stays theirs — silently reassigning started work loses the
 * context of whatever they already did and surprises both people. An overdue
 * task stays too: moving it hides the lateness and resets its clock.
 */
export function shouldDeEscalate(task: {
  wasEscalated: boolean;
  started: boolean;
  overdue: boolean;
  completed: boolean;
}): boolean {
  if (!task.wasEscalated) return false;
  if (task.completed || task.started || task.overdue) return false;
  return true;
}
