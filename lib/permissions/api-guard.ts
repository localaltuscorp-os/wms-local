import "server-only";
import { NextResponse } from "next/server";
import { nodeKeyForPath } from "./catalog";
import { canViewModule } from "./resolve";

/**
 * THE ROUTE-HANDLER GUARD — how the permission matrix reaches an endpoint.
 *
 * ── WHY HANDLERS NEED THEIR OWN GUARD ──────────────────────────────────────
 * Pages are covered centrally: `app/(app)/layout.tsx` calls `requirePathView`
 * once, and every page beneath it inherits the check. A route handler renders no
 * layout, so that call never runs for it. Until this module existed, revoking a
 * module hid its pages while its endpoints kept answering — the matrix looked
 * like a security boundary and was a navigation-level restriction. Nothing
 * revealed the difference, because the page you were refused was the page you
 * were looking at.
 *
 * That is worst exactly where it matters most. The Letters module is the worked
 * example: `email-pdf` sends mail, `issue-rich` and `pdf` render through headless
 * Chromium, and `issue` mints the letter. All four were open to anybody who
 * could call them.
 *
 * ── WHY IT RETURNS INSTEAD OF THROWING ─────────────────────────────────────
 * Every other guard in this family throws `forbiddenError()`, and for pages and
 * server actions that is correct: Next maps the error's digest to a 403 page.
 * A route handler has no error boundary, so a throw becomes a 500 — a refusal
 * that reports itself as the application being broken.
 *
 * So this one RETURNS the refusal and the caller early-returns it, matching the
 * shape the mobile handlers already use (`if (!auth.ok) return ...`):
 *
 *     const denial = await apiViewDenial(request);
 *     if (denial) return denial;
 *
 * ── FAIL-CLOSED, BUT NOT FAIL-HOSTILE ──────────────────────────────────────
 * A thrown guard that somebody forgets to check still denies (it 500s). A
 * returned guard that somebody forgets to check does NOT — so the call must be
 * assigned and used. `tests/unit/route-handler-coverage.test.ts` requires every
 * handler to do this rather than merely import the function, which is what keeps
 * a forgotten check from reading as coverage.
 *
 * An UNGOVERNED path is allowed, deliberately: `nodeKeyForPath` returns null for
 * anything the catalogue does not claim, and null is not a denial. The matrix
 * has no opinion about a route nobody has classified, and inventing a refusal
 * for one would break surfaces at random.
 */

/** The refusal an endpoint returns when the matrix denies the module it serves. */
export function forbiddenApiResponse(
  nodeKey: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    // The node is named so a person reading a failed request — or a screenshot
    // of one — can tell which switch to look at. This is an internal tool; the
    // alternative is a bare "forbidden" and a support conversation.
    { error: "forbidden", node: nodeKey },
    { status: 403, headers },
  );
}

/**
 * `null` when the request may proceed; a 403 response when the module that owns
 * this endpoint has been revoked for the caller.
 *
 * `headers` is for the mobile endpoints, which must return CORS headers on every
 * response including a refusal — without them the native app reports a network
 * failure rather than a 403, and the person sees "can't connect" instead of
 * "you do not have access".
 */
export async function apiViewDenial(
  request: Request,
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  const pathname = new URL(request.url).pathname;
  const key = nodeKeyForPath(pathname);
  if (!key) return null;
  if (await canViewModule(key)) return null;
  return forbiddenApiResponse(key, headers);
}
