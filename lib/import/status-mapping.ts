import type { TaskStatus } from "@/db/enums";

const TABLE: Record<string, TaskStatus> = {
  "not started":   "not_started",
  "initiated":     "initiated",
  "follow up":     "follow_up",
  // need_help retired 2026-06-10 — legacy "need help" rows now import as need_info.
  "need help":     "need_info",
  "done":          "done",
  "approved":      "approved",
  "not approved":  "not_approved",
  "cancelled":     "cancelled",
  "transferred":   "transferred",
};

/**
 * Map a legacy sheet status label ("Not Started", "Follow Up", etc.) to
 * the canonical task_status enum value. Whitespace + case insensitive.
 * Returns null for unrecognised labels (caller should skip + report).
 */
export function mapLegacyStatus(raw: string): TaskStatus | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return TABLE[key] ?? null;
}
