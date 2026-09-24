"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcShareSchedule, tcShareAttendees } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canTrain } from "@/lib/training/roles";
import { rateLimitOrError } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/dispatch";
import { auditAction } from "@/lib/logs/audit";
import { SHARE_SLOTS } from "@/db/enums";

const PATH = "/training/share";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

async function requireShareManager() {
  const me = await requireWorkspace("training");
  if (!me.isAdmin && !isSuperAdmin(me.email) && !(await canTrain(me))) {
    throw new Error("Managers only");
  }
  return me;
}

function fail(parsed: { success: false; error: z.ZodError }): { ok: false; error: string } {
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
}

const ScheduleShareSchema = z.object({
  shareDate: z.string().min(1, "Pick a date."), // YYYY-MM-DD
  slot: z.enum(SHARE_SLOTS),
  presenterId: UUID.nullable().optional(),
  topic: z.string().trim().max(300).nullable().optional(),
});

/** Assign (or move) a presenter to a daily share slot. */
export async function scheduleShare(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireShareManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ScheduleShareSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    const [row] = await db
      .insert(tcShareSchedule)
      .values({
        shareDate: d.shareDate,
        slot: d.slot,
        presenterId: d.presenterId ?? null,
        topic: d.topic ?? null,
        createdById: me.id,
      })
      .onConflictDoUpdate({
        target: [tcShareSchedule.shareDate, tcShareSchedule.slot],
        set: { presenterId: d.presenterId ?? null, topic: d.topic ?? null, updatedAt: new Date() },
      })
      .returning({ id: tcShareSchedule.id });

    if (d.presenterId && d.presenterId !== me.id) {
      notify({
        userId: d.presenterId,
        kind: "learning_share_scheduled",
        title: "Learning share scheduled for you",
        body: `${d.shareDate} · ${d.slot === "junior" ? "1:30 PM" : "1:40 PM"}`,
        actorId: me.id,
      });
    }

    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const RecordShareSchema = z.object({
  id: UUID,
  topic: z.string().trim().min(2, "Add a topic.").max(300),
  los: z.string().trim().max(1000).nullable().optional(),
  keyTakeaway: z.string().trim().max(1000).nullable().optional(),
});

/** Record the delivered share (topic + key takeaway) and mark it done. */
export async function recordShare(input: unknown): Promise<Result> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = RecordShareSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    const [s] = await db
      .select({ presenterId: tcShareSchedule.presenterId })
      .from(tcShareSchedule)
      .where(eq(tcShareSchedule.id, d.id))
      .limit(1);
    if (!s) return { ok: false, error: "Share not found." };
    if (s.presenterId !== me.id && !me.isAdmin && !isSuperAdmin(me.email)) {
      return { ok: false, error: "Only the presenter can record this share." };
    }

    await db
      .update(tcShareSchedule)
      .set({
        topic: d.topic,
        los: d.los?.trim() || null,
        keyTakeaway: d.keyTakeaway?.trim() || null,
        status: "done",
        updatedAt: new Date(),
      })
      .where(eq(tcShareSchedule.id, d.id));

    auditAction({
      eventType: "UPDATE",
      employeeId: me.id,
      route: PATH,
      module: "Training",
      resourceType: "learning_share",
      resourceId: d.id,
      action: "complete",
      status: "SUCCESS",
    });

    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const ReplaceShareSchema = z.object({
  id: UUID,
  replacementPresenterId: UUID,
});

/** Replace an absent presenter with someone else. */
export async function replaceShare(input: unknown): Promise<Result> {
  const me = await requireShareManager();
  const parsed = ReplaceShareSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    const [s] = await db
      .select({ presenterId: tcShareSchedule.presenterId, shareDate: tcShareSchedule.shareDate, slot: tcShareSchedule.slot })
      .from(tcShareSchedule)
      .where(eq(tcShareSchedule.id, d.id))
      .limit(1);
    if (!s) return { ok: false, error: "Share not found." };

    await db
      .update(tcShareSchedule)
      .set({ replacedById: s.presenterId, presenterId: d.replacementPresenterId, status: "scheduled", updatedAt: new Date() })
      .where(eq(tcShareSchedule.id, d.id));

    notify({
      userId: d.replacementPresenterId,
      kind: "learning_share_scheduled",
      title: "Learning share reassigned to you",
      body: `${s.shareDate} · ${s.slot === "junior" ? "1:30 PM" : "1:40 PM"}`,
      actorId: me.id,
    });

    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const ShareAttendanceSchema = z.object({
  shareScheduleId: UUID,
  employeeIds: z.array(UUID).max(500),
});

/** Record who attended a share. */
export async function setShareAttendance(input: unknown): Promise<Result> {
  const me = await requireShareManager();
  const parsed = ShareAttendanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const { shareScheduleId, employeeIds } = parsed.data;

  try {
    const ids = Array.from(new Set(employeeIds));
    if (ids.length > 0) {
      await db
        .insert(tcShareAttendees)
        .values(ids.map((employeeId) => ({ shareScheduleId, employeeId, status: "present" as const })))
        .onConflictDoNothing({ target: [tcShareAttendees.shareScheduleId, tcShareAttendees.employeeId] });
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
