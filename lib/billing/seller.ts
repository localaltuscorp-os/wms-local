/**
 * BILLING — resolving WHO IS BILLING into one printable block.
 *
 * "Entity: Admin Panel", "PAN Details: Admin Panel", "Signature Details: Admin
 * Panel", "Address: Admin Panel" in the handwritten notes all mean the same
 * thing: the seller's side of an invoice is configured once and then appears by
 * itself. This module is that resolution — the code registry
 * (lib/hr/entities.ts) provides the name, logo and fallback contact line; the
 * `billing_entity_profiles` row layers the billing-specific facts on top.
 *
 * PURE — no DB, no server-only imports — so the form's read-only "Company
 * details" card and the PDF renderer can share one function and cannot drift.
 */

import {
  getEntity,
  isEntityId,
  DEFAULT_PHONE,
  DEFAULT_EMAIL,
  DEFAULT_WEBSITE,
  DEFAULT_ADDRESS_LINE,
} from "@/lib/hr/entities";
import type { BillingSellerSnapshot } from "@/db/schema";

/** The billing-profile fields this merge reads. A subset of the table row, so
 *  the function stays callable from a client component with plain data. */
export interface SellerProfileFields {
  legalName?: string | null;
  pan?: string | null;
  gstin?: string | null;
  stateName?: string | null;
  stateCode?: string | null;
  addressLine?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;
  upiId?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  signatureImageUrl?: string | null;
  interestClause?: string | null;
  invoiceFooterNote?: string | null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * The seller block as it will print. Call it at SAVE time and store the result
 * in `seller_snapshot` — after that the document renders from the snapshot, so
 * editing the profile later cannot change an invoice already issued.
 */
export function buildSellerSnapshot(
  entityId: string,
  profile: SellerProfileFields | null | undefined,
  /** `org_settings.logoUrl` — the last logo fallback. */
  orgLogoUrl?: string | null,
): BillingSellerSnapshot {
  /* A COMPANY ADDED IN ADMIN IS NOT IN THE CODE REGISTRY.
     `getEntity` answers an unknown slug with the DEFAULT entity, which is the
     right behaviour for a letterhead that must render something — and the
     wrong one here, where it would quietly print somebody else's invoice
     under Altus Corp's name. So an id the registry does not know keeps its own
     id and takes its names from its profile (see lib/billing/entities.ts).
     Everything below this line merges identically either way. */
  const known = isEntityId(entityId);
  const entity = getEntity(entityId);
  const fallbackName = clean(profile?.legalName) ?? entityId;
  return {
    entityId: known ? entity.id : entityId,
    displayName: known ? entity.displayName : fallbackName,
    legalName: clean(profile?.legalName) ?? (known ? entity.legalName : fallbackName),
    pan: clean(profile?.pan),
    gstin: clean(profile?.gstin),
    stateName: clean(profile?.stateName),
    stateCode: clean(profile?.stateCode),
    addressLine: clean(profile?.addressLine) ?? (known ? entity.addressLine : null) ?? DEFAULT_ADDRESS_LINE,
    email: clean(profile?.email) ?? (known ? entity.email : null) ?? DEFAULT_EMAIL,
    phone: clean(profile?.phone) ?? (known ? entity.phone : null) ?? DEFAULT_PHONE,
    whatsapp: clean(profile?.whatsapp),
    website: clean(profile?.website) ?? (known ? entity.website : null) ?? DEFAULT_WEBSITE,
    // profile override → the per-entity asset in /public/logos → the org logo.
    logoUrl: clean(profile?.logoUrl) ?? (known ? entity.logo : null) ?? clean(orgLogoUrl),
    bankName: clean(profile?.bankName),
    bankAccountName: clean(profile?.bankAccountName),
    bankAccountNo: clean(profile?.bankAccountNo),
    bankIfsc: clean(profile?.bankIfsc),
    bankBranch: clean(profile?.bankBranch),
    upiId: clean(profile?.upiId),
    signatoryName: clean(profile?.signatoryName),
    signatoryDesignation: clean(profile?.signatoryDesignation),
    signatureImageUrl: clean(profile?.signatureImageUrl),
    interestClause: clean(profile?.interestClause),
    invoiceFooterNote: clean(profile?.invoiceFooterNote),
  };
}

/** Is this entity ready to issue a TAX invoice? (A GSTIN is the whole test.) */
export function sellerCanIssueTaxInvoice(snapshot: BillingSellerSnapshot): boolean {
  return Boolean(snapshot.gstin);
}

/** The bank rows a document prints — blanks are dropped, never printed empty. */
export function sellerBankRows(
  s: BillingSellerSnapshot,
): { label: string; value: string }[] {
  // THE REFERENCE INVOICE'S FOUR ROWS, in its order and with its wording:
  //
  //   Cheque to be issued in favour of : Altus Corp
  //   Account name for online transfer : Altus Corp (Current Account)
  //   Bank Account Number              : 6812028980 — Kotak Mahindra Bank
  //   Bank IFS Code                    : KKBK0000646 (Malad East, Mumbai 400097)
  //
  // TWO DIFFERENT NAMES, deliberately. A cheque is made out to the LEGAL entity
  // ("Altus Corp"); an online transfer has to match the name on the account,
  // which carries the account type ("Altus Corp (Current Account)"). They read
  // as a duplication and are not one — paying either way with the other name is
  // how a transfer gets returned.
  //
  // There is no separate "Bank" row: the reference folds the bank's name into
  // the account-number line, and a fifth row for it would not be this template.
  const rows: { label: string; value: string }[] = [];
  const chequeName = s.legalName ?? s.bankAccountName;
  if (chequeName) rows.push({ label: "Cheque to be issued in favour of", value: chequeName });
  if (s.bankAccountName) {
    rows.push({ label: "Account name for online transfer", value: s.bankAccountName });
  }
  if (s.bankAccountNo) {
    rows.push({
      label: "Bank Account Number",
      value: s.bankName ? `${s.bankAccountNo} — ${s.bankName}` : s.bankAccountNo,
    });
  }
  if (s.bankIfsc) {
    rows.push({
      label: "Bank IFS Code",
      value: s.bankBranch ? `${s.bankIfsc} (${s.bankBranch})` : s.bankIfsc,
    });
  }
  if (s.upiId) rows.push({ label: "UPI", value: s.upiId });
  return rows;
}
