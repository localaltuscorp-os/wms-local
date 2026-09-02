"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings, settingsEvents, statusSettings } from "@/db/schema";
import { TASK_STATUSES } from "@/db/enums";
import { requireAdmin } from "@/lib/auth/current";
import { isValidColumnId } from "@/lib/kanban-columns";
import {
  UpdateOrgSettingsSchema,
  type UpdateOrgSettingsInput,
} from "@/lib/validators/org-settings";
import { colorTokenSchema } from "@/lib/validators/color-token";
import { notify } from "@/lib/notifications/dispatch";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from "@/lib/notifications/resolve-channels";
import { NOTIFICATION_KINDS } from "@/db/schema";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateOrgSettings(
  input: UpdateOrgSettingsInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = UpdateOrgSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const before = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, 1),
  });

  const patch: Partial<typeof orgSettings.$inferInsert> = {
    updatedAt: new Date(),
    updatedById: me.id,
  };
  if (parsed.data.companyName !== undefined)
    patch.companyName = parsed.data.companyName;
  if (parsed.data.logoUrl !== undefined) {
    patch.logoUrl =
      parsed.data.logoUrl === null || parsed.data.logoUrl === ""
        ? null
        : parsed.data.logoUrl;
  }
  if (parsed.data.digestHourIst !== undefined)
    patch.digestHourIst = parsed.data.digestHourIst;
  if (parsed.data.workingDays !== undefined)
    patch.workingDays = parsed.data.workingDays;
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
  if (parsed.data.idleTimeoutMinutes !== undefined)
    patch.idleTimeoutMinutes = parsed.data.idleTimeoutMinutes;
  if (parsed.data.allowSelfRegister !== undefined)
    patch.allowSelfRegister = parsed.data.allowSelfRegister;
  if (parsed.data.officeLat !== undefined) patch.officeLat = parsed.data.officeLat;
  if (parsed.data.officeLng !== undefined) patch.officeLng = parsed.data.officeLng;
  if (parsed.data.attendanceRadiusM !== undefined)
    patch.attendanceRadiusM = parsed.data.attendanceRadiusM;

  try {
    await db.update(orgSettings).set(patch).where(eq(orgSettings.id, 1));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  // Audit row — only fields that actually changed. Non-fatal: log + continue
  // so an audit-write failure never blocks the user action.
  try {
    const changedKeys = Object.keys(parsed.data) as Array<
      keyof typeof parsed.data
    >;
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    for (const key of changedKeys) {
      if (parsed.data[key] === undefined) continue;
      fromValue[key] = before ? (before as Record<string, unknown>)[key] : null;
      toValue[key] = parsed.data[key];
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(settingsEvents).values({
        scope: "org_settings",
        targetId: "1",
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateOrgSettings] audit write failed", err);
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

const UpdateStatusSettingSchema = z.object({
  status: z.enum(TASK_STATUSES),
  label: z.string().trim().min(1).max(32),
  color: colorTokenSchema,
});

export type UpdateStatusSettingInput = z.infer<typeof UpdateStatusSettingSchema>;

export async function updateStatusSettingAction(
  input: UpdateStatusSettingInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = UpdateStatusSettingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { status, label, color } = parsed.data;

  const before = await db.query.statusSettings.findFirst({
    where: eq(statusSettings.status, status),
  });

  try {
    await db
      .update(statusSettings)
      .set({
        label,
        colorToken: color,
        updatedAt: new Date(),
        updatedById: me.id,
      })
      .where(eq(statusSettings.status, status));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "status_settings",
      targetId: status,
      actorId: me.id,
      eventType: "updated",
      fromValue: before
        ? { label: before.label, color: before.colorToken }
        : null,
      toValue: { label, color },
    });
  } catch (err) {
    console.error("[updateStatusSettingAction] audit write failed", err);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  updateTag(CACHE_TAGS.statusSettings);
  return { ok: true };
}

/**
 * sir's changes #8 — persist the kanban column order (admin-only). Accepts the
 * full ordered list of column ids; unknown/deprecated ids are rejected so a
 * stale client can't poison the stored order.
 */
export async function setBoardColumnOrder(order: string[]): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!Array.isArray(order) || order.length === 0 || order.length > 40) {
    return { ok: false, error: "Invalid column order." };
  }
  if (!order.every((id) => typeof id === "string" && isValidColumnId(id))) {
    return { ok: false, error: "Unknown column in order." };
  }
  try {
    await db
      .update(orgSettings)
      .set({ boardColumnOrder: order, updatedAt: new Date(), updatedById: me.id })
      .where(eq(orgSettings.id, 1));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  revalidatePath("/tasks/kanban");
  return { ok: true };
}

const sendIntegrationTestSchema = z.enum(NOTIFICATION_CHANNELS);

export async function sendIntegrationTestAction(
  channel: NotificationChannel,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!sendIntegrationTestSchema.safeParse(channel).success) {
    return { ok: false, error: "Unknown channel" };
  }
  try {
    await notify({
      userId: me.id,
      kind: "task_assigned",
      title: "Altus Corp integration test",
      body: `This is a test message sent through the ${channel} channel from /admin/settings.`,
      actorId: me.id,
      forceChannels: [channel],
    });
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Test send failed",
    };
  }
}

const NotificationMatrixSchema = z.object({
  matrix: z.record(
    z.enum(NOTIFICATION_KINDS),
    z.array(z.enum(NOTIFICATION_CHANNELS)),
  ),
});

export async function updateNotificationMatrixAction(input: {
  matrix: Record<string, readonly string[]>;
}): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = NotificationMatrixSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid matrix",
    };
  }

  const before = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, 1),
  });

  try {
    await db
      .update(orgSettings)
      .set({
        notificationMatrix: parsed.data.matrix as Record<string, string[]>,
        updatedAt: new Date(),
        updatedById: me.id,
      })
      .where(eq(orgSettings.id, 1));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "org_settings",
      targetId: "1",
      actorId: me.id,
      eventType: "updated",
      fromValue: before ? { notificationMatrix: before.notificationMatrix } : null,
      toValue: { notificationMatrix: parsed.data.matrix },
    });
  } catch (err) {
    console.error("[updateNotificationMatrixAction] audit write failed", err);
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
