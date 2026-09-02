import { NextResponse } from "next/server";
import { TASK_STATUSES, type TaskStatus } from "@/db/enums";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { applyTaskStatusChange } from "@/lib/tasks/set-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

// Map the core's error codes to HTTP statuses.
const STATUS_FOR: Record<string, number> = {
  invalid: 400,
  "not-found": 404,
  forbidden: 403,
  stale: 409,
};

/**
 * POST /api/mobile/tasks/:id/status — change a task's status from the app.
 * Body: { status, expectedUpdatedAt, note? }. Reuses the exact web rules via
 * applyTaskStatusChange (permission matrix, optimistic lock, audit event,
 * notifications). Returns the new `updatedAt` so the client can keep editing.
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
  const body = (await req.json().catch(() => null)) as
    | { status?: string; expectedUpdatedAt?: string; note?: string }
    | null;
  if (!body || typeof body.status !== "string" || typeof body.expectedUpdatedAt !== "string") {
    return NextResponse.json(
      { error: "status and expectedUpdatedAt are required" },
      { status: 400, headers: MOBILE_CORS },
    );
  }
  if (!TASK_STATUSES.includes(body.status as TaskStatus)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400, headers: MOBILE_CORS });
  }

  const result = await applyTaskStatusChange(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    id,
    body.status as TaskStatus,
    body.expectedUpdatedAt,
    body.note,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: STATUS_FOR[result.error] ?? 400, headers: MOBILE_CORS },
    );
  }
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt }, { headers: MOBILE_CORS });
}
