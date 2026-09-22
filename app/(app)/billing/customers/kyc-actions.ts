"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, logDbError, uniqueViolationConstraint } from "@/lib/db/error";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  billingCustomerAddresses,
  billingCustomerContacts,
  billingCustomerDocuments,
  billingCustomers,
} from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { stateByName, stateFromGstin } from "@/lib/billing/states";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { putObject, removeObjects } from "@/lib/storage/objects";
import { validateUpload } from "@/lib/hr/upload";
import { getCustomerDetail, type CustomerDetail } from "@/lib/queries/billing-customers";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "That input is not valid.";
}

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const ContactSchema = z.object({
  firstName: opt(120),
  lastName: opt(120),
  phone: opt(40),
  whatsapp: opt(40),
  email: opt(200),
  designation: opt(120),
  department: opt(120),
  notes: opt(2000),
});

const AddressSchema = z.object({
  kind: z.enum(["billing", "shipping"]),
  line1: opt(300),
  line2: opt(300),
  line3: opt(300),
  line4: opt(300),
  city: opt(120),
  stateName: opt(120),
  country: z.string().trim().max(80).default("India"),
  pincode: opt(12),
});

const KycSchema = z.object({
  /* Present when EDITING an existing client; absent when onboarding. */
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "The company needs a name.").max(300),
  /* CHECKED ONLY WHEN GIVEN. An unregistered customer is a real case — the
     invoice then carries no GST lines at all — so a blank GSTIN is valid and a
     malformed one is not. */
  gstin: opt(15).refine(
    (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v.toUpperCase()),
    "That GSTIN is not in the right format (15 characters, e.g. 27ACPPV1393L1ZQ).",
  ),
  pan: opt(10).refine(
    (v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase()),
    "That PAN is not in the right format (e.g. ACPPV1393L).",
  ),
  msmeNo: opt(60),
  gstRegType: opt(60),
  currency: z.string().trim().max(10).default("INR"),
  country: z.string().trim().max(80).default("India"),
  stateName: opt(120),
  grade: opt(40),
  salesPersonId: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().uuid().nullable().default(null),
  ),
  isExport: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1)).default([]),
  customerTypes: z.array(z.string().trim().min(1)).default([]),
  industryTypes: z.array(z.string().trim().min(1)).default([]),
  productTypes: z.array(z.string().trim().min(1)).default([]),
  paymentTerms: opt(120),
  freightCharges: opt(120),
  creditDays: opt(40),
  creditLimit: opt(40),
  transporter: opt(120),
  quantityDeviation: opt(40),
  otherReferences: opt(4000),
  notes: opt(4000),
  businessCategory: opt(120),
  natureOfBusiness: opt(500),
  linkedinUrl: opt(500),
  instagramHandle: opt(200),
  subscription: z.enum(["Yes", "No", "Not Applicable", ""]).optional(),
  emi: z.enum(["Yes", "No", "Not Applicable", ""]).optional(),
  moduleWisePayment: z.enum(["Yes", "No", "Not Applicable", ""]).optional(),
  introducer: z
    .object({
      website: opt(300),
      firstName: opt(120),
      lastName: opt(120),
      socialMedia: z.enum(["Yes", "No", ""]).optional(),
      city: opt(120),
      email: opt(200),
      whatsapp: opt(40),
      company: opt(200),
      designation: opt(120),
      natureOfWork: opt(300),
      businessCategory: opt(120),
      cameThrough: opt(120),
      introducedBy: opt(200),
    })
    .optional(),
  contacts: z.array(ContactSchema).default([]),
  addresses: z.array(AddressSchema).default([]),
});

/** The introducer with its blank answers dropped — null when nothing was answered. */
function cleanIntroducer(v: Record<string, string | undefined> | undefined): Record<string, string> | null {
  if (!v) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (val && val.trim()) out[k] = val.trim();
  return Object.keys(out).length ? out : null;
}

