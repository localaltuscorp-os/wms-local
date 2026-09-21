import { requireUser } from "@/lib/auth/current";
import { getIncentiveBreakup } from "@/lib/incentive/breakup";
import { renderIncentiveBreakupPdf } from "@/lib/incentive/breakup-pdf";
import { apiViewDenial } from "@/lib/permissions/api-guard";

/**
 * GET /salary/incentive-breakup/[employeeId]?month=YYYY-MM[&view=1]
 *
 * WS-6 — the Incentive Breakup document for one person + month: each incentive
 * entry's approved (due), paid, reversal adjustment and NET, closed with a total.
 * Same A4 salary-slip house style as the combined earnings document.
 *
 * Read-only. Authorization: admin (anyone) or the employee themselves.
 * `month` defaults to the previous complete IST month. `view=1` serves inline
 * (iframe preview) instead of a download. Killable via SALARY_STATEMENTS="false".
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
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
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

  const data = await getIncentiveBreakup(employeeId, month);
  const buf = await renderIncentiveBreakupPdf(data, { generatedBy: me.name });

  const safeName = data.employeeName.replace(/\s+/g, "");
  const inline = url.searchParams.get("view") === "1";
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="Incentive-Breakup-${safeName}-${month}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
