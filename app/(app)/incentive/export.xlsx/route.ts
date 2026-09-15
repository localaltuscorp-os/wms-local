import { requireUser } from "@/lib/auth/current";
import { listIncentiveCatalog } from "@/lib/queries/incentive-catalog";
import { MAX_EXPORT_ROWS, EXPORT_TOO_LARGE } from "@/lib/exports/csv";
import { incentiveExportFilename } from "@/lib/exports/incentive-catalog";
import { renderIncentiveCatalogXlsx } from "@/lib/exports/incentive-catalog-xlsx";

/**
 * GET /incentive/export.xlsx — the WHOLE Incentive Table as a real workbook.
 *
 * ── THE COMPLETE DATASET, BY CONSTRUCTION ──────────────────────────────────
 * Rows come from `listIncentiveCatalog()` — the same query the page itself uses
 * — called HERE, on the server, rather than from anything the browser happens
 * to be rendering. There is nothing to paginate past and no visible-row subset
 * to accidentally export: the query returns the full catalog in display order,
 * and the renderer writes every row it is handed.
 *
 * ── WHO ────────────────────────────────────────────────────────────────────
 * `requireUser`, matching the table itself: the incentive catalog is shown
 * in-app to every employee (only EDITING is admin-gated), so an export that
 * demanded admin would withhold a file from people who can already read every
 * row of it on screen.
 *
 * Thin by design — the workbook is built in lib/exports/incentive-catalog-xlsx.ts
 * so it can be unit-tested. See that module for why it uses ExcelJS.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireUser();
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

  const buffer = await renderIncentiveCatalogXlsx(rows);

  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${incentiveExportFilename("xlsx")}"`,
      "cache-control": "no-store",
    },
  });
}
