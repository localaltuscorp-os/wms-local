"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ambAmbassadors,
  ambProducts,
  ambAmbassadorProducts,
  ambReferrals,
  ambPayouts,
  ambPayoutReferrals,
  ambActivities,
  clients,
} from "@/db/schema";
import { requireWorkspace, requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadWritableAmbassador } from "@/lib/ambassadors/access";
import { computeCommission, round2, type PayoutType } from "@/lib/ambassadors/commission";
import { computePartnerScore, tierFor } from "@/lib/ambassadors/score";
import { isWonStage, validateTransition, type Stage } from "@/lib/ambassadors/stages";
import {
  AmbassadorSchema,
  ReferralSchema,
  PayoutSchema,
  ActivitySchema,
} from "@/lib/validators/ambassadors";

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/ambassadors";
const num = (n: number | null | undefined): string | null => (n == null ? null : String(round2(n)));

function revalidateAmbassador(id?: string) {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/directory`);
  revalidatePath(`${PATH}/pipeline`);
  revalidatePath(`${PATH}/commissions`);
  if (id) revalidatePath(`${PATH}/${id}`);
}

// ── Ambassador CRUD ─────────────────────────────────────────────────────────
export async function createAmbassador(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AmbassadorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ambAmbassadors)
        .values({
          name: v.name,
          company: v.company,
          email: v.email,
          phone: v.phone,
          photoUrl: v.photoUrl,
          // A non-admin who leaves owner blank takes ownership themselves, so the
          // record stays editable by its creator.
          ownerId: v.ownerId ?? (me.isAdmin ? null : me.id),
          status: v.status,
          payoutType: v.payoutType,
          payoutValue: num(v.payoutValue) ?? "0",
          payoutTermsNotes: v.payoutTermsNotes,
          monthlyTarget: num(v.monthlyTarget),
          monthlyTargetCount: v.monthlyTargetCount == null ? null : Math.round(v.monthlyTargetCount),
          joinedOn: v.joinedOn,
          source: v.source,
          createdById: me.id,
        })
        .returning({ id: ambAmbassadors.id });
      const newId = row!.id;
      await writeProducts(tx, newId, v.productIds);
      return newId;
    });
    revalidateAmbassador(id);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: `Could not create ambassador: ${(err as Error).message}` };
  }
}

export async function updateAmbassador(id: string, input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const gate = await loadWritableAmbassador(id, me);
  if (!gate.ok) return gate;
  const parsed = AmbassadorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(ambAmbassadors)
        .set({
          name: v.name,
          company: v.company,
          email: v.email,
          phone: v.phone,
          photoUrl: v.photoUrl,
          ownerId: v.ownerId,
          status: v.status,
          payoutType: v.payoutType,
          payoutValue: num(v.payoutValue) ?? "0",
          payoutTermsNotes: v.payoutTermsNotes,
          monthlyTarget: num(v.monthlyTarget),
          monthlyTargetCount: v.monthlyTargetCount == null ? null : Math.round(v.monthlyTargetCount),
          joinedOn: v.joinedOn,
          source: v.source,
          updatedAt: new Date(),
        })
        .where(eq(ambAmbassadors.id, id));
      await tx.delete(ambAmbassadorProducts).where(eq(ambAmbassadorProducts.ambassadorId, id));
      await writeProducts(tx, id, v.productIds);
    });
    revalidateAmbassador(id);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: `Could not update ambassador: ${(err as Error).message}` };
  }
}

export async function archiveAmbassador(id: string, archived = true): Promise<Result> {
  const me = await requireWorkspace("sales");
  const gate = await loadWritableAmbassador(id, me);
  if (!gate.ok) return gate;
  try {
    await db
      .update(ambAmbassadors)
      .set({ archived, status: archived ? "archived" : "active", updatedAt: new Date() })
      .where(eq(ambAmbassadors.id, id));
    revalidateAmbassador(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not archive: ${(err as Error).message}` };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeProducts(tx: any, ambassadorId: string, productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return;
  await tx
    .insert(ambAmbassadorProducts)
    .values(ids.map((productId) => ({ ambassadorId, productId })))
    .onConflictDoNothing();
}

