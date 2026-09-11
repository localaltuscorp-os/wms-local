import { NextResponse } from "next/server";
import { getCurrentEmployee } from "@/lib/auth/current";
import { nextPopupBroadcastForEmployee } from "@/lib/ecos/queries";

/**
 * "Is there a broadcast I should be seeing right now?"
 *
 * Polled every few seconds by <BroadcastPopup> on every authed page, which is
 * what makes a broadcast land in front of people within ~5 seconds of the
 * sender pressing Send rather than whenever they next navigate.
 *
 * `?s=` is the caller's browser-session id (see the component) — the snooze
 * key. It is opaque and client-minted: it identifies nothing but "this browser
 * session", is only ever compared for equality against the value the same
 * browser stored when it snoozed, and cannot widen what the caller can see
 * (that is fixed by the signed-in employee).
 *
 * ALWAYS 200. A signed-out or errored poll answers `{broadcast:null}` — a
 * background poller that starts logging 401s on every tab, forever, after a
 * session expires is worse than one that quietly finds nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const me = await getCurrentEmployee();
    if (!me) return NextResponse.json({ broadcast: null });

    const sessionId = new URL(request.url).searchParams.get("s");
    const broadcast = await nextPopupBroadcastForEmployee(me.id, sessionId);

    return NextResponse.json(
      { broadcast },
      // Never cached: the entire point is that it reflects the last five seconds.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ broadcast: null });
  }
}
