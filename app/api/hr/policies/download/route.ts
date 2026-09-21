import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { isPolicyKey } from "@/lib/hr/policies/registry";
import { loadPublishedPolicy } from "@/lib/hr/policies/load-db";
import { renderPolicyPdf } from "@/lib/hr/policies/policy-pdf";
import { getEntity } from "@/lib/hr/entities";
import { getSignedPolicyPdfPath } from "@/app/(app)/hr/policies/signed-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/hr/policies/download?key=<policyKey>
 *
 * THE WHOLE POLICY, and the caller's own signed acknowledgement behind it.
 *
 * ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ─────────────────────────────
 * It redirected to `document_signatures.signed_pdf_path` — the archive created at
 * signing time. That file is the ACKNOWLEDGEMENT ONLY: consent, identity and the
 * signature. It has never contained the policy's text, because the text is not
 * what gets signed; the signature is. So "download the policy" handed people a
 * one-page receipt for a document they could not read.
 *
 * The body now comes from the same source the reader page uses — the published
 * CMS version, falling back to the code registry — rendered through the same
 * component by `renderPolicyPdf`, so the download cannot diverge from the screen.
 * The acknowledgement is appended after it, in the order a reader expects.
 *
 * ── WHY IT NO LONGER REDIRECTS ─────────────────────────────────────────────
 * A redirect cannot merge two PDFs. The archive is fetched server-side instead of
 * handing the browser a signed URL, which also keeps the private bucket private
 * for a moment longer.
 *
 * ── THE BODY IS NOT OPTIONAL ───────────────────────────────────────────────
 * If the policy body cannot be rendered this returns an error rather than the
 * acknowledgement alone. Quietly degrading to the receipts is the exact failure
 * this route exists to fix, and a person who asked for a policy and silently got
 * a receipt would have no way to tell.
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

  const doc = await loadPublishedPolicy(key);
  if (!doc) {
    return NextResponse.json({ error: "This policy has no published text." }, { status: 404 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(path);
    if (error || !data) {
      return NextResponse.json({ error: "Could not retrieve your signed copy." }, { status: 500 });
    }
    const ackBytes = new Uint8Array(await data.arrayBuffer());

    let bodyBytes: Uint8Array;
    try {
      bodyBytes = await renderPolicyPdf({ doc, entity: getEntity(doc.entityDefault ?? null) });
    } catch (e) {
      console.error("[policy download] body render failed", e);
      return NextResponse.json(
        {
          error:
            "Could not render the policy text just now. The acknowledgement is not sent on its own — please try again in a moment.",
        },
        { status: 503 },
      );
    }

    const merged = await PDFDocument.create();
    for (const buf of [bodyBytes, ackBytes]) {
      const src = await PDFDocument.load(buf.slice()); // slice: pdf-lib wants a copy it may detach
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const p of pages) merged.addPage(p);
    }
    const out = await merged.save();
    const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;

    const safeTitle = doc.title.replace(/[^\w\-. ]+/g, "").trim() || key;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      },
    });
  } catch (e) {
    console.error("[policy download] failed", e);
    return NextResponse.json({ error: "Could not prepare the download." }, { status: 500 });
  }
}
