import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { renderSectionPdf } from "@/lib/reports/section-pdf";
import { isSectionReport, reportFilename } from "@/lib/reports/section-report";

/**
 * POST /api/reports/section-pdf
 *
 * Turns one dashboard section's CURRENT view into a PDF and hands it back as a
 * download. The body is the view itself — see lib/reports/section-report.ts for
 * why the client sends its rows rather than the server re-running the query.
 *
 * `runtime = "nodejs"` because pdfkit needs the Node filesystem for the fonts
 * and the logo; on the edge runtime it fails at import, not at call.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const me = await requireUser();

    // Rate-limited as a WRITE, not a read: each call spends real CPU laying out
    // a document, so a held-down button must not be as cheap as a query.
    const limited = rateLimitOrError(me.id, "write");
    if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

    const body: unknown = await req.json();
    if (!isSectionReport(body)) {
      return NextResponse.json({ error: "Invalid report payload" }, { status: 400 });
    }

    const now = new Date();
    const pdf = await renderSectionPdf(body, now);
    const filename = reportFilename(body.title, now);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Never cached: two exports a minute apart are two different snapshots,
        // and a cached one would silently hand back the earlier view.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the report" },
      { status: 500 },
    );
  }
}
