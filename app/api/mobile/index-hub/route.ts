import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listIndexSections } from "@/lib/queries/index-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/index-hub — the Marketing "Index Hub": a curated directory of
 * campaign / reach / lead-gen links, grouped into sections. Reuses the web's
 * `listIndexSections` (one source of truth). Read-only.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const sections = await listIndexSections();
  return NextResponse.json(
    {
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        links: s.links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
      })),
    },
    { headers: MOBILE_CORS },
  );
}
