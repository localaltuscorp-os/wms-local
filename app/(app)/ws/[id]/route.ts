import { NextResponse, type NextRequest } from "next/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  WORKSPACE_LANDING,
  WORKSPACE_COMING_SOON,
  isWorkspaceId,
  canAccessWorkspace,
} from "@/lib/workspaces";
import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { goalsCanvasOn } from "@/lib/goals/flag";

// This handler reads cookies + auth and redirects — it is ALWAYS dynamic. Without
// this, Turbopack tries to statically generate paths for /ws/[id] and the worker
// crashes (no request/cookie context at gen time) → "Jest worker … child process
// exceptions". Force-dynamic opts it out of any static generation attempt.
export const dynamic = "force-dynamic";

/**
 * Enter a workspace from the hub.
 *
 * Remembers the chosen room in the `aw` cookie (so the top nav can show ONLY
 * that workspace's modules), then redirects to the workspace's landing page.
 * Bounces back to the hub for: an unknown id, a not-yet-launched room (so the
 * cookie is never set to a nav-less room), or a room the user isn't allowed into
 * (Sales = department-gated, Admin = admins only). Auth is enforced upstream by
 * the middleware.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isWorkspaceId(id) || WORKSPACE_COMING_SOON[id]) {
    return NextResponse.redirect(new URL("/hub", req.url));
  }

  const me = await getCurrentEmployee();
  if (me && isCandidateAccount(me)) {
    return NextResponse.redirect(new URL("/candidate/form", req.url));
  }
  if (!me || !canAccessWorkspace(id, await accessFor(me))) {
    return NextResponse.redirect(new URL("/hub", req.url));
  }

  // Goals module entry lands on the Yearly board when the new level-page UI is
  // live; with the flag OFF prod keeps landing on the /goals hub, unchanged.
  const landing =
    id === "goals" && goalsCanvasOn() ? "/goals/yearly" : WORKSPACE_LANDING[id];

  const res = NextResponse.redirect(new URL(landing, req.url));
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days — sticks across sessions
  });
  return res;
}
