import { requireUser } from "@/lib/auth/current";
import { isFinanceViewer } from "@/lib/auth/finance-access";
import { listSalaryBreakup } from "@/lib/queries/salary-breakup";
import { toPayrollRows } from "@/lib/salary/payroll-rows";
import { renderPayrollPdf } from "@/lib/salary/payroll-pdf";

/**
 * GET /salary/export.pdf?month=YYYY-MM — admin-only payroll PDF (landscape).
 * Opens with a company breakdown summary, then the employee detail grouped by
 * entity with per-entity + grand totals. Drawing lives in renderPayrollPdf.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentMonthIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await isFinanceViewer(me))) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthIST();

  const rows = toPayrollRows(await listSalaryBreakup(month));
  const buffer = await renderPayrollPdf(rows, monthLabel(month));

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Payroll-${month}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
