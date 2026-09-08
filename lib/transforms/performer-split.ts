import type { Employee } from "@/db/schema";
import type {
  PunctualityPerson,
  RankedPunctualityPerson,
  TopPerformer,
} from "@/lib/types";

/**
 * ONE LEADERBOARD, CUT ONCE — the rule that keeps Top Performers and People To
 * Pull Up from ever holding the same person.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 * The two cards were built from two lists that had never been told about each
 * other: Top Performers from `computeTopPerformers` (ranked by completions) and
 * People To Pull Up from `computePunctuality` (ranked by lowest volume). Both
 * admitted the whole roster, so every single person appeared on both boards —
 * praised at the top of the page and flagged for a pull-up conversation 600px
 * below it. On a one-person view that reads as an outright contradiction; on a
 * full roster it reads as noise.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────
 * There is one ranking of the whole team. Positions 1…TOP_PERFORMER_RANKS are
 * Top Performers; position TOP_PERFORMER_RANKS+1 and below is People To Pull
 * Up. Nobody is in both, nobody is in neither, and the position a person
 * carries is the SAME number in either card — so the pair reads as one
 * continuous standing rather than two separate opinions.
 *
 * The cut is a POSITION, not a volume threshold. A count threshold ("15 tasks
 * done") looks equivalent and is not: it depends on how busy the window was, so
 * a quiet month would empty the top card and put the entire company up for a
 * pull-up. A position always splits the roster the same way.
 */
export const TOP_PERFORMER_RANKS = 15;

export type { RankedPunctualityPerson };

export interface LeaderboardSplit {
  /** Ranks 1…TOP_PERFORMER_RANKS, best first. */
  top: TopPerformer[];
  /** Rank TOP_PERFORMER_RANKS+1 and below, WORST first. */
  pullUp: RankedPunctualityPerson[];
}

/**
 * Extend a completion-based ranking to EVERY member of staff.
 *
 * `computeTopPerformers` ranks only people who completed something, which is
 * right for a leaderboard and wrong for a split: someone who closed nothing at
 * all was in neither card — invisible on the one page that exists to say who
 * needs a conversation. They are the clearest pull-up case there is.
 *
 * The people it adds sort BELOW everyone with a completion (they have none) and
 * are ordered by name among themselves — arbitrary, but stable, so the ranks do
 * not shuffle between renders.
 *
 * Inactive accounts, candidate guest-logins and system/test accounts are left
 * out: they are excluded from every other roster in the app for the same
 * reason, and a dormant account sitting at the bottom of the standings would
 * push a real person out of view.
 */
export function rankWholeRoster(
  ranking: TopPerformer[],
  employees: Employee[],
): TopPerformer[] {
  const ranked = new Set(ranking.map((p) => p.employeeId));
  const missing = employees
    .filter((e) => e.isActive && e.accountType === "employee" && !ranked.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<TopPerformer>((e, i) => ({
      employeeId: e.id,
      employeeName: e.name,
      doneCount: 0,
      weeklySparkline: new Array(7).fill(0),
      rank: ranking.length + i + 1,
      department: e.department ?? null,
      completedOnTime: 0,
      datedCompletions: 0,
      // Nothing completed ⇒ nothing measurable. Null, never 0% — a 0% on-time
      // rate would libel someone who simply has no dated work to be judged on.
      onTimeRate: null,
      avgTurnaroundDays: null,
    }));
  return [...ranking, ...missing];
}

/**
 * Cut a ranked roster into the two boards.
 *
 * @param rankedPeople the people being shown, each already carrying its true
 *   team-wide `rank`. Pass the SCOPED list (what the filters selected) — the
 *   ranks inside it stay global, so a filtered view still states real standings
 *   rather than "1st of 1".
 * @param punctualityPeople the punctuality rows, used to enrich the pull-up
 *   side. That card measures something Top Performers does not — how late the
 *   late work was — which is the whole reason it is not this list read upside
 *   down. Anyone with no punctuality row (nothing dated and done) is carried
 *   with zeroes rather than dropped, or the bottom of the roster would go
 *   missing from the one card that exists for it.
 */
export function splitLeaderboard(
  rankedPeople: TopPerformer[],
  punctualityPeople: PunctualityPerson[],
): LeaderboardSplit {
  const punctualityById = new Map(punctualityPeople.map((p) => [p.employeeId, p]));

  const pullUp = rankedPeople
    .filter((p) => p.rank > TOP_PERFORMER_RANKS)
    .map<RankedPunctualityPerson>((p) => {
      const hit = punctualityById.get(p.employeeId);
      if (hit) return { ...hit, rank: p.rank };
      return {
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        done: 0,
        onTime: 0,
        late: 0,
        rate: 0,
        lateSpread: { d1_3: 0, d4_7: 0, d8_14: 0, d15: 0 },
        avgDaysLate: null,
        department: p.department,
        rank: p.rank,
      };
    })
    /* WORST FIRST — descending rank, so the very last person on the team's
       standing is the first card. The pull-up board's shape depends on it: the
       ⚠️ and the ring go on the first card, and pointing those at rank 16 (the
       BEST of the people below the cut) would flag the person least in need of
       the conversation. */
    .sort((a, b) => b.rank - a.rank);

  return {
    top: rankedPeople.filter((p) => p.rank <= TOP_PERFORMER_RANKS),
    pullUp,
  };
}
