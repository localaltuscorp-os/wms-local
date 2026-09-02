import { getProductivityViewer, canViewProductivityOf } from "@/lib/productivity/access";
import { loadProductivity } from "@/lib/productivity/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/productivity/report/<employeeId>/pdf — the dashboard's "Download".
 *
 * Authorisation is NOT inherited from the page that linked here: this route is
 * directly addressable, so it re-runs the module's own `canViewProductivityOf`
 * gate. Without that, anyone who guessed an id could pull a colleague's salary
 * and incentive figures without ever loading a dashboard.
 *
 * A refusal 404s rather than 403s, matching the pages: distinguishing "no such
 * employee" from "not yours" would let a manager enumerate the org chart.
 *
 * The pdfkit renderer is imported LAZILY, matching the HR letters and forms
 * routes, so the heavy dependency stays out of any bundle that merely
 * references this module.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const viewer = await getProductivityViewer();
  if (!(await canViewProductivityOf(viewer, id))) return new Response("Not found", { status: 404 });

  const snap = await loadProductivity(id);
  if (!snap) return new Response("Not found", { status: 404 });

  try {
    const { renderProductivityReportPdf, reportFilename } = await import("@/lib/productivity/report-pdf");
    const pdf = await renderProductivityReportPdf(snap);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${reportFilename(snap.employee.name, snap.period.label)}"`,
        // Salary and incentive figures are personal data — never let a shared
        // cache hold this response.
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
