import { NextResponse } from "next/server";
import { resendTwoStepChallenge, requestMeta } from "@/lib/auth/two-step";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Send a new code". Takes the current handle, retires its code and emails a
 * fresh one to the same person — the handle already proves the password step
 * passed, so the password is not asked for again. Throttled together with the
 * first send (MAX_SENDS_PER_WINDOW in lib/auth/two-step.ts).
 */
export async function POST(req: Request) {
  let body: { challenge?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json", message: "Something went wrong. Try again." }, { status: 400 });
  }
  const challenge = typeof body.challenge === "string" ? body.challenge : "";
  const issued = await resendTwoStepChallenge(challenge, requestMeta(req));
  if (!issued.ok) {
    const status = issued.error === "too-many-codes" ? 429 : issued.error === "code-expired" ? 410 : 502;
    return NextResponse.json(issued, { status });
  }
  return NextResponse.json({
    ok: true,
    challenge: issued.token,
    maskedEmail: issued.maskedEmail,
    expiresInSeconds: issued.expiresInSeconds,
  });
}
