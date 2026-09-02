import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/accounts — the Accounts module front door for the signed-in
 * user: the same data-driven section registry the web `/accounts` page reads
 * (`ACCOUNTS_SECTIONS`), ordered, with the built/total roll-up. Read-only.
 *
 * Additive: reuses the web's `ACCOUNTS_SECTIONS` constant verbatim (one source
 * of truth for both surfaces) and normalizes each row to exactly what the
 * native index needs — the web page is untouched. Sections are pure metadata
 * (no credentials leave this endpoint); the CA-Handover vault stays behind its
 * own gated read.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }

  const sections = [...ACCOUNTS_SECTIONS]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      slug: s.slug,
      order: s.order,
      title: s.title,
      blurb: s.blurb,
      status: s.status,
      href: s.href ?? null,
      sensitive: s.sensitive ?? false,
    }));

  const built = sections.filter((s) => s.status === "built").length;
  const live = sections.filter((s) => s.status === "built" || s.status === "link").length;

  return NextResponse.json(
    {
      // Wrapped in a Date so a string/Date drift can never leak to the client.
      generatedAt: new Date().toISOString(),
      title: "Accounts Totality, Compliance, Checklist & Trackers",
      tagline:
        "One front door to every accounts checklist, compliance tracker and master register.",
      builtCount: built,
      liveCount: live,
      totalCount: sections.length,
      sections,
    },
    { headers: MOBILE_CORS },
  );
}
