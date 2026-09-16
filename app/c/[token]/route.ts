import { NextResponse, type NextRequest } from "next/server";
import { resolveAccessLink } from "@/lib/hr/candidate/access-link";
import {
  CANDIDATE_LINK_COOKIE,
  candidateLinkCookieOptions,
} from "@/lib/hr/candidate/access-link-cookie";

export const dynamic = "force-dynamic";

/**
 * THE DOOR. The emailed link lands here, and here only.
 *
 * A ROUTE HANDLER, NOT A PAGE, and that is not a style choice: this route's
 * whole job is to set a cookie, and a Server Component may not write cookies in
 * Next 16 — `cookies().set()` from a rendering page throws. The handler sets it
 * on its own redirect response instead, which is the one place the framework
 * actually allows.
 *
 * All it does is swap the token for an HttpOnly cookie and get out of the way:
 * verify, store (path-scoped to `/c`, see access-link-cookie.ts), redirect to
 * the clean `/c/form`. The token is therefore in the address bar for exactly one
 * request — not in the history, not in a `Referer`, not in a screenshot of a
 * form being filled on a shared office machine.
 *
 * There is no "which candidate" parameter anywhere: `resolveAccessLink` answers
 * that from the token alone, re-reading the row, the clock, the revocation and
 * the candidate's liveness. Every failure — unknown, expired, revoked, closed —
 * lands on the SAME page, because telling a stranger which one it was is telling
 * them whether the token they hold was ever real.
 *
 * 303, not the default 307: the browser must follow this with a plain GET.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await resolveAccessLink(token);

  if (!link) {
    return NextResponse.redirect(new URL("/c/expired", req.url), 303);
  }

  // Where the link was issued to go (0222). Read from the ROW, never from the
  // URL — a candidate editing their own link must not be able to point it at a
  // surface HR did not send them to.
  const landing = link.purpose === "policies" ? "/c/policies" : "/c/form";
  const res = NextResponse.redirect(new URL(landing, req.url), 303);
  res.cookies.set(CANDIDATE_LINK_COOKIE, token, candidateLinkCookieOptions(link.expiresAt));
  return res;
}
