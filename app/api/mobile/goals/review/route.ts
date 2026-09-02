import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { toGoalDTO } from "@/components/goals/cascade/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const ReviewSchema = z.object({
  id: z.string().uuid(),
  acceptPct: z.number().int().min(0).max(100).nullable().optional(),
  reviewNotes: z.string().max(4000).nullable().optional(),
});

/**
 * POST /api/mobile/goals/review — the Review & Scores write: set the manager
 * Accept % and/or review notes on a goal. A goal the user OWNS (self-review) or,
 * for admins, any goal. Returns the updated GoalDTO (carrying acceptPct +
 * reviewNotes so the app's effective-% recomputes).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  const [row] = await db.select().from(goals).where(eq(goals.id, d.id)).limit(1);
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });
  // Own goal (self-review) or admin (manage-anyone). Managers-of-downline is a
  // web-parity follow-up; own+admin covers the mobile v1.
  if (row.employeeId !== me.id && !me.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const patch: Record<string, unknown> = { reviewedById: me.id, reviewedAt: new Date(), updatedById: me.id, updatedAt: new Date() };
  if (d.acceptPct !== undefined) patch.acceptPct = d.acceptPct;
  if (d.reviewNotes !== undefined) patch.reviewNotes = d.reviewNotes ?? null;

  const [updated] = await db.update(goals).set(patch).where(and(eq(goals.id, d.id))).returning();
  if (!updated) return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });

  return NextResponse.json({ ok: true, goal: toGoalDTO(updated) }, { headers: MOBILE_CORS });
}
