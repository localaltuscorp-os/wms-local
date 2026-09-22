"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingCustomers, billingDocumentLines, billingDocuments, billingEmailLog } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  BillingCustomerSchema,
  BillingDocumentSchema,
  CancelBillingDocumentSchema,
  ConvertBillingDocumentSchema,
  EmailBillingDocumentSchema,
  GenerateBillingDocumentSchema,
  MarkPaidSchema,
  parseAddressList,
  ArchiveBillingDocumentSchema,
} from "@/lib/validators/billing";
import {
  cancelBillingDocument,
  convertBillingDocument,
  generateBillingDocument,
  markBillingDocumentPaid,
  markBillingDocumentSent,
  recordEvent,
  saveBillingDocument,
  type BillingActor,
  setBillingDocumentArchived,
} from "@/lib/billing/documents";
import { buildInvoiceViewModel, invoiceFilename } from "@/lib/billing/view-model";
import { invoiceDocumentHtml } from "@/lib/billing/invoice-email-html";
import { renderInvoiceFiles } from "@/lib/billing/invoice-files";
import { sendInvoiceEmail } from "@/lib/email/billing-document-email";
import { money } from "@/lib/billing/tax";
import { BILLING_DOC_TYPE_LABELS } from "@/db/enums";

/**
 * BILLING — the document engine's write surface.
 *
 * Every action follows the house shape: authorise → rate-limit → zod parse →
 * the core in lib/billing/documents.ts → revalidate → return
 * `{ok:true,…} | {ok:false,error}`. Nothing here throws to the UI, and nothing
 * here trusts an id, a total or a status that arrived from the client.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const LIST_PATH = "/billing/documents";

async function actor(): Promise<BillingActor> {
  const me = await requireWorkspace("billing");
  return { id: me.id, email: me.email, name: me.name };
}

/** zod's first message, which names the field the user must fix. */
function firstIssue(err: { issues: { message: string }[] }): string {
  return err.issues[0]?.message ?? "Please check the form and try again.";
}

function revalidateDocument(id?: string): void {
  revalidatePath(LIST_PATH);
  if (id) {
    revalidatePath(`${LIST_PATH}/${id}`);
    revalidatePath(`${LIST_PATH}/${id}/edit`);
  }
}

export async function saveBillingDraftAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = BillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const result = await saveBillingDocument(parsed.data, me);
  if (!result.ok) return result;
  revalidateDocument(result.id);
  return result;
}

/**
 * Save and generate in one click — the form's primary button. The two halves
 * are deliberately the SAME code paths the individual actions use, so a
 * document created this way is indistinguishable from one saved then generated.
 */
export async function saveAndGenerateAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; docNo: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = BillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const saved = await saveBillingDocument(parsed.data, me);
  if (!saved.ok) return saved;

  const generated = await generateBillingDocument(saved.id, me);
  if (!generated.ok) {
    // The draft survives — the user fixes what is missing and generates again.
    revalidateDocument(saved.id);
    return { ok: false, error: generated.error };
  }
  revalidateDocument(saved.id);
  return { ok: true, id: saved.id, docNo: generated.docNo };
}

export async function generateBillingDocumentAction(
  raw: unknown,
): Promise<ActionResult<{ docNo: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = GenerateBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const result = await generateBillingDocument(parsed.data.id, me);
  revalidateDocument(parsed.data.id);
  return result;
}

export async function convertBillingDocumentAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ConvertBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const result = await convertBillingDocument(parsed.data.sourceId, parsed.data.toType, me);
  revalidateDocument(parsed.data.sourceId);
  if (result.ok) revalidateDocument(result.id);
  return result;
}

export async function cancelBillingDocumentAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CancelBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const result = await cancelBillingDocument(parsed.data.id, parsed.data.reason, me);
  revalidateDocument(parsed.data.id);
  return result;
}

