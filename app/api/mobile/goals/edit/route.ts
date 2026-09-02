import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { autoPctDone, statusForPct } from "@/lib/goals/auto-pct";
import { toGoalDTO } from "@/components/goals/cascade/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Numeric string or null for a money/qty column. */
function money(v: number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  pctDone: z.number().int().min(0).max(100).optional(),
  targetQty: z.union([z.number(), z.string()]).nullable().optional(),
  actualQty: z.union([z.number(), z.string()]).nullable().optional(),
  area: z.string().max(160).nullable().optional(),
  uom: z.string().max(80).nullable().optional(),
  category: z.string().max(60).optional(),
  weight: z.number().int().min(0).max(1000).optional(),
  teamDependencyPct: z.number().int().min(0).max(100).nullable().optional(),
  shareWithTeam: z.boolean().optional(),
  teamInvolved: z
    .array(z.object({ employeeId: z.string().optional(), name: z.string().optional(), weight: z.number().int().min(0).max(1000).optional() }))
    .nullable()
    .optional(),
});

/**
 * POST /api/mobile/goals/edit — inline-edit a goal the signed-in user OWNS.
 * Body = a partial patch (only supplied fields are written): the same fields the
 * web inline table edits (% Done, target/actual, Area/Measure/Type, weight,
 * team % + members/weights, Share-with-Team). Returns the updated GoalDTO.
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  // Own-goal guard: the goal must belong to the signed-in user.
  const [owned] = await db
    .select({ id: goals.id, targetQty: goals.targetQty, actualQty: goals.actualQty })
    .from(goals)
    .where(and(eq(goals.id, d.id), eq(goals.employeeId, me.id)))
    .limit(1);
  if (!owned) return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  if (d.pctDone !== undefined) patch.pctDone = d.pctDone;
  if (d.targetQty !== undefined) patch.targetQty = money(d.targetQty);
  if (d.actualQty !== undefined) patch.actualQty = money(d.actualQty);
  if (d.area !== undefined) patch.area = d.area ?? null;
  if (d.uom !== undefined) patch.uom = d.uom ?? null;
  if (d.category !== undefined) patch.category = d.category;
  if (d.weight !== undefined) patch.weight = d.weight;
  if (d.teamDependencyPct !== undefined) patch.teamDependencyPct = d.teamDependencyPct ?? null;
  if (d.shareWithTeam !== undefined) patch.shareWithTeam = d.shareWithTeam;
  if (d.teamInvolved !== undefined) patch.teamInvolved = d.teamInvolved ?? null;

  // Auto % Done from Target / Actual (shared with the web editGoal action):
  // when target/actual just changed and a numeric target drives the goal,
  // progress = Actual ÷ Target (clamped). Otherwise % Done stays as sent.
  if (d.targetQty !== undefined || d.actualQty !== undefined) {
    const effTarget = d.targetQty !== undefined ? money(d.targetQty) : owned.targetQty;
    const effActual = d.actualQty !== undefined ? money(d.actualQty) : owned.actualQty;
    const auto = autoPctDone(effTarget, effActual);
    if (auto !== null) {
      patch.pctDone = auto;
      patch.status = statusForPct(auto);
    }
  }

  const [row] = await db.update(goals).set(patch).where(eq(goals.id, d.id)).returning();
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });

  return NextResponse.json({ ok: true, goal: toGoalDTO(row) }, { headers: MOBILE_CORS });
}
