/**
 * Canonical cache-tag names for `unstable_cache` reads and the matching
 * `revalidateTag` calls in server actions. Centralising them so a typo
 * can't desync read-side cache key from write-side invalidation —
 * everything imports the same string constants.
 */
export const CACHE_TAGS = {
  /** Anything that reads the `tasks` table (board counts, nav badges, etc.). */
  tasks: "tasks",
  /** The active employee roster (slim picker payload). */
  employees: "employees",
  /** Distinct subjects pulled from tasks + the subjects admin table. */
  subjects: "subjects",
  /** Admin-managed status label/color overrides. */
  statusSettings: "status-settings",
  /** Client roster used by the task "Client Name" picker. */
  clients: "clients",
  /** Project tree nodes (Project / Milestone / Result / Action / Sub-Action). */
  projectNodes: "project-nodes",
  /** Weekly Goals planner rows (per-week priorities + % done). */
  weeklyGoals: "weekly-goals",
  /** Index hub sections + hyperlink buttons (the editable Ecosystem Index). */
  indexHub: "index-hub",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * Per-user cache tags for the Profile v2 surface. Functions because each
 * tag is scoped to a specific employee id — a single static string would
 * over-invalidate across users.
 */
export const PROFILE_CACHE_TAGS = {
  profile: (employeeId: string) => `profile:${employeeId}`,
  quickStats: (employeeId: string) => `profile:quick-stats:${employeeId}`,
  authSessions: (employeeId: string) => `profile:sessions:${employeeId}`,
  dataExports: (employeeId: string) => `profile:exports:${employeeId}`,
  notificationPrefs: (employeeId: string) =>
    `profile:notification-prefs:${employeeId}`,
  pinnedItems: (employeeId: string) =>
    `profile:pinned-items:${employeeId}`,
} as const;
