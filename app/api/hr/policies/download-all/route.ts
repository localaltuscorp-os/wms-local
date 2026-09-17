import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { listSignedPolicyPdfs } from "@/app/(app)/hr/policies/signed-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/hr/policies/download-all
 *
 * Every signed firm policy the caller has, merged into ONE PDF — their full
 * signed policy packet — and streamed as a download. This is the "download all
 * at once" affordance; merging avoids a zip dependency and reads naturally as a
 * single docket (title page + one policy after another).
 *
 * Missing archives are skipped, not fatal: if the first N fetch but the last is
 * gone, the caller still gets N merged rather than an error.
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
  const buffers: Uint8Array[] = [];
  for (const s of signed) {
    try {
      const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(s.signedPdfPath);
      if (error || !data) continue;
      buffers.push(new Uint8Array(await data.arrayBuffer()));
    } catch {
      // Skip this one — a single missing archive should not sink the whole packet.
    }
  }
  if (buffers.length === 0) {
    return NextResponse.json({ error: "Could not retrieve any signed policies." }, { status: 500 });
  }

  try {
    const merged = await PDFDocument.create();
    for (const buf of buffers) {
      const src = await PDFDocument.load(buf.slice()); // slice: pdf-lib wants a copy it may detach
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const p of pages) merged.addPage(p);
    }
    const out = await merged.save();
    // pdf-lib returns a Uint8Array; Next's Response body wants an ArrayBuffer.
    // slice() copies the exact used span (not the whole backing buffer).
    const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;

    const name = `signed-policies-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not merge the PDFs." },
      { status: 500 },
    );
  }
}
