import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { addTaskComment } from "@/lib/tasks/add-comment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const STATUS_FOR: Record<string, number> = {
  invalid: 400,
  "not-found": 404,
  forbidden: 403,
};

/**
 * POST /api/mobile/tasks/:id/comment — add a comment from the app.
 * Body: { body }. Reuses the web comment rules (participant/admin check, audit
 * event, notifications) via addTaskComment.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) {
    return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (!body || typeof body.body !== "string") {
    return NextResponse.json({ error: "A comment body is required." }, { status: 400, headers: MOBILE_CORS });
  }

  const result = await addTaskComment(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    id,
    { body: body.body },
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: STATUS_FOR[result.error] ?? 400, headers: MOBILE_CORS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