/**
 * ARCHIVE (or restore) a document — take it off the working list.
 *
 * Separate from `cancelBillingDocumentAction`, which voids a document and
 * takes a reason. This one says nothing about the document's validity; it only
 * decides whether you are shown it. See `setBillingDocumentArchived`.
 */
export async function archiveBillingDocumentAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ArchiveBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const result = await setBillingDocumentArchived(parsed.data.id, parsed.data.archived, me);
  revalidateDocument(parsed.data.id);
  return result;
}

export async function markBillingDocumentPaidAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MarkPaidSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const result = await markBillingDocumentPaid(
    parsed.data.id,
    money(parsed.data.paidAmount),
    parsed.data.paidAt,
    me,
  );
  revalidateDocument(parsed.data.id);
  return result;
}

/**
 * THE SEND. Renders the PDF fresh from the row (never a cached file), sends it
 * through the app's existing Resend client, logs what went out, stamps the
 * document `sent` and writes the event — in that order, so a failed send leaves
 * a failure in the log and the document untouched.
 */
export async function emailBillingDocumentAction(
  raw: unknown,
): Promise<ActionResult<{ to: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EmailBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  const cc = parseAddressList(input.cc);
  if (!cc.ok) return { ok: false, error: `"${cc.bad}" is not a valid CC address.` };
  const bcc = parseAddressList(input.bcc);
  if (!bcc.ok) return { ok: false, error: `"${bcc.bad}" is not a valid BCC address.` };

  const [document] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, input.id))
    .limit(1);
  if (!document) return { ok: false, error: "That document no longer exists." };
  if (document.status === "cancelled") {
    return { ok: false, error: "A cancelled document cannot be emailed." };
  }
  if (!document.docNo) {
    return { ok: false, error: "Generate this document before emailing it." };
  }

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, input.id))
    .orderBy(billingDocumentLines.sortOrder);

  // PDF + picture from the one template renderer, so the attachment and the
  // picture in the body are the same sheet.
  let pdf: Buffer;
  let documentImage: Buffer | undefined;
  try {
    const files = await renderInvoiceFiles(document, lines, { pdf: true, png: true });
    pdf = files.pdf!;
    documentImage = files.png;
  } catch (err) {
    return {
      ok: false,
      error: `The invoice PDF could not be built: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const filename = invoiceFilename(document);
  const sent = await sendInvoiceEmail({
    to: input.to,
    cc: cc.list,
    bcc: bcc.list,
    subject: input.subject,
    body: input.body,
    title: `${BILLING_DOC_TYPE_LABELS[document.docType]} ${document.docNo}`,
    companyName: document.sellerSnapshot?.legalName ?? "",
    pdf,
    filename,
    // The exact template as a picture in the body; the HTML rendering is only
    // the fallback if the picture cannot be made.
    documentImage,
    documentHtml: invoiceDocumentHtml(buildInvoiceViewModel(document, lines)),
  });

  await db.insert(billingEmailLog).values({
    documentId: document.id,
    recipient: input.to,
    cc: cc.list.join(", ") || null,
    bcc: bcc.list.join(", ") || null,
    subject: input.subject,
    body: input.body,
    attachment: filename,
    status: sent.ok ? "sent" : "failed",
    error: sent.ok ? null : (sent.error ?? "Unknown error"),
    sentById: me.id,
  });

  if (!sent.ok) {
    await recordEvent(db, document.id, me.id, "emailed", { to: input.to, ok: false, error: sent.error });
    revalidateDocument(document.id);
    return { ok: false, error: sent.error ?? "The email could not be sent." };
  }

  await markBillingDocumentSent(document.id, input.to, me);
  await recordEvent(db, document.id, me.id, "emailed", { to: input.to, ok: true, filename });
  revalidateDocument(document.id);
  return { ok: true, to: input.to };
}

/**
 * HAND THE EMAIL TO THE USER'S OWN MAIL APP, rather than sending it ourselves.
 *
 * Manan, 2026-09-17: "when I click send it should take me into the email
 * compose section and I will send it myself — without an API key."
 *
 * `emailBillingDocumentAction` above needs `RESEND_API_KEY`, and on this
 * deployment there is none, so that button can only ever fail. This path needs
 * no key and no outbound mail service at all: the browser opens a `mailto:`
 * URL, the operating system hands it to whatever mail app is already signed in
 * — Outlook, Gmail, Thunderbird — and the message arrives there fully written.
 * It is sent by the person, from their own mailbox, which also means the
 * customer sees a reply-to address that actually reaches somebody.
 *
 * ── WHY THE PDF IS NOT ATTACHED, AND CANNOT BE ─────────────────────────────
 *
 * `mailto:` carries text only. RFC 6068 defines `to`, `cc`, `bcc`, `subject`
 * and `body` and NOTHING ELSE; there is no attachment field, and no browser
 * offers one, because a page that could silently attach a local file to an
 * outgoing message would be a file-exfiltration primitive. Gmail's compose URL
 * is the same. So the composer downloads the PDF at the same moment it opens
 * the draft, leaving the file in Downloads for the one drag it takes to attach.
 *
 * VALIDATION IS STILL DONE HERE rather than in the browser, so this path and
 * the API path reject exactly the same things — a cancelled document, an
 * ungenerated draft, a malformed CC list — instead of drifting apart.
 *
 * Writes NOTHING. The document is not marked Sent here, because at this point
 * nothing has been sent: the draft is merely open on someone's screen, and they
 * may yet close it. `markBillingDocumentEmailedAction` below records that, once
 * the person confirms they went through with it.
 */
export async function composeBillingDocumentEmailAction(
  raw: unknown,
): Promise<ActionResult<{ mailto: string; gmailUrl: string; filename: string; pdfUrl: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EmailBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  const cc = parseAddressList(input.cc);
  if (!cc.ok) return { ok: false, error: `"${cc.bad}" is not a valid CC address.` };
  const bcc = parseAddressList(input.bcc);
  if (!bcc.ok) return { ok: false, error: `"${bcc.bad}" is not a valid BCC address.` };

  const [document] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, input.id))
    .limit(1);
  if (!document) return { ok: false, error: "That document no longer exists." };
  if (document.status === "cancelled") {
    return { ok: false, error: "A cancelled document cannot be emailed." };
  }
  if (!document.docNo) {
    return { ok: false, error: "Generate this document before emailing it." };
  }

  const params = new URLSearchParams();
  if (cc.list.length) params.set("cc", cc.list.join(","));
  if (bcc.list.length) params.set("bcc", bcc.list.join(","));
  params.set("subject", input.subject);
  params.set("body", input.body);
  /* `URLSearchParams` encodes a space as "+", which is correct for a form body
     and WRONG in a mailto: a mail client renders those plus signs literally,
     so the customer receives a letter with every space turned into "+". RFC
     6068 wants percent-encoding throughout. */
  const query = params.toString().replace(/\+/g, "%20");
  /* The address itself is left readable — "@" and the separating commas are
     both legal unencoded in a mailto path, and some Windows handlers do not
     decode them if they are escaped. */
  const to = encodeURIComponent(input.to.trim()).replace(/%40/g, "@").replace(/%2C/g, ",");

  /* GMAIL'S COMPOSE URL, because `mailto:` is not reliable on a real desktop.
     Windows sends `mailto:` to whatever holds the UrlAssociation, and on a
     machine with no mail program that is the BROWSER — which then needs a web
     mail handler registered inside it, and if none is, the click does nothing
     at all and looks broken. This URL is an ordinary https page: it opens in a
     tab, needs no handler, no registration and no desktop mail client. */
  const g = new URLSearchParams({ view: "cm", fs: "1", to: input.to.trim(), su: input.subject, body: input.body });
  if (cc.list.length) g.set("cc", cc.list.join(","));
  if (bcc.list.length) g.set("bcc", bcc.list.join(","));

  return {
    ok: true,
    mailto: `mailto:${to}?${query}`,
    gmailUrl: `https://mail.google.com/mail/?${g.toString()}`,
    filename: invoiceFilename(document),
    pdfUrl: `/billing/documents/${document.id}/pdf?download=1`,
  };
}