// ── Product lookup (admin) ──────────────────────────────────────────────────
export async function addProduct(name: string): Promise<Result<{ id: string; name: string }>> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const clean = (name ?? "").trim();
  if (!clean) return { ok: false, error: "Name is required." };
  try {
    // Reactivate a soft-deleted match, else insert.
    const [existing] = await db
      .select({ id: ambProducts.id, name: ambProducts.name })
      .from(ambProducts)
      .where(sql`lower(${ambProducts.name}) = lower(${clean})`)
      .limit(1);
    if (existing) {
      await db.update(ambProducts).set({ isActive: true, updatedAt: new Date() }).where(eq(ambProducts.id, existing.id));
      revalidateAmbassador();
      return { ok: true, id: existing.id, name: existing.name };
    }
    const [row] = await db.insert(ambProducts).values({ name: clean }).returning({ id: ambProducts.id, name: ambProducts.name });
    revalidateAmbassador();
    return { ok: true, id: row!.id, name: row!.name };
  } catch (err) {
    return { ok: false, error: `Could not add product: ${(err as Error).message}` };
  }
}

export async function softDeleteProduct(id: string): Promise<Result> {
  const me = await requireWorkspaceAdmin("sales");
  try {
    await db.update(ambProducts).set({ isActive: false, updatedAt: new Date() }).where(eq(ambProducts.id, id));
    revalidateAmbassador();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not remove product: ${(err as Error).message}` };
  }
}

// ── Referrals + stage engine ────────────────────────────────────────────────
export async function createReferral(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReferralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;
  const gate = await loadWritableAmbassador(v.ambassadorId, me);
  if (!gate.ok) return gate;

  try {
    const [row] = await db
      .insert(ambReferrals)
      .values({
        ambassadorId: v.ambassadorId,
        prospectName: v.prospectName,
        prospectCompany: v.prospectCompany,
        prospectPhone: v.prospectPhone,
        prospectEmail: v.prospectEmail,
        prospectNotes: v.prospectNotes,
        receivedOn: v.receivedOn ?? undefined,
        stage: v.stage,
        assignedToId: v.assignedToId ?? gate.row.ownerId ?? null,
        productId: v.productId,
        dealAmount: num(v.dealAmount),
        expectedClose: v.expectedClose,
        createdById: me.id,
      })
      .returning({ id: ambReferrals.id });
    await db.insert(ambActivities).values({
      ambassadorId: v.ambassadorId,
      referralId: row!.id,
      type: "system",
      title: `Referral received: ${v.prospectName}`,
      createdById: me.id,
    });
    await recomputeScoreInternal(v.ambassadorId);
    revalidateAmbassador(v.ambassadorId);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: `Could not create referral: ${(err as Error).message}` };
  }
}

export async function updateReferral(id: string, input: unknown): Promise<Result> {
  const me = await requireWorkspace("sales");
  const parsed = ReferralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;
  const gate = await loadWritableAmbassador(v.ambassadorId, me);
  if (!gate.ok) return gate;

  try {
    await db
      .update(ambReferrals)
      .set({
        prospectName: v.prospectName,
        prospectCompany: v.prospectCompany,
        prospectPhone: v.prospectPhone,
        prospectEmail: v.prospectEmail,
        prospectNotes: v.prospectNotes,
        receivedOn: v.receivedOn ?? undefined,
        assignedToId: v.assignedToId,
        productId: v.productId,
        dealAmount: num(v.dealAmount),
        expectedClose: v.expectedClose,
        updatedAt: new Date(),
      })
      .where(eq(ambReferrals.id, id));
    revalidateAmbassador(v.ambassadorId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not update referral: ${(err as Error).message}` };
  }
}

/**
 * Advance/move a referral to a new stage. Validates the transition, snapshots
 * the commission on entering a won stage, links/creates a client, writes a
 * stage_change activity, and refreshes the partner score.
 */
