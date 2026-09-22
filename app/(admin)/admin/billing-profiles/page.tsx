import { Building2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canEditModule, requireModuleView } from "@/lib/permissions/resolve";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { db } from "@/lib/db";
import { billingNumberSeries } from "@/db/schema";
import { billingEntitiesFrom } from "@/lib/billing/entities";
import { BILLING_DOC_TYPES } from "@/db/enums";
import {
  listEntityBillingProfiles,
  listPaymentTerms,
  listSeriesDefaults,
} from "@/lib/queries/billing-documents";
import { SERIES_BASE, financialYear, todayISO } from "@/lib/billing/numbering";
import {
  BillingProfileEditor,
  type EntityCard,
} from "@/components/admin/billing/profile-editor";

/**
 * ADMIN › BILLING PROFILES — the seller side of every document.
 *
 * This screen is what the handwritten notes mean by "Entity: Admin Panel",
 * "PAN Details: Admin Panel", "Bank Details" and "Signature Details": configure
 * an entity once here and its invoices fill their own letterhead, bank block and
 * signature from then on.
 */
export const dynamic = "force-dynamic";

export default async function BillingProfilesPage() {
  await requireAdmin();
  await requireModuleView("admin.masters.billing-profiles");

  /* SEQUENTIAL, not Promise.all — the same call this module already made in
     `getBillingFormData`, and for the same reason.

     2026-09-20: this page took 2.5–4 MINUTES to render while the four tables it
     reads answered in 43–490ms each from a fresh connection. The time was not
     query cost, it was queueing: five statements fired at once, on a pooler
     where a stalled one holds its slot until Supabase's 2-minute
     statement_timeout releases it. A reload while that is happening adds five
     more, and the pool collapses — the slow-query log showed clusters finishing
     at identical 87s / 155s / 251s marks, which is what waiting on the same
     blockage looks like.

     These four rows-tables are tiny and cost ~600ms end to end in a row, so the
     parallelism was buying milliseconds and paying minutes. */
  const profiles = await listEntityBillingProfiles();
  const terms = await listPaymentTerms(true);
  const seriesDefaults = await listSeriesDefaults();
  const liveSeries = await db.select().from(billingNumberSeries);
  const canEdit = await canEditModule("admin.masters.billing-profiles");

  const finYear = financialYear(todayISO());
  const byEntity = new Map(profiles.map((p) => [p.entityId, p]));
  // Off the rows just read — this screen is the one that already has them, and
  // it is slow enough without reading the same table twice.
  const entities = billingEntitiesFrom(profiles);

  /* The five in code, then any company added on this screen — see
     lib/billing/entities.ts for why they come from two places. */
  const cards: EntityCard[] = entities.map((entity) => {
    const p = byEntity.get(entity.id) ?? null;
    return {
      entityId: entity.id,
      displayName: entity.displayName,
      hasProfile: Boolean(p),
      fallbackLogo: entity.logo ?? null,
      isCustom: entity.isCustom,
      values: {
        entityId: entity.id,
        legalName: p?.legalName ?? "",
        pan: p?.pan ?? "",
        gstin: p?.gstin ?? "",
        stateCode: p?.stateCode ?? "",
        addressLine: p?.addressLine ?? "",
        email: p?.email ?? "",
        phone: p?.phone ?? "",
        whatsapp: p?.whatsapp ?? "",
        website: p?.website ?? "",
        logoUrl: p?.logoUrl ?? "",
        bankName: p?.bankName ?? "",
        bankAccountName: p?.bankAccountName ?? "",
        bankAccountNo: p?.bankAccountNo ?? "",
        bankIfsc: p?.bankIfsc ?? "",
        bankBranch: p?.bankBranch ?? "",
        upiId: p?.upiId ?? "",
        defaultSacCode: p?.defaultSacCode ?? "",
        signatoryName: p?.signatoryName ?? "",
        signatoryDesignation: p?.signatoryDesignation ?? "",
        signatureImageUrl: p?.signatureImageUrl ?? "",
        defaultPaymentTermsId: p?.defaultPaymentTermsId ?? "",
        interestClause: p?.interestClause ?? "",
        invoiceFooterNote: p?.invoiceFooterNote ?? "",
      },
      series: BILLING_DOC_TYPES.map((docType) => {
        const configured = seriesDefaults.find(
          (d) => d.entityId === entity.id && d.docType === docType,
        );
        const live = liveSeries.find(
          (s) => s.entityId === entity.id && s.docType === docType && s.finYear === finYear,
        );
        return {
          docType,
          prefix: configured?.prefix ?? "",
          startSeq: String(configured?.startSeq ?? SERIES_BASE[docType]),
          padWidth: String(configured?.padWidth ?? 0),
          liveNext: live?.nextSeq ?? null,
          finYear,
        };
      }),
    };
  });

  const ready = cards.filter((c) => c.values.gstin.trim()).length;

  return (
    <AdminSection
      eyebrow="Admin · Masters"
      title="Billing profiles"
      subtitle="PAN, GSTIN, address, bank, signatory and number series for each issuing entity. Every invoice fills its company block from here."
      icon={Building2}
      stats={[
        { label: "Entities", value: cards.length },
        { label: "GST-ready", value: ready, tone: ready === cards.length ? "green" : "amber" },
        { label: "Financial year", value: finYear },
      ]}
    >
      <BillingProfileEditor
        cards={cards}
        paymentTerms={terms.map((t) => ({ id: t.id, label: t.label }))}
        canEdit={canEdit}
      />
    </AdminSection>
  );
}
