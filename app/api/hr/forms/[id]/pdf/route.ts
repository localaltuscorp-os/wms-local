import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  loadAuthorisedSubmission,
  submissionFilename,
  contentDispositionAttachment,
} from "@/lib/hr/forms/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/hr/forms/<id>/pdf — download a filled form as a PDF.
 *
 * Authorisation is NOT inherited from the page that linked here: this route is
 * directly addressable, so it re-runs the same `canViewHrSubmission` rule via
 * `loadAuthorisedSubmission`. Without that, a non-HR employee who guessed an id
 * could pull someone else's exit interview without ever loading a list.
 *
 * The pdfkit renderer is imported LAZILY, matching the letters routes, so the
 * heavy dependency stays out of any bundle that merely references this module.
 *
 * Rate-limited like its sibling email route: authorisation says WHO may render a
 * PDF, not how often, and each call spins up pdfkit for a full document.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return new Response(limited.error, { status: 429 });

  const loaded = await loadAuthorisedSubmission(id);
  if (!loaded.ok) return new Response("Not found", { status: loaded.status });

  try {
    const { renderHrFormPdf } = await import("@/lib/hr/forms/pdf");
    const pdf = await renderHrFormPdf(loaded.data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDispositionAttachment(
          submissionFilename(loaded.data.formName, loaded.data.employeeName),
        ),
        // A filled form is personal data — never let a shared cache hold it.
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
