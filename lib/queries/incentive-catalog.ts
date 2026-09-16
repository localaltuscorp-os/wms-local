import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { incentiveCatalog } from "@/db/schema";
import { isEligible, loadEligibility } from "@/lib/queries/incentive-eligibility";

/** One incentive-catalog row ("3.Incentive Chart") — what each incentive earns. */
export interface CatalogRow {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  salesEligible: boolean;
  internsEligible: boolean;
  notes: string | null;
  sortOrder: number;
  active: boolean;
  /** Migration 0216 — TRUE means everyone; FALSE means the picked list only. */
  appliesToAll: boolean;
  /** Who it was narrowed to. Populated for admins; empty for everyone else. */
  eligibleIds: string[];
}

/**
 * The incentive catalog, in display order.
 *
 * SCOPED TO THE VIEWER unless they are an admin. An employee sees only the
 * incentives they were picked for — an incentive nobody selected them for is
 * not greyed out or marked ineligible, it is simply not there. Showing someone
 * a reward they cannot earn is worse than showing them nothing.
 *
 * `forEmployeeId` is the scope and `isAdmin` opens it back up. Admins also get
 * `eligibleIds` filled in, because the picker needs it; nobody else does, and
 * shipping the roster to every employee's browser would be a quiet leak.
 */
export async function listIncentiveCatalog(opts?: {
  forEmployeeId?: string;
  isAdmin?: boolean;
}): Promise<CatalogRow[]> {
  /* `loadEligibility` runs the additive DDL for 0216 before anything else
     touches the new column, so a deploy that lands before the migration is run
     by hand still renders. It is awaited FIRST, not in the Promise.all, for
     exactly that reason. */
  const elig = await loadEligibility();
  const rows = await db
    .select()
    .from(incentiveCatalog)
    .orderBy(asc(incentiveCatalog.sortOrder), asc(incentiveCatalog.name));

  const isAdmin = opts?.isAdmin ?? false;
  const viewer = opts?.forEmployeeId;

  return rows
    .filter((r) => isAdmin || !viewer || isEligible(elig, r.id, viewer))
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      amount: Number(r.amount),
      salesEligible: r.salesEligible ?? false,
      internsEligible: r.internsEligible ?? false,
      notes: r.notes,
      sortOrder: r.sortOrder ?? 100,
      active: r.active,
      appliesToAll: r.appliesToAll,
      eligibleIds: isAdmin ? [...(elig.picked.get(r.id) ?? [])] : [],
    }));
}
