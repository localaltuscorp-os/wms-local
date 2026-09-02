"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, pmsRecognition, pmsPromotionSignal, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { scoreFor } from "@/lib/queries/pms";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * PMS human-release actions (Law 8). The score engine only ever *suggests*
 * (recognition) and *flags* (promotion); NOTHING here auto-creates a
 * consequence. Every function below only transitions an existing signal to a
 * human decision (release / dismiss / acknowledge / action), stamping who
 * decided and when — plus a manual `createRecognition` so an admin can add a
 * recognition the engine missed. Admin / super-admin only.
 */

/** Admin/super gate shared by every action here. Returns the actor or an error. */
async function requireAdmin(): Promise<
  | { ok: true; me: Awaited<ReturnType<typeof requireUser>> }
  | { ok: false; error: string }
> {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    return { ok: false, error: "Only an admin can release recognition or decide promotions." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return { ok: true, me };
}

const IdSchema = z.object({ id: z.string().uuid("Invalid id") });

// ── Recognition ──────────────────────────────────────────────────────────────

/** Release a suggested recognition — the human says "yes, recognise this". */
export async function releaseRecognition(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid id" };

  try {
    const res = await db
      .update(pmsRecognition)
      .set({ status: "released", releasedById: gate.me.id, releasedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmsRecognition.id, parsed.data.id))
      .returning({ id: pmsRecognition.id });
    if (res.length === 0) return { ok: false, error: "Recognition not found." };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/signals");
  return { ok: true };
}

/** Dismiss a suggested recognition — the human declines it. */
export async function dismissRecognition(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid id" };

  try {
    const res = await db
      .update(pmsRecognition)
      .set({ status: "dismissed", releasedById: gate.me.id, releasedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmsRecognition.id, parsed.data.id))
      .returning({ id: pmsRecognition.id });
    if (res.length === 0) return { ok: false, error: "Recognition not found." };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/signals");
  return { ok: true };
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CreateSchema = z.object({
  employeeId: z.string().uuid("Pick a person"),
  period: z.string().regex(PERIOD_RE, "Period must be YYYY-MM"),
  kind: z.string().trim().min(1, "Pick a kind").max(80),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Manually add a recognition (status 'suggested') — for the case an admin wants
 * to recognise someone the engine didn't surface. Snapshots the live score so
 * the card reads the same as an engine-suggested one. NEVER auto-released.
 */
export async function createRecognition(input: unknown): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const [emp] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, parsed.data.employeeId))
      .limit(1);
    if (!emp) return { ok: false, error: "Employee not found." };

    let snapshot: string | null = null;
    try {
      const s = await scoreFor(parsed.data.employeeId);
      snapshot = String(s.score.score);
    } catch {
      snapshot = null; // best-effort — the recognition stands without a live score
    }

    await db.insert(pmsRecognition).values({
      employeeId: parsed.data.employeeId,
      period: parsed.data.period,
      kind: parsed.data.kind,
      reason: parsed.data.reason && parsed.data.reason.length > 0 ? parsed.data.reason : null,
      scoreSnapshot: snapshot,
      status: "suggested",
    });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/signals");
  return { ok: true };
}

// ── Promotion signals ─────────────────────────────────────────────────────────

/** Acknowledge a flagged promotion signal — "seen, under consideration". */
export async function acknowledgePromotion(input: unknown): Promise<ActionResult> {
  return decidePromotion(input, "acknowledged");
}

/** Action a promotion signal — "we are promoting / acting on this". */
export async function actionPromotion(input: unknown): Promise<ActionResult> {
  return decidePromotion(input, "actioned");
}

/** Dismiss a promotion signal — "not now". */
export async function dismissPromotion(input: unknown): Promise<ActionResult> {
  return decidePromotion(input, "dismissed");
}

async function decidePromotion(
  input: unknown,
  status: "acknowledged" | "actioned" | "dismissed",
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid id" };

  try {
    const res = await db
      .update(pmsPromotionSignal)
      .set({ status, decidedById: gate.me.id, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(pmsPromotionSignal.id, parsed.data.id))
      .returning({ id: pmsPromotionSignal.id });
    if (res.length === 0) return { ok: false, error: "Promotion signal not found." };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/signals");
  return { ok: true };
}
