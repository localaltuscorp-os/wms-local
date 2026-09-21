import { NextResponse } from "next/server";
import { issueLetter } from "@/lib/hr/letters/issue-core";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/hr/letters/issue — render + archive an HR letter and record its
 * document_instances row (keeping the document_signatures e-sign flow intact).
 * Called via fetch from the client letter page so the CLIENT never imports the
 * heavy issue graph. Auth + admin guard live inside issueLetter().
 *
 * The MODULE gate lives here, and only here. `issueLetter()` checks the narrower
 * "may issue letters" capability; nothing checked whether an administrator had
 * revoked the Letters module for this person, because a route handler renders no
 * layout for `requirePathView` to run in.
 */
export async function POST(req: Request) {
  const denial = await apiViewDenial(req);
  if (denial) return denial;

  const input = await req.json().catch(() => ({}));
  const res = await issueLetter(input);
  return NextResponse.json(res);
}
