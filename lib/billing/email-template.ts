/**
 * BILLING — the invoice email, pre-written.
 *
 * "Click Send Email → the composer opens with the recipient, the subject, a
 * professional body and the PDF already attached" is the requirement this file
 * serves. It is PURE so the composer can render exactly the text the server
 * will send, and the user edits that text rather than discovering it later.
 */

import { BILLING_DOC_TYPE_LABELS, type BillingDocType } from "@/db/enums";
import { fmtDocDate, fmtMoney } from "@/lib/billing/view-model";

export interface InvoiceEmailContext {
  docType: BillingDocType;
  docNo: string | null;
  docDate: string;
  dueDate: string | null;
  total: number;
  customerName: string;
  contactName: string | null;
  companyName: string;
  paymentTermsLabel: string | null;
  contactLine: string;
}

/** "Tax Invoice 10004-26-27 — Altus Corp". Clamped by the sender at 80 chars. */
export function invoiceEmailSubject(ctx: InvoiceEmailContext): string {
  const label = BILLING_DOC_TYPE_LABELS[ctx.docType];
  const no = ctx.docNo ? ` ${ctx.docNo}` : "";
  return `${label}${no} — ${ctx.companyName}`;
}

/**
 * The default body. Plain text on purpose: it is what the user reads and edits
 * in the composer, and the sender wraps it in the branded HTML shell, so what
 * is typed here is exactly what the customer reads.
 */
export function invoiceEmailBody(ctx: InvoiceEmailContext): string {
  const label = BILLING_DOC_TYPE_LABELS[ctx.docType];
  const greetingName = (ctx.contactName ?? ctx.customerName).trim();
  const lines: string[] = [];

  lines.push(`Dear ${greetingName || "Sir/Madam"},`);
  lines.push("");
  lines.push(
    ctx.docNo
      ? `Please find attached ${label} ${ctx.docNo} for your kind reference.`
      : `Please find attached the ${label.toLowerCase()} for your kind reference.`,
  );
  lines.push("");
  lines.push(`${label} Date: ${fmtDocDate(ctx.docDate)}`);
  lines.push(`Amount: Rs. ${fmtMoney(ctx.total)}`);
  if (ctx.dueDate) lines.push(`Due Date: ${fmtDocDate(ctx.dueDate)}`);
  if (ctx.paymentTermsLabel) lines.push(`Payment Terms: ${ctx.paymentTermsLabel}`);
  lines.push("");
  lines.push(
    ctx.docType === "quotation"
      ? "Do review the attached quotation and let us know if you would like us to proceed."
      : "Kindly review the attached document and let us know if you have any questions.",
  );
  lines.push("");
  lines.push("Warm regards,");
  lines.push(ctx.companyName);
  if (ctx.contactLine) lines.push(ctx.contactLine);

  return lines.join("\n");
}
