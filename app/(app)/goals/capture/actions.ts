"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, goalCaptureLog } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalCaptureEnabled, voiceCaptureEnabled } from "@/lib/goals/flag";
import { listGoalLookups } from "@/lib/goals/lookups";
import { structureGoals, type CapturedRow } from "@/lib/goals/capture/structure";
import { transcribe } from "@/lib/goals/capture/transcribe";
import { bulkCreateGoals } from "@/app/(app)/goals/cascade/actions";
import { goalScopeFor, canManageGoalFor } from "@/lib/goals/scope";
import { fyStartYearOfKey, type GoalPeriod } from "@/lib/goals/types";
import { GOAL_PERIODS } from "@/db/enums";
import type { GoalDTO } from "@/components/goals/cascade/util";
import { revalidatePath } from "next/cache";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

/**
 * Goal Capture — turn a plain-language brain-dump into structured goals.
 * Auto-commits (source:"ai" + a shared captureBatchId) so the board can offer
 * "Undo all". In-app callers pass the board's level+period; every row lands
 * there. Best-effort throughout — never throws to the user.
 */
export async function captureGoals(input: {
  employeeId: string;
  level: GoalPeriod;
  periodKey: string;
  text: string;
}): Promise<Result<{ batchId: string; created: number; rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!goalCaptureEnabled()) return { ok: false, error: "Goal Capture is turned off." };

  const level = GOAL_PERIODS.includes(input.level) ? input.level : "year";
  const periodKey = String(input.periodKey || "").trim();
  const text = String(input.text || "").trim();
  if (!text) return { ok: false, error: "Type or paste your goals first." };
  if (text.length > 6000) return { ok: false, error: "That's a lot - keep it under 6000 characters." };

  const scope = await goalScopeFor({ id: me.id, isAdmin });
  const employeeId = input.employeeId || me.id;
  if (!canManageGoalFor(scope, employeeId)) {
    return { ok: false, error: "You can't add goals for that person." };
  }

  const lookups = await listGoalLookups();
  const fyStartYear = Number.isFinite(fyStartYearOfKey(periodKey))
    ? fyStartYearOfKey(periodKey)
    : new Date().getUTCFullYear();

  const structured = await structureGoals(text, {
    fyStartYear,
    level,
    periodKey,
    areas: lookups.areas,
    measures: lookups.measures,
    types: lookups.goaltypes,
  });
  if (!structured.ok) return { ok: false, error: structured.error };

  const batchId = randomUUID();
  const rows = structured.rows.map((r: CapturedRow) => ({
    area: r.area,
    title: r.title,
    uom: r.uom,
    targetQty: r.targetQty,
    actualQty: r.actualQty,
    category: r.category,
  }));

  const res = await bulkCreateGoals({
    employeeId,
    level,
    periodKey,
    rows,
    source: "ai",
    captureBatchId: batchId,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Best-effort audit — never blocks.
  void db
    .insert(goalCaptureLog)
    .values({
      employeeId,
      batchId,
      channel: "in_app_text",
      rawText: text.slice(0, 4000),
      model: structured.model,
      rowCount: res.created,
    })
    .catch(() => {});

  return { ok: true, batchId, created: res.created, rows: res.rows };
}

/** Voice → text. The mic UI records audio and posts it here; the returned text
 *  fills the capture box (the user reviews it, then Captures). Not a commit. */
export async function transcribeCapture(
  formData: FormData,
): Promise<Result<{ text: string }>> {
  await requireGoalsAccess();
  if (!voiceCaptureEnabled()) return { ok: false, error: "Voice capture is turned off." };
  const file = formData.get("audio");
  if (!(file instanceof File)) return { ok: false, error: "No audio received." };
  if (file.size === 0) return { ok: false, error: "The recording was empty." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "Recording too long - keep it under a minute or two." };
  const res = await transcribe(file, file.name || "capture.webm");
  return res.ok ? { ok: true, text: res.text } : { ok: false, error: res.error };
}

/** Undo an AI capture batch — soft-delete (archive) exactly its goals. */
export async function undoCaptureBatch(input: {
  batchId: string;
}): Promise<Result<{ removed: number }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const batchId = String(input.batchId || "").trim();
  if (!batchId) return { ok: false, error: "No batch to undo." };

  const batch = await db
    .select({ id: goals.id, employeeId: goals.employeeId, periodKey: goals.periodKey })
    .from(goals)
    .where(and(eq(goals.captureBatchId, batchId), eq(goals.archived, false)));
  if (batch.length === 0) return { ok: true, removed: 0 };

  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!canManageGoalFor(scope, batch[0]!.employeeId)) {
    return { ok: false, error: "You can't undo that batch." };
  }

  const ids = batch.map((b) => b.id);
  await db
    .update(goals)
    .set({ archived: true, updatedById: me.id, updatedAt: new Date() })
    .where(inArray(goals.id, ids));

  revalidatePath("/goals");
  return { ok: true, removed: ids.length };
}
