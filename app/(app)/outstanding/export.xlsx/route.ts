import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { parseOutstandingFilters } from "@/lib/outstanding/filters";
import { loadOutstandingDashboard } from "@/lib/queries/outstanding";
import { todayISO, rollingHorizon } from "@/lib/outstanding/horizon";
import {
  OUTSTANDING_ENTRY_HEADERS,
  COLLECTION_EXPORT_HEADERS,
  OUTSTANDING_TEMPLATE_HEADERS,
  COLLECTION_TEMPLATE_HEADERS,
  toEntryRowArray,
  toCollectionRowArray,
  outstandingExportFilename,
} from "@/lib/exports/outstanding-rich";

/**
 * GET /outstanding/export.xlsx
 *
 * XLSX export of the current Outstanding dashboard view (any signed-in user).
 * Mirrors /tasks/export.xlsx — SheetJS workbook, humanized columns, attachment
 * Content-Disposition.
 *
 *   ?template=outstanding → blank workbook with only the 26 import headers
 *   ?template=collection  → blank workbook with only the 7 collection headers
 *
 * Otherwise: a "Outstanding Entries" sheet (derived installments) + a
 * "Collections" sheet, both reflecting the dashboard's active filters.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function xlsxResponse(wb: XLSX.WorkBook, filename: string): Response {
  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  // Sales room — the whole receivables dataset lives behind this route, so it
  // must enforce Sales access itself (the layout gate never runs for routes).
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!canAccessWorkspace("sales", await accessFor(me))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const template = url.searchParams.get("template");

  // ── Blank import templates — header row only ──
  if (template === "outstanding") {
    const ws = XLSX.utils.aoa_to_sheet([[...OUTSTANDING_TEMPLATE_HEADERS]]);
    ws["!cols"] = OUTSTANDING_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Outstanding");
    return xlsxResponse(
      wb,
      outstandingExportFilename("xlsx", "outstanding-template"),
    );
  }
  if (template === "collection") {
    const ws = XLSX.utils.aoa_to_sheet([[...COLLECTION_TEMPLATE_HEADERS]]);
    ws["!cols"] = COLLECTION_TEMPLATE_HEADERS.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Collection");
    return xlsxResponse(
      wb,
      outstandingExportFilename("xlsx", "collection-template"),
    );
  }

  // ── Live data export ──
  const sp: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;

  const today = todayISO();
  const horizon = rollingHorizon(today);
  const filters = parseOutstandingFilters(sp);
  const { entries, collectionEntries } = await loadOutstandingDashboard(
    filters,
    today,
    horizon,
  );

  const wb = XLSX.utils.book_new();

  const entrySheet = XLSX.utils.aoa_to_sheet([
    [...OUTSTANDING_ENTRY_HEADERS],
    ...entries.map((e, i) => toEntryRowArray(e, i)),
  ]);
  entrySheet["!cols"] = [
    { wch: 6 }, // S. No.
    { wch: 28 }, // Client
    { wch: 20 }, // Product
    { wch: 14 }, // Cycle
    { wch: 14 }, // Due Date
    { wch: 14 }, // Balance
    { wch: 12 }, // Days Overdue
    { wch: 18 }, // Entity
    { wch: 18 }, // Responsible
    { wch: 10 }, // Status
  ];
  XLSX.utils.book_append_sheet(wb, entrySheet, "Outstanding Entries");

  const collSheet = XLSX.utils.aoa_to_sheet([
    [...COLLECTION_EXPORT_HEADERS],
    ...collectionEntries.map((c, i) => toCollectionRowArray(c, i)),
  ]);
  collSheet["!cols"] = [
    { wch: 6 }, // S. No.
    { wch: 28 }, // Client
    { wch: 14 }, // Amount
    { wch: 18 }, // Payment Mode
    { wch: 18 }, // Responsible
    { wch: 30 }, // Comments
    { wch: 14 }, // Collected At
  ];
  XLSX.utils.book_append_sheet(wb, collSheet, "Collections");

  return xlsxResponse(wb, outstandingExportFilename("xlsx", "data"));
}
