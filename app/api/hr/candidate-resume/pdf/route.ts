import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { renderCandidateResumePdf } from "@/lib/hr/candidate/resume-pdf";

export const dynamic = "force-dynamic";

interface ResumePdfBody {
  data?: Record<string, string>;
  instances?: Record<string, string[]>;
  photoPath?: string;
}

/**
 * `photoPath` is a caller-supplied key into the PRIVATE documents bucket, read
 * with the SERVICE-ROLE client and embedded in the PDF handed back to the
 * caller. Anything short of an exact shape match is an arbitrary-read primitive:
 * any signed-in employee could have named someone else's scanned Aadhaar or
 * signature image and received it rendered into a PDF.
 *
 * This is the ONLY shape `uploadCandidateFile` produces — see the `path`
 * construction in app/(app)/hr/candidate-actions.ts — and the only one accepted
 * here. Anchored at both ends, so `..`, absolute paths and any other bucket
 * prefix are rejected outright.
 */
const CANDIDATE_ASSET_PATH = /^candidate-intake\/(?:photo|sign)\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

/**
 * POST /api/hr/candidate-resume/pdf — render a filled Candidate Interview Form
 * to a downloadable resume PDF.
 *
 * HR-STAFF ONLY. The sole caller is the intake wizard's review step, reachable
 * only from /hr/intake, which is already `requireHrStaff()` — so the gate here
 * matches the page rather than tightening it. `requireUser()` alone was never
 * the intended audience: this renders one candidate's full interview record.
 */
export async function POST(req: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await isHrStaff(me))) return new Response("Forbidden", { status: 403 });

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return new Response(limited.error, { status: 429 });

  let body: ResumePdfBody;
  try {
    body = (await req.json()) as ResumePdfBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const data = body.data ?? {};
  const instances = body.instances ?? {};

  // Optional passport photo from Supabase storage — guarded so a missing/bad
  // image never blocks the PDF. A path that doesn't match the upload shape is
  // dropped silently for the same reason: the PDF is still worth rendering.
  let photo: Buffer | null = null;
  if (body.photoPath && CANDIDATE_ASSET_PATH.test(body.photoPath)) {
    try {
      const { data: blob } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .download(body.photoPath);
      photo = blob ? Buffer.from(await blob.arrayBuffer()) : null;
    } catch {
      photo = null;
    }
  }

  try {
    const pdf = await renderCandidateResumePdf({ data, instances, photo });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="Candidate-Resume.pdf"',
        // Personal data — keep it out of shared caches and browser history.
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
