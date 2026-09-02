import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";

/**
 * M4 Commit 3b — Meta Cloud API webhook for inbound WhatsApp events.
 *
 * Two responsibilities:
 *
 *   1. GET — Meta's one-time verification handshake. Echoes back the
 *      `hub.challenge` when `hub.verify_token` matches the configured
 *      `META_WHATSAPP_VERIFY_TOKEN`.
 *
 *   2. POST — inbound messages. We only care about the STOP keyword:
 *      if the message body is `"stop"` (case-insensitive, trimmed) we
 *      flip `employees.whatsapp_opted_in = false` for the matching phone
 *      number. Every other inbound message is acknowledged with 200 OK
 *      and ignored (no echo, no auto-reply).
 *
 * Signature verification: Meta signs each delivery with
 * `X-Hub-Signature-256: sha256=<hex>` derived from the request body and
 * the app secret. For demo we use `META_WHATSAPP_ACCESS_TOKEN` as the
 * HMAC key — replace with the dedicated App Secret in prod.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (
    mode === "subscribe" &&
    token === process.env.META_WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  // For demo; replace with App Secret in prod.
  const appSecret = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!sig || !appSecret) {
    // Accept silently in demo so a misconfigured webhook doesn't
    // wedge Meta's delivery retries.
    return NextResponse.json({ ok: true });
  }
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return NextResponse.json(
      { ok: false, error: "bad signature" },
      { status: 401 },
    );
  }
  let body: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            type?: string;
            from?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };
  try {
    body = JSON.parse(raw);
  } catch (err) {
    // Returning 200 here would tell Meta the delivery succeeded, even
    // though we couldn't parse it. Returning 400 makes Meta retry with
    // backoff, and gives us a log trail when their payload format
    // drifts.
    console.error(
      "[whatsapp/webhook] malformed JSON body",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "malformed body" },
      { status: 400 },
    );
  }
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (
          msg.type === "text" &&
          /^stop$/i.test((msg.text?.body ?? "").trim())
        ) {
          const from = msg.from?.startsWith("+")
            ? msg.from
            : `+${msg.from ?? ""}`;
          await db
            .update(employees)
            .set({ whatsappOptedIn: false })
            .where(eq(employees.whatsappPhone, from));
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