export async function setReferralStage(
  referralId: string,
  stage: Stage,
  opts?: { commissionOverride?: number | null },
): Promise<Result> {
  const me = await requireWorkspace("sales");
  const [ref] = await db.select().from(ambReferrals).where(eq(ambReferrals.id, referralId)).limit(1);
  if (!ref) return { ok: false, error: "Referral not found." };
  const gate = await loadWritableAmbassador(ref.ambassadorId, me);
  if (!gate.ok) return gate;

  const dealAmount = ref.dealAmount == null ? null : Number(ref.dealAmount);
  const check = validateTransition(ref.stage as Stage, stage, { dealAmount });
  if (!check.ok) return check;

  try {
    const patch: Partial<typeof ambReferrals.$inferInsert> = { stage, updatedAt: new Date() };

    if (isWonStage(stage)) {
      patch.outcome = "converted";
      if (!ref.wonAt) patch.wonAt = new Date();
      // (Re)compute commission from the ambassador's terms unless already paid.
      if (ref.commissionStatus !== "paid") {
        const c = computeCommission({
          payoutType: gate.row.payoutType as PayoutType,
          payoutValue: Number(gate.row.payoutValue),
          dealAmount,
          override: opts?.commissionOverride,
        });
        patch.commissionAmount = num(c.amount);
        patch.commissionBasis = c.basis;
        patch.commissionStatus = stage === "commission_paid" ? "paid" : "generated";
      }
      // Link a client (CRM) on win — reuse an existing client by name or create one.
      if (!ref.clientId) {
        const clientName = (ref.prospectCompany || ref.prospectName).trim();
        if (clientName) patch.clientId = await ensureClient(clientName);
      }
    } else if (stage === "lost") {
      patch.outcome = "lost";
    }

    await db.update(ambReferrals).set(patch).where(eq(ambReferrals.id, referralId));
    await db.insert(ambActivities).values({
      ambassadorId: ref.ambassadorId,
      referralId,
      type: "stage_change",
      title: `Stage → ${stage}`,
      createdById: me.id,
    });
    await recomputeScoreInternal(ref.ambassadorId);
    revalidateAmbassador(ref.ambassadorId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not change stage: ${(err as Error).message}` };
  }
}

async function ensureClient(name: string): Promise<string> {
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(sql`lower(${clients.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(clients).values({ name }).onConflictDoNothing().returning({ id: clients.id });
  if (row) return row.id;
  // Race: another insert won — read it back.
  const [again] = await db.select({ id: clients.id }).from(clients).where(sql`lower(${clients.name}) = lower(${name})`).limit(1);
  return again!.id;
}

// ── Payouts ─────────────────────────────────────────────────────────────────
export async function recordPayout(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = PayoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;
  const gate = await loadWritableAmbassador(v.ambassadorId, me);
  if (!gate.ok) return gate;
  if (!v.amount || v.amount <= 0) return { ok: false, error: "Enter a payout amount." };

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ambPayouts)
        .values({
          ambassadorId: v.ambassadorId,
          amount: num(v.amount)!,
          paidOn: v.paidOn ?? undefined,
          method: v.method,
          reference: v.reference,
          note: v.note,
          createdById: me.id,
        })
        .returning({ id: ambPayouts.id });
      const payoutId = row!.id;
      const refIds = [...new Set(v.referralIds.filter(Boolean))];
      if (refIds.length) {
        const refs = await tx
          .select({ id: ambReferrals.id, commissionAmount: ambReferrals.commissionAmount })
          .from(ambReferrals)
          .where(and(eq(ambReferrals.ambassadorId, v.ambassadorId), inArray(ambReferrals.id, refIds)));
        for (const r of refs) {
          await tx.insert(ambPayoutReferrals).values({
            payoutId,
            referralId: r.id,
            amountApplied: r.commissionAmount ?? "0",
          });
        }
        await tx
          .update(ambReferrals)
          .set({ commissionStatus: "paid", stage: "commission_paid", updatedAt: new Date() })
          .where(inArray(ambReferrals.id, refs.map((r) => r.id)));
      }
      await tx.insert(ambActivities).values({
        ambassadorId: v.ambassadorId,
        type: "commission",
        title: `Payout recorded: ₹${num(v.amount)}`,
        body: v.reference ? `Ref: ${v.reference}` : null,
        createdById: me.id,
      });
      return payoutId;
    });
    await recomputeScoreInternal(v.ambassadorId);
    revalidateAmbassador(v.ambassadorId);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: `Could not record payout: ${(err as Error).message}` };
  }
}

