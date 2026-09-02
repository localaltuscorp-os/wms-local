import "server-only";
import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { notificationPreferences } from "@/db/schema";
import { PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

/**
 * The 9 user-controllable notification kinds in v2's prefs matrix.
 * Excludes `overdue_digest` — that's the digest cron, not a per-event
 * notification a user can opt in/out of separately.
 */
export const NOTIFICATION_KINDS = [
  "task_assigned",
  "task_initiated",
  "status_changed",
  "approved",
  "declined",
  "reassigned",
  "transferred",
  "cancelled",
  "commented",
] as const;
export type NotificationKindKey = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_CHANNELS = [
  "email",
  "slack",
  "whatsapp",
  "push",
] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Lookup map keyed by `${kind}|${channel}` — present in the map only
 * when the user has explicitly set a preference. Absent keys mean
 * "fall back to legacy channel scalars".
 */
export type PrefsMatrix = Record<string, boolean>;

function matrixKey(kind: string, channel: string): string {
  return `${kind}|${channel}`;
}

/**
 * Read the per-(kind, channel) preference matrix for an employee.
 * Cached aggressively per-user — invalidated by `setNotificationPref`.
 */
export async function getNotificationPrefs(
  employeeId: string,
): Promise<PrefsMatrix> {
  return unstable_cache(
    async () => {
      const rows = await db
        .select({
          kind: notificationPreferences.kind,
          channel: notificationPreferences.channel,
          enabled: notificationPreferences.enabled,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.employeeId, employeeId));

      const matrix: PrefsMatrix = {};
      for (const r of rows) {
        matrix[matrixKey(r.kind, r.channel)] = r.enabled;
      }
      return matrix;
    },
    [PROFILE_CACHE_TAGS.notificationPrefs(employeeId)],
    { tags: [PROFILE_CACHE_TAGS.notificationPrefs(employeeId)] },
  )();
}

/**
 * Set / upsert a single (kind, channel) preference. Returns the new value.
 * Idempotent — calling with the same value is a no-op write.
 */
export async function upsertNotificationPref(
  employeeId: string,
  kind: NotificationKindKey,
  channel: NotificationChannelKey,
  enabled: boolean,
): Promise<void> {
  const existing = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.employeeId, employeeId),
        eq(notificationPreferences.kind, kind),
        eq(notificationPreferences.channel, channel),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(notificationPreferences)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(notificationPreferences.id, existing[0].id));
  } else {
    await db.insert(notificationPreferences).values({
      employeeId,
      kind,
      channel,
      enabled,
    });
  }
}

/**
 * Resolve the effective enabled state for a (kind, channel) pair given
 * the user's matrix + legacy channel scalars. Single source of truth
 * for "should this arm fire?" used by both UI and dispatch.
 */
export function effectiveEnabled(
  matrix: PrefsMatrix,
  kind: NotificationKindKey,
  channel: NotificationChannelKey,
  legacyChannelOptIn: boolean,
): boolean {
  const key = matrixKey(kind, channel);
  if (Object.prototype.hasOwnProperty.call(matrix, key)) {
    return matrix[key]!;
  }
  return legacyChannelOptIn;
}
