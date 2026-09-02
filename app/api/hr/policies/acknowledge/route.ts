import { NextResponse } from "next/server";
import { acknowledgePolicy } from "@/lib/hr/policies/acknowledge-core";

export const dynamic = "force-dynamic";

/**
 * POST /api/hr/policies/acknowledge — file a policy acknowledgement for the
 * current user and start a pending signature, returning the signable
 * document id. Called via fetch from the client policy page so the CLIENT never
 * imports the db/auth graph. The client then navigates to
 *   /documents/sign?kind=letter&doc=<docId>
 * to complete the DigiLocker-verified signature. Auth + rate-limit live inside
 * acknowledgePolicy().
 */
export async function POST(req: Request) {
  const input = await req.json().catch(() => ({}));
  const res = await acknowledgePolicy(input);
  return NextResponse.json(res);
}
