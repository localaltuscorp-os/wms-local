import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, employees, appraisalItems, appraisalScores } from "@/lib/db";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { appraisalEnabled } from "@/lib/pms/appraisal-flag";
import { isAppraisalAdmin, canManagerScore } from "@/lib/pms/appraisal/access";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";
import { notify } from "@/lib/notifications/dispatch";
import { emit } from "@/lib/events/emit";
import {
  appraisalSelfSubmitted,
  appraisalManagerSubmitted,
  appraisalManagementSubmitted,
} from "@/lib/events/appraisal-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const ScoreSchema = z.object({
  itemId: z.string().uuid(),
  stage: z.enum(["self", "manager", "management"]),
  score: z.coerce.number().min(0).max(10),
  justification: z.string().trim().max(2000).optional(),
});

/** The active super-admin employee ids (management-review notification fan-out) —
 *  mirrors the web action's private helper. */
async function superAdminIds(): Promise<string[]> {
  const emails = SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase());
  const rows = await db
    .select({ id: employees.id, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true));
  return rows
    .filter((r) => r.email && emails.includes(r.email.trim().toLowerCase()))
    .map((r) => r.id);
}

/**
 * POST /api/mobile/appraisal/score — submit ONE appraisal score, routed by
 * `stage` to the exact behaviour of the web submitSelfScore / submitManagerScore
 * / submitManagementScore actions (same authorization, same DB writes, same
 * status transition, same event + notification fan-out — so phone and web can
 * never diverge). Body: { itemId, stage: "self"|"manager"|"management", score
 * (0-10), justification? }. For the manager stage the explanation is required.
 * Auto items (incentive / knowledge_sharing) can never be hand-scored.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!appraisalEnabled()) {
    return NextResponse.json({ error: "appraisal-disabled" }, { status: 403, headers: MOBILE_CORS });
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = ScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  // Load + guard the item (auto items are computed, never hand-scored).
  const [item] = await db.select().from(appraisalItems).where(eq(appraisalItems.id, d.itemId)).limit(1);
  if (!item) return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });
  if (item.isAuto) {
    return NextResponse.json({ error: "This item is scored automatically." }, { status: 400, headers: MOBILE_CORS });
  }

  const scoreStr = String(d.score);

  try {
    if (d.stage === "self") {
      if (item.employeeId !== me.id && !isAppraisalAdmin(me)) {
        return NextResponse.json({ error: "You can only self-score your own items." }, { status: 403, headers: MOBILE_CORS });
      }
      if (item.isManagerOnly) {
        return NextResponse.json({ error: "This item is scored by your manager." }, { status: 400, headers: MOBILE_CORS });
      }

      await db.transaction(async (tx) => {
        await tx
          .insert(appraisalScores)
          .values({
            itemId: d.itemId,
            selfScore: scoreStr,
            selfJustification: d.justification || null,
            selfSubmittedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: appraisalScores.itemId,
            set: {
              selfScore: scoreStr,
              selfJustification: d.justification || null,
              selfSubmittedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        await tx
          .update(appraisalItems)
          .set({ status: "awaiting_manager", updatedAt: new Date() })
          .where(eq(appraisalItems.id, d.itemId));
        await emit(
          tx,
          appraisalSelfSubmitted(
            d.itemId,
            { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: item.dimension, stage: "self", score: d.score },
            { actorId: me.id },
          ),
        );
      });

      const [emp] = await db
        .select({ managerId: employees.managerId })
        .from(employees)
        .where(eq(employees.id, item.employeeId))
        .limit(1);
      if (emp?.managerId) {
        await notify({
          userId: emp.managerId,
          kind: "appraisal_manager_pending",
          title: "A self score is ready for your review",
          body: "A team member submitted a self score. Add your manager score + explanation.",
          actorId: me.id,
        });
      }
      return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
    }

    if (d.stage === "manager") {
      if (!(await canManagerScore(me, item.employeeId))) {
        return NextResponse.json({ error: "You are not this person's manager." }, { status: 403, headers: MOBILE_CORS });
      }
      const explanation = d.justification?.trim();
      if (!explanation) {
        return NextResponse.json({ error: "Manager explanation is required." }, { status: 400, headers: MOBILE_CORS });
      }

      await db.transaction(async (tx) => {
        await tx
          .insert(appraisalScores)
          .values({
            itemId: d.itemId,
            managerId: me.id,
            managerScore: scoreStr,
            managerExplanation: explanation,
            managerSubmittedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: appraisalScores.itemId,
            set: {
              managerId: me.id,
              managerScore: scoreStr,
              managerExplanation: explanation,
              managerSubmittedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        await tx
          .update(appraisalItems)
          .set({ status: "awaiting_management", updatedAt: new Date() })
          .where(eq(appraisalItems.id, d.itemId));
        await emit(
          tx,
          appraisalManagerSubmitted(
            d.itemId,
            { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: item.dimension, stage: "manager", score: d.score },
            { actorId: me.id },
          ),
        );
      });

      for (const id of await superAdminIds()) {
        await notify({
          userId: id,
          kind: "appraisal_management_pending",
          title: "A manager score is ready for management review",
          body: "A manager submitted a score. Add the management score to finalize.",
          actorId: me.id,
        });
      }
      return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
    }

    // stage === "management" — admin-only, finalizes the item.
    if (!isAppraisalAdmin(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: MOBILE_CORS });
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(appraisalScores)
        .values({
          itemId: d.itemId,
          managementId: me.id,
          managementScore: scoreStr,
          managementExplanation: d.justification || null,
          managementSubmittedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appraisalScores.itemId,
          set: {
            managementId: me.id,
            managementScore: scoreStr,
            managementExplanation: d.justification || null,
            managementSubmittedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      await tx
        .update(appraisalItems)
        .set({ status: "finalized", updatedAt: new Date() })
        .where(eq(appraisalItems.id, d.itemId));
      await emit(
        tx,
        appraisalManagementSubmitted(
          d.itemId,
          { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: item.dimension, stage: "management", score: d.score },
          { actorId: me.id },
        ),
      );
    });
    return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
