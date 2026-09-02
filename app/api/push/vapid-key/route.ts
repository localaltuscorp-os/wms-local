import { NextResponse } from "next/server";

/**
 * M4 Commit 3c — public VAPID key for the in-browser PushManager
 * subscription handshake.  Client fetches this once before calling
 * `pushManager.subscribe`.  Server-side senders (lib/web-push/client.ts)
 * use the same public key plus the private half via webpush.setVapidDetails.
 */
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  });
}
