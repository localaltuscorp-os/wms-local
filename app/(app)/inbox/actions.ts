"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import {
  markRead as markReadQuery,
  markAllRead as markAllReadQuery,
} from "@/lib/queries/notifications";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Mark a single notification read.  RLS + the query's user_id scope
 * make this safe even if a forged id is passed.  Returns void so the
 * client doesn't need a JSON envelope; we revalidate /inbox + / to
 * refresh the nav-badge.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(notificationId)) return { ok: false, error: "Invalid id." };
  const me = await requireUser();
  try {
    await markReadQuery(notificationId, me.id);
  } catch (err) {
    // Non-critical: marking read failing must never block opening the task.
    return { ok: false, error: `Could not mark read: ${(err as Error).message}` };
  }
  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Mark every unread notification for the current user as read.  Powers
 * the "Mark all read" button at the top of /inbox.
 */
export async function markAllNotificationsRead(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await requireUser();
  try {
    await markAllReadQuery(me.id);
  } catch (err) {
    return { ok: false, error: `Could not mark all read: ${(err as Error).message}` };
  }
  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true };
}