// ── Activities / timeline / reminders ───────────────────────────────────────
export async function logActivity(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const parsed = ActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;
  const gate = await loadWritableAmbassador(v.ambassadorId, me);
  if (!gate.ok) return gate;
  try {
    const [row] = await db
      .insert(ambActivities)
      .values({
        ambassadorId: v.ambassadorId,
        referralId: v.referralId,
        type: v.type,
        title: v.title,
        body: v.body,
        occurredAt: v.occurredAt ? new Date(v.occurredAt) : undefined,
        remindAt: v.remindAt ? new Date(v.remindAt) : null,
        createdById: me.id,
      })
      .returning({ id: ambActivities.id });
    revalidateAmbassador(v.ambassadorId);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: `Could not log activity: ${(err as Error).message}` };
  }
}

export async function completeReminder(activityId: string): Promise<Result> {
  const me = await requireWorkspace("sales");
  const [act] = await db.select().from(ambActivities).where(eq(ambActivities.id, activityId)).limit(1);
  if (!act) return { ok: false, error: "Reminder not found." };
  const gate = await loadWritableAmbassador(act.ambassadorId, me);
  if (!gate.ok) return gate;
  try {
    await db.update(ambActivities).set({ done: true }).where(eq(ambActivities.id, activityId));
    revalidateAmbassador(act.ambassadorId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not complete reminder: ${(err as Error).message}` };
  }
}

// ── Partner score recompute ─────────────────────────────────────────────────
export async function recomputeScore(id: string): Promise<Result<{ score: number }>> {
  const me = await requireWorkspace("sales");
  const gate = await loadWritableAmbassador(id, me);
  if (!gate.ok) return gate;
  try {
    const score = await recomputeScoreInternal(id);
    revalidateAmbassador(id);
    return { ok: true, score };
  } catch (err) {
    return { ok: false, error: `Could not recompute score: ${(err as Error).message}` };
  }
}

/** Recompute + persist the partner score/tier for one ambassador. */
async function recomputeScoreInternal(ambassadorId: string): Promise<number> {
  const wonSql = sql`(${ambReferrals.stage} in ('won','payment','commission_generated','commission_paid'))`;
  const [agg] = await db
    .select({
      referrals: sql<number>`count(*)`,
      converted: sql<number>`count(*) filter (where ${wonSql})`,
      revenue: sql<number>`coalesce(sum(${ambReferrals.dealAmount}) filter (where ${wonSql}), 0)`,
      generated: sql<number>`coalesce(sum(${ambReferrals.commissionAmount}) filter (where ${ambReferrals.commissionStatus} in ('generated','paid')), 0)`,
      paid: sql<number>`coalesce(sum(${ambReferrals.commissionAmount}) filter (where ${ambReferrals.commissionStatus} = 'paid'), 0)`,
    })
    .from(ambReferrals)
    .where(eq(ambReferrals.ambassadorId, ambassadorId));

  const [last] = await db
    .select({ at: ambActivities.occurredAt })
    .from(ambActivities)
    .where(eq(ambActivities.ambassadorId, ambassadorId))
    .orderBy(desc(ambActivities.occurredAt))
    .limit(1);

  const referrals = Number(agg?.referrals ?? 0);
  const converted = Number(agg?.converted ?? 0);
  const revenue = Number(agg?.revenue ?? 0);
  const generated = Number(agg?.generated ?? 0);
  const paid = Number(agg?.paid ?? 0);
  const daysSinceActivity = last?.at ? (Date.now() - new Date(last.at).getTime()) / 86_400_000 : Infinity;

  const score = computePartnerScore({
    referrals,
    conversionRate: referrals > 0 ? converted / referrals : 0,
    revenue,
    daysSinceActivity,
    paidRatio: generated > 0 ? paid / generated : 1,
  });

  await db
    .update(ambAmbassadors)
    .set({ partnerScore: String(score), tier: tierFor(score), scoreUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(ambAmbassadors.id, ambassadorId));
  return score;
}
