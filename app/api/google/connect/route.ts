import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getCurrentEmployee } from "@/lib/auth/current";
import { buildAuthUrl, isGoogleConfigured } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

/** Kick off the Google OAuth consent flow for the signed-in employee. */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${origin}/profile?google=unconfigured`);
  }
  const me = await getCurrentEmployee();
  if (!me) return NextResponse.redirect(`${origin}/login`);

  const state = crypto.randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = `${origin}/api/google/callback`;
  return NextResponse.redirect(buildAuthUrl(redirectUri, state));
}
