"use server";

import { revalidatePath } from "next/cache";
import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcFeedback, tcServices, employees, type Employee } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager, type TcLookupOption } from "@/lib/queries/training";
import { notify } from "@/lib/notifications/dispatch";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CreateFeedbackSchema, ResolveFeedbackSchema, FeedbackIdSchema } from "@/lib/validators/feedback";

const LIST = "/training/feedback";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function requireFeedbackManager(): Promise<Employee> {
  const me = await requireWorkspace("training");
  if (!(me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id)))) throw new Error("Managers only");
  return me;
}

export async function createFeedback(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateFeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(tcFeedback)
      .values({
        type: d.type,
        ratedEmployeeId: d.ratedEmployeeId,
        ratedName: d.ratedName,
        clientName: d.clientName,
        serviceId: d.serviceId,
        rating: d.rating,
        q1: d.q1,
        q2: d.q2,
        voiceNotePath: d.voiceNotePath,
        voiceTranscript: d.voiceTranscript,
        picturePath: d.picturePath,
        escalate: d.escalate,
        escalatedToId: d.escalatedToId,
        status: d.escalate ? "escalated" : "open",
        createdById: me.id,
      })
      .returning({ id: tcFeedback.id });
    revalidatePath(LIST);
    if (d.escalate) await pingEscalation(row!.id, d.escalatedToId, me);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function pingEscalation(feedbackId: string, escalatedToId: string | null, by: Employee) {
  const title = "A feedback case was escalated";
  const body = `${by.name} escalated a feedback case for review.`;
  if (escalatedToId && escalatedToId !== by.id) notify({ userId: escalatedToId, kind: "nudged", title, body });
  const admins = await db.select({ id: employees.id }).from(employees).where(sql`is_admin = true and is_active = true`);
  for (const a of admins) if (a.id !== by.id && a.id !== escalatedToId) notify({ userId: a.id, kind: "nudged", title, body });
}

export async function escalateFeedback(id: string, escalatedToId: string | null): Promise<Result> {
  const me = await requireWorkspace("training");
  if (!FeedbackIdSchema.safeParse({ id }).success) return { ok: false, error: "Invalid case." };
  try {
    await db.update(tcFeedback).set({ escalate: true, escalatedToId: escalatedToId ?? null, status: "escalated", updatedAt: new Date() }).where(eq(tcFeedback.id, id));
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${id}`);
    await pingEscalation(id, escalatedToId ?? null, me);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveFeedback(input: unknown): Promise<Result> {
  await requireWorkspace("training");
  const parsed = ResolveFeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    await db.update(tcFeedback).set({ resolution: true, resolutionHow: parsed.data.resolutionHow, resolvedAt: new Date(), status: "resolved", updatedAt: new Date() }).where(eq(tcFeedback.id, parsed.data.id));
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function signOffFeedback(id: string): Promise<Result> {
  const me = await requireFeedbackManager();
  if (!FeedbackIdSchema.safeParse({ id }).success) return { ok: false, error: "Invalid case." };
  try {
    await db.update(tcFeedback).set({ signedOff: true, signedOffById: me.id, signedOffAt: new Date(), status: "signed_off", updatedAt: new Date() }).where(eq(tcFeedback.id, id));
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveFeedback(id: string, archived: boolean): Promise<Result> {
  await requireFeedbackManager();
  if (!FeedbackIdSchema.safeParse({ id }).success) return { ok: false, error: "Invalid case." };
  try {
    await db.update(tcFeedback).set({ archived, status: archived ? "archived" : "open", updatedAt: new Date() }).where(eq(tcFeedback.id, id));
    revalidatePath(LIST);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteFeedback(id: string): Promise<Result> {
  await requireFeedbackManager();
  if (!FeedbackIdSchema.safeParse({ id }).success) return { ok: false, error: "Invalid case." };
  try {
    await db.delete(tcFeedback).where(eq(tcFeedback.id, id));
    revalidatePath(LIST);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Service dropdown — inline add/soft-delete (open to all Training users). */
export async function addFeedbackService(name: string): Promise<Result<{ option: TcLookupOption }>> {
  await requireWorkspace("training");
  const value = name.trim();
  if (!value || value.length > 120) return { ok: false, error: "Enter a service (≤120 chars)." };
  try {
    const existing = (await db.execute(sql`SELECT id, name, is_active FROM "tc_services" WHERE lower(name) = lower(${value}) LIMIT 1`)) as unknown as Array<{ id: string; name: string; is_active: boolean }>;
    if (existing[0]) {
      if (!existing[0].is_active) await db.execute(sql`UPDATE "tc_services" SET is_active = true, updated_at = now() WHERE id = ${existing[0].id}`);
      revalidatePath(LIST);
      return { ok: true, option: { id: existing[0].id, name: existing[0].name } };
    }
    const inserted = (await db.execute(sql`INSERT INTO "tc_services" (name) VALUES (${value}) RETURNING id, name`)) as unknown as Array<{ id: string; name: string }>;
    revalidatePath(LIST);
    return { ok: true, option: { id: inserted[0]!.id, name: inserted[0]!.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteFeedbackService(id: string): Promise<Result> {
  await requireWorkspace("training");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Invalid option." };
  try {
    await db.update(tcServices).set({ isActive: false, updatedAt: new Date() }).where(eq(tcServices.id, id));
    revalidatePath(LIST);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
