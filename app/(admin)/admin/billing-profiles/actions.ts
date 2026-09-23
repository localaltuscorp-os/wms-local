"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingContracts,
  billingDocuments,
  billingEntityProfiles,
  billingNumberSeries,
  billingSeriesDefaults,
  outstandingProducts,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { z } from "zod";
import {
  BillingEntityProfileSchema,
  BillingSeriesDefaultSchema,
} from "@/lib/validators/billing";
import {
  entitySlug,
  isKnownBillingEntity,
  listCustomBillingEntities,
} from "@/lib/billing/entities";

/**
 * ADMIN › BILLING PROFILES — the answer to every "…: Admin Panel" in the notes.
 *
 * One row per issuing entity carrying its PAN, GSTIN, state, address, bank,
 * signatory and number-series settings. Configure it once and every document
 * that entity raises fills its own company block, bank block and signature.
 *
 * The profile is NOT what a generated document prints from — that is the
 * snapshot taken at save time. Editing here changes future documents only,
 * which is the point.
 */

const NODE = "admin.masters.billing-profiles";

export type BillingAdminResult = { ok: true; id?: string } | { ok: false; error: string };

function bust(): void {
  revalidatePath("/admin/billing-profiles");
  revalidatePath("/billing/documents");
}

export async function saveBillingEntityProfile(
  values: Record<string, unknown>,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = BillingEntityProfileSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  /* The five entities live in code; a company added on this screen lives as a
     profile row of its own (lib/billing/entities.ts). Anything that is neither
     would be an orphan profile no document could ever resolve, so it is
     refused here rather than written and discovered later. */
  if (!(await isKnownBillingEntity(v.entityId))) return { ok: false, error: "Unknown entity." };

  const row = {
    legalName: v.legalName,
    pan: v.pan,
    gstin: v.gstin,
    stateName: v.stateName,
    stateCode: v.stateCode,
    addressLine: v.addressLine,
    email: v.email,
    whatsapp: v.whatsapp,
    phone: v.phone,
    website: v.website,
    logoUrl: v.logoUrl,
    bankName: v.bankName,
    bankAccountName: v.bankAccountName,
    bankAccountNo: v.bankAccountNo,
    bankIfsc: v.bankIfsc,
    bankBranch: v.bankBranch,
    upiId: v.upiId,
    defaultSacCode: v.defaultSacCode,
    signatoryName: v.signatoryName,
    signatoryDesignation: v.signatoryDesignation,
    signatureImageUrl: v.signatureImageUrl,
    defaultPaymentTermsId: v.defaultPaymentTermsId,
    interestClause: v.interestClause,
    invoiceFooterNote: v.invoiceFooterNote,
    updatedById: me.id,
    updatedAt: new Date(),
  };

  try {
    const [existing] = await db
      .select({ id: billingEntityProfiles.id })
      .from(billingEntityProfiles)
      .where(eq(billingEntityProfiles.entityId, v.entityId))
      .limit(1);

    if (existing) {
      await db.update(billingEntityProfiles).set(row).where(eq(billingEntityProfiles.id, existing.id));
      bust();
      return { ok: true, id: existing.id };
    }
    const [created] = await db
      .insert(billingEntityProfiles)
      .values({ ...row, entityId: v.entityId, createdById: me.id })
      .returning({ id: billingEntityProfiles.id });
    bust();
    return { ok: true, id: created?.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * The number series for one (entity, document type): its prefix, the sequence
 * it starts at and how it is padded.
 *
 * These are DEFAULTS for a financial year that has not started yet. A year
 * already in progress keeps its own counter — changing the base here must never
 * rewind a series that has already issued numbers.
 */
export async function saveBillingSeriesDefault(
  values: Record<string, unknown>,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = BillingSeriesDefaultSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  // Same gate as the profile save: the five, or a company added on this screen.
  if (!(await isKnownBillingEntity(v.entityId))) return { ok: false, error: "Unknown entity." };

  try {
    const where = and(
      eq(billingSeriesDefaults.entityId, v.entityId),
      eq(billingSeriesDefaults.docType, v.docType),
    );
    const [existing] = await db
      .select({ id: billingSeriesDefaults.id })
      .from(billingSeriesDefaults)
      .where(where)
      .limit(1);
    const row = {
      prefix: v.prefix,
      startSeq: v.startSeq,
      padWidth: v.padWidth,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(billingSeriesDefaults).set(row).where(eq(billingSeriesDefaults.id, existing.id));
    } else {
      await db
        .insert(billingSeriesDefaults)
        .values({ ...row, entityId: v.entityId, docType: v.docType });
    }
    bust();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * The product master's BILLING columns — SAC, default rate, default GST rate,
 * description and whether the product is billable at all.
 *
 * Writes `outstanding_products`, the same rows `/admin/products` manages. The
 * table is extended, never forked: Outstanding keeps working untouched, and a
 * product picked on an invoice arrives with its own SAC and rate.
 */
const ProductBillingSchema = z.object({
  sacCode: z.string().trim().max(20).nullable().default(null),
  defaultRate: z.string().trim().max(20).nullable().default(null),
  defaultGstRate: z.string().trim().max(10).nullable().default(null),
  description: z.string().trim().max(2000).nullable().default(null),
  isBillable: z.boolean().default(true),
});

export async function saveProductBillingFields(
  id: string | null,
  values: Record<string, unknown>,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit("admin.masters.products");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!id || !z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Products are created on the Product Master screen." };
  }

  const blank = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : v;
    return s === "" || s === undefined ? null : s;
  };
  const parsed = ProductBillingSchema.safeParse({
    sacCode: blank(values.sacCode),
    defaultRate: blank(values.defaultRate),
    defaultGstRate: blank(values.defaultGstRate),
    description: blank(values.description),
    isBillable: Boolean(values.isBillable),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const numeric = (s: string | null, label: string): string | null | { error: string } => {
    if (s === null) return null;
    const n = Number(s.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return { error: `${label} must be a number.` };
    return n.toFixed(2);
  };
  const rate = numeric(v.defaultRate, "Default rate");
  if (rate && typeof rate === "object") return { ok: false, error: rate.error };
  const gst = numeric(v.defaultGstRate, "Default GST rate");
  if (gst && typeof gst === "object") return { ok: false, error: gst.error };
  if (typeof gst === "string" && Number(gst) > 28) {
    return { ok: false, error: "A GST rate above 28% is not a thing." };
  }

  try {
    await db
      .update(outstandingProducts)
      .set({
        sacCode: v.sacCode,
        defaultRate: rate as string | null,
        defaultGstRate: gst as string | null,
        description: v.description,
        isBillable: v.isBillable,
        updatedAt: new Date(),
      })
      .where(eq(outstandingProducts.id, id));
    revalidatePath("/admin/billing-products");
    revalidatePath("/billing/documents");
    updateTag(CACHE_TAGS.products);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * ADD A COMPANY that is not one of the five in code.
 *
 * Manan, 2026-09-20, against the "+ Add billing profile" picker: "here have
 * already have company but if i want to add new profile then how can i do so."
 * That picker only ever offered the five, so once each had a profile it was
 * empty and there was no way in at all.
 *
 * All this writes is the row and its name — the PAN, GSTIN, bank and signatory
 * are then filled in on the card it opens, by the same editor the five use. The
 * id is a slug of the name because `entity_id` is what documents carry: it has
 * to be stable and readable, and a uuid in a seller snapshot tells nobody
 * anything.
 */
export async function createBillingCompany(
  raw: unknown,
): Promise<BillingAdminResult & { entityId?: string }> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Type the company's legal name.")
        .max(120, "That name is too long."),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const name = parsed.data.name;
  const entityId = entitySlug(name);
  if (!entityId) {
    return { ok: false, error: "That name has no letters or numbers in it." };
  }

  // Against the five AND against the companies already added — the unique
  // index on entity_id would catch a clash, but not with a sentence.
  if (await isKnownBillingEntity(entityId)) {
    const existing = (await listCustomBillingEntities()).find((c) => c.id === entityId);
    return {
      ok: false,
      error: existing
        ? `"${existing.displayName}" is already on this screen — open its card to edit it.`
        : `"${name}" is one of the companies that already has a card here.`,
    };
  }

  try {
    const [row] = await db
      .insert(billingEntityProfiles)
      .values({ entityId, legalName: name, updatedById: me.id })
      .returning({ id: billingEntityProfiles.id });
    bust();
    return { ok: true, id: row?.id, entityId };
  } catch {
    return { ok: false, error: "That company could not be added." };
  }
}

/**
 * DELETE A COMPANY that was added on this screen.
 *
 * ── WHAT CANNOT BE DELETED, AND WHY ─────────────────────────────────────────
 * THE FIVE IN CODE. Altus Corp, Unleashed, The Gainmakers, Legacy Creators and
 * The Perfect Blend come from `lib/hr/entities.ts` and their cards are built
 * from that registry, not from the database. "Deleting" one would wipe its PAN,
 * GSTIN, bank and signatory and then redraw the same card empty a second later,
 * which is data loss wearing the costume of a delete.
 *
 * A COMPANY THAT HAS BILLED. A document carries its `entity_id`, and the
 * documents list and its entity filter read the company's name back out of the
 * registry of companies. Remove the company and those documents name an id
 * nobody can resolve. The issued PDFs are safe either way — they print from the
 * seller snapshot frozen at generate time — but the working screens are not, so
 * this refuses and says how many documents are in the way rather than leaving
 * that to be discovered later.
 *
 * What it does delete, once nothing points at the company: the profile row and
 * the number-series rows that only exist to serve it.
 */
export async function deleteBillingCompany(
  raw: unknown,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = z.object({ entityId: z.string().trim().min(1) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Which company?" };
  const { entityId } = parsed.data;

  const custom = (await listCustomBillingEntities()).find((c) => c.id === entityId);
  if (!custom) {
    return {
      ok: false,
      error:
        "That is one of the five built-in companies — it cannot be deleted. " +
        "Clear the fields on its card instead.",
    };
  }

  const [docs, contracts] = await Promise.all([
    db
      .select({ id: billingDocuments.id })
      .from(billingDocuments)
      .where(eq(billingDocuments.entityId, entityId))
      .limit(1),
    db
      .select({ id: billingContracts.id })
      .from(billingContracts)
      .where(eq(billingContracts.entityId, entityId))
      .limit(1),
  ]);
  if (docs.length > 0 || contracts.length > 0) {
    const what = docs.length > 0 ? "documents" : "contracts";
    return {
      ok: false,
      error:
        `${custom.displayName} has ${what} raised against it, so it cannot be deleted — ` +
        `they would be left naming a company that no longer exists.`,
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(billingSeriesDefaults).where(eq(billingSeriesDefaults.entityId, entityId));
      await tx.delete(billingNumberSeries).where(eq(billingNumberSeries.entityId, entityId));
      await tx.delete(billingEntityProfiles).where(eq(billingEntityProfiles.entityId, entityId));
    });
    bust();
    return { ok: true };
  } catch {
    return { ok: false, error: `${custom.displayName} could not be deleted.` };
  }
}