const blank = (v: string | undefined | null): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * ONBOARD A CLIENT — the Customer KYC form's save.
 *
 * Company, contacts and addresses in ONE TRANSACTION. A half-saved client — a
 * company row whose addresses failed to insert — is worse than a failed save,
 * because nothing on screen says so and the gap is found later, on an invoice
 * with nowhere to post it.
 *
 * The client code is allocated INSIDE the transaction, for the same reason the
 * document numbers are: two people onboarding at the same moment must not both
 * be handed CL-0042.
 */
export async function saveCustomerKycAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; clientCode: string }>> {
  const me = await requireWorkspace("billing");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = KycSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;

  // MANDATORY — the same list the form checks: everything New Document
  // fetches from the KYC. Checked here too so no path can skip it.
  const c0 = v.contacts[0];
  const bill = v.addresses.find((a) => a.kind === "billing");
  const need: [unknown, string][] = [
    [c0?.firstName, "Contact person's First Name is required."],
    [c0?.phone, "Contact No is required."],
    [c0?.email, "Email is required."],
    [bill?.line1, "Billing Address Line 1 is required."],
    [bill?.city, "Billing address City is required."],
    [bill?.stateName, "Billing address State is required."],
    [bill?.pincode, "Billing address Pin Code is required."],
    [v.paymentTerms, "Payment Terms is required."],
  ];
  for (const [val, msg] of need) {
    if (typeof val !== "string" || !val.trim()) return { ok: false, error: msg };
  }

  const gstin = blank(v.gstin)?.toUpperCase() ?? null;
  /* The first two digits of a GSTIN ARE the state code, so a registered
     customer's state is derived rather than asked for a second time and then
     allowed to disagree with itself. */
  const derived = stateFromGstin(gstin);

  try {
    const result = await db.transaction(async (tx) => {
      let customerId: string;
      let clientCode: string;
      if (v.id) {
        /* EDIT — the fields are overwritten, and the contacts and addresses are
           replaced wholesale: the form always sends the complete list, so
           "what is on screen" is exactly what is stored, removals included.
           The client code never changes; documents already raised carry it. */
        const [existing] = await tx
          .select({ id: billingCustomers.id, clientCode: billingCustomers.clientCode })
          .from(billingCustomers)
          .where(and(eq(billingCustomers.id, v.id), isNull(billingCustomers.deletedAt)))
          .limit(1);
        if (!existing) throw new Error("NOT_FOUND");
        await tx
          .update(billingCustomers)
          .set({
            name: v.name,
            gstin,
            pan: blank(v.pan)?.toUpperCase() ?? null,
            msmeNo: blank(v.msmeNo),
            gstRegType: blank(v.gstRegType),
            currency: v.currency || "INR",
            country: v.country || "India",
            stateName: derived?.name ?? blank(v.stateName),
            stateCode: derived?.code ?? null,
            grade: blank(v.grade),
            salesPersonId: v.salesPersonId,
            isExport: v.isExport,
            tags: v.tags,
            customerTypes: v.customerTypes,
            industryTypes: v.industryTypes,
            productTypes: v.productTypes,
            paymentTerms: blank(v.paymentTerms),
            freightCharges: blank(v.freightCharges),
            creditDays: blank(v.creditDays),
            creditLimit: blank(v.creditLimit),
            transporter: blank(v.transporter),
            quantityDeviation: blank(v.quantityDeviation),
            otherReferences: blank(v.otherReferences),
            businessCategory: blank(v.businessCategory),
            natureOfBusiness: blank(v.natureOfBusiness),
            linkedinUrl: blank(v.linkedinUrl),
            instagramHandle: blank(v.instagramHandle),
            subscription: blank(v.subscription),
            emi: blank(v.emi),
            moduleWisePayment: blank(v.moduleWisePayment),
            // Only the answered introducer fields; none at all → no introducer.
            introducer: cleanIntroducer(v.introducer),
            notes: blank(v.notes),
            updatedById: me.id,
            updatedAt: new Date(),
          })
          .where(eq(billingCustomers.id, v.id));
        await tx.delete(billingCustomerContacts).where(eq(billingCustomerContacts.customerId, v.id));
        await tx.delete(billingCustomerAddresses).where(eq(billingCustomerAddresses.customerId, v.id));
        customerId = v.id;
        clientCode = existing.clientCode ?? "";
      } else {
        const [max] = await tx
          .select({
            n: sql<number>`coalesce(max(nullif(regexp_replace(coalesce(${billingCustomers.clientCode}, ''), '[^0-9]', '', 'g'), '')::int), 0)`,
          })
          .from(billingCustomers);
        clientCode = `CL-${String((max?.n ?? 0) + 1).padStart(4, "0")}`;

        const [row] = await tx
          .insert(billingCustomers)
          .values({
            name: v.name,
            clientCode,
            gstin,
            pan: blank(v.pan)?.toUpperCase() ?? null,
            msmeNo: blank(v.msmeNo),
            gstRegType: blank(v.gstRegType),
            currency: v.currency || "INR",
            country: v.country || "India",
            stateName: derived?.name ?? blank(v.stateName),
            stateCode: derived?.code ?? null,
            grade: blank(v.grade),
            salesPersonId: v.salesPersonId,
            isExport: v.isExport,
            tags: v.tags,
            customerTypes: v.customerTypes,
            industryTypes: v.industryTypes,
            productTypes: v.productTypes,
            paymentTerms: blank(v.paymentTerms),
            freightCharges: blank(v.freightCharges),
            creditDays: blank(v.creditDays),
            creditLimit: blank(v.creditLimit),
            transporter: blank(v.transporter),
            quantityDeviation: blank(v.quantityDeviation),
            otherReferences: blank(v.otherReferences),
            businessCategory: blank(v.businessCategory),
            natureOfBusiness: blank(v.natureOfBusiness),
            linkedinUrl: blank(v.linkedinUrl),
            instagramHandle: blank(v.instagramHandle),
            subscription: blank(v.subscription),
            emi: blank(v.emi),
            moduleWisePayment: blank(v.moduleWisePayment),
            // Only the answered introducer fields; none at all → no introducer.
            introducer: cleanIntroducer(v.introducer),
            notes: blank(v.notes),
            createdById: me.id,
            updatedById: me.id,
          })
          .returning({ id: billingCustomers.id });

        customerId = row!.id;
      }

      /* Entirely blank rows are dropped rather than saved. The form opens with
         one empty contact and one empty address, and somebody who filled in
         neither meant to leave them out, not to store two empty records. */
      const contacts = v.contacts.filter((c) =>
        [c.firstName, c.lastName, c.phone, c.whatsapp, c.email, c.designation].some((x) => blank(x)),
      );
      if (contacts.length > 0) {
        await tx.insert(billingCustomerContacts).values(
          contacts.map((c, i) => ({
            customerId,
            firstName: blank(c.firstName),
            lastName: blank(c.lastName),
            phone: blank(c.phone),
            whatsapp: blank(c.whatsapp),
            email: blank(c.email),
            designation: blank(c.designation),
            department: blank(c.department),
            notes: blank(c.notes),
            isPrimary: i === 0,
            sortOrder: i,
          })),
        );
        /* Mirrored onto the customer so every screen that only wants "who do I
           ring" — the master list, an invoice's Kind Attn. — needs no join. */
        const first = contacts[0]!;
        const name = [blank(first.firstName), blank(first.lastName)].filter(Boolean).join(" ");
        await tx
          .update(billingCustomers)
          .set({
              contactName: name || null,
              email: blank(first.email),
              phone: blank(first.phone),
              whatsapp: blank(first.whatsapp),
            })
            .where(eq(billingCustomers.id, customerId));
        }
  
        const addresses = v.addresses.filter((a) =>
          [a.line1, a.line2, a.line3, a.line4, a.city, a.pincode].some((x) => blank(x)),
        );
        if (addresses.length > 0) {
          await tx.insert(billingCustomerAddresses).values(
            addresses.map((a, i) => ({
              customerId,
              kind: a.kind,
              line1: blank(a.line1),
              line2: blank(a.line2),
              line3: blank(a.line3),
              line4: blank(a.line4),
              city: blank(a.city),
              stateName: blank(a.stateName),
              stateCode: stateByName(a.stateName)?.code ?? null,
              country: a.country || "India",
              pincode: blank(a.pincode),
              sortOrder: i,
            })),
          );
          /* The billing address also lands on the customer, because that is what
             an invoice prints and it should not have to choose between two. */
          const billing = addresses.find((a) => a.kind === "billing") ?? addresses[0]!;
          const rest = [blank(billing.line2), blank(billing.line3), blank(billing.line4)]
            .filter(Boolean)
            .join(", ");
          await tx
            .update(billingCustomers)
            .set({
              addressLine1: blank(billing.line1),
              addressLine2: rest || null,
              city: blank(billing.city),
              pincode: blank(billing.pincode),
            })
            .where(eq(billingCustomers.id, customerId));
        }
  
        return { id: customerId, clientCode };
      });
  
      revalidatePath("/billing/customers");
      revalidatePath("/billing/customers/addresses");
      revalidatePath("/billing/documents/new");
      return { ok: true, ...result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg === "NOT_FOUND") return { ok: false, error: "That client no longer exists." };

      /* A DUPLICATE IS NOT A CRASH — it is a sentence about one field.
         The old branch tested drizzle's `.message` for the word "unique",
         which it never contains: drizzle's message is only ever "Failed query:
         <sql> params: <values>", so every duplicate name fell through to the
         generic arm and put the whole INSERT — the customer's name, GSTIN, PAN
         and notes among the bound parameters — on screen. The SQLSTATE and the
         index name are on the driver's error under `.cause`. */
      const constraint = uniqueViolationConstraint(e);
      if (constraint !== null) {
        if (constraint === "billing_customers_name_uq") {
          return {
            ok: false,
            error:
              `A client called "${v.name.trim()}" is already in the Customer Master. ` +
              `Open that client to edit it, or give this one a different company name.`,
          };
        }
        if (constraint === "billing_customers_code_uq") {
          return {
            ok: false,
            error: "That client code was taken while you were filling the form. Press save again.",
          };
        }
        return { ok: false, error: "A client with those details already exists." };
      }

      /* Anything else: the reason, never the bound parameters — dbErrorMessage
         drops those deliberately, and this string goes into a toast. */
      logDbError("saveCustomerKycAction", e);
      return { ok: false, error: `The client could not be saved: ${dbErrorMessage(e)}` };
    }
  }
  
  /**
   * ATTACH ONE FILE TO A SAVED CLIENT — business-card front / back, or "other".
   *
   * The KYC form holds picked files in the browser until the client is saved,
   * then sends them here one at a time with the new id. One file per call keeps
   * each request under the 25 MB server-action body limit and lets one bad file
   * fail on its own instead of taking the rest with it.
   *
   * The object is written first and the row second; if the row insert fails the
   * object is removed, so storage never holds a file no record points at.
   */
  export async function uploadCustomerDocumentAction(
    fd: FormData,
  ): Promise<ActionResult<{ id: string }>> {
    const me = await requireWorkspace("billing");
    const limited = rateLimitOrError(me.id, "write");
    if (limited) return limited;
  
    const customerId = String(fd.get("customerId") ?? "");
    const slotRaw = String(fd.get("slot") ?? "other");
    const slot = (["front", "back", "brochure", "video"] as const).find((x) => x === slotRaw) ?? "other";
    const file = fd.get("file");
    if (!z.string().uuid().safeParse(customerId).success) return { ok: false, error: "Unknown client." };
    if (!(file instanceof File)) return { ok: false, error: "No file provided." };
    const valid = validateUpload(file);
    if (!valid.ok) return valid;
  
    const [cust] = await db
      .select({ id: billingCustomers.id })
      .from(billingCustomers)
      .where(eq(billingCustomers.id, customerId))
      .limit(1);
    if (!cust) return { ok: false, error: "That client no longer exists." };
  
    const cleanName = (file.name || "file").replace(/[\r\n"]/g, "").slice(0, 180) || "file";
    const ext = (cleanName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `billing/customers/${customerId}/${randomUUID()}${ext ? `.${ext}` : ""}`;
    const mime = (file.type || "application/octet-stream").toLowerCase();
  
    const put = await putObject(DOCUMENTS_BUCKET, path, Buffer.from(await file.arrayBuffer()), mime);
    if (!put.ok) return { ok: false, error: `Upload failed: ${put.error}` };
  
    try {
      const [row] = await db
        .insert(billingCustomerDocuments)
        .values({
          customerId,
          slot,
          fileName: cleanName,
          storagePath: path,
          contentType: mime,
          sizeBytes: file.size,
          uploadedById: me.id,
        })
        .returning({ id: billingCustomerDocuments.id });
      revalidatePath("/billing/customers");
      return { ok: true, id: row!.id };
    } catch (e) {
      await removeObjects(DOCUMENTS_BUCKET, [path]).catch(() => {});
      return { ok: false, error: `The file could not be saved: ${e instanceof Error ? e.message : "Unknown error"}` };
    }
  }
  
  /* ─────────────────────── Customer Master row actions ────────────────────── */
  
  const IdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "Select at least one client.").max(500) });
  
  /** Everything on one client — Quick View and the PDF view read this. */
  export async function getCustomerDetailAction(
    id: string,
  ): Promise<ActionResult<{ customer: CustomerDetail }>> {
    await requireWorkspace("billing");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown client." };
    const customer = await getCustomerDetail(id);
    if (!customer) return { ok: false, error: "That client no longer exists." };
    return { ok: true, customer };
  }
  
  /**
   * DEACTIVATE / ACTIVATE. An inactive client stays in the master and on every
   * document already raised; it is only no longer offered for new ones.
   */
  export async function setCustomersActiveAction(
    raw: unknown,
  ): Promise<ActionResult<{ updated: number }>> {
    const me = await requireWorkspace("billing");
    const limited = rateLimitOrError(me.id, "write");
    if (limited) return limited;
    const parsed = IdsSchema.extend({ active: z.boolean() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  
    const rows = await db
      .update(billingCustomers)
      .set({ isActive: parsed.data.active, updatedAt: new Date(), updatedById: me.id })
      .where(and(inArray(billingCustomers.id, parsed.data.ids), isNull(billingCustomers.deletedAt)))
      .returning({ id: billingCustomers.id });
    revalidatePath("/billing/customers");
    revalidatePath("/billing/documents/new");
    return { ok: true, updated: rows.length };
  }
  
  /**
   * DELETE — to the recycle bin, not out of the database. Sets `deleted_at`;
   * the Recycle Bin's Restore clears it, and nothing that referenced the client
   * (documents, contacts, addresses, files) is touched either way.
   */
  export async function deleteCustomersAction(raw: unknown): Promise<ActionResult<{ deleted: number }>> {
    const me = await requireWorkspace("billing");
    const limited = rateLimitOrError(me.id, "write");
    if (limited) return limited;
    const parsed = IdsSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  
    const rows = await db
      .update(billingCustomers)
      .set({ deletedAt: new Date(), deletedById: me.id })
      .where(and(inArray(billingCustomers.id, parsed.data.ids), isNull(billingCustomers.deletedAt)))
      .returning({ id: billingCustomers.id });
    revalidatePath("/billing/customers");
    revalidatePath("/billing/customers/addresses");
    revalidatePath("/billing/recycle-bin");
    revalidatePath("/billing/documents/new");
    return { ok: true, deleted: rows.length };
  }
  
/**
 * REMOVE ONE ATTACHED FILE from a client — the row, then the stored object.
 * The object removal is best-effort (lib/storage/objects): once the row is
 * gone nothing points at the file, so a leftover object is only disk.
 */
export async function removeCustomerDocumentAction(id: string): Promise<ActionResult> {
  const me = await requireWorkspace("billing");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown file." };

  const [row] = await db
    .delete(billingCustomerDocuments)
    .where(eq(billingCustomerDocuments.id, id))
    .returning({ storagePath: billingCustomerDocuments.storagePath });
  if (!row) return { ok: false, error: "That file is already gone." };
  await removeObjects(DOCUMENTS_BUCKET, [row.storagePath]).catch(() => {});
  revalidatePath("/billing/customers");
  return { ok: true };
}
