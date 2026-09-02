import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { listUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { currentWeekStart } from "@/lib/weekly-goals/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/weekly-goals/fill — the Mon/Thu report gate: this week's goals
 * still needing a %Done + explanation from the signed-in user.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const now = new Date();
  const goals = await listUnfilledWeekGoals(me.id, now);
  return NextResponse.json(
    {
      weekStart: currentWeekStart(now),
      goals: goals.map((g) => ({
        id: g.id,
        position: g.position ?? 0,
        client: g.client,
        subject: g.subject,
        targetDone: g.targetDone,
        priority: g.priority,
        targetDate: g.targetDate,
        pctDone: g.pctDone,
        explanation: g.explanation,
      })),
    },
    { headers: MOBILE_CORS },
  );
}

/**
 * POST /api/mobile/weekly-goals/fill — submit progress for one or more goals.
 * Body: { fills: [{ goalId, pctDone, explanation? }] }. Owner-scoped.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as { fills?: Array<{ goalId?: string; pctDone?: number; explanation?: string }> } | null;
  if (!body || !Array.isArray(body.fills) || body.fills.length === 0) {
    return NextResponse.json({ error: "fills are required" }, { status: 400, headers: MOBILE_CORS });
  }

  for (const f of body.fills) {
    if (!f?.goalId) continue;
    const pct = Math.max(0, Math.min(100, Math.round(Number(f.pctDone) || 0)));
    const explanation = (f.explanation ?? "").toString().trim().slice(0, 500) || null;
    await db
      .update(weeklyGoals)
      .set({ pctDone: pct, explanation, pctUpdatedById: me.id, pctUpdatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(weeklyGoals.id, f.goalId), eq(weeklyGoals.employeeId, me.id)));
  }
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
