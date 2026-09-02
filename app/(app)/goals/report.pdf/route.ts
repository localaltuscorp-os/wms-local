import { z } from "zod";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { goalScopeFor } from "@/lib/goals/scope";
import { renderGoalsReportPdf } from "@/lib/goals/whatsapp-dispatch";
import { weekNoOf } from "@/lib/goals/fy-calendar";

/**
 * GET /goals/report.pdf?employeeId=<uuid>&weekStart=<yyyy-mm-dd>
 *
 * In-app download of the 2-sheet weekly goals report (same Buffer the WhatsApp
 * dispatcher sends). Authorization reuses the cascade scope: admins/Manan may
 * fetch anyone; managers their downline; everyone their own. `weekStart` is the
 * "last week" anchor (progress week); next week is derived (+7).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  employeeId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request): Promise<Response> {
  if (!goalsCascadeEnabled()) return new Response("Not found", { status: 404 });

  let me;
  let isAdmin = false;
  try {
    ({ me, isAdmin } = await requireGoalsAccess());
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    employeeId: url.searchParams.get("employeeId"),
    weekStart: url.searchParams.get("weekStart"),
  });
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  const { employeeId, weekStart } = parsed.data;

  // Authorization: own report, or within the manager/admin scope.
  const scope = await goalScopeFor(me);
  const allowed = isAdmin || employeeId === me.id || scope.ids.includes(employeeId);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { buffer, data } = await renderGoalsReportPdf(employeeId, weekStart);
  if (buffer.length === 0) {
    return new Response("Report unavailable", { status: 500 });
  }

  const safe = (data.employee.name || "employee").replace(/\s+/g, "");
  const weekNo = weekNoOf(weekStart);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Weekly-Goals-${safe}-W${weekNo}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
