import type { NotificationKind } from "@/db/schema";

// Single source of truth for the 4 dispatch channels. Mirrors the arm layout
// inside lib/notifications/dispatch.ts.
export const NOTIFICATION_CHANNELS = [
  "email",
  "slack",
  "whatsapp",
  "push",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// org_settings.notification_matrix is JSONB on the admin side; partial because
// missing keys fall back to all-channels (preserves M4 behaviour for any kind
// the matrix hasn't been configured for yet).
export type NotificationMatrix = Partial<Record<NotificationKind, string[]>>;

const ALL_CHANNELS: NotificationChannel[] = [...NOTIFICATION_CHANNELS];

export function resolveChannels(
  kind: NotificationKind,
  matrix: NotificationMatrix,
): NotificationChannel[] {
  const entry = matrix[kind];
  if (entry === undefined) return ALL_CHANNELS;
  return entry.filter((c): c is NotificationChannel =>
    (NOTIFICATION_CHANNELS as readonly string[]).includes(c),
  );
}
