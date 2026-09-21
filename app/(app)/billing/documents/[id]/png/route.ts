import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingDocumentLines, billingDocuments } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { renderInvoiceFiles } from "@/lib/billing/invoice-files";
import { apiViewDenial } from "@/lib/permissions/api-guard";

/**
 * GET /billing/documents/[id]/png — page one of the invoice PDF as an image.
 *
 * The email composer shows this under the message ("In the message, below
 * your text"), and the send puts the very same picture into the email body, so
 * what is previewed is what the customer sees. Rendered from the PDF, never
 * re-drawn, so it cannot drift from the attachment.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // THE MODULE GATE. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking Billing hides its screens while
  // this endpoint still hands over the invoice. First in the body, so a denied
  // caller is refused before any rendering happens.
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireWorkspace("billing");
  const { id } = await ctx.params;

  const [document] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, id)).limit(1);
  if (!document) return new Response("Not found", { status: 404 });
  const lines = await db
    .select()
    .from(billingDocumentLines)
    .where(eq(billingDocumentLines.documentId, id))
    .orderBy(billingDocumentLines.sortOrder);

  try {
    const png = (await renderInvoiceFiles(document, lines, { pdf: false, png: true })).png;
    if (!png) throw new Error("no image produced");
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return new Response(
      `The document image could not be rendered: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 500 },
    );
  }
}
