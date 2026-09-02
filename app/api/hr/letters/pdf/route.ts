import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getLetter } from "@/lib/hr/letters/registry";
import type { ContentKind } from "@/lib/hr/letters/rich";
import { normalizeGender, type Gender } from "@/lib/hr/pronouns";

export const dynamic = "force-dynamic";

/** A safe, quoted-string filename for Content-Disposition (no header injection). */
function safePdfName(raw: string | undefined): string {
  const base = (raw || "letter").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "letter";
  return base.endsWith(".pdf") ? base : `${base}.pdf`;
}

interface LetterPdfBody {
  key?: string;
  entity?: string;
  values?: Record<string, string>;
  date?: string;
  /** Candidate gender — resolves pronoun/salutation tokens for structured PDFs. */
  gender?: Gender;
  /** When "rich", render `bodyHtml` via headless Chromium instead of pdfkit. */
  contentKind?: ContentKind;
  /** The free-form TipTap HTML for a rich letter (required when rich). */
  bodyHtml?: string;
  /** Optional uploaded scanned-signature image (data URL) for the sign-off. */
  signatureImage?: string;
}

/**
 * POST /api/hr/letters/pdf — render a filled HR letter to a downloadable PDF on
 * the selected paying-entity letterhead. Auth-gated; no DB writes (pure export).
 * The heavy pdfkit renderer is imported LAZILY so it stays server-runtime only.
 */
export async function POST(req: Request): Promise<Response> {
  // AUTHZ: HR letters are an HR-STAFF function. This route previously gated on
  // requireUser() only, so ANY authenticated employee could POST arbitrary
  // `bodyHtml` (contentKind:"rich") and have it rendered in server-side headless
  // Chromium — an SSRF + private-file-read + Chromium-DoS hole (the rich path is
  // the crown jewel). Match the sibling issue/email routes: require HR staff, and
  // rate-limit (Chromium is the heaviest op in the app).
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return new Response("Too many requests", { status: 429 });
  if (!(await isHrStaff(me))) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: LetterPdfBody;
  try {
    body = (await req.json()) as LetterPdfBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  /* ---- Rich ("Edit freely") letters → headless-Chromium renderer ---- */
  if (body.contentKind === "rich" && body.bodyHtml) {
    try {
      const { renderRichLetterPdf } = await import("@/lib/hr/letters/render-rich");
      const pdf = await renderRichLetterPdf({
        entity: body.entity ?? "",
        bodyHtml: body.bodyHtml,
      });
      const filename = safePdfName(body.key);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {
      return new Response("Failed to render PDF", { status: 500 });
    }
  }

  /* ---- Structured letters → existing pdfkit renderer (unchanged) ---- */
  const template = body.key ? getLetter(body.key) : undefined;
  if (!template) return new Response("Unknown letter", { status: 404 });

  try {
    const { renderLetterPdf } = await import("@/lib/hr/letters/pdf");
    const pdf = await renderLetterPdf({
      template,
      entity: body.entity ?? null,
      values: body.values ?? {},
      date: body.date,
      gender: normalizeGender(body.gender),
      signatureImage: body.signatureImage,
    });
    const filename = safePdfName(template.key);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
