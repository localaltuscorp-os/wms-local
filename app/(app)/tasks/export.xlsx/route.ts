import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth/current";
import { parseTaskFilters } from "@/lib/task-filters";
import { listTasksForExport } from "@/lib/queries/tasks";
import { MAX_EXPORT_ROWS, EXPORT_TOO_LARGE } from "@/lib/exports/csv";
import {
  RICH_EXPORT_HEADERS,
  toRichRowArray,
  richExportFilename,
} from "@/lib/exports/tasks-rich";

/**
 * GET /tasks/export.xlsx
 *
 * Admin-only XLSX export of the current /tasks view. Shares query-param
 * parsing with /tasks/export (CSV) so the FilterBar can fan out to all
 * three formats. Columns are humanized (status labels, priority labels,
 * MMM d, yyyy dates) rather than raw enum/ISO values — see lib/exports/tasks-rich.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // Admin-only. requireAdmin throws if not an admin → renders error.tsx
  // (HTTP 500). We catch and re-respond as a clean 403 below.
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const sp: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;

  const archived = sp.archived === "1" || sp.archived === "true";
  const filters = parseTaskFilters(sp, archived, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  // Read one above the cap so we can detect overrun and return 422.
  const rows = await listTasksForExport(filters, {
    limit: MAX_EXPORT_ROWS + 1,
  });

  if (rows.length > MAX_EXPORT_ROWS) {
    return Response.json(
      {
        error: EXPORT_TOO_LARGE,
        cap: MAX_EXPORT_ROWS,
        totalRows: rows.length,
      },
      { status: 422 },
    );
  }

  const aoa: (string | number)[][] = [
    [...RICH_EXPORT_HEADERS],
    ...rows.map(toRichRowArray),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Reasonable default column widths for the 11 columns.
  ws["!cols"] = [
    { wch: 28 }, // Client Name
    { wch: 18 }, // Subject
    { wch: 14 }, // Status
    { wch: 16 }, // Approval Status
    { wch: 22 }, // Priority
    { wch: 18 }, // Doer
    { wch: 18 }, // Initiator
    { wch: 14 }, // Due Date
    { wch: 18 }, // Revised Target Date
    { wch: 14 }, // Created At
    { wch: 24 }, // Tags
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${richExportFilename("xlsx")}"`,
      "cache-control": "no-store",
    },
  });
}
