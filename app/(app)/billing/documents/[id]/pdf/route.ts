import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingDocumentLines, billingDocuments } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { renderInvoiceFiles } from "@/lib/billing/invoice-files";
import { invoiceFilename } from "@/lib/billing/view-model";

/**
 * GET /billing/documents/[id]/pdf
 *
 * Streams the document as `application/pdf`. `?download=1` forces a download;
 * the default is inline, so the browser's own viewer can show it. Built fresh
 * from the row every time — there is no cached file to go stale against an
 * edit, and nothing here depends on object storage, so it works under
 * DUMMY_MODE exactly as it does in production.
 *
 * Same streaming shape as app/(app)/salary/payslip/[runId]/route.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  await requireWorkspace("billing");
  const { id } = await ctx.params;

  const [document] = await db
    .select()
    .from(billingDocuments)
    .where(eq(billingDocuments.id, id))
    .limit(1);
  if (!document) return new Response("Not found", { status: 404 });

  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id))
    .orderBy(billingDocumentLines.sortOrder);

  let pdf: Buffer;
  try {
    // The on-screen template, printed — the exact sheet (pdfkit only as fallback).
    pdf = (await renderInvoiceFiles(document, lines, { pdf: true, png: false })).pdf!;
  } catch (err) {
    return new Response(
      `The document could not be rendered: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 500 },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = invoiceFilename(document);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