/**
 * RECORD A SEND THAT HAPPENED IN SOMEBODY ELSE'S MAIL APP.
 *
 * The counterpart to `composeBillingDocumentEmailAction`. Once a draft leaves
 * for Outlook or Gmail this app can no longer see what became of it, so the
 * document is marked Sent only when the person says they sent it. That is a
 * deliberate trade: a status nobody can verify is worse than one click.
 *
 * Everything the API path records is recorded here too — the log row, the
 * status change, the activity event — so a document emailed this way reads
 * identically in the trail, except for the `via` marker that says which route
 * it took.
 */
export async function markBillingDocumentEmailedAction(
  raw: unknown,
): Promise<ActionResult<{ to: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EmailBillingDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  const cc = parseAddressList(input.cc);
  if (!cc.ok) return { ok: false, error: `"${cc.bad}" is not a valid CC address.` };
  const bcc = parseAddressList(input.bcc);
  if (!bcc.ok) return { ok: false, error: `"${bcc.bad}" is not a valid BCC address.` };

  const [document] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, input.id))
    .limit(1);
  if (!document) return { ok: false, error: "That document no longer exists." };
  if (document.status === "cancelled") {
    return { ok: false, error: "A cancelled document cannot be emailed." };
  }
  if (!document.docNo) {
    return { ok: false, error: "Generate this document before emailing it." };
  }

  const filename = invoiceFilename(document);

  await db.insert(billingEmailLog).values({
    documentId: document.id,
    recipient: input.to,
    cc: cc.list.join(", ") || null,
    bcc: bcc.list.join(", ") || null,
    subject: input.subject,
    body: input.body,
    attachment: filename,
    status: "sent",
    error: null,
    sentById: me.id,
  });

  await markBillingDocumentSent(document.id, input.to, me);
  await recordEvent(db, document.id, me.id, "emailed", {
    to: input.to,
    ok: true,
    filename,
    via: "mail-client",
  });
  revalidateDocument(document.id);
  return { ok: true, to: input.to };
}

