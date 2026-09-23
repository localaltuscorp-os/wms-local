import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  incentiveCatalog,
  incentiveEligibility,
  incentiveFunctionScope,
} from "@/db/schema";
import { INCENTIVE_TYPES, type IncentiveType } from "@/db/enums";
import { validateIncentiveDetails } from "@/lib/incentive-fields";
import {
  eligibilityReasonLabel,
  isIntern,
  resolveEmployeeType,
  resolveIncentiveEligibility,
  type EligibilityReason,
  type EligibilityWindow,
} from "@/lib/incentive/master";
import { checkSplit, type IncentiveSplitShare } from "@/lib/incentive/split";
import { listActiveProductNames } from "@/lib/queries/products";
import { listActiveShiftTypeNames } from "@/lib/queries/shift-types";

/**
 * NEW INCENTIVE REQUEST — the server-side gate both entry points share.
 *
 * `createIncentiveRequest` (web) and POST /api/mobile/incentive each used to
 * parse and validate on their own, identically by copy. They now call this, so
 * the mobile-number, email, product, client-permission, date and split rules
 * are enforced once, the same way, whichever client files the request — the
 * dialog's inline validation is a convenience on top, never the only check.
 *
 * ── IT ALSO ENFORCES ELIGIBILITY (0244) ────────────────────────────────────
 * Being able to see an incentive in the UI is not permission to file for it. A
 * request is refused here when the person cannot earn it — an intern always, and
 * anybody the scheme's applicability does not cover. This is the ONE place both
 * clients pass through, so a crafted POST from the mobile app gets exactly the
 * same answer as the web dialog, and hiding a button is never the enforcement.
 *
 * Reads only (the product master, the split's employees, and the schemes for
 * this request type). The caller inserts what it returns.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RequestSchema = z
  .object({
    type: z.enum(INCENTIVE_TYPES),
    details: z.record(z.string(), z.string()),
    // Loose here on purpose: the friendly messages (too many people, missing
    // employee, bad share) come from checkSplit. This only bounds the payload.
    split: z
      .array(z.object({ employeeId: z.string().max(64), pct: z.number() }).strict())
      .max(20)
      .nullable()
      .optional(),
  })
  .strict();

/**
 * MAY THIS PERSON FILE FOR THIS REQUEST TYPE?
 *
 * Returns a refusal message, or null to allow. The rules, in order:
 *
 *  1. AN INTERN NEVER MAY. This is checked first and unconditionally, so it
 *     holds even when no scheme exists for the type yet — an intern filing for
 *     a brand-new incentive is exactly the case a "hide the form" fix misses.
 *  2. NO SCHEME YET = allowed. Admins add the Incentive Master row after the
 *     form ships (that is how every type here has started), and a request with
 *     "amount not set" is the normal state until they do.
 *  3. A SCHEME EXISTS: the person must be eligible for at least one scheme of
 *     this type that is on offer. Several schemes can price the same type, so
 *     it is any-of rather than all-of.
 *
 * The reason comes from the same `resolveIncentiveEligibility` the employee's
 * own My Incentives list uses, so the message they get and the row they saw
 * cannot disagree.
 */
