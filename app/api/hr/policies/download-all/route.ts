import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { loadPublishedPolicy } from "@/lib/hr/policies/load-db";
import { renderPolicyPdfs } from "@/lib/hr/policies/policy-pdf";
import { getEntity } from "@/lib/hr/entities";
import type { PolicyDoc } from "@/lib/hr/policies/types";
import { listSignedPolicyPdfs } from "@/app/(app)/hr/policies/signed-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/hr/policies/download-all
 *
 * EVERY policy the caller has signed — each one's FULL TEXT followed by their
 * signed acknowledgement — merged into a single PDF packet.
 *
 * ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ─────────────────────────────
 * It concatenated the `document_signatures.signed_pdf_path` archives, which are
 * ACKNOWLEDGEMENTS: consent, identity, signature. It produced a stack of receipts
 * for policies whose text was nowhere in the file. "Download all the policies"
 * gave you everything except the policies.
 *
 * ── ONE BROWSER FOR THE WHOLE PACKET ───────────────────────────────────────
 * The bodies are rendered in a single Chromium launch (`renderPolicyPdfs`) rather
 * than one per policy. Launching is the dominant cost, and a per-policy launch
 * would put a multi-second charge on each document and very plausibly blow the
 * function timeout on a long service record.
 *
 * ── A POLICY WITH NO TEXT IS SKIPPED, NOT SUBSTITUTED ──────────────────────
 * If a body cannot be rendered, that policy contributes only its
 * acknowledgement and is COUNTED, and the count comes back in a response header.
 * The alternative — failing the whole packet — would deny somebody the twenty
 * policies that worked because one was broken. Unlike the single-policy route
 * there is no honest way to error here; a partial packet with a number attached
 * is, and it is visible to whoever is scripting the download.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const me = await getCurrentEmployee();
  if (!me) return NextResponse.redirect(new URL("/login", request.url));

  const signed = await listSignedPolicyPdfs(me.id);
  if (signed.length === 0) {
    return NextResponse.json(
      { error: "No signed policies to download yet." },
      { status: 404 },
    );
  }

  const admin = getSupabaseAdmin();

  // ── 1. The acknowledgements, in the order the caller signed them. ────────
  const acknowledgements: { key: string; bytes: Uint8Array | null }[] = [];
  for (const s of signed) {
    try {
      const { data, error } = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .download(s.signedPdfPath);
      if (error || !data) {
        acknowledgements.push({ key: s.key, bytes: null });
        continue;
      }
      acknowledgements.push({ key: s.key, bytes: new Uint8Array(await data.arrayBuffer()) });
    } catch {
      // Skip this one — a single missing archive should not sink the whole packet.
      acknowledgements.push({ key: s.key, bytes: null });
    }
  }
  if (acknowledgements.every((a) => !a.bytes)) {
    return NextResponse.json({ error: "Could not retrieve any signed policies." }, { status: 500 });
  }

  // ── 2. The policy TEXTS. ─────────────────────────────────────────────────
  const withText: { doc: PolicyDoc; index: number }[] = [];
  for (let i = 0; i < acknowledgements.length; i++) {
    const doc = await loadPublishedPolicy(acknowledgements[i]!.key);
    if (doc) withText.push({ doc, index: i });
  }

  const bodies = new Map<number, Uint8Array>();
  if (withText.length > 0) {
    try {
      const rendered = await renderPolicyPdfs(
        withText.map((w) => w.doc),
        // Every policy in the packet shares the firm's default letterhead; a
        // per-policy entity is a property of the DOC, not of the packet.
        getEntity(withText[0]!.doc.entityDefault ?? null),
      );
      withText.forEach((w, i) => {
        const bytes = rendered[i];
        if (bytes) bodies.set(w.index, bytes);
      });
    } catch (e) {
      // The whole render failed — every policy falls back to its acknowledgement
      // and the header below reports the count.
      console.error("[policy download-all] body render failed", e);
    }
  }

  try {
    const merged = await PDFDocument.create();
    let bodiesMissing = 0;
    for (let i = 0; i < acknowledgements.length; i++) {
      const body = bodies.get(i);
      if (!body) bodiesMissing++;
      const parts = [body, acknowledgements[i]!.bytes].filter(
        (b): b is Uint8Array => b != null,
      );
      for (const buf of parts) {
        const src = await PDFDocument.load(buf.slice()); // slice: pdf-lib wants a copy it may detach
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const p of pages) merged.addPage(p);
      }
    }
    const out = await merged.save();
    const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;

    const name = `signed-policies-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        // Visible to whoever scripts the download: N of the policies in this
        // packet carry their acknowledgement only.
        "X-Policies-Without-Text": String(bodiesMissing),
      },
    });
  } catch (e) {
    console.error("[policy download-all] merge failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not merge the PDFs." },
      { status: 500 },
    );
  }
}