/**
 * Inline customer creation from the document form, so raising an invoice for a
 * new customer is never blocked on a trip to the Admin Panel.
 */
export async function createBillingCustomerAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = BillingCustomerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;

  try {
    const [row] = await db
      .insert(billingCustomers)
      .values({
        name: v.name,
        legalName: v.legalName,
        contactName: v.contactName,
        email: v.email,
        whatsapp: v.whatsapp,
        phone: v.phone,
        pan: v.pan,
        gstin: v.gstin,
        addressLine1: v.addressLine1,
        addressLine2: v.addressLine2,
        city: v.city,
        stateName: v.stateName,
        stateCode: v.stateCode,
        pincode: v.pincode,
        country: v.country,
        clientId: v.clientId,
        outstandingEntityId: v.outstandingEntityId,
        notes: v.notes,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: billingCustomers.id, name: billingCustomers.name });
    revalidatePath(LIST_PATH);
    revalidatePath("/admin/billing-customers");
    return { ok: true, id: row!.id, name: row!.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(message)) {
      return { ok: false, error: `A customer called "${v.name}" already exists.` };
    }
    return { ok: false, error: "Could not save that customer." };
  }
}

/** Record that a document was downloaded or printed, for the activity trail. */
export async function logBillingDocumentViewAction(
  id: string,
  kind: "downloaded" | "printed",
): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  const [exists] = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id))
    .limit(1);
  if (!exists) return { ok: false, error: "That document no longer exists." };
  await recordEvent(db, id, me.id, kind);
  return { ok: true };
}
