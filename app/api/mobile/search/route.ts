import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { globalSearch, type GlobalSearchResult } from "@/lib/queries/global-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** The empty grouped shape — returned verbatim for sub-2-char queries, exactly
 *  like the web ⌘K server action (globalSearchAction) does. */
const EMPTY: GlobalSearchResult = {
  tasks: [], clients: [], projects: [], people: [], outstanding: [], documents: [], ambassadors: [],
};

/**
 * GET /api/mobile/search?q=<term> — the native app's global ⌘K search.
 *
 * Byte-for-byte the same grouped, ranked (active-above-archived) result the web
 * header search renders: it wraps the SAME `globalSearch` query the web server
 * action (app/(app)/search/actions.ts → globalSearchAction) wraps, so the phone
 * and the palette can never diverge. Auth-gated; a query under 2 trimmed chars
 * short-circuits to the empty groups without touching the DB.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json(EMPTY, { headers: MOBILE_CORS });
  }

  const results = await globalSearch(q);
  return NextResponse.json(results, { headers: MOBILE_CORS });
}
