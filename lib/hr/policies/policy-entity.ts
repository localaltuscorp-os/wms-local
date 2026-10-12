import { getEntity, type Entity, type EntityId } from "@/lib/hr/entities";

/**
 * Resolve a payroll-company name to the policy letterhead identity. Keeping this
 * pure makes the same mapping usable by the screen, PDFs, and acknowledgement
 * records without trusting a value supplied by the browser.
 */
export function policyEntityIdForPayingEntityName(
  payingEntityName: string | null | undefined,
): EntityId {
  return policyEntityForPayingEntityName(payingEntityName).id;
}

/** The full letterhead record used by the PDF renderer and policy screen. */
export function policyEntityForPayingEntityName(
  payingEntityName: string | null | undefined,
): Entity {
  return getEntity(payingEntityName);
}
