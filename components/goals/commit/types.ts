/**
 * Shared, PURE types for the Saturday commit surface (Module 2). No DB / no
 * `server-only` so the server data-loader and the client workspace can both
 * import them.
 */

/** One weekly-goal row as the commit surface renders it (this-week or next-week). */
export interface CommitGoalRow {
  id: string;
  position: number;
  title: string;
  client: string | null;
  subject: string | null;
  area: string | null;
  uom: string | null;
  /** Owner self-rating 0–100. */
  pctDone: number;
  /** Manager-accepted % (null = not reviewed). Display only. */
  acceptPct: number | null;
  /** `pct_updated_at` is stamped — the doer actively set progress this week. */
  filled: boolean;
  /** Opt-in per week (cross-out = false drops it from the committed set). */
  adopted: boolean;
  /** `committed_at` is stamped (Saturday freeze). */
  committed: boolean;
}

/** A person shown on the commit surface — the signed-in user or a downline member. */
export interface CommitMember {
  employeeId: string;
  name: string;
  isSelf: boolean;
  /** This week's goals — fill progress on each. */
  thisWeek: CommitGoalRow[];
  /** Next week's goals — adopt / edit / add, then freeze. */
  nextWeek: CommitGoalRow[];
}

/** Everything the commit workspace needs for one Saturday. */
export interface CommitData {
  /** Monday of THIS week (the week that is ending) — the freeze anchor. */
  weekStart: string;
  /** Monday of NEXT week (the week being committed). */
  nextWeekStart: string;
  thisWeekLabel: string;
  nextWeekLabel: string;
  /** True on Saturday IST — the day the commit + its punch-out gate go live. */
  isSaturday: boolean;
  /** True when the signed-in user has ≥1 active downline member. */
  isManager: boolean;
  /** Self first, then downline members by name. */
  members: CommitMember[];
}

/** A member is "committed" when this week is fully filled AND next week fully frozen. */
export function memberProgressFilled(m: CommitMember): boolean {
  const adopted = m.thisWeek.filter((g) => g.adopted);
  return adopted.every((g) => g.filled);
}

export function memberNextCommitted(m: CommitMember): boolean {
  const adopted = m.nextWeek.filter((g) => g.adopted);
  return adopted.length > 0 && adopted.every((g) => g.committed);
}

export function memberDone(m: CommitMember): boolean {
  return memberProgressFilled(m) && memberNextCommitted(m);
}
