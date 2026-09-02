import { requireUser } from "@/lib/auth/current";
import { getCombinedEarnings } from "@/lib/salary/combined-earnings";
import { renderCombinedEarningsPdf } from "@/lib/salary/combined-earnings-pdf";

/**
 * GET /salary/earnings/[employeeId]?month=YYYY-MM[&view=1]
 *
 * WS-5 + WS-6 — Combined "total earnings" document for one person + month:
 * salary + attendance analytics + incentive Target-vs-Paid (this month / last 3
 * months / YTD) + retention line (only when paid). A4 PDF, payslip house style.
 *
 * Read-only document — DEFAULT ON, killable via SALARY_STATEMENTS="false".
 * Authorization: admin (anyone) or the employee themselves.
 * `month` defaults to the previous complete IST month.
 *
 * `view=1` serves the SAME bytes with an inline disposition instead of an
 * attachment, so the Salary Slip list (/hr/salary-slip) can preview a slip in an
 * iframe. Without it a browser downloads the file rather than rendering it, and
 * "view" would be indistinguishable from "download". It changes one header and
 * nothing else — same document, same authorization.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Previous complete month ("YYYY-MM") in IST. */
function defaultMonth(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  ist.setUTCDate(1);
  ist.setUTCMonth(ist.getUTCMonth() - 1);
  return ist.toISOString().slice(0, 7);
}

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
  const rawMonth = url.searchParams.get("month");
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : defaultMonth();
  const nameHint = url.searchParams.get("name") ?? undefined;

  const data = await getCombinedEarnings(employeeId, month, nameHint);
  const buf = await renderCombinedEarningsPdf(data, { generatedBy: me.name });

  const safeName = data.employeeName.replace(/\s+/g, "");
  // Inline for the in-page preview, attachment everywhere else. The filename is
  // sent either way so a viewer who then hits "save" in the PDF reader gets the
  // same name the download would have produced.
  const inline = url.searchParams.get("view") === "1";
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="Total-Earnings-${safeName}-${month}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
