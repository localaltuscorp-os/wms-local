import { NextResponse } from "next/server";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { isPolicyKey } from "@/lib/hr/policies/registry";
import { getSignedPolicyPdfPath } from "@/app/(app)/hr/policies/signed-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hr/policies/download?key=<policyKey>
 *
 * Downloads the CALLER'S OWN signed copy of a firm policy — the exact PDF their
 * signature was archived into when they signed (document_signatures.signed_pdf_path),
 * never a re-render. Redirects to a short-lived signed URL, so the browser's own
 * download path handles the bytes and the private bucket stays private.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const me = await getCurrentEmployee();
  if (!me) return NextResponse.redirect(new URL("/login", request.url));

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key || !isPolicyKey(key)) {
    return NextResponse.json({ error: "Unknown policy." }, { status: 400 });
  }

  const path = await getSignedPolicyPdfPath(me.id, key);
  if (!path) {
    return NextResponse.json(
      { error: "No signed copy found for this policy. Sign it first." },
      { status: 404 },
    );
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Could not prepare the download." }, { status: 500 });
    }
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ error: "Could not prepare the download." }, { status: 500 });
  }
}
