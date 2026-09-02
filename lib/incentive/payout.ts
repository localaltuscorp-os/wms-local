import "server-only";
import { and, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
} from "@/db/schema";
import {
  foldIncentiveSources,
  monthEndExclusive,
  type ResolvedSource,
} from "@/lib/incentive/payout-sources";

/**
 * WS-6 — server-only DB reads for incentive payout. The month's raw ledger rows
 * are fetched here and folded (in the pure `payout-sources` module) into flat
 * payable legs. The transactional `payIncentivesWithRun` action re-fetches these
 * rows itself WITH `FOR UPDATE` inside its transaction; this helper is the plain
 * read used by the board query.
 */

/** All folded payable incentive legs for a "YYYY-MM" month (plain read). */
export async function loadMonthIncentiveSources(month: string): Promise<ResolvedSource[]> {
  const start = `${month}-01`;
  const end = monthEndExclusive(month);
  const [entries, projects, participants] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(and(gte(incentiveEntries.periodMonth, start), lt(incentiveEntries.periodMonth, end))),
    db
      .select()
      .from(incentiveProjects)
      .where(and(gte(incentiveProjects.periodMonth, start), lt(incentiveProjects.periodMonth, end))),
    db
      .select()
      .from(incentiveParticipants)
      .where(
        and(
          gte(incentiveParticipants.periodMonth, start),
          lt(incentiveParticipants.periodMonth, end),
        ),
      ),
  ]);
  return foldIncentiveSources(entries, projects, participants);
}
