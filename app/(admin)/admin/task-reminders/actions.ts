"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { taskReminderRules, type TaskReminderStatusToken } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { REMINDER_STATUS_TOKENS, isValidSendTime } from "@/lib/task-reminders/rules";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/admin/task-reminders";

// `.guid()` not `.uuid()` — zod v4's name, and what lib/validators/index-hub.ts
// already uses in this repo.
const uuid = z.string().guid("Must be a UUID");

/** Only tokens the picker offers — a terminal status can never be stored.
 *  `z.custom` rather than `z.enum` so the parsed value keeps its real
 *  `TaskReminderStatusToken` type instead of widening to `string` and needing a
 *  cast at every insert. */
const StatusToken = z.custom<TaskReminderStatusToken>(
  (v) => typeof v === "string" && (REMINDER_STATUS_TOKENS as readonly string[]).includes(v),
  "Unknown task status",
);

const RuleShape = z.object({
  name: z.string().trim().min(1, "Give the reminder a name").max(120),
  recipientIds: z.array(uuid).min(1, "Choose at least one recipient").max(50),
  scope: z.enum(["all", "selected"]),
  employeeIds: z.array(uuid).max(500),
  statuses: z.array(StatusToken).min(1, "Choose at least one status"),
  sendTimeIst: z
    .string()
    .refine(isValidSendTime, "Send time must be a 24-hour HH:MM"),
  isEnabled: z.boolean(),
});

/** "Selected" with nobody selected would silently match no one — catch it here
 *  rather than letting the rule sit there quietly sending nothing. */
function scopeError(input: { scope: string; employeeIds: string[] }): string | null {
  return input.scope === "selected" && input.employeeIds.length === 0
    ? "Pick at least one employee, or switch the scope to All Employees."
    : null;
}

export async function createReminderRule(input: {
  name: string;
  recipientIds: string[];
  scope: "all" | "selected";
  employeeIds: string[];
  statuses: string[];
  sendTimeIst: string;
  isEnabled: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RuleShape.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const bad = scopeError(parsed.data);
  if (bad) return { ok: false, error: bad };

  try {
    const [row] = await db
      .insert(taskReminderRules)
      .values({
        name: parsed.data.name,
        recipientIds: parsed.data.recipientIds,
        scope: parsed.data.scope,
        // Scope 'all' ignores the roster; store it empty so a later switch to
        // 'selected' starts from a clean slate rather than a stale list.
        employeeIds: parsed.data.scope === "selected" ? parsed.data.employeeIds : [],
        statuses: parsed.data.statuses,
        sendTimeIst: parsed.data.sendTimeIst,
        isEnabled: parsed.data.isEnabled,
        createdById: me.id,
      })
      .returning({ id: taskReminderRules.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidatePath(PATH);
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function updateReminderRule(input: {
  id: string;
  name: string;
  recipientIds: string[];
  scope: "all" | "selected";
  employeeIds: string[];
  statuses: string[];
  sendTimeIst: string;
  isEnabled: boolean;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RuleShape.extend({ id: uuid }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const bad = scopeError(parsed.data);
  if (bad) return { ok: false, error: bad };

  try {
    await db
      .update(taskReminderRules)
      .set({
        name: parsed.data.name,
        recipientIds: parsed.data.recipientIds,
        scope: parsed.data.scope,
        employeeIds: parsed.data.scope === "selected" ? parsed.data.employeeIds : [],
        statuses: parsed.data.statuses,
        sendTimeIst: parsed.data.sendTimeIst,
        isEnabled: parsed.data.isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(taskReminderRules.id, parsed.data.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Pause / resume. Separate from `updateReminderRule` so the row's toggle is one
 * cheap write that cannot fail validation on an unrelated field — pausing a
 * misconfigured rule is exactly when you most need the toggle to work.
 */
export async function setReminderRuleEnabled(input: {
  id: string;
  isEnabled: boolean;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!uuid.safeParse(input.id).success) return { ok: false, error: "Invalid id" };

  try {
    await db
      .update(taskReminderRules)
      .set({ isEnabled: Boolean(input.isEnabled), updatedAt: new Date() })
      .where(eq(taskReminderRules.id, input.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function deleteReminderRule(input: { id: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!uuid.safeParse(input.id).success) return { ok: false, error: "Invalid id" };

  try {
    await db.delete(taskReminderRules).where(eq(taskReminderRules.id, input.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}
