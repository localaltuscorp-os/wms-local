/**
 * Canonical cache-tag names for `unstable_cache` reads and the matching
 * `revalidateTag` calls in server actions. Centralising them so a typo
 * can't desync read-side cache key from write-side invalidation —
 * everything imports the same string constants.
 */
export const CACHE_TAGS = {
  /** Anything that reads the `tasks` table (board counts, nav badges, etc.). */
  tasks: "tasks",
  /**
   * The EXECUTIVE DASHBOARD aggregate (org-wide rollups). Deliberately SEPARATE
   * from `tasks` and busted by NOTHING on the per-task write path — it serves
   * from its 60s TTL instead. Rationale (Operation Butter P0 / ARCHITECTURE.md
   * Law 10): an org KPI rollup doesn't need read-your-own-writes; coupling it to
   * `tasks` meant every status tick org-wide recomputed ~17 queries × every
   * connected client (the "20 users crash the dashboard" storm). TTL-only caps
   * that at one recompute per 60s regardless of write volume or concurrency.
   */
  dashboard: "dashboard",
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
  /** Weekly Goals planner rows (board + dashboard reads). */
  weeklyGoals: "weekly-goals",
  /** Index hub — admin-editable link sections + their hyperlink buttons. */
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
