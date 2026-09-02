import { NextResponse } from "next/server";
import { removeAuthCookies } from "next-firebase-auth-edge/next/cookies";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return removeAuthCookies(req.headers, {
    cookieName: "__session",
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
      sameSite: "lax" as const,
      maxAge: 0,
    },
  });
}
