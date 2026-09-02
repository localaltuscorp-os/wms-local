import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAccountsAccess } from "@/lib/accounts/access";

export const dynamic = "force-dynamic";

/**
 * GET /accounts/task-list/template — streams a clean, well-designed .xlsx the
 * team can fill in and bulk-import. Two sheets matching the importer's expected
 * headers, with example rows, real dates, and sensible column widths. Gated to
 * Accounts access.
 */
export async function GET() {
  await requireAccountsAccess();

  const wb = XLSX.utils.book_new();

  // ── Accounts Task List ──────────────────────────────────────────────────────
  const taskHeader = [
    "Sr. No.",
    "Area",
    "Task Description",
    "Status",
    "Links",
    "Target Date",
    "Actual Date",
    "Gear",
    "Notes",
  ];
  const taskRows: (string | number | Date | null)[][] = [
    taskHeader,
    [
      1,
      "GST",
      "File GSTR-3B for May and reconcile input credit",
      "Pending",
      "https://gst.gov.in",
      new Date(2026, 5, 20), // 20 Jun 2026
      null,
      "Delegate",
      "Cross-check with purchase register",
    ],
    [
      2,
      "TDS",
      "Deposit Q1 TDS challan and download Form 16A",
      "Done",
      "",
      new Date(2026, 6, 7), // 7 Jul 2026
      new Date(2026, 6, 5), // 5 Jul 2026
      "Support",
      "Paid via net-banking",
    ],
  ];
  const taskWs = XLSX.utils.aoa_to_sheet(taskRows, { cellDates: true });
  taskWs["!cols"] = [
    { wch: 8 }, // Sr. No.
    { wch: 14 }, // Area
    { wch: 52 }, // Task Description
    { wch: 12 }, // Status
    { wch: 26 }, // Links
    { wch: 14 }, // Target Date
    { wch: 14 }, // Actual Date
    { wch: 12 }, // Gear
    { wch: 36 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, taskWs, "Accounts Task List");

  // ── Screenshots to Post ─────────────────────────────────────────────────────
  const shotHeader = [
    "Sr. No.",
    "Project Name",
    "Project Details",
    "Frequency",
    "Target Date",
    "Actual Date",
    "Gear",
    "Notes",
  ];
  const shotRows: (string | number | Date | null)[][] = [
    shotHeader,
    [
      1,
      "Altus Corp",
      "Post weekly compliance status screenshot to the group",
      "Weekly",
      new Date(2026, 5, 22), // 22 Jun 2026
      null,
      "Delegate",
      "Use the standard template",
    ],
  ];
  const shotWs = XLSX.utils.aoa_to_sheet(shotRows, { cellDates: true });
  shotWs["!cols"] = [
    { wch: 8 }, // Sr. No.
    { wch: 22 }, // Project Name
    { wch: 46 }, // Project Details
    { wch: 12 }, // Frequency
    { wch: 14 }, // Target Date
    { wch: 14 }, // Actual Date
    { wch: 12 }, // Gear
    { wch: 36 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, shotWs, "Screenshots to Post");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Accounts-Task-List-Template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
