import { requireUser } from "@/lib/auth/current";
import {
  getAnnualStatement,
  currentFyStartYear,
} from "@/lib/salary/annual-statement";
import { renderAnnualStatementPdf } from "@/lib/salary/annual-statement-pdf";

/**
 * GET /salary/annual-statement/[employeeId]?year=<FY-start-year>
 *
 * WS-5 — Annual Salary Statement (1 Apr → 31 Mar) for one employee, as an A4
 * PDF in the payslip house style. `year` is the FY START calendar year (e.g.
 * 2026 = FY 26-27); defaults to the current FY.
 *
 * Read-only document — no money mutation — so it is DEFAULT ON, killable via
 * the SALARY_STATEMENTS kill-switch (`SALARY_STATEMENTS="false"` → 404).
 *
 * Authorization: admins may fetch anyone's statement; a non-admin may fetch
 * only their OWN (employeeId === me.id).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
): Promise<Response> {
  if (process.env.SALARY_STATEMENTS === "false") {
    return new Response("Not found", { status: 404 });
  }

  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { employeeId } = await params;
  if (!me.isAdmin && me.id !== employeeId) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const rawYear = url.searchParams.get("year");
  const parsed = rawYear ? Number(rawYear) : NaN;
  const startYear =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : currentFyStartYear();

  const stmt = await getAnnualStatement(employeeId, startYear);
  const buf = await renderAnnualStatementPdf(stmt, { generatedBy: me.name });

  const safeName = stmt.employeeName.replace(/\s+/g, "");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Annual-Statement-${safeName}-FY${startYear}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
