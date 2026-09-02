import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import {
  getMonthDashboard,
  getEmployeeMonthStatus,
} from "@/lib/queries/attendance-status";
import {
  SUMMARY_HEADERS,
  toSummaryRow,
  matrixHeaders,
  toMatrixRow,
  attendanceExportFilename,
  monthTitle,
} from "@/lib/exports/attendance-rich";

/**
 * GET /attendance/export.xlsx?y=&m=
 *
 * Admin-only XLSX of the month attendance dashboard. Two sheets:
 *  - "Summary": one humanized row per active employee (Present/Absent/…/Payable).
 *  - "Daily Matrix": Employee × day-of-month → attendance code (P / H/D / A / W/O / …).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TZ = "Asia/Kolkata";

function resolveYM(url: URL): { year: number; month: number } {
  const todayISO = localDateString(DEFAULT_TZ);
  const [cy, cm] = todayISO.split("-").map(Number);
  const rawY = Number(url.searchParams.get("y"));
  const rawM = Number(url.searchParams.get("m"));
  const year =
    Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month =
    Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const { year, month } = resolveYM(url);
  const todayISO = localDateString(DEFAULT_TZ);

  const rows = await getMonthDashboard(year, month, todayISO);

  // Summary sheet.
  const summaryAoa: (string | number)[][] = [
    [monthTitle(year, month)],
    [...SUMMARY_HEADERS],
    ...rows.map(toSummaryRow),
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
  summaryWs["!cols"] = [
    { wch: 26 },
    ...Array(SUMMARY_HEADERS.length - 1).fill({ wch: 12 }),
  ];

  // Daily matrix sheet — one getEmployeeMonthStatus per employee. N queries,
  // fine for an admin-triggered export.
  const details = await Promise.all(
    rows.map((r) =>
      getEmployeeMonthStatus(r.employeeId, year, month, todayISO).then(
        (detail) => ({ name: r.name, detail }),
      ),
    ),
  );
  const matrixAoa: string[][] = [
    matrixHeaders(year, month),
    ...details.map(({ name, detail }) =>
      toMatrixRow(name, detail, year, month),
    ),
  ];
  const matrixWs = XLSX.utils.aoa_to_sheet(matrixAoa);
  matrixWs["!cols"] = [
    { wch: 26 },
    ...Array(matrixAoa[0]!.length - 1).fill({ wch: 4 }),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
  XLSX.utils.book_append_sheet(wb, matrixWs, "Daily Matrix");

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${attendanceExportFilename(year, month, "xlsx")}"`,
      "cache-control": "no-store",
    },
  });
}
