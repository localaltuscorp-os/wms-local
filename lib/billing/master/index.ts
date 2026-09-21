/**
 * WHERE BILLING'S MASTER DATA COMES FROM — the one place that decides.
 *
 * The billing module reads five masters: the company/entity profile, the
 * customers, the products, the payment terms and the SAC codes. All five have
 * real tables and real Admin Panel screens (/admin/billing-*). None of them has
 * rows yet, which is the only reason ./dummy.ts exists.
 *
 * THE RULE IS PER-MASTER, AND IT IS "REAL WINS".
 *
 *   A master that has rows in its table is used exactly as it is. A master with
 *   NO rows falls back to the dummy set.
 *
 * Per-master, not all-or-nothing, because the Admin Panel will be filled in the
 * order a person gets to it — customers one afternoon, SAC codes the next week.
 * An all-or-nothing switch would mean the first real customer entered silently
 * emptied the payment-terms dropdown and no invoice could be raised until every
 * master was complete. This way each one crosses over on its own and billing
 * keeps working throughout.
 *
 * "Real wins" rather than "dummy wins", because the failure modes are not
 * symmetric: a real row shadowed by a synthetic one puts a made-up GSTIN on a
 * document that prints as a tax invoice, which is a filing problem. A synthetic
 * row shadowed by a real one is just the changeover working.
 *
 * NOTHING MERGES. A master is either the real table or the dummy list, never
 * both concatenated — a dropdown holding four real customers and ten invented
 * ones, with nothing on screen saying which is which, is how a fake GSTIN ends
 * up on a real invoice.
 *
 * TO TURN IT OFF FOR GOOD, when the Admin Panel is fully populated: delete
 * lib/billing/master/, and delete the `withDummyFallback` wrappers in
 * lib/queries/billing-documents.ts. Nothing else refers to it — every consumer
 * sees the real row types either way. There is no UI, no flag in a settings
 * screen and no migration to undo.
 *
 * TO FORCE EITHER SIDE while developing, set BILLING_MASTER_SOURCE:
 *   "auto"  (default) real per master, dummy where empty
 *   "admin"          real only — dropdowns go empty, which is the honest
 *                    preview of today's Admin Panel
 *   "dummy"          dummy only — for testing the sample invoice end to end
 */

import {
  DUMMY_CUSTOMERS,
  DUMMY_ENTITY_PROFILES,
  DUMMY_PAYMENT_TERMS,
  DUMMY_PRODUCTS,
  DUMMY_SAC_CODES,
} from "./dummy";

export type BillingMasterSource = "auto" | "admin" | "dummy";

export function billingMasterSource(): BillingMasterSource {
  const v = process.env.BILLING_MASTER_SOURCE?.trim().toLowerCase();
  return v === "admin" || v === "dummy" ? v : "auto";
}

/**
 * Apply the rule to one master.
 *
 * `rows` is what the table returned. The dummy set is used only when the mode
 * allows it AND the table gave nothing back.
 */
export function withDummyFallback<T>(rows: T[], dummy: readonly T[]): T[] {
  const mode = billingMasterSource();
  if (mode === "admin") return rows;
  if (mode === "dummy") return [...dummy];
  return rows.length > 0 ? rows : [...dummy];
}

/** True when this master is currently being served from ./dummy.ts — for the
 *  banner that tells the user what they are looking at. */
export function isServingDummy<T>(rows: T[]): boolean {
  const mode = billingMasterSource();
  if (mode === "admin") return false;
  if (mode === "dummy") return true;
  return rows.length === 0;
}

export {
  DUMMY_CUSTOMERS,
  DUMMY_ENTITY_PROFILES,
  DUMMY_PAYMENT_TERMS,
  DUMMY_PRODUCTS,
  DUMMY_SAC_CODES,
};
export { isDummyMasterId, withDummyCustomerDetail, enrichedAnyCustomer } from "./dummy";
export { DUMMY_EMAIL_CONFIG, type BillingEmailConfig } from "./dummy";
export type { BillableProduct } from "./types";
