import "server-only";

import type { BillingDocument, BillingDocumentLine } from "@/db/schema";
import { buildInvoiceViewModel } from "@/lib/billing/view-model";
import { renderInvoiceSheet } from "@/lib/billing/invoice-sheet-render";
import { renderInvoicePdf } from "@/lib/billing/invoice-pdf";
import { pdfFirstPageToPng } from "@/lib/billing/pdf-to-png";

/**
 * The invoice's files — the PDF and a picture of page one — from ONE place, so
 * the download, the email attachment and the picture in the email body can
 * never disagree.
 *
 * First choice: the on-screen template printed by headless Chromium
 * (invoice-sheet-render.ts) — the exact sheet. If Chromium cannot start on
 * this machine, the older pdfkit rendering (and pdf.js for its picture) is
 * used instead, so a document is always produced; the warning in the log says
 * which one ran.
 */
export async function renderInvoiceFiles(
  document: BillingDocument,
  lines: BillingDocumentLine[],
  want: { pdf?: boolean; png?: boolean } = { pdf: true, png: true },
): Promise<{ pdf?: Buffer; png?: Buffer; engine: "sheet" | "pdfkit" }> {
  try {
    const out = await renderInvoiceSheet(buildInvoiceViewModel(document, lines), want);
    return { ...out, engine: "sheet" };
  } catch (err) {
    console.warn("[billing] template renderer unavailable, using pdfkit:", err instanceof Error ? err.message : err);
    const pdf = await renderInvoicePdf(document, lines);
    const png = want.png ? await pdfFirstPageToPng(pdf).catch(() => undefined) : undefined;
    return { pdf: want.pdf ? pdf : undefined, png, engine: "pdfkit" };
  }
}
