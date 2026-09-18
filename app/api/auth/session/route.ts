import { NextResponse } from "next/server";
import { mintSessionForIdToken } from "@/lib/auth/session-mint";

export const runtime = "nodejs";

/**
 * Exchange a Firebase ID token the CLIENT already holds for this app's session
 * cookies. Used by Google sign-in and the set-password screen.
 *
 * Email + password sign-in does NOT come through here any more: it posts to
 * /api/auth/login, where the server checks the password itself so wrong
 * passwords can be counted (account lockout). This route cannot count anything —
 * it only ever sees a token that Firebase has already accepted.
 *
 * The minting itself lives in lib/auth/session-mint.ts, shared with that route.
 */
export async function POST(req: Request) {
  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { idToken } = body;
  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }
  return mintSessionForIdToken(req, idToken);
}
