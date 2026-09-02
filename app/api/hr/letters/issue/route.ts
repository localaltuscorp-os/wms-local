import { NextResponse } from "next/server";
import { issueLetter } from "@/lib/hr/letters/issue-core";

export const dynamic = "force-dynamic";

/**
 * POST /api/hr/letters/issue — render + archive an HR letter and record its
 * document_instances row (keeping the document_signatures e-sign flow intact).
 * Called via fetch from the client letter page so the CLIENT never imports the
 * heavy issue graph. Auth + admin guard live inside issueLetter().
 */
export async function POST(req: Request) {
  const input = await req.json().catch(() => ({}));
  const res = await issueLetter(input);
  return NextResponse.json(res);
}
