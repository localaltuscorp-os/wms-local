import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth/current";
import { listRunsForMonth } from "@/lib/queries/salary";

/**
 * GET /salary/export.xlsx?month=YYYY-MM
 *
 * Admin-only monthly salary report — one row per salary run, raw numbers for
 * money so Excel handles formatting. Mirrors /outstanding/export.xlsx (SheetJS
 * workbook, attachment Content-Disposition).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Employee",
  "Designation",
  "Entity",
  "Monthly CTC",
  "Payable Days",
  "Late Ded. Days",
  "Gross",
  "PT",
  "TDS",
  "Advances",
  "Pending In",
  "Net Payable",
  "Disbursed",
] as const;

/** Current month "YYYY-MM" in IST. */
function currentMonthIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 7);
}

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!me.isAdmin) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthIST();

  const rows = await listRunsForMonth(month);

  const aoa: (string | number)[][] = [
    [...HEADERS],
    ...rows.map((r) => [
      r.employeeName,
      r.designationName ?? "",
      r.payingEntityName ?? "",
      r.annualCtc / 12,
      r.payableDays,
      r.lateDeductionDays,
      r.gross,
      r.pt,
      r.tds,
      r.advances,
      r.pendingBalanceIn,
      r.netPayable,
      r.disbursed ? "Yes" : "No",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 24 }, // Employee
    { wch: 20 }, // Designation
    { wch: 18 }, // Entity
    { wch: 14 }, // Monthly CTC
    { wch: 12 }, // Payable Days
    { wch: 14 }, // Late Ded. Days
    { wch: 14 }, // Gross
    { wch: 12 }, // PT
    { wch: 12 }, // TDS
    { wch: 14 }, // Advances
    { wch: 14 }, // Pending In
    { wch: 14 }, // Net Payable
    { wch: 12 }, // Disbursed
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Salary ${month}`);

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="salary-${month}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
