import { NextResponse } from "next/server";
import { mintSessionForIdToken } from "@/lib/auth/session-mint";

export const runtime = "nodejs";

/**
 * Accept an already-verified client sign-in token (Google and set-password
 * flows) and put it through the same guarded session-mint path as password
 * sign-in. This prevents one login method from bypassing device or two-step
 * checks that another login method enforces.
 */
export async function POST(req: Request) {
  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.idToken || typeof body.idToken !== "string") {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  return mintSessionForIdToken(req, body.idToken);
}
