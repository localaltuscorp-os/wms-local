import { requireUser } from "@/lib/auth/current";
import { listIncentiveCatalog } from "@/lib/queries/incentive-catalog";
import { MAX_EXPORT_ROWS, EXPORT_TOO_LARGE } from "@/lib/exports/csv";
import { incentiveExportFilename } from "@/lib/exports/incentive-catalog";
import { renderIncentiveCatalogPdf } from "@/lib/exports/incentive-catalog-pdf";

/**
 * GET /incentive/export.pdf — the WHOLE Incentive Table as a typeset document.
 *
 * ── THE COMPLETE DATASET, BY CONSTRUCTION ──────────────────────────────────
 * Rows come from `listIncentiveCatalog()` — the same query the page itself uses
 * — called HERE, on the server, rather than from anything the browser happens
 * to be rendering. There is nothing to paginate past and no visible-row subset
 * to accidentally export: the query returns the full catalog in display order,
 * and the renderer writes every row it is handed. That is also why this is a
 * route rather than a client-side jsPDF pass over the dialog's props.
 *
 * ── WHO ────────────────────────────────────────────────────────────────────
 * `requireUser`, matching the table itself: the incentive catalog is shown
 * in-app to every employee (only EDITING is admin-gated), so an export that
 * demanded admin would withhold a file from people who can already read every
 * row of it on screen.
 *
 * Thin by design — the drawing lives in lib/exports/incentive-catalog-pdf.ts so
 * it can be unit-tested. See that module for the pagination rules.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await listIncentiveCatalog();
  if (rows.length > MAX_EXPORT_ROWS) {
    return Response.json(
      { error: EXPORT_TOO_LARGE, cap: MAX_EXPORT_ROWS, totalRows: rows.length },
      { status: 422 },
    );
  }

  const pdf = await renderIncentiveCatalogPdf(rows, { generatedBy: me.name });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${incentiveExportFilename("pdf")}"`,
      "cache-control": "no-store",
    },
  });
}
