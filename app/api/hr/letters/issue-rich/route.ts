import { NextResponse } from "next/server";
import { issueRichLetter } from "@/lib/hr/letters/issue-rich";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/hr/letters/issue-rich — render + archive a RICH ("Edit freely")
 * HR letter and record its document_instances row (content_kind='rich', with a
 * frozen body_html snapshot), keeping the document_signatures e-sign flow intact.
 * Called via fetch from the client letter page so the CLIENT never imports the
 * heavy Chromium/issue graph. Workspace-gated (hr) + rate-limited here; the
 * admin guard lives inside issueRichLetter().
 */
export async function POST(req: Request) {
  const me = await requireWorkspace("hr");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json(limited);

  const input = await req.json().catch(() => ({}));
  const res = await issueRichLetter(input);
  return NextResponse.json(res);
}
