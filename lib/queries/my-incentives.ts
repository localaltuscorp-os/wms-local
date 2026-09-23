import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  incentiveCatalog,
  incentiveEligibility,
  incentiveFunctionScope,
} from "@/db/schema";
import {
  eligibilityReasonLabel,
  hasExpired,
  incentiveApplicabilityLabel,
  resolveEmployeeType,
  resolveIncentiveEligibility,
  todayIst,
  type EligibilityReason,
  type EligibilityWindow,
} from "@/lib/incentive/master";

/**
 * MY INCENTIVES — "what can I earn, and what does it pay?"
 *
 * One person's view of the Incentive Master, answered by the SAME rule every
 * other screen uses (`resolveIncentiveEligibility`): the admin list's Eligible
 * count, the notification audience and this table cannot disagree about who is
 * eligible, because there is one function and they all call it.
 *
 * ── THE RATE IS READ, NEVER REPEATED ───────────────────────────────────────
 * `amount` comes straight off the catalog row on every read, so the figure an
 * employee sees is whatever the admin last set. There is no rate constant and no
 * per-employee copy of a price — the only place a figure is ever copied is a
 * ledger entry for an incentive that has ALREADY been earned, where it is a
 * historical fact rather than a live price.
 *
 * ── INELIGIBLE ROWS ARE RETURNED TOO, WITH A REASON ────────────────────────
 * The employee-facing table shows the eligible ones; the rest go in a collapsed
 * group so "why can't I see the ₹2,000 referral?" has an answer on the page
 * instead of in a support message. The reason comes from the rule itself, so it
 * says "Interns are not eligible" or "Not your function" rather than a generic
 * denial.
 *
 * FOUR QUERIES, NO N+1: every catalog row, the function scope, this person's own
 * grants, and their own record. The fold happens in memory.
 */

export interface MyIncentiveRow {
  catalogId: string;
  name: string;
  description: string | null;
  /** What it pays, live from the Incentive Master (₹). */
  rate: number;
  /** "All employees" / "Function: Sales" / "Selected employees". */
  appliesTo: string;
  eligible: boolean;
  /** Why, in one phrase — the rule's own reason, never re-derived here. */
  reason: string;
  /** The reason code, for anything that needs to branch on it. */
  reasonCode: EligibilityReason;
  /** Active and not past its Valid Until. */
  onOffer: boolean;
  expired: boolean;
}

export async function listMyIncentives(
  employeeId: string,
  opts: { now?: Date } = {},
): Promise<MyIncentiveRow[]> {
  const today = todayIst(opts.now ?? new Date());

  // The person themselves: their type (override or designation) and their
  // Function are what the rule needs, and both are read from the masters rather
  // than inferred from anything on the client.
  const [me] = await db
    .select({
      id: employees.id,
      isActive: employees.isActive,
      employmentStatus: employees.employmentStatus,
      accountType: employees.accountType,
      override: employees.employeeType,
      designationType: designations.employeeType,
      functionId: employees.departmentId,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!me) return [];

  const [catalog, grants, scope] = await Promise.all([
    db
      .select({
        id: incentiveCatalog.id,
        name: incentiveCatalog.name,
        description: incentiveCatalog.description,
        amount: incentiveCatalog.amount,
        sortOrder: incentiveCatalog.sortOrder,
        active: incentiveCatalog.active,
        validUntil: incentiveCatalog.validUntil,
        applicability: incentiveCatalog.applicability,
        salesEligible: incentiveCatalog.salesEligible,
        internsEligible: incentiveCatalog.internsEligible,
      })
      .from(incentiveCatalog),
    db
      .select({
        catalogId: incentiveEligibility.catalogId,
        employeeId: incentiveEligibility.employeeId,
        effectiveFrom: incentiveEligibility.effectiveFrom,
        removedEffectiveFrom: incentiveEligibility.removedEffectiveFrom,
      })
      .from(incentiveEligibility)
      .where(eq(incentiveEligibility.employeeId, employeeId)),
    db
      .select({
        catalogId: incentiveFunctionScope.catalogId,
        functionId: incentiveFunctionScope.functionId,
      })
      .from(incentiveFunctionScope),
  ]);

  const windows: EligibilityWindow[] = grants.map((g) => ({
    employeeId: g.employeeId,
    effectiveFrom: String(g.effectiveFrom),
    removedEffectiveFrom: g.removedEffectiveFrom == null ? null : String(g.removedEffectiveFrom),
  }));

  const scopeByCatalog = new Map<string, string[]>();
  for (const s of scope) {
    const list = scopeByCatalog.get(s.catalogId) ?? [];
    list.push(s.functionId);
    scopeByCatalog.set(s.catalogId, list);
  }

  const employeeType = resolveEmployeeType({
    override: me.override,
    designationType: me.designationType,
  });
  const applicant = {
    id: me.id,
    isActive: me.isActive,
    employmentStatus: me.employmentStatus,
    accountType: me.accountType,
    employeeType,
    functionId: me.functionId,
  };

  const rows = catalog.map((c): MyIncentiveRow => {
    const applicable = c.applicability;
    const { eligible, reason } = resolveIncentiveEligibility({
      incentive: {
        active: c.active,
        validUntil: c.validUntil == null ? null : String(c.validUntil),
        applicability: applicable,
        functionIds: scopeByCatalog.get(c.id) ?? [],
        salesEligible: c.salesEligible === true,
        internsEligible: c.internsEligible === true,
      },
      windows,
      employee: applicant,
      today,
    });
    return {
      catalogId: c.id,
      name: c.name,
      description: c.description,
      rate: Number(c.amount),
      appliesTo: incentiveApplicabilityLabel(applicable),
      eligible,
      reason: eligibilityReasonLabel(reason),
      reasonCode: reason,
      onOffer: c.active && !hasExpired({ validUntil: c.validUntil == null ? null : String(c.validUntil) }, today),
      expired: hasExpired({ validUntil: c.validUntil == null ? null : String(c.validUntil) }, today),
    };
  });

  // ELIGIBLE FIRST, then the rest, and within each group in the Master's own
  // display order (sort_order, then name — the order the query already returns)
  // so this table reads like the admin screen an admin is looking at.
  const order = new Map(catalog.map((c, i) => [c.id, i] as const));
  return rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return (order.get(a.catalogId) ?? 0) - (order.get(b.catalogId) ?? 0);
  });
}