async function requestRefusal(
  requesterId: string,
  type: IncentiveType,
): Promise<string | null> {
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
    .where(eq(employees.id, requesterId))
    .limit(1);

  // No employee row: the caller's own auth gates handle this, and refusing here
  // would turn a data problem into a confusing eligibility message.
  if (!me) return null;

  const employeeType = resolveEmployeeType({
    override: me.override,
    designationType: me.designationType,
  });
  if (isIntern({ employeeType })) {
    return "Interns are not eligible for incentives.";
  }

  const schemes = await db
    .select({
      id: incentiveCatalog.id,
      active: incentiveCatalog.active,
      validUntil: incentiveCatalog.validUntil,
      applicability: incentiveCatalog.applicability,
      salesEligible: incentiveCatalog.salesEligible,
      internsEligible: incentiveCatalog.internsEligible,
    })
    .from(incentiveCatalog)
    .where(eq(incentiveCatalog.incentiveType, type));

  if (schemes.length === 0) return null;

  // Both reads are bounded by the schemes just loaded, and by this one person.
  const schemeIds = schemes.map((s) => s.id);
  const [grants, scope] = await Promise.all([
    db
      .select({
        employeeId: incentiveEligibility.employeeId,
        effectiveFrom: incentiveEligibility.effectiveFrom,
        removedEffectiveFrom: incentiveEligibility.removedEffectiveFrom,
      })
      .from(incentiveEligibility)
      .where(
        and(
          inArray(incentiveEligibility.catalogId, schemeIds),
          eq(incentiveEligibility.employeeId, requesterId),
        ),
      ),
    db
      .select({
        catalogId: incentiveFunctionScope.catalogId,
        functionId: incentiveFunctionScope.functionId,
      })
      .from(incentiveFunctionScope)
      .where(inArray(incentiveFunctionScope.catalogId, schemeIds)),
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

  const applicant = {
    id: me.id,
    isActive: me.isActive,
    employmentStatus: me.employmentStatus,
    accountType: me.accountType,
    employeeType,
    functionId: me.functionId,
  };

  const reasons: EligibilityReason[] = [];
  for (const s of schemes) {
    const result = resolveIncentiveEligibility({
      incentive: {
        active: s.active,
        validUntil: s.validUntil == null ? null : String(s.validUntil),
        applicability: s.applicability,
        functionIds: scopeByCatalog.get(s.id) ?? [],
        salesEligible: s.salesEligible === true,
        internsEligible: s.internsEligible === true,
      },
      windows,
      employee: applicant,
    });
    // ANY scheme of this type that covers the person is enough: two schemes can
    // price the same form, and one of them being closed to them is not a reason
    // to refuse the other.
    if (result.eligible) return null;
    reasons.push(result.reason);
  }

  // The most specific true reason, for a message an employee can act on. "Not on
  // offer" is the least actionable, so it is the fallback rather than the first
  // thing tried.
  const reason =
    reasons.find((r) => r !== "not_on_offer") ?? reasons[0] ?? "not_on_offer";
  return `You are not eligible for this incentive (${eligibilityReasonLabel(reason).toLowerCase()}).`;
}

export interface PreparedIncentiveRequest {
  employeeId: string;
  type: IncentiveType;
  details: Record<string, string>;
  split: IncentiveSplitShare[] | null;
}

export async function prepareIncentiveRequest(
  requesterId: string,
  input: unknown,
): Promise<{ ok: true; values: PreparedIncentiveRequest } | { ok: false; error: string }> {
  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { type, details, split } = parsed.data;

  // The two live masters the form draws options from, re-read here so the
  // SERVER decides what a valid answer is — a forged POST naming a retired
  // product or an unknown shift is refused by the same function the dialog
  // runs. Product options are cached under the `products` tag, shifts under
  // `shifts`.
  const [productNames, shiftTypeNames] = await Promise.all([
    listActiveProductNames(),
    listActiveShiftTypeNames(),
  ]);
  const validated = validateIncentiveDetails(type, details, { productNames, shiftTypeNames });
  if (!validated.ok) return validated;

  // Eligibility LAST, after the answers are known to be well-formed: a rejected
  // field should say which field is wrong, and only a well-formed request should
  // be told the person may not earn it.
  const refusal = await requestRefusal(requesterId, type);
  if (refusal) return { ok: false, error: refusal };

  let shares: IncentiveSplitShare[] | null = null;
  if (split && split.length > 0) {
    const check = checkSplit(split, { requesterId });
    if (!check.ok) return { ok: false, error: check.error };

    const ids = check.shares.map((s) => s.employeeId);
    if (!ids.every((id) => UUID_RE.test(id))) {
      return { ok: false, error: "Pick an employee for every person in the split." };
    }
    // Names are read from the employee rows, never taken from the client, and
    // only active employees can share an incentive.
    const found = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(inArray(employees.id, ids), eq(employees.isActive, true)));
    const nameById = new Map(found.map((r) => [r.id, r.name]));
    if (ids.some((id) => !nameById.has(id))) {
      return { ok: false, error: "Everyone in the split must be an active employee." };
    }
    shares = check.shares.map((s) => ({ employeeId: s.employeeId, name: nameById.get(s.employeeId)!, pct: s.pct }));
  }

  return {
    ok: true,
    values: { employeeId: requesterId, type, details: validated.details, split: shares },
  };
}
